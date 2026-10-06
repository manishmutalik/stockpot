/**
 * quickParse.ts
 *
 * Turning what the owner said into something they can confirm, for the phone
 * app: the questions to ask when the message leaves something open, the owner's
 * answers applied in code, and the draft those make. The model only reads; what
 * it read has been checked against the message (orderParse.validateParsedOrder)
 * before anything here sees it, and anything the message did not settle becomes
 * a question here, never a guess.
 *
 * Pure: the server runs it, with everything it needs passed in.
 */
import type { MenuItem, PaymentMethod, RawMaterial, BakerySettings } from '../types';
import { PAYMENT_METHODS } from '../types';
import { buildBill, billBalance, formatMoney } from './billing';
import { customerLabels, groupOrdersByCustomer } from './customers';
import { planOrderGroup, planProductionSession, productionRunCost, type OrderGroupCommon, type OrderLineItem, type ProductionRunInput } from './plans';
import type { ProductionFormFill } from './productionParse';
import type { OrderFormFill } from './orderParse';
import type { Order } from '../types';

export type QuickKind = 'order' | 'restock' | 'production' | 'payment';
export const QUICK_KINDS: QuickKind[] = ['order', 'restock', 'production', 'payment'];
const KIND_LABELS: Record<QuickKind, string> = { order: 'A customer order', restock: 'Stock bought', production: 'Something I made', payment: 'A payment received' };

/** One thing to ask the owner. `choice` is answered with one of `options`' values, `date` with YYYY-MM-DD, `amount` with a number. */
export interface Question {
  id: string;
  type: 'choice' | 'date' | 'amount';
  prompt: string;
  options?: { value: string; label: string }[];
}

export interface Answer { questionId: string; value: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_MAX = 10_000_000;
const METHOD_IDS = PAYMENT_METHODS.map(m => m.value) as string[];
const METHOD_LABEL = (m: string) => PAYMENT_METHODS.find(p => p.value === m)?.label ?? m;

/** The request's answers, or null if they are not a short list of `{ questionId, value }` strings. */
export function readAnswers(raw: unknown): Answer[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 40) return null;
  const out: Answer[] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object' || typeof a.questionId !== 'string' || typeof a.value !== 'string') return null;
    if (a.questionId.length > 40 || a.value.length > 80) return null;
    out.push({ questionId: a.questionId, value: a.value.trim() });
  }
  return out;
}

/** The latest answer to each question. */
export const answerMap = (answers: Answer[]): Map<string, string> => new Map(answers.map(a => [a.questionId, a.value]));

