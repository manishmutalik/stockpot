/**
 * productionParse.ts
 *
 * Filling the Log Production Run form from a pasted or typed message ("made 40
 * croissants and 24 muffins this morning, 3 croissants burnt"), shared by the
 * server (to check what the model read) and the browser (to prepare the text and
 * turn the answer into form values). The counterpart of orderParse.ts, with the
 * same rules (docs/AI_CFO_DESIGN.md):
 *
 *  - The model only reads the message. Nothing is saved from it: the answer
 *    pre-fills the form and the owner checks it and presses Log Run.
 *  - Every quantity must be written in the message. Unlike an order, a bare
 *    "croissants" is not one croissant: a production quantity is never assumed.
 *  - Waste is the number the message states ("3 burnt"); the sellable yield
 *    (made minus waste) is worked out here, never by the model.
 *  - Every name, phrase and note must be text that is in the message, and an item
 *    is only matched to a menu item that exists, otherwise it is shown as not
 *    found with the closest menu item as a suggestion.
 *  - The date is never worked out by the model: it returns the phrase as written
 *    and `resolveProductionDate` works it out. A production run is in the past, so
 *    "Saturday" is the last Saturday and a date in the future is not understood.
 */
import { redactPhones } from './aiPrivacy';
import { addDays } from './localDate';
import { quantityWritten, resolveWhen, squash, suggestMenuItem, type NotFoundItem } from './orderParse';
import { resolveMenuItem } from './menuVariants';

export const PRODUCTION_TEXT_MAX_CHARS = 1500;
export const PRODUCTION_MAX_ITEMS = 15;
export const PRODUCTION_MAX_MENU_ITEMS = 300;
export const PRODUCTION_MAX_QUANTITY = 99999;

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

/** The JSON schema the model's answer must follow (structured outputs). Every field is present; "not in the message" is null. */
export const PRODUCTION_SCHEMA = {
  type: 'object',
  properties: {
    lineItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nameAsWritten: { type: 'string' },
          menuItemId: nullable({ type: 'string' }),
          quantity: { type: 'integer' },
          wasteUnits: nullable({ type: 'integer' }),
        },
        required: ['nameAsWritten', 'menuItemId', 'quantity', 'wasteUnits'],
        additionalProperties: false,
      },
    },
    when: nullable({ type: 'string' }),
    notes: nullable({ type: 'string' }),
  },
  required: ['lineItems', 'when', 'notes'],
  additionalProperties: false,
} as const;

export interface ParsedProductionLine {
  nameAsWritten: string;
  /** A menu item id from the list that was sent, or null when the item was not found on the menu. */
  menuItemId: string | null;
  /** How many were made, as written in the message. */
  quantity: number;
  /** How many of them were wasted (burnt, dropped, discarded), as written. Absent when the message does not say. */
  wasteUnits?: number;
}

/** What was read from the message, checked. Absent when the message does not say. */
export interface ParsedProduction {
  lineItems: ParsedProductionLine[];
  when?: string;
  notes?: string;
}

// ── Preparing the text ──────────────────────────────────────────────────────

/** The message as it is sent: whitespace tidied, phone numbers removed (there is no reason for one to reach the model). */
export function prepareProductionText(raw: string): string {
  const collapsed = raw.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return redactPhones(collapsed, '[phone]').text.slice(0, PRODUCTION_TEXT_MAX_CHARS);
}

// ── Checking what the model read ─────────────────────────────────────────────

export type ProductionParseValidation = { ok: true; parsed: ParsedProduction } | { ok: false; problems: string[] };

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const orNull = (v: unknown) => (v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? null : v);
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether a quantity is supported by the message. It must be written (digits, words, "half a dozen", "2 dozen"). One
 * is also supported by "a croissant" or "an eclair", an article straight before the item's name.
 */
function quantitySupported(quantity: number, text: string, nameAsWritten: string): boolean {
  if (quantityWritten(quantity, text)) return true;
  return quantity === 1 && new RegExp(`\\b(a|an|one)\\s+${escapeRegExp(nameAsWritten.trim())}`, 'i').test(text);
}

