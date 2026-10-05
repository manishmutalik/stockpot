/**
 * aiChat.ts
 *
 * "Ask your business", shared by the server (to validate what the model wrote)
 * and the browser (to prepare a question and choose the period).
 *
 * The same rule as the briefing applies (docs/AI_CFO_DESIGN.md): the model
 * writes words and tokens, never a number. Its answer is checked against the
 * snapshot that was sent, and an answer that does not pass is never shown.
 *
 * Privacy: the question is prepared on the browser. Customer names the owner
 * types are replaced by the customer's label, and phone-number-like digits are
 * removed, before anything is sent.
 */
import { validateAiText } from './aiFigures';
import { knownIdsFromSnapshot } from './aiBriefing';
import type { AiSnapshot } from './aiSnapshot';
import { redactPhones, replaceCustomerNames } from './aiPrivacy';
import { addDays } from './localDate';
import { numberWritten } from './orderParse';
import { pricesFromPercent } from './pricing';

export const CHAT_MAX_QUESTION_CHARS = 500;
export const CHAT_MAX_ANSWER_CHARS = 1200;
export const CHAT_MAX_HISTORY_TURNS = 4;

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

/**
 * The JSON schema the model's reply must follow (structured outputs): either an answer, or a request to run a
 * what-if calculation first (the one "tool" the chat has). Exactly one of the two is set; the other is null.
 */
export const CHAT_SCHEMA = {
  type: 'object',
  properties: {
    answer: nullable({ type: 'string' }),
    scenario: nullable({
      type: 'object',
      properties: {
        products: { type: 'array', items: { type: 'string' } },
        changePercent: nullable({ type: 'number' }),
        newPrice: nullable({ type: 'number' }),
        salesChangePercent: nullable({ type: 'number' }),
      },
      required: ['products', 'changePercent', 'newPrice', 'salesChangePercent'],
      additionalProperties: false,
    }),
  },
  required: ['answer', 'scenario'],
  additionalProperties: false,
} as const;

/** A what-if the model asks the app to calculate. Every number in it is one the owner wrote in the question. */
export interface ScenarioRequest {
  /** Name ids from the snapshot (`item_...`), or ['ALL']. */
  products: string[];
  /** A price change in percent, negative for a cut. Exactly one of this and `newPrice` is set. */
  changePercent: number | null;
  /** A new price for a single product. */
  newPrice: number | null;
  /** The owner's own guess at how sales would change, in percent. */
  salesChangePercent: number | null;
}

/** One earlier exchange, as kept for context: the question as sent, and the model's answer with its tokens. */
export interface ChatTurn {
  question: string;
  answer: string;
}

export const trimHistory = (turns: ChatTurn[]): ChatTurn[] => turns.slice(-CHAT_MAX_HISTORY_TURNS);

export type ChatAnswerValidation =
  | { ok: true; answer: string; scenario?: undefined }
  | { ok: true; scenario: ScenarioRequest; answer?: undefined }
  | { ok: false; problems: string[] };

/** Words that say a number is a fall ("cut prices by 10%", "sales drop 5%"). */
const FALL_WORDS = /\b(cut|cuts|cutting|lower|lowers|lowering|reduce|reduces|reducing|decrease|decreases|decreasing|drop|drops|dropping|fall|falls|falling|fell|slash|slashing|discount|less|down|decline|declines|lose|loss|shrink|shrinks)\b/i;

/** Whether the words around a number written in the question say it is a fall. Without digits to look around, the whole question. */
function suggestsFall(value: number, question: string): boolean {
  for (const m of question.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    if (Number(m[0].replace(/,/g, '')) !== value) continue;
    const at = m.index ?? 0;
    return FALL_WORDS.test(question.slice(Math.max(0, at - 24), at + m[0].length + 10));
  }
  return FALL_WORDS.test(question);
}

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const nullish = (v: unknown) => v === null || v === undefined;

/**
 * Checks a what-if request against the question and the snapshot. The model must not do arithmetic or invent a
 * figure, so every number must be one written in the question, with the sign the words around it imply; the
 * products must be ones the snapshot names (or all of them). A request is refused if the calculation has already
 * been run for this question.
 */
