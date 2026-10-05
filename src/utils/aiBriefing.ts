/**
 * aiBriefing.ts
 *
 * The daily briefing, shared by the server (to validate what the model wrote)
 * and the browser (to build everything that is not the model's words).
 *
 * What the owner sees is built from three kinds of parts:
 *  - Figures, tiles and the headline: built here and in the screen from the
 *    application's own numbers. Never model text.
 *  - The explanation (`why`) and the attention list: written by the model, but
 *    only as words and tokens (see aiFigures), and validated before they are
 *    kept or shown.
 *  - A deterministic version of the explanation and attention list, built from
 *    the same snapshot by code. It is what the demo shows as its sample, and
 *    what the screen falls back to when the model cannot be used or its answer
 *    does not pass validation. So the briefing never shows an unchecked answer
 *    and never shows nothing.
 */
import { formatFigure, validateAiText, type AiRegistry, type FormatContext } from './aiFigures';
import type { AiSnapshot } from './aiSnapshot';

/** What an attention item is about. Repricing and price-move kinds arrive with the pricing work. */
export const AI_ATTENTION_KINDS = ['preorder', 'profit_driver', 'wastage', 'low_stock', 'expiring', 'reorder_customer', 'unpaid'] as const;
export type AttentionKind = (typeof AI_ATTENTION_KINDS)[number];

export const MAX_ATTENTION_ITEMS = 4;

export interface BriefingAttention {
  kind: AttentionKind;
  text: string;
}

export interface BriefingContent {
  /** One or two sentences on why profit moved. Words and tokens only. */
  why: string;
  /** The most urgent things first. */
  attention: BriefingAttention[];
}

/** What is kept for a day and returned to the app. */
export interface StoredBriefing {
  /** The business date it was generated on (the briefing is about the day before). */
  date: string;
  /** `ai`: the model wrote `content`. `fallback`: the model could not be used or failed validation; the app builds the text. */
  source: 'ai' | 'fallback';
  content?: BriefingContent;
  createdAt: number;
  /** How many times it has been regenerated after the first. */
  refreshes: number;
}

