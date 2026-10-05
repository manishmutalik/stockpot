/**
 * orderParse.ts
 *
 * Filling the Add Order form from a pasted message (a WhatsApp order, say),
 * shared by the server (to check what the model read) and the browser (to
 * prepare the text and to turn the answer into form values).
 *
 * The model only reads the message. Nothing is saved from it: the answer
 * pre-fills the Add Order form, and the owner checks and confirms it. Because
 * this is the owner's own data going in, it is checked hard:
 *  - every quantity and discount the model gives must appear in the message;
 *  - every name, phrase and address must be text that is in the message;
 *  - an item is only matched to a menu item that exists, otherwise it is shown
 *    as not found, with the closest menu item as a suggestion;
 *  - the date is never worked out by the model: it returns the phrase as
 *    written ("tomorrow", "Saturday", "12 Oct") and `resolveWhen` works it out.
 *
 * Privacy (see aiPrivacy): phone numbers are removed from the text before it is
 * sent, and the names of customers the app knows become labels. Names of new
 * customers and delivery addresses written in the message do reach the model:
 * reading them is the point.
 */
import { PAYMENT_METHODS, type PaymentMethod } from '../types';
import { redactPhones, replaceCustomerNames } from './aiPrivacy';
import { addDays } from './localDate';

export const ORDER_TEXT_MAX_CHARS = 1500;
export const ORDER_MAX_ITEMS = 15;
export const ORDER_MAX_MENU_ITEMS = 300;

const PAYMENT_IDS = PAYMENT_METHODS.map(m => m.value);
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

/** The JSON schema the model's answer must follow (structured outputs). Every field is present; "not in the message" is null. */
export const ORDER_SCHEMA = {
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
        },
        required: ['nameAsWritten', 'menuItemId', 'quantity'],
        additionalProperties: false,
      },
    },
    customerLabel: nullable({ type: 'string' }),
    customerName: nullable({ type: 'string' }),
    when: nullable({ type: 'string' }),
    deliveryAddress: nullable({ type: 'string' }),
    paymentStatus: nullable({ type: 'string', enum: ['paid', 'unpaid'] }),
    paymentMethod: nullable({ type: 'string', enum: [...PAYMENT_IDS] }),
    discountAmount: nullable({ type: 'number' }),
    discountPercent: nullable({ type: 'number' }),
    notes: nullable({ type: 'string' }),
    advanceAmount: nullable({ type: 'number' }),
  },
  required: ['lineItems', 'customerLabel', 'customerName', 'when', 'deliveryAddress', 'paymentStatus', 'paymentMethod', 'discountAmount', 'discountPercent', 'notes', 'advanceAmount'],
  additionalProperties: false,
} as const;

export interface ParsedLineItem {
  nameAsWritten: string;
  /** A menu item id from the list that was sent, or null when the item was not found on the menu. */
  menuItemId: string | null;
  quantity: number;
}

/** What was read from the message, checked. Absent when the message does not say. */
export interface ParsedOrder {
  lineItems: ParsedLineItem[];
  customerLabel?: string;
  customerName?: string;
  when?: string;
  deliveryAddress?: string;
  paymentStatus?: 'paid' | 'unpaid';
  paymentMethod?: PaymentMethod;
  discountAmount?: number;
  discountPercent?: number;
  /** What the customer asks for the order itself, as written: a cake message, eggless, instructions. */
  notes?: string;
  /** Money the message says is paid in advance (a number written in it); the method is `paymentMethod`. */
  advanceAmount?: number;
}

// ── Preparing the text ──────────────────────────────────────────────────────

/** The message as it is sent, with the phone numbers it held (for the app to use itself) and the customers it named. */
export function prepareOrderText(raw: string, customers: { name: string; label: string }[]): { text: string; phones: string[]; mentioned: string[] } {
  const collapsed = raw.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const { text: noPhones, phones } = redactPhones(collapsed, '[phone]');
  const { text, mentioned } = replaceCustomerNames(noPhones, customers);
  return { text: text.slice(0, ORDER_TEXT_MAX_CHARS), phones, mentioned };
}

// ── Checking what the model read ─────────────────────────────────────────────

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
  couple: 2, pair: 2, dozen: 12,
};

/** Lower case, one space between words, no punctuation that varies: for "is this text in that text". */
const squash = (s: string) => s.toLowerCase().replace(/[\s,.;:!?'"()’-]+/g, ' ').trim();

/** Every number written in the text, in digits ("2", "1,200", "12.5") or in words ("two", "dozen"). */
function numbersIn(text: string): Set<number> {
  const found = new Set<number>();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ''));
    if (Number.isFinite(n)) found.add(n);
  }
  for (const m of text.toLowerCase().matchAll(/[a-z]+/g)) if (m[0] in WORD_NUMBERS) found.add(WORD_NUMBERS[m[0]]);
  return found;
}