/** Checks the model's reading against the message (the text that was sent) and the menu ids that were sent. */
export function validateParsedProduction(raw: unknown, input: { text: string; menuIds: Iterable<string> }): ProductionParseValidation {
  if (!isObject(raw)) return { ok: false, problems: ['the answer is not an object'] };
  const problems: string[] = [];
  const menuIds = new Set(input.menuIds);
  const haystack = squash(input.text);
  const inText = (s: string) => squash(s) !== '' && haystack.includes(squash(s));
  const parsed: ParsedProduction = { lineItems: [] };

  if (!Array.isArray(raw.lineItems)) {
    problems.push('lineItems is not a list');
  } else if (raw.lineItems.length > PRODUCTION_MAX_ITEMS) {
    problems.push(`more than ${PRODUCTION_MAX_ITEMS} items`);
  } else {
    raw.lineItems.forEach((li: any, i: number) => {
      const n = i + 1;
      if (!isObject(li) || typeof li.nameAsWritten !== 'string' || li.nameAsWritten.length > 80) { problems.push(`item ${n} is malformed`); return; }
      if (!inText(li.nameAsWritten)) problems.push(`item ${n}: "${li.nameAsWritten}" is not written in the message`);
      const id = orNull(li.menuItemId);
      if (id !== null && (typeof id !== 'string' || !menuIds.has(id))) problems.push(`item ${n}: menuItemId is not one of the menu items`);
      const q = li.quantity;
      let quantityOk = false;
      if (!Number.isInteger(q) || q < 1 || q > PRODUCTION_MAX_QUANTITY) problems.push(`item ${n}: quantity must be a whole number from 1 to ${PRODUCTION_MAX_QUANTITY}`);
      else if (!quantitySupported(q, input.text, li.nameAsWritten)) problems.push(`item ${n}: the quantity ${q} is not written in the message (do not assume a quantity)`);
      else quantityOk = true;

      const waste = orNull(li.wasteUnits) as number | null;
      let wasteUnits: number | undefined;
      if (waste !== null) {
        if (!Number.isInteger(waste) || waste < 1) problems.push(`item ${n}: wasteUnits must be a whole number of at least 1, or null`);
        else if (quantityOk && waste > q) problems.push(`item ${n}: wasteUnits ${waste} is more than the quantity made`);
        else if (!quantityWritten(waste, input.text)) problems.push(`item ${n}: the waste ${waste} is not written in the message`);
        else wasteUnits = waste;
      }
      if (typeof li.nameAsWritten === 'string' && (id === null || (typeof id === 'string' && menuIds.has(id))) && quantityOk) {
        parsed.lineItems.push({ nameAsWritten: li.nameAsWritten.trim(), menuItemId: id as string | null, quantity: q, ...(wasteUnits !== undefined && { wasteUnits }) });
      }
    });
  }

  const when = orNull(raw.when);
  if (when !== null) {
    if (typeof when !== 'string' || when.length > 40 || !inText(when)) problems.push('when is not a phrase written in the message');
    else parsed.when = when.trim();
  }
  const notes = orNull(raw.notes);
  if (notes !== null) {
    if (typeof notes !== 'string' || notes.length > 300 || !inText(notes)) problems.push('notes is not text written in the message');
    else parsed.notes = notes.trim();
  }
  return problems.length ? { ok: false, problems } : { ok: true, parsed };
}

// ── Working out the date ─────────────────────────────────────────────────────

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const weekdayOf = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

/**
 * The date a phrase from a production message means, relative to `today` (a YYYY-MM-DD in the business's time zone).
 * Production has already happened, so: today, "this morning", "just now", yesterday, "last night" and "the day before
 * yesterday" are understood; a weekday name is the most recent one (today if it is that day; "last Saturday" is a week
 * back when today is Saturday); "12 Oct" and "12/10" as in orders. A date that would be in the future is not understood.
 * Returns null when it cannot tell.
 */
