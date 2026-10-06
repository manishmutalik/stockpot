/**
 * paymentParse.ts
 *
 * Reading "Priya paid 1300 by UPI" for the phone app's Payment screen. The model only reads who, how much and how; what to
 * do with it is worked out here from the owner's own data, so nothing is guessed:
 *  - the amount must be a number written in the message;
 *  - the customer is found among the people who owe something (the known customer's label is what the model sees, never
 *    their name or number); a name that is not clearly one of them becomes a question;
 *  - there are no part-payments yet, so the amount must come to exactly what one or more whole orders are owed, oldest
 *    first (src/utils/quickPayments); anything else is asked about, with the amounts that would work.
 */
import { PAYMENT_METHODS, type PaymentMethod } from '../types';
import { formatMoney } from './billing';
import { numberWritten, squash } from './orderParse';
import { matchingOption, type CustomerDues } from './quickPayments';
import type { DraftResult, KnownCustomer, Question } from './quickParse';

const METHOD_IDS = PAYMENT_METHODS.map(m => m.value);
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

export const PAYMENT_SCHEMA = {
  type: 'object',
  properties: {
    customerLabel: nullable({ type: 'string' }),
    customerName: nullable({ type: 'string' }),
    amount: nullable({ type: 'number' }),
    method: nullable({ type: 'string', enum: [...METHOD_IDS] }),
  },
  required: ['customerLabel', 'customerName', 'amount', 'method'],
  additionalProperties: false,
} as const;

export interface ParsedPayment {
  customerLabel?: string;
  customerName?: string;
  amount?: number;
  method?: PaymentMethod;
}

export type PaymentValidation = { ok: true; parsed: ParsedPayment } | { ok: false; problems: string[] };
const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const LABEL = /^C-[0-9A-Z]{4,7}(-\d+)?$/;

/** Checks the model's reading against the message that was sent. */
export function validateParsedPayment(raw: unknown, input: { text: string }): PaymentValidation {
  if (!isObject(raw)) return { ok: false, problems: ['the answer is not an object'] };
  const text = input.text;
  const problems: string[] = [];
  const out: ParsedPayment = {};

  const label = raw.customerLabel ?? null;
  if (label !== null) {
    if (typeof label !== 'string' || !LABEL.test(label) || !text.includes(label)) problems.push('customerLabel is not a label written in the message');
    else out.customerLabel = label;
  }
  const name = raw.customerName ?? null;
  if (name !== null) {
    if (typeof name !== 'string' || name.trim() === '' || !squash(text).includes(squash(name))) problems.push(`the name "${String(name)}" is not written in the message`);
    else if (!out.customerLabel) out.customerName = name.trim();
  }
  const amount = raw.amount ?? null;
  if (amount !== null) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) problems.push('amount must be a number above nothing');
    else if (!numberWritten(amount, text)) problems.push(`the amount ${amount} is not written in the message`);
    else out.amount = amount;
  }
  const method = raw.method ?? null;
  if (method !== null) {
    if (typeof method !== 'string' || !METHOD_IDS.includes(method as PaymentMethod)) problems.push(`method must be one of ${METHOD_IDS.join(', ')} or null`);
    else out.method = method as PaymentMethod;
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, parsed: out };
}

// ─── From the reading to a draft ────────────────────────────────────────────