/** The JSON schema the model's answer must follow (structured outputs). */
export const BRIEFING_SCHEMA = {
  type: 'object',
  properties: {
    why: { type: 'string' },
    attention: {
      type: 'array',
      items: {
        type: 'object',
        properties: { kind: { type: 'string', enum: [...AI_ATTENTION_KINDS] }, text: { type: 'string' } },
        required: ['kind', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['why', 'attention'],
  additionalProperties: false,
} as const;

/** The ids a snapshot offers the model: the only tokens its text may use. */
export function knownIdsFromSnapshot(snapshot: AiSnapshot) {
  const labels = [...snapshot.customers.dueList, ...snapshot.customers.lapsedList, ...(snapshot.customers.mentioned ?? [])].map(c => c.label);
  return { figures: Object.keys(snapshot.figures), names: Object.keys(snapshot.names), customers: labels };
}

export type ContentValidation = { ok: true; content: BriefingContent } | { ok: false; problems: string[] };

/** Checks the model's answer: its shape, then every sentence against the figure guard. */
export function validateBriefingContent(raw: unknown, snapshot: AiSnapshot): ContentValidation {
  const problems: string[] = [];
  const obj = raw as { why?: unknown; attention?: unknown } | null;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, problems: ['the answer is not an object'] };

  const known = knownIdsFromSnapshot(snapshot);
  const why = validateAiText(obj.why, known);
  if (!why.ok) problems.push(...why.problems.map(p => `why: ${p}`));

  const attention: BriefingAttention[] = [];
  if (!Array.isArray(obj.attention)) {
    problems.push('attention is not a list');
  } else {
    if (obj.attention.length > MAX_ATTENTION_ITEMS) problems.push(`attention has more than ${MAX_ATTENTION_ITEMS} items`);
    obj.attention.slice(0, MAX_ATTENTION_ITEMS).forEach((item: { kind?: unknown; text?: unknown }, i: number) => {
      if (!item || typeof item !== 'object') { problems.push(`attention ${i + 1} is not an object`); return; }
      if (!AI_ATTENTION_KINDS.includes(item.kind as AttentionKind)) problems.push(`attention ${i + 1}: unknown kind`);
      const check = validateAiText(item.text, known);
      if (!check.ok) problems.push(...check.problems.map(p => `attention ${i + 1}: ${p}`));
      else if (AI_ATTENTION_KINDS.includes(item.kind as AttentionKind)) attention.push({ kind: item.kind as AttentionKind, text: item.text as string });
    });
  }
  return problems.length ? { ok: false, problems } : { ok: true, content: { why: obj.why as string, attention } };
}

const WEEKDAY_DATE = (iso: string, ctx: FormatContext) =>
  formatFigure({ kind: 'date', value: iso, label: '' }, ctx);

/**
 * The headline, built by code from the application's own figures:
 * "Yesterday (Thu 2 Oct): 14 orders, ₹6,240 revenue and ₹2,180 true profit, down 12% on the same day last week."
 */
export function buildBriefingHeadline(snapshot: AiSnapshot, registry: AiRegistry, ctx: FormatContext): string {
  const f = (id: string) => registry.figures[id];
  const show = (id: string) => (f(id) ? formatFigure(f(id), ctx) : '-');
  const day = `Yesterday (${WEEKDAY_DATE(snapshot.period.end, ctx)})`;
  const orders = Number(f('orders_now')?.value ?? 0);
  const ordersBefore = Number(f('orders_before')?.value ?? 0);

  if (orders === 0) {
    return ordersBefore > 0
      ? `${day}: no orders, compared with ${show('orders_before')} ${ordersBefore === 1 ? 'order' : 'orders'} ${snapshot.comparison.label}.`
      : `${day}: no orders.`;
  }
  let text = `${day}: ${show('orders_now')} ${orders === 1 ? 'order' : 'orders'}, ${show('revenue_now')} revenue and ${show('true_profit_now')} true profit`;
  const pct = f('true_profit_change_pct');
  const change = f('true_profit_change');
  if (pct) {
    // Profit was positive before, so a percentage means something.
    const p = Number(pct.value);
    text += p === 0 ? `, the same as ${snapshot.comparison.label}` : `, ${p > 0 ? 'up' : 'down'} ${formatFigure({ ...pct, signed: false, value: Math.abs(p) }, ctx)} on ${snapshot.comparison.label}`;
  } else if (ordersBefore === 0 && Number(f('revenue_before')?.value ?? 0) === 0) {
    text += `, with nothing to compare against from ${snapshot.comparison.label}`;
  } else if (change) {
    // Profit was zero or a loss before: a percentage would mislead, so say how much it moved.
    const c = Number(change.value);
    text += c === 0 ? `, the same as ${snapshot.comparison.label}` : `, ${c > 0 ? 'up' : 'down'} ${formatFigure({ ...change, signed: false, value: Math.abs(c) }, ctx)} on ${snapshot.comparison.label}`;
  }
  return `${text}.`;
}

/**
 * The explanation and attention list built by code from the snapshot: the same
 * structure the model fills in, made only of fixed wording and tokens. The demo
 * shows this as its sample, and the screen uses it when the model is not used
 * or its answer fails validation.
 */
export function buildDeterministicBriefing(snapshot: AiSnapshot): BriefingContent {
  const [first, second] = snapshot.drivers;
  // The figure is signed (+ raised true profit, - lowered it), so the sign carries the direction.
  const phrase = (d: typeof first) => `${d.label.toLowerCase()} ({{fig:${d.figure}}} on true profit)`;
  const why = first
    ? `The biggest change was ${phrase(first)}${second ? `, then ${phrase(second)}` : ''}.`
    : `Nothing changed enough to explain, compared with ${snapshot.comparison.label}.`;

  const attention: BriefingAttention[] = [];
  // Pre-orders to prepare come first: they have a deadline. Each is "N item, N item" with the numbers from the app.
  const preorderLine = (label: string, day: AiSnapshot['preorders']['dueToday']) =>
    day && day.items.length > 0
      ? `Pre-orders due ${label}: ${day.items.slice(0, 3).map(i => `{{fig:${i.quantity}}} {{name:${i.name}}}`).join(', ')}.`
      : null;
  const dueToday = preorderLine('today', snapshot.preorders?.dueToday ?? null);
  const dueTomorrow = preorderLine('tomorrow', snapshot.preorders?.dueTomorrow ?? null);
  if (dueToday) attention.push({ kind: 'preorder', text: dueToday });
  if (dueTomorrow) attention.push({ kind: 'preorder', text: dueTomorrow });
  const names = (ids: string[]) => ids.slice(0, 3).map(id => `{{name:${id}}}`).join(', ');
  if (snapshot.inventory.lowStock.length) attention.push({ kind: 'low_stock', text: `Running low: ${names(snapshot.inventory.lowStock)}.` });
  // A material that will run out soon at the current rate of use, and is not already in the low-stock line.
  const soon = (snapshot.inventory.reorderSoon ?? []).find(r => !snapshot.inventory.lowStock.includes(r.name));
  if (soon) {
    attention.push({
      kind: 'low_stock',
      text: `{{name:${soon.name}}} may run out around {{fig:${soon.runOutDate}}}; about {{fig:${soon.suggestedQty}}} would cover the next week.`,
    });
  }
  if (snapshot.inventory.expiringSoon.length) attention.push({ kind: 'expiring', text: `Expiring soon or expired: ${names(snapshot.inventory.expiringSoon)}.` });
  if (snapshot.figures.unpaid_now) attention.push({ kind: 'unpaid', text: `{{fig:unpaid_now}} of revenue is not paid yet.` });
  const due = snapshot.customers.dueList[0];
  if (due) {
    attention.push({
      kind: 'reorder_customer',
      text: `{{cust:${due.label}}} is due to reorder: {{fig:${due.daysSinceLastOrder}}} since the last order.`,
    });
  }
  if (snapshot.figures.wastage_now && snapshot.drivers.some(d => d.figure === 'driver_wastage' && d.effect === 'lowered')) {
    attention.push({ kind: 'wastage', text: `Wastage cost {{fig:wastage_now}} and pulled profit down.` });
  }
  return { why, attention: attention.slice(0, MAX_ATTENTION_ITEMS) };
}

/**
 * Every token in the content resolves against the registry the app holds now.
 * A cached briefing refers to figures by id; if the data has since changed so an
 * id no longer exists (a product fell out of the top sellers, say), the cached
 * text is stale and the screen uses the deterministic version instead.
 */
export function contentResolves(content: BriefingContent, registry: AiRegistry, customers: Record<string, string>): boolean {
  const known = { figures: Object.keys(registry.figures), names: Object.keys(registry.names), customers: Object.keys(customers) };
  return validateAiText(content.why, known).ok && content.attention.every(a => validateAiText(a.text, known).ok);
}