export function resolveProductionDate(phrase: string, today: string): string | null {
  const text = phrase.toLowerCase().replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (/\bday before yesterday\b/.test(text)) return addDays(today, -2);
  if (/\b(yesterday|last night)\b/.test(text)) return addDays(today, -1);
  if (/\b(tomorrow|tmrw|tmr|tomo|next)\b/.test(text)) return null;
  if (/\b(today|tonight|now|just now|earlier|this (morning|afternoon|evening)|a while ago)\b/.test(text)) return today;

  const weekday = WEEKDAYS.findIndex(w => new RegExp(`\\b(${w}|${w.slice(0, 3)})\\b`).test(text));
  if (weekday !== -1 && !/\d/.test(text)) {
    let back = (weekdayOf(today) - weekday + 7) % 7;
    if (back === 0 && /\blast\b/.test(text)) back = 7;
    return addDays(today, -back);
  }
  const date = resolveWhen(phrase, today);
  return date && date <= today ? date : null;
}

// ── From the reading to the form ─────────────────────────────────────────────

/** Waste the form has no place for (more than one item, or an item not on the menu): shown to the owner to record another way. */
export interface UnplacedWaste { name: string; units: number }

/** Everything the Log Production Run form is pre-filled with, and what to tell the owner to check. */
export interface ProductionFormFill {
  rows: { recipeId: string; quantity: number }[];
  notFound: NotFoundItem[];
  date?: string;
  /** The phrase the date was read from, when it could not be worked out. */
  dateNotUnderstood?: string;
  notes?: string;
  /** Sellable units after waste: made minus the waste written, for a single item. Worked out here. */
  yieldQty?: number;
  unplacedWaste: UnplacedWaste[];
}

/**
 * Turns the checked reading into form values. The same item written twice is one row with the quantities added.
 * For a single item with waste written, the sellable yield is that quantity minus the waste. With several items the
 * form cannot hold per-item waste, so it is listed for the owner to record with Discard in the Production Log.
 */
export function buildProductionForm(input: { parsed: ParsedProduction; menu: { id: string; name: string }[]; today: string; askAboutVariants?: boolean }): ProductionFormFill {
  const { parsed, menu, today } = input;
  const fill: ProductionFormFill = { rows: [], notFound: [], unplacedWaste: [] };

  const rows = new Map<string, { quantity: number; waste: number }>();
  for (const li of parsed.lineItems) {
    const resolved = input.askAboutVariants ? resolveMenuItem(li.nameAsWritten, menu) : { kind: 'keep' as const };
    const matched = resolved.kind === 'item' ? resolved.id : resolved.kind === 'keep' && li.menuItemId && menu.some(m => m.id === li.menuItemId) ? li.menuItemId : null;
    if (matched) {
      const row = rows.get(matched) ?? { quantity: 0, waste: 0 };
      row.quantity += li.quantity;
      row.waste += li.wasteUnits ?? 0;
      rows.set(matched, row);
    } else {
      fill.notFound.push({
        nameAsWritten: li.nameAsWritten, quantity: li.quantity,
        suggestion: resolved.kind === 'ask' ? null : suggestMenuItem(li.nameAsWritten, menu),
        ...(resolved.kind === 'ask' && { options: resolved.options }),
      });
      if (li.wasteUnits) fill.unplacedWaste.push({ name: li.nameAsWritten, units: li.wasteUnits });
    }
  }
  fill.rows = [...rows].map(([recipeId, r]) => ({ recipeId, quantity: r.quantity }));

  const single = fill.rows.length === 1 && fill.notFound.length === 0;
  for (const [id, r] of rows) {
    if (r.waste <= 0) continue;
    if (single) fill.yieldQty = Math.max(r.quantity - r.waste, 0);
    else fill.unplacedWaste.push({ name: menu.find(m => m.id === id)?.name ?? 'an item', units: r.waste });
  }

  if (parsed.when) {
    const date = resolveProductionDate(parsed.when, today);
    if (date) fill.date = date;
    else fill.dateNotUnderstood = parsed.when;
  }
  if (parsed.notes) fill.notes = parsed.notes;
  return fill;
}