const validAmount = (v: string | undefined): number | null => {
  if (v === undefined || !/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const n = Number(v);
  return n > 0 && n <= AMOUNT_MAX ? n : null;
};
const validDate = (v: string | undefined): string | null => (v && DATE.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

// ─── What kind of message is it ─────────────────────────────────────────────

const HINTS: Record<QuickKind, RegExp[]> = {
  order: [/\border(ed|s)?\b/i, /\bwants?\b/i, /\bbook(ed|ing)?\b/i, /\bdeliver(y|ed)?\b/i, /\bpre-?order\b/i, /\bneeds?\b/i],
  restock: [/\bbought\b/i, /\bpurchased?\b/i, /\brestock(ed)?\b/i, /\bstock in\b/i, /\bgot\b.*\b(kg|kilo|g|gram|litre|liter|l|ml|packet|pack)\b/i, /\bdelivery of\b/i],
  production: [/\b(baked|made|produced|prepared|cooked)\b/i, /\bbatch(es)?\b/i, /\bcame out\b/i, /\bwasted?\b/i],
  payment: [/\bpaid\b/i, /\bpayment\b/i, /\bsettled\b/i, /\bcleared\b/i, /\bgave me\b/i, /\bsent me\b/i, /\bowes?\b/i],
};

/**
 * Which of the four things the message is about, by the words it uses. Null when it fits none or more than one equally:
 * the app then asks, rather than guessing which save to prepare.
 */
export function detectKind(text: string): QuickKind | null {
  const scores = QUICK_KINDS.map(k => ({ k, n: HINTS[k].filter(r => r.test(text)).length }));
  const top = Math.max(...scores.map(s => s.n));
  if (top === 0) return null;
  const best = scores.filter(s => s.n === top);
  return best.length === 1 ? best[0].k : null;
}

export const kindQuestion = (): Question => ({
  id: 'kind', type: 'choice', prompt: 'What is this about?',
  options: QUICK_KINDS.map(k => ({ value: k, label: KIND_LABELS[k] })),
});

export const asKind = (v: unknown): QuickKind | null => (typeof v === 'string' && (QUICK_KINDS as string[]).includes(v) ? (v as QuickKind) : null);

// ─── Customers the owner already has ────────────────────────────────────────

export interface KnownCustomer { key: string; label: string; name: string; phone?: string }

/**
 * Who has ordered, with the label that stands for each in what is sent to the model (their name and number never are).
 * The same identity and labels the web uses (payments.customerKey, customers.customerLabels).
 */
export function customerDirectory(orders: Order[]): KnownCustomer[] {
  const byCustomer = groupOrdersByCustomer(orders.filter(o => !o.cancelledOn));
  const labels = customerLabels([...byCustomer.keys()]);
  const out: KnownCustomer[] = [];
  for (const [key, list] of byCustomer) {
    const newest = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const name = newest.find(o => o.customerName)?.customerName?.trim();
    const phone = newest.find(o => o.customerPhone)?.customerPhone;
    out.push({ key, label: labels.get(key)!, name: name || 'Customer not named', ...(phone && { phone }) });
  }
  return out;
}

// ─── An order ───────────────────────────────────────────────────────────────

export interface OrderDraft { common: OrderGroupCommon; lineItems: OrderLineItem[] }

export interface DraftResult<D> {
  draft: D;
  questions: Question[];
  /** Things the owner should know about how the draft was made. */
  notes: string[];
}

const methodOptions = () => PAYMENT_METHODS.map(m => ({ value: m.value as string, label: m.label }));

/**
 * The order the message describes, as the save endpoint takes it, and what is still open. A date after today (or notes, or
 * an advance) makes it a pre-order, as on the web; a pre-order is pay-later unless the message says otherwise.
 *
 * Questions (answer ids): `item:N` which menu item the Nth unmatched item is (a menu id, or `skip`); `date`; `payment`
 * (`later`, or the method it was paid by); `advance_method`; `advance` (a corrected amount); `stock` (`preorder`).
 */
export function buildOrderDraft(input: {
  fill: OrderFormFill;
  menu: { id: string; name: string }[];
  today: string;
  answers: Map<string, string>;
}): DraftResult<OrderDraft> {
  const { fill, menu, today, answers } = input;
  const questions: Question[] = [];
  const notes: string[] = [];

  // Items: the ones matched, then those the owner has placed.
  const quantities = new Map<string, number>(fill.lineItems.map(li => [li.menuItemId, li.quantity]));
  fill.notFound.forEach((nf, i) => {
    const id = `item:${i}`;
    const chosen = answers.get(id);
    if (chosen === 'skip') { notes.push(`Left out ${nf.quantity} × ${nf.nameAsWritten}.`); return; }
    if (chosen && menu.some(m => m.id === chosen)) { quantities.set(chosen, (quantities.get(chosen) ?? 0) + nf.quantity); return; }
    const options = [
      ...(nf.suggestion ? [{ value: nf.suggestion.id, label: nf.suggestion.name }] : []),
      { value: 'skip', label: 'Leave it out' },
    ];
    questions.push({ id, type: 'choice', prompt: `"${nf.nameAsWritten}" is not on your menu. Which menu item is it?`, options });
  });
  const lineItems: OrderLineItem[] = [...quantities].map(([menuItemId, quantity]) => ({ menuItemId, quantity }));

  // When.
  let date = fill.date ?? today;
  if (fill.dateNotUnderstood) {
    const chosen = validDate(answers.get('date'));
    if (chosen) date = chosen;
    else questions.push({ id: 'date', type: 'date', prompt: `I could not tell the date from "${fill.dateNotUnderstood}". When is it needed?` });
  }

  const preorder = date > today || fill.notes !== undefined || fill.advanceAmount !== undefined || answers.get('stock') === 'preorder';
  if (preorder && date <= today && (fill.notes !== undefined || fill.advanceAmount !== undefined)) {
    notes.push(fill.advanceAmount !== undefined ? 'Booked as a pre-order because it has an advance.' : 'Booked as a pre-order because it has notes.');
  }

  const common: OrderGroupCommon = { date };
  if (fill.customerName) common.customerName = fill.customerName;
  if (fill.customerPhone) common.customerPhone = fill.customerPhone;
  if (fill.deliveryAddress) common.deliveryAddress = fill.deliveryAddress;
  if (fill.discountAmount) common.discount = fill.discountAmount;

  // Payment.
  const paidAnswer = answers.get('payment');
  if (preorder) {
    common.preorder = true;
    if (fill.notes) common.notes = fill.notes;
    common.paymentStatus = fill.payLater === false ? 'paid' : 'unpaid';
    if (fill.payLater === false && fill.method) common.paymentMethod = fill.method;

    if (fill.advanceAmount !== undefined) {
      const amount = validAmount(answers.get('advance')) ?? fill.advanceAmount;
      const method = (fill.advanceMethod ?? (METHOD_IDS.includes(answers.get('advance_method') ?? '') ? (answers.get('advance_method') as PaymentMethod) : undefined));
      if (method) common.advance = { amount, method };
      else questions.push({ id: 'advance_method', type: 'choice', prompt: `How was the advance of ${amount} paid?`, options: methodOptions() });
    }
  } else if (fill.payLater === true || paidAnswer === 'later') {
    common.paymentStatus = 'unpaid';
  } else if (fill.payLater === false && fill.method) {
    common.paymentStatus = 'paid';
    common.paymentMethod = fill.method;
  } else if (METHOD_IDS.includes(paidAnswer ?? '')) {
    common.paymentStatus = 'paid';
    common.paymentMethod = paidAnswer as PaymentMethod;
  } else {
    questions.push({
      id: 'payment', type: 'choice', prompt: 'Has this been paid?',
      options: [...methodOptions().map(o => ({ value: o.value, label: `Paid, ${o.label}` })), { value: 'later', label: 'Pay later' }],
    });
  }

  return { draft: { common, lineItems }, questions, notes };
}

/** The money side of an order draft, worked out by the same plan the save runs, so it is the figure the save will use. */
export interface OrderPreview {
  lines: { menuItemId: string; name: string; quantity: number; unitPrice: number; lineTotal: number; stockAfter: number | null }[];
  /** What the customer pays, with GST and discount. */
  total: number;
  advance: number | null;
  balanceDue: number;
  label: { total: string; balanceDue: string; advance: string | null };
}

export function previewOrder(input: {
  draft: OrderDraft;
  menu: MenuItem[];
  materials: RawMaterial[];
  settings: Partial<BakerySettings>;
  currency: { code: string; symbol: string };
  today: string;
}): { ok: true; preview: OrderPreview } | { ok: false; question: Question | null; message: string } {
  const { draft, menu, currency } = input;
  const settings = input.settings;
  const plan = planOrderGroup({
    common: draft.common, lineItems: draft.lineItems, menu, materials: input.materials,
    gst: { gstApplicable: settings.gstApplicable, gstRate: settings.gstRate, gstPricingMode: settings.gstPricingMode } as any,
    feeRates: settings.paymentFeeRates, today: input.today, ctx: { newId: (() => { let n = 0; return () => `preview-${++n}`; })() },
  });
  if (plan.ok === false) {
    const e = plan.error;
    if (e.code === 'insufficient_stock') {
      return { ok: false, message: e.message, question: {
        id: 'stock', type: 'choice', prompt: e.message,
        options: [{ value: 'preorder', label: 'Book it as a pre-order' }],
      } };
    }
    if (e.code === 'advance_too_large') {
      return { ok: false, message: e.message, question: { id: 'advance', type: 'amount', prompt: `${e.message} How much was paid in advance?` } };
    }
    return { ok: false, message: e.message, question: null };
  }

  const bill = buildBill({
    orders: plan.orders, menu,
    settings: { name: settings.name ?? '', address: settings.address ?? '', phone: settings.phone ?? '', logo: settings.logo, gstApplicable: settings.gstApplicable, gstRate: settings.gstRate, gstPricingMode: settings.gstPricingMode, upiId: settings.upiId } as any,
    currency,
  });
  // The bill counts what is left after an advance; an order that was paid in full owes nothing.
  const owes = plan.orders.some(o => o.paymentStatus === 'unpaid');
  const balance = owes ? Math.round(billBalance(bill) * 100) / 100 : 0;
  const total = Math.round(bill.total * 100) / 100;
  const advance = plan.orders.find(o => o.advance)?.advance?.amount ?? null;
  const money = (n: number) => formatMoney(n, currency);
  return { ok: true, preview: {
    lines: plan.orders.map(o => {
      const item = menu.find(m => m.id === o.menuItemId);
      const unit = o.unitPriceAtSale ?? item?.sellingPrice ?? 0;
      return {
        menuItemId: o.menuItemId, name: item?.name ?? 'Item', quantity: o.quantity, unitPrice: unit,
        lineTotal: Math.round(unit * o.quantity * 100) / 100,
        stockAfter: plan.preorder ? null : (item?.finishedGoodsStock ?? 0) - (plan.requestedByItem.get(o.menuItemId) ?? 0),
      };
    }),
    total, advance, balanceDue: balance,
    label: { total: money(total), balanceDue: money(balance), advance: advance === null ? null : money(advance) },
  } };
}

// ─── What was made ──────────────────────────────────────────────────────────

/** The body of the production endpoint. */
export interface ProductionDraft {
  date?: string;
  rows: { recipeId: string; quantityProduced: number; quantityYield?: number; notes?: string }[];
}

/**
 * What was made, as the production endpoint takes it, and what is still open. The date is never in the future (it has
 * happened). With one item and waste written, the sellable yield is the quantity less the waste.
 * Questions (answer ids): `item:N` which menu item the Nth unmatched item is (a menu id, or `skip`); `date`.
 */
export function buildProductionDraft(input: {
  fill: ProductionFormFill;
  menu: { id: string; name: string }[];
  today: string;
  answers: Map<string, string>;
}): DraftResult<ProductionDraft> {
  const { fill, menu, today, answers } = input;
  const questions: Question[] = [];
  const notes: string[] = [];

  const quantities = new Map<string, number>(fill.rows.map(r => [r.recipeId, r.quantity]));
  fill.notFound.forEach((nf, i) => {
    const id = `item:${i}`;
    const chosen = answers.get(id);
    if (chosen === 'skip') { notes.push(`Left out ${nf.quantity} × ${nf.nameAsWritten}.`); return; }
    if (chosen && menu.some(m => m.id === chosen)) { quantities.set(chosen, (quantities.get(chosen) ?? 0) + nf.quantity); return; }
    questions.push({
      id, type: 'choice', prompt: `"${nf.nameAsWritten}" is not on your menu. Which menu item is it?`,
      options: [...(nf.suggestion ? [{ value: nf.suggestion.id, label: nf.suggestion.name }] : []), { value: 'skip', label: 'Leave it out' }],
    });
  });

  let date = fill.date ?? today;
  if (fill.dateNotUnderstood) {
    const chosen = validDate(answers.get('date'));
    if (chosen && chosen <= today) date = chosen;
    else questions.push({ id: 'date', type: 'date', prompt: `I could not tell the date from "${fill.dateNotUnderstood}". When was it made?` });
  }

  const rows: ProductionDraft['rows'] = [...quantities].map(([recipeId, quantityProduced]) => ({ recipeId, quantityProduced }));
  if (fill.yieldQty !== undefined && rows.length === 1 && fill.notFound.length === 0) rows[0].quantityYield = fill.yieldQty;
  if (fill.notes && rows.length > 0) rows[0].notes = fill.notes;
  for (const w of fill.unplacedWaste) notes.push(`${w.units} ${w.name} wasted: record it with Discard in the web app's Production Log.`);

  return { draft: { ...(date !== today && { date }), rows }, questions, notes };
}

export interface ProductionPreview {
  date: string;
  rows: { recipeId: string; name: string; quantityProduced: number; quantityYield: number; costTotal: number; costPerUnit: number; stockAfter: number }[];
  /** Ingredients this would take below nothing, as the web would let it. The app asks "Produce anyway?". */
  shortages: { materialId: string; name: string; unit: string; short: number }[];
  total: number;
  label: { total: string };
}

/** The same plan the save runs, so the cost and the shortfall shown are the ones that will be recorded. */
export function previewProduction(input: {
  draft: ProductionDraft;
  menu: MenuItem[];
  materials: RawMaterial[];
  currency: { code: string; symbol: string };
  today: string;
}): { ok: true; preview: ProductionPreview } | { ok: false; message: string } {
  const { draft, menu, materials, currency } = input;
  const day = draft.date ?? input.today;
  const inputs: ProductionRunInput[] = draft.rows.map(r => {
    const recipe = menu.find(m => m.id === r.recipeId)?.recipe ?? [];
    return {
      recipeId: r.recipeId, quantityProduced: r.quantityProduced, quantityYield: r.quantityYield ?? r.quantityProduced, date: day, notes: r.notes,
      costTotal: parseFloat(productionRunCost(recipe, materials, r.quantityProduced).toFixed(2)),
    };
  });
  let n = 0;
  const plan = planProductionSession(inputs, { materials, menu }, { newId: () => `preview-${++n}`, now: () => 0 });
  if (plan.ok === false) return { ok: false, message: plan.error.message };

  const rows = inputs.map(r => ({
    recipeId: r.recipeId, name: menu.find(m => m.id === r.recipeId)?.name ?? 'Item',
    quantityProduced: r.quantityProduced, quantityYield: r.quantityYield, costTotal: r.costTotal,
    costPerUnit: r.quantityYield > 0 ? Math.round((r.costTotal / r.quantityYield) * 100) / 100 : 0,
    stockAfter: plan.state.menu.find(m => m.id === r.recipeId)?.finishedGoodsStock ?? 0,
  }));
  const total = Math.round(rows.reduce((s, r) => s + r.costTotal, 0) * 100) / 100;
  const shortages = plan.state.materials
    .filter(m => m.initialStock < 0)
    .map(m => ({ materialId: m.id, name: m.name, unit: m.unit, short: Math.round(-m.initialStock * 10000) / 10000 }));
  return { ok: true, preview: { date: day, rows, shortages, total, label: { total: formatMoney(total, currency) } } };
}