export function validateScenarioRequest(raw: unknown, question: string, snapshot: AiSnapshot): { ok: true; scenario: ScenarioRequest } | { ok: false; problems: string[] } {
  if (snapshot.pricing?.scenario) return { ok: false, problems: ['the what-if has already been calculated: answer from pricing.scenario instead of asking again'] };
  if (!isObject(raw)) return { ok: false, problems: ['scenario is not an object'] };
  const problems: string[] = [];

  const products = raw.products;
  const names = new Set(Object.keys(snapshot.names).filter(id => id.startsWith('item_')));
  if (!Array.isArray(products) || products.length < 1 || products.length > 30 || !products.every(p => typeof p === 'string')) {
    problems.push('products must be a list of product ids, or ["ALL"]');
  } else if (products.includes('ALL')) {
    if (products.length !== 1) problems.push('"ALL" must be the only product');
  } else {
    for (const p of products) if (!names.has(p)) problems.push(`"${p}" is not a product in the snapshot`);
  }

  const change = nullish(raw.changePercent) ? null : raw.changePercent;
  const price = nullish(raw.newPrice) ? null : raw.newPrice;
  const sales = nullish(raw.salesChangePercent) ? null : raw.salesChangePercent;
  if ((change === null) === (price === null)) problems.push('give exactly one of changePercent and newPrice');

  const checkPercent = (value: unknown, field: string, max: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value === 0 || Math.abs(value) > max) { problems.push(`${field} must be a non-zero number within ${max} percent`); return; }
    if (!numberWritten(Math.abs(value), question)) { problems.push(`${field} is not a number written in the question`); return; }
    if ((value < 0) !== suggestsFall(Math.abs(value), question)) problems.push(`${field} has the wrong sign for what the question says`);
  };
  if (change !== null) checkPercent(change, 'changePercent', 300);
  if (sales !== null) checkPercent(sales, 'salesChangePercent', 100);
  if (price !== null) {
    if (typeof price !== 'number' || !Number.isFinite(price) || !(price > 0)) problems.push('newPrice must be a positive number');
    else if (!numberWritten(price, question)) problems.push('newPrice is not a number written in the question');
    if (Array.isArray(products) && (products.includes('ALL') || products.length !== 1)) problems.push('newPrice is for exactly one product');
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, scenario: { products: products as string[], changePercent: change as number | null, newPrice: price as number | null, salesChangePercent: sales as number | null } };
}

/** Checks the model's reply: an answer (its shape, then the figure guard against the ids the snapshot offered) or a what-if request. */
export function validateChatAnswer(raw: unknown, snapshot: AiSnapshot, question = ''): ChatAnswerValidation {
  if (!isObject(raw)) return { ok: false, problems: ['the answer is not an object'] };
  if (!nullish(raw.scenario)) {
    if (!nullish(raw.answer)) return { ok: false, problems: ['give either an answer or a scenario, not both'] };
    const checked = validateScenarioRequest(raw.scenario, question, snapshot);
    return checked.ok ? { ok: true, scenario: checked.scenario } : checked;
  }
  const checked = validateAiText(raw.answer, knownIdsFromSnapshot(snapshot), CHAT_MAX_ANSWER_CHARS);
  return checked.ok ? { ok: true, answer: (raw.answer as string).trim() } : { ok: false, problems: checked.problems };
}

/**
 * What a what-if assumed, in plain words, built by code from the request and what was calculated, to show under
 * the answer ("Assumed: prices +8% on all items, sales unchanged, from 30 days of real sales."), so the owner
 * can see what the numbers are for whatever the answer's wording.
 */