/** The body of the payment endpoint, with whatever is not settled yet left out. */
export interface PaymentDraft { customerKey?: string; amount?: number; method?: PaymentMethod }

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const METHOD_OPTIONS = PAYMENT_METHODS.map(m => ({ value: m.value as string, label: m.label }));
const validAmount = (v: string | undefined): number | null => {
  if (v === undefined || !/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const n = Number(v);
  return n > 0 && n <= 1_000_000_000 ? n : null;
};
const words = (s: string) => squash(s).split(' ').filter(Boolean);
const orderWord = (n: number) => `${n} order${n === 1 ? '' : 's'}`;

/**
 * The payment the message describes and what is still open.
 * Questions (answer ids): `customer` (a customer key, from those who owe something); `method`; `amount`.
 */
export function buildPaymentDraft(input: {
  parsed: ParsedPayment;
  /** Everyone who owes something. */
  owing: CustomerDues[];
  known: KnownCustomer[];
  answers: Map<string, string>;
  currency: { code: string; symbol: string };
}): DraftResult<PaymentDraft> & { entry: CustomerDues | null; amountQuestionOptions?: number[] } {
  const { parsed, owing, known, answers, currency } = input;
  const money = (n: number) => formatMoney(n, currency);
  const questions: Question[] = [];
  const notes: string[] = [];
  const draft: PaymentDraft = {};

  // Who.
  let entry: CustomerDues | null = null;
  const chosen = answers.get('customer');
  if (chosen) entry = owing.find(o => o.customer.key === chosen) ?? null;
  let nothingOwed: string | null = null;
  if (!entry && parsed.customerLabel) {
    const person = known.find(k => k.label === parsed.customerLabel);
    if (person) {
      entry = owing.find(o => o.customer.key === person.key) ?? null;
      if (!entry) nothingOwed = person.name;
    }
  }
  if (!entry && parsed.customerName) {
    const spoken = words(parsed.customerName);
    const matches = owing.filter(o => { const mine = words(o.customer.name); return spoken.length > 0 && spoken.every(w => mine.includes(w)); });
    if (matches.length === 1) entry = matches[0];
    else if (matches.length === 0) nothingOwed = parsed.customerName;
  }
  if (!entry) {
    questions.push({
      id: 'customer', type: 'choice',
      prompt: nothingOwed ? `${nothingOwed} has nothing pending. Who paid?` : 'Who paid?',
      options: owing.slice(0, 8).map(o => ({ value: o.customer.key, label: `${o.customer.name} · ${money(o.customer.dueTotal)}` })),
    });
  } else {
    draft.customerKey = entry.customer.key;
  }

  // How.
  const method = (METHOD_OPTIONS.some(o => o.value === answers.get('method')) ? answers.get('method') : parsed.method) as PaymentMethod | undefined;
  if (method) draft.method = method;
  else questions.push({ id: 'method', type: 'choice', prompt: 'How did they pay?', options: METHOD_OPTIONS });

  // How much: it has to settle whole orders.
  const amount = validAmount(answers.get('amount')) ?? parsed.amount ?? null;
  const suggestions = entry?.options;
  const suggestionList = entry ? entry.options.map((total, i) => ({ value: String(total), label: `${money(total)} · ${orderWord(i + 1)}${i === 0 ? ' (the oldest)' : ''}` })) : undefined;
  if (amount === null) {
    questions.push({ id: 'amount', type: 'amount', prompt: entry ? `How much did ${entry.customer.name} pay?` : 'How much was paid?', ...(suggestionList && { options: suggestionList }) });
  } else if (entry && matchingOption(entry.options, amount) < 0) {
    const owed = round2(entry.customer.dueTotal);
    const why = amount > owed + 0.005
      ? `${money(amount)} is more than that.`
      : `${money(amount)} doesn't cover ${entry.dues.length === 1 ? 'it' : `a whole order (the oldest is ${money(entry.dues[0].due)})`}.`;
    questions.push({
      id: 'amount', type: 'amount',
      prompt: `${entry.customer.name} owes ${money(owed)} for ${orderWord(entry.customer.orderCount)}. ${why} Check the amount?`,
      options: suggestionList,
    });
  } else {
    draft.amount = amount;
  }
  return { draft, questions, notes, entry, amountQuestionOptions: suggestions };
}

export interface PaymentPreview {
  customerKey: string;
  customerName: string;
  /** What they owed before this payment. */
  owed: number;
  amount: number;
  ordersCovered: number;
  /** Still owed after this payment. */
  remainingDue: number;
  /** The payment settles everything they owe. */
  clearsAll: boolean;
  label: { owed: string; amount: string; remainingDue: string };
}

/** The figures to confirm, from the same sums the save checks. Null until who, how much and a matching amount are settled. */
export function previewPayment(input: { entry: CustomerDues; amount: number; currency: { code: string; symbol: string } }): PaymentPreview | null {
  const { entry, amount, currency } = input;
  const at = matchingOption(entry.options, amount);
  if (at < 0) return null;
  const owed = round2(entry.customer.dueTotal);
  const remaining = round2(owed - amount);
  return {
    customerKey: entry.customer.key, customerName: entry.customer.name, owed, amount, ordersCovered: at + 1,
    remainingDue: remaining, clearsAll: remaining <= 0.005,
    label: { owed: formatMoney(owed, currency), amount: formatMoney(amount, currency), remainingDue: formatMoney(remaining, currency) },
  };
}