/**
 * Whether a quantity is supported by the message: it is written (digits or words),
 * it is one (a bare "croissant" or "a croissant"), it is "half a dozen", or it is a
 * multiple of a dozen ("2 dozen" is 24).
 */
export function quantityAppears(quantity: number, text: string): boolean {
  if (quantity === 1) return true;
  const written = numbersIn(text);
  if (written.has(quantity)) return true;
  const lower = text.toLowerCase();
  if (quantity === 6 && /half\s+(a\s+)?dozen/.test(lower)) return true;
  if (/dozen/.test(lower) && quantity % 12 === 0 && written.has(quantity / 12)) return true;
  return false;
}

/** Whether a number (a discount) is written in the message in digits. */
export function numberAppears(value: number, text: string): boolean {
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    if (Number(m[0].replace(/,/g, '')) === value) return true;
  }
  return false;
}

export type ParseValidation = { ok: true; parsed: ParsedOrder } | { ok: false; problems: string[] };

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const orNull = (v: unknown) => (v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? null : v);

/** Checks the model's reading against the message (the text that was sent) and the menu ids that were sent. */
export function validateParsedOrder(raw: unknown, input: { text: string; menuIds: Iterable<string> }): ParseValidation {
  if (!isObject(raw)) return { ok: false, problems: ['the answer is not an object'] };
  const problems: string[] = [];
  const menuIds = new Set(input.menuIds);
  const haystack = squash(input.text);
  const inText = (s: string) => squash(s) !== '' && haystack.includes(squash(s));

  const parsed: ParsedOrder = { lineItems: [] };

  if (!Array.isArray(raw.lineItems)) {
    problems.push('lineItems is not a list');
  } else if (raw.lineItems.length > ORDER_MAX_ITEMS) {
    problems.push(`more than ${ORDER_MAX_ITEMS} items`);
  } else {
    raw.lineItems.forEach((li: any, i: number) => {
      const n = i + 1;
      if (!isObject(li) || typeof li.nameAsWritten !== 'string' || li.nameAsWritten.length > 80) { problems.push(`item ${n} is malformed`); return; }
      if (!inText(li.nameAsWritten)) problems.push(`item ${n}: "${li.nameAsWritten}" is not written in the message`);
      const id = orNull(li.menuItemId);
      if (id !== null && (typeof id !== 'string' || !menuIds.has(id))) problems.push(`item ${n}: menuItemId is not one of the menu items`);
      const q = li.quantity;
      if (!Number.isInteger(q) || q < 1 || q > 999) problems.push(`item ${n}: quantity must be a whole number from 1 to 999`);
      else if (!quantityAppears(q, input.text)) problems.push(`item ${n}: the quantity ${q} is not written in the message`);
      if (typeof li.nameAsWritten === 'string' && (id === null || (typeof id === 'string' && menuIds.has(id))) && Number.isInteger(q)) {
        parsed.lineItems.push({ nameAsWritten: li.nameAsWritten.trim(), menuItemId: id as string | null, quantity: q });
      }
    });
  }

  const label = orNull(raw.customerLabel);
  if (label !== null) {
    if (typeof label !== 'string' || !/^C-[A-Z0-9]{1,12}$/.test(label) || !input.text.includes(label)) problems.push('customerLabel is not a label written in the message');
    else parsed.customerLabel = label;
  }

  const name = orNull(raw.customerName);
  if (name !== null) {
    if (typeof name !== 'string' || name.length > 60 || !inText(name)) problems.push('customerName is not written in the message');
    else if (!label) parsed.customerName = name.trim();
  }

  const when = orNull(raw.when);
  if (when !== null) {
    if (typeof when !== 'string' || when.length > 40 || !inText(when)) problems.push('when is not a phrase written in the message');
    else parsed.when = when.trim();
  }

  const address = orNull(raw.deliveryAddress);
  if (address !== null) {
    if (typeof address !== 'string' || address.length > 300 || !inText(address)) problems.push('deliveryAddress is not written in the message');
    else parsed.deliveryAddress = address.trim();
  }

  const status = orNull(raw.paymentStatus);
  if (status !== null) {
    if (status !== 'paid' && status !== 'unpaid') problems.push('paymentStatus must be paid or unpaid');
    else parsed.paymentStatus = status;
  }

  const method = orNull(raw.paymentMethod);
  if (method !== null) {
    if (typeof method !== 'string' || !PAYMENT_IDS.includes(method as PaymentMethod)) problems.push('paymentMethod is not one of the payment methods');
    else parsed.paymentMethod = method as PaymentMethod;
  }

  const amount = orNull(raw.discountAmount);
  if (amount !== null) {
    if (typeof amount !== 'number' || !(amount > 0) || !numberAppears(amount, input.text)) problems.push('discountAmount is not a number written in the message');
    else parsed.discountAmount = amount;
  }
  const percent = orNull(raw.discountPercent);
  if (percent !== null) {
    if (typeof percent !== 'number' || !(percent > 0) || percent > 100 || !numberAppears(percent, input.text)) problems.push('discountPercent is not a number written in the message');
    else parsed.discountPercent = percent;
  }

  const notes = orNull(raw.notes);
  if (notes !== null) {
    if (typeof notes !== 'string' || notes.length > 300 || !inText(notes)) problems.push('notes is not text written in the message');
    else parsed.notes = notes.trim();
  }
  const advanceAmount = orNull(raw.advanceAmount);
  if (advanceAmount !== null) {
    if (typeof advanceAmount !== 'number' || !(advanceAmount > 0) || !numberAppears(advanceAmount, input.text)) problems.push('advanceAmount is not a number written in the message');
    else parsed.advanceAmount = advanceAmount;
  }

  return problems.length ? { ok: false, problems } : { ok: true, parsed };
}