export function describeScenario(request: ScenarioRequest, itemNames: string[], daysUsed: number): string {
  const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}%`;
  const who = request.products.includes('ALL') ? 'all items' : itemNames.join(', ') || 'the items';
  const price = request.newPrice !== null ? `price ${request.newPrice} on ${who}` : `prices ${signed(request.changePercent ?? 0)} on ${who}`;
  const sales = request.salesChangePercent !== null ? `sales ${signed(request.salesChangePercent)}` : 'sales unchanged';
  return `Assumed: ${price}, ${sales}, from ${daysUsed} ${daysUsed === 1 ? 'day' : 'days'} of real sales.`;
}

/**
 * The price changes a what-if request means, from the menu on this device: the menu ids it names (or every priced
 * item), each with its new price. `item_` name ids carry the menu id after the prefix.
 */
export function scenarioChanges(request: ScenarioRequest, menu: { id: string; sellingPrice: number }[]): { menuItemId: string; newPrice: number }[] {
  const ids = request.products.includes('ALL') ? menu.map(m => m.id) : request.products.map(p => p.replace(/^item_/, ''));
  if (request.newPrice !== null) {
    const only = ids.find(id => menu.some(m => m.id === id));
    return only ? [{ menuItemId: only, newPrice: request.newPrice }] : [];
  }
  return pricesFromPercent(menu, ids, request.changePercent ?? 0);
}

/**
 * The question as it is sent. Customer names become labels (so the server never
 * sees a name) and the labels found are returned so the snapshot can include
 * those customers. A first name alone matches only when it is unique. Phone
 * numbers are removed.
 */
export function prepareQuestion(
  raw: string,
  customers: { name: string; label: string }[]
): { text: string; mentioned: string[] } {
  const cleaned = redactPhones(raw.replace(/\s+/g, ' ').trim()).text;
  const { text, mentioned } = replaceCustomerNames(cleaned, customers);
  return { text: text.slice(0, CHAT_MAX_QUESTION_CHARS), mentioned };
}

export type ChatPeriodId = 'month' | 'last_month' | '7d' | '30d';

export interface ChatPeriod {
  id: ChatPeriodId;
  label: string;
  period: { start: string; end: string };
  comparison: { start: string; end: string; label: string };
}

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-12
const pad = (n: number) => String(n).padStart(2, '0');

/** The periods the owner can ask about, each with what it is compared against. `today` is in the business's time zone. */
export function chatPeriods(today: string): ChatPeriod[] {
  const [y, m, d] = today.split('-').map(Number);
  const prevYear = m === 1 ? y - 1 : y;
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevMonthDays = daysInMonth(prevYear, prevMonth);
  const prevStart = `${prevYear}-${pad(prevMonth)}-01`;
  const monthBeforeYear = prevMonth === 1 ? prevYear - 1 : prevYear;
  const monthBefore = prevMonth === 1 ? 12 : prevMonth - 1;

  return [
    {
      id: 'month', label: 'This month so far',
      period: { start: `${y}-${pad(m)}-01`, end: today },
      comparison: { start: prevStart, end: `${prevYear}-${pad(prevMonth)}-${pad(Math.min(d, prevMonthDays))}`, label: 'the same stretch of last month' },
    },
    {
      id: 'last_month', label: 'Last month',
      period: { start: prevStart, end: `${prevYear}-${pad(prevMonth)}-${pad(prevMonthDays)}` },
      comparison: { start: `${monthBeforeYear}-${pad(monthBefore)}-01`, end: `${monthBeforeYear}-${pad(monthBefore)}-${pad(daysInMonth(monthBeforeYear, monthBefore))}`, label: 'the month before' },
    },
    {
      id: '7d', label: 'Last 7 days',
      period: { start: addDays(today, -6), end: today },
      comparison: { start: addDays(today, -13), end: addDays(today, -7), label: 'the 7 days before' },
    },
    {
      id: '30d', label: 'Last 30 days',
      period: { start: addDays(today, -29), end: today },
      comparison: { start: addDays(today, -59), end: addDays(today, -30), label: 'the 30 days before' },
    },
  ];
}

/** Questions offered on an empty chat. Each one the snapshot can answer today. */
export const STARTER_QUESTIONS = [
  'Why did my profit change?',
  'What should I stop selling?',
  'Which customers should I get back in touch with?',
  'Where am I losing money?',
  'What if I raise prices by 8%?',
] as const;