// ── Working out the date ─────────────────────────────────────────────────────

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const weekdayOf = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const isRealDate = (y: number, m: number, d: number) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** A day and month with no year means the next time that date comes round, or one that has only just passed. */
function nextOccurrence(day: number, month: number, today: string): string | null {
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    if (!isRealDate(y, month, day)) continue;
    const candidate = iso(y, month, day);
    if (candidate >= addDays(today, -30)) return candidate;
  }
  return null;
}

/**
 * Works out the date a phrase from the message means, relative to `today` (a
 * YYYY-MM-DD in the business's time zone). Understands today, tomorrow, the day
 * after tomorrow, yesterday, weekday names (the next one, today if it is that
 * day; "next" skips today), "12 Oct", "12th October", "Oct 12" and "12/10" or
 * "12-10-2026" (day first). Returns null when it cannot tell.
 */
export function resolveWhen(phrase: string, today: string): string | null {
  const text = phrase.toLowerCase().replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  if (/\bday after tomorrow\b/.test(text)) return addDays(today, 2);
  if (/\b(tomorrow|tmrw|tmr|tomo)\b/.test(text)) return addDays(today, 1);
  if (/\byesterday\b/.test(text)) return addDays(today, -1);
  if (/\b(today|tonight|now|asap)\b/.test(text)) return today;

  const numeric = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) {
    const day = Number(numeric[1]), month = Number(numeric[2]);
    if (numeric[3]) {
      const y = numeric[3].length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
      return isRealDate(y, month, day) ? iso(y, month, day) : null;
    }
    return nextOccurrence(day, month, today);
  }

  const monthPattern = MONTHS.map(m => `${m}|${m.slice(0, 3)}`).join('|');
  const dayFirst = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(${monthPattern})\\b`));
  const monthFirst = text.match(new RegExp(`\\b(${monthPattern})\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  const named = dayFirst ? { day: Number(dayFirst[1]), month: dayFirst[2] } : monthFirst ? { day: Number(monthFirst[2]), month: monthFirst[1] } : null;
  if (named) {
    const month = MONTHS.findIndex(m => m === named.month || m.slice(0, 3) === named.month) + 1;
    return month ? nextOccurrence(named.day, month, today) : null;
  }

  const weekday = WEEKDAYS.findIndex(w => new RegExp(`\\b(${w}|${w.slice(0, 3)})\\b`).test(text));
  if (weekday !== -1) {
    const skipToday = /\bnext\b/.test(text);
    let ahead = (weekday - weekdayOf(today) + 7) % 7;
    if (ahead === 0 && skipToday) ahead = 7;
    return addDays(today, ahead);
  }
  return null;
}

// ── Matching names to the menu ───────────────────────────────────────────────

const tidy = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** How alike two words are, from 0 to 1. */
const similarity = (a: string, b: string) => (a || b ? 1 - editDistance(a, b) / Math.max(a.length, b.length) : 1);

/**
 * The menu item a name most likely meant ("croisant" for "Classic Croissant"),
 * or null when nothing is close enough. Compares whole names and single words.
 * Only ever used as a suggestion the owner can accept: it is never applied.
 */
export function suggestMenuItem<T extends { id: string; name: string }>(written: string, menu: T[]): T | null {
  const w = tidy(written);
  if (w.length < 3) return null;
  let best: { item: T; score: number } | null = null;
  for (const item of menu) {
    const name = tidy(item.name);
    if (!name) continue;
    let score = similarity(w, name);
    if (name.includes(w) || w.includes(name) || name.replace(/ /g, '').includes(w.replace(/ /g, ''))) score = Math.max(score, 0.8);
    for (const word of name.split(' ')) {
      if (word.length >= 4) for (const theirs of w.split(' ')) if (theirs.length >= 4) score = Math.max(score, similarity(theirs, word) * 0.9);
    }
    if (!best || score > best.score) best = { item, score };
  }
  return best && best.score >= 0.7 ? best.item : null;
}

// ── From the reading to the form ─────────────────────────────────────────────

export interface NotFoundItem {
  nameAsWritten: string;
  quantity: number;
  suggestion: { id: string; name: string } | null;
}

/** Everything the Add Order form is pre-filled with, and what to tell the owner to check. */
export interface OrderFormFill {
  lineItems: { menuItemId: string; quantity: number }[];
  notFound: NotFoundItem[];
  customerName?: string;
  customerPhone?: string;
  /** Set when the message named a customer the app already knows. */
  knownCustomer: boolean;
  date?: string;
  /** The phrase the date was read from, when it could not be worked out. */
  dateNotUnderstood?: string;
  payLater?: boolean;
  method?: PaymentMethod;
  discountAmount?: number;
  deliveryAddress?: string;
  /** What the customer asked for the order itself (a cake message, eggless). */
  notes?: string;
  /** Money the message says was paid in advance; `advanceMethod` is how, when it said. */
  advanceAmount?: number;
  advanceMethod?: PaymentMethod;
}

/**
 * Turns the checked reading into form values. Customers the app knows are
 * identified by label here, on the device, and their name and phone number come
 * from their own record; a phone number found in the message is used only when
 * there is no known customer. A percentage discount becomes an amount from the
 * order's own value, computed here.
 */
export function buildOrderForm(input: {
  parsed: ParsedOrder;
  menu: { id: string; name: string; sellingPrice: number }[];
  customers: { label: string; name: string; phone?: string }[];
  phones: string[];
  today: string;
}): OrderFormFill {
  const { parsed, menu, customers, phones, today } = input;
  const fill: OrderFormFill = { lineItems: [], notFound: [], knownCustomer: false };

  // The same item written twice is one row, with the quantities added.
  const rows = new Map<string, number>();
  for (const li of parsed.lineItems) {
    if (li.menuItemId && menu.some(m => m.id === li.menuItemId)) rows.set(li.menuItemId, (rows.get(li.menuItemId) ?? 0) + li.quantity);
    else fill.notFound.push({ nameAsWritten: li.nameAsWritten, quantity: li.quantity, suggestion: suggestMenuItem(li.nameAsWritten, menu) });
  }
  fill.lineItems = [...rows].map(([menuItemId, quantity]) => ({ menuItemId, quantity }));

  const known = parsed.customerLabel ? customers.find(c => c.label === parsed.customerLabel) : undefined;
  if (known) {
    fill.knownCustomer = true;
    fill.customerName = known.name;
    if (known.phone) fill.customerPhone = known.phone;
  } else {
    if (parsed.customerName) fill.customerName = parsed.customerName;
    if (phones[0]) fill.customerPhone = phones[0];
  }

  if (parsed.when) {
    const date = resolveWhen(parsed.when, today);
    if (date) fill.date = date;
    else fill.dateNotUnderstood = parsed.when;
  }
  if (parsed.paymentStatus === 'unpaid') fill.payLater = true;
  else if (parsed.paymentStatus === 'paid') fill.payLater = false;
  if (parsed.paymentMethod && parsed.paymentStatus !== 'unpaid') fill.method = parsed.paymentMethod;
  if (parsed.deliveryAddress) fill.deliveryAddress = parsed.deliveryAddress;
  if (parsed.notes) fill.notes = parsed.notes;
  if (parsed.advanceAmount) {
    fill.advanceAmount = parsed.advanceAmount;
    if (parsed.paymentMethod) fill.advanceMethod = parsed.paymentMethod;
  }

  const subtotal = fill.lineItems.reduce((sum, li) => sum + (menu.find(m => m.id === li.menuItemId)?.sellingPrice ?? 0) * li.quantity, 0);
  if (parsed.discountAmount) fill.discountAmount = Math.min(parsed.discountAmount, subtotal || parsed.discountAmount);
  else if (parsed.discountPercent && subtotal > 0) fill.discountAmount = Math.round(subtotal * parsed.discountPercent) / 100;

  return fill;
}
