/**
 * billing.ts
 *
 * Pure logic behind customer bills: what a bill contains and adds up to, the
 * UPI payment link, WhatsApp links and the "view bill online" token. It is
 * shared by the browser (the bill modal) and the server (the public bill
 * page), so the two can never disagree about a bill, and it has no Firebase
 * or React dependency so it can be unit tested on its own.
 *
 * The sums are not re-derived here: they come from `saleAmounts` in profit.ts,
 * the same code the dashboard and the Orders tab use, so a bill and the profit
 * figures always agree on what the customer paid (items plus delivery minus
 * the discount, plus GST on top in exclusive pricing).
 */
import type { BakerySettings, MenuItem, Order } from '../types';
import type { GstPricingMode } from './gstCalculations';
import { formatShortDate } from './localDate';
import { saleAmounts } from './profit';
import { clusterOrdersByGroup } from './orderClustering';
import { advanceOf } from './preorders';
import { resolveItemName, resolveUnitPrice } from './orderPricing';

export interface BillLine {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** Order date; set only on a statement, where lines come from different days. */
  date?: string;
}

export interface Bill {
  /** Short reference, used as the UPI payment note and shown on the bill. */
  reference: string;
  date: string; // YYYY-MM-DD
  customerName?: string;
  business: { name: string; address: string; phone: string; logo?: string };
  lines: BillLine[];
  /** Sum of the item lines, before delivery and GST. */
  itemsTotal: number;
  deliveryCharge: number;
  /** Amount taken off the whole order, counted once per multi-item order. 0 when none. */
  discount: number;
  gst: { rate: number; mode: GstPricingMode; amount: number } | null;
  /** What the customer pays. */
  total: number;
  /** Money received in advance (pre-orders). `date` is when, for a single bill; a statement covering several orders has none. */
  advance?: { amount: number; date?: string };
  /** What is still to be paid: the total less any advance. The payment QR and link ask for this, never the total. Absent on bills saved before advances existed: then it is the total. */
  balanceDue: number;
  currency: { code: string; symbol: string };
  /** Present only when the business set a UPI ID and bills in rupees. */
  upiId?: string;
  /** 'statement' is a consolidated bill for several of a customer's pending orders. */
  kind?: 'statement';
  /** For a statement: how many orders it covers (a multi-item order counts once). */
  orderCount?: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** A logo is kept only when it is a web URL or a small embedded image, so a bill stays small. */
const MAX_LOGO_CHARS = 200_000;
export function usableLogo(logo: string | undefined): string | undefined {
  if (!logo) return undefined;
  const ok = /^https?:\/\//i.test(logo) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(logo);
  return ok && logo.length <= MAX_LOGO_CHARS ? logo : undefined;
}

/** Orders that make up one bill: the whole multi-item order, or the single order. */
export function ordersForBill(order: Order, allOrders: Order[]): Order[] {
  if (!order.orderGroupId) return [order];
  const group = allOrders.filter(o => o.orderGroupId === order.orderGroupId);
  return group.length > 0 ? group : [order];
}

export function buildBill(input: {
  orders: Order[];
  menu: MenuItem[];
  settings: Pick<BakerySettings, 'name' | 'address' | 'phone' | 'logo' | 'gstApplicable' | 'gstRate' | 'gstPricingMode' | 'upiId'>;
  currency: { code: string; symbol: string };
  /** A consolidated bill for several orders (dated lines, "ST-" reference). */
  statement?: boolean;
  /** The statement's date, YYYY-MM-DD; defaults to today. */
  today?: string;
}): Bill {
  const { orders, menu, settings, currency, statement } = input;
  const byId = [...orders].sort((a, b) => a.id.localeCompare(b.id))[0];
  const ordered = statement
    ? [...orders].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    : orders;

  const lines: BillLine[] = ordered.map(o => {
    // The price and name the order was made at, so a later menu change never alters a bill.
    const unitPrice = resolveUnitPrice(o, menu).value;
    const quantity = o.quantity || 0;
    return {
      name: resolveItemName(o, menu), quantity, unitPrice, lineTotal: round2(unitPrice * quantity),
      ...(statement && { date: o.date }),
    };
  });
  // The same sums the profit figures use (shared delivery charge and discount count once per order, GST
  // is worked out on the sale after the discount), so the bill and the Orders and Summary screens agree.
  const sale = saleAmounts(orders, menu, settings);
  const rate = settings.gstApplicable ? settings.gstRate || 0 : 0;
  const mode: GstPricingMode = settings.gstPricingMode || 'exclusive';
  const gst = rate > 0 ? { rate, mode, amount: round2(sale.gstAmount) } : null;
  const itemsTotal = round2(sale.itemsGross);
  const deliveryCharge = round2(sale.deliveryGross);
  const discount = round2(sale.discount);
  const total = round2(sale.customerPays);
  // An advance is stored on one item of each order. Together they can never be more than what is owed.
  const advances = clusterOrdersByGroup(orders).map(c => advanceOf(c.type === 'single' ? [c.order] : c.orders)).filter((a): a is NonNullable<typeof a> => !!a);
  const advanceAmount = round2(Math.min(advances.reduce((sum, a) => sum + a.amount, 0), total));
  const balanceDue = round2(Math.max(total - advanceAmount, 0));

  return {
    reference: statement ? `ST-${byId.id.slice(0, 6).toUpperCase()}` : byId.id.slice(0, 8).toUpperCase(),
    date: statement ? (input.today ?? new Date().toISOString().slice(0, 10)) : byId.date,
    customerName: ordered.find(o => o.customerName)?.customerName || undefined,
    business: { name: settings.name, address: settings.address, phone: settings.phone, logo: usableLogo(settings.logo) },
    lines,
    itemsTotal,
    deliveryCharge,
    discount,
    gst,
    total,
    ...(advanceAmount > 0 && { advance: { amount: advanceAmount, ...(!statement && advances.length === 1 && { date: advances[0].date }) } }),
    balanceDue,
    currency,
    upiId: canPayByUpi(settings.upiId, currency.code) ? settings.upiId!.trim() : undefined,
    ...(statement && { kind: 'statement' as const, orderCount: new Set(orders.map(o => o.orderGroupId || o.id)).size }),
  };
}

/**
 * What is still to pay on a bill: the total less any advance. A bill saved before advances existed has no
 * `balanceDue`, and its balance is its total. The payment QR and link always ask for this.
 */
export const billBalance = (bill: Pick<Bill, 'total' | 'balanceDue'>): number => bill.balanceDue ?? bill.total;

/** UPI is India-only: a payment QR needs a UPI ID and a bill in rupees. */
export function canPayByUpi(upiId: string | undefined, currencyCode: string): boolean {
  return !!upiId && upiId.trim().length > 0 && currencyCode === 'INR';
}

/**
 * The payment link for a bill: it asks for the balance, never the total, so a customer who paid an advance is
 * not charged twice. Null when there is no UPI ID or nothing is left to pay.
 */
export function buildBillUpiLink(bill: Pick<Bill, 'upiId' | 'total' | 'balanceDue' | 'business' | 'reference'>): string | null {
  const balance = billBalance(bill);
  return bill.upiId && balance > 0
    ? buildUpiLink({ upiId: bill.upiId, payeeName: bill.business.name, amount: balance, reference: bill.reference })
    : null;
}

/**
 * The upi://pay deep link encoded in the payment QR. Every value is URL
 * encoded (business names have spaces and "&"); the amount is fixed to two
 * decimals as UPI apps expect; the note is the bill reference.
 */
export function buildUpiLink(input: { upiId: string; payeeName: string; amount: number; reference: string }): string {
  const enc = encodeURIComponent;
  return `upi://pay?pa=${enc(input.upiId.trim())}&pn=${enc(input.payeeName.trim())}&am=${input.amount.toFixed(2)}&tn=${enc(input.reference)}&cu=INR`;
}

/**
 * Turns however a phone number was typed ("+91 98450 10101", "098450-10101",
 * "9845010101") into the digits-only international form wa.me needs
 * ("919845010101"). Bare 10-digit numbers are taken to be Indian, since that
 * is the market. Returns null when it can't be a phone number.
 */
export function normalizeWhatsAppNumber(raw: string | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export function buildWhatsAppUrl(phone: string | undefined, message: string): string | null {
  const number = normalizeWhatsAppNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
}

export function formatMoney(amount: number, currency: { symbol: string }): string {
  return `${currency.symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The short message pre-filled in WhatsApp (it can't carry rich formatting). */
export function buildBillMessage(bill: Bill, link?: string): string {
  const greeting = bill.customerName ? `Hi ${bill.customerName}, here's` : "Here's";
  const balance = billBalance(bill);
  const base = bill.kind === 'statement'
    ? `${greeting} your statement from ${bill.business.name}: ${formatMoney(balance, bill.currency)} due for ${bill.orderCount} order${bill.orderCount === 1 ? '' : 's'}.`
    : bill.advance
      ? `${greeting} your bill from ${bill.business.name} — ${formatMoney(bill.total, bill.currency)}. Advance received: ${formatMoney(bill.advance.amount, bill.currency)}. Balance due: ${formatMoney(balance, bill.currency)}.`
      : `${greeting} your bill from ${bill.business.name} — ${formatMoney(bill.total, bill.currency)}.`;
  return link ? `${base} View/pay: ${link}` : base;
}

const TOKEN_PATTERN = /^[a-f0-9]{32}$/;

export const isValidBillToken = (token: unknown): token is string => typeof token === 'string' && TOKEN_PATTERN.test(token);

/** 128 random bits as 32 hex characters: unguessable, so bills can't be enumerated. */
export function generateBillToken(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * The token for a bill: the one already stored on any of its orders, or a new
 * one when this is the first bill. Reusing it keeps links and QR codes that
 * were already sent to a customer working.
 */
export function resolveBillToken(
  orders: Pick<Order, 'billToken' | 'statementToken'>[],
  field: 'billToken' | 'statementToken' = 'billToken'
): { token: string; isNew: boolean } {
  const existing = orders.map(o => o[field]).find(isValidBillToken);
  return existing ? { token: existing, isNew: false } : { token: generateBillToken(), isNew: true };
}

/** "morning", "afternoon", "evening" or a time such as "16:30", in words for a message. */
export const describeDueSlot = (slot: string | undefined): string => {
  const s = (slot ?? '').trim();
  if (!s) return '';
  return /^\d{1,2}:\d{2}$/.test(s) ? `at ${s}` : s;
};

/** "2 Sourdough", "2 Sourdough and 1 Chocolate Cake", "A, B and C". */
const listItems = (lines: { name: string; quantity: number }[]) => {
  const parts = lines.map(l => `${l.quantity} ${l.name}`);
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
};

/**
 * The WhatsApp confirmation for a booked pre-order: what, when, and what has been paid and what is left.
 * "Hi Priya, your order for 2 Sourdough on Tue 6 Oct (morning) is confirmed. Advance received: ₹200. Balance: ₹300."
 */
export function buildPreorderConfirmation(input: {
  customerName?: string;
  lines: { name: string; quantity: number }[];
  /** The due date, YYYY-MM-DD. */
  date: string;
  dueSlot?: string;
  currency: { symbol: string };
  /** What the customer pays for the order. */
  total: number;
  /** The advance received, if any. */
  advance?: number;
  businessName?: string;
}): string {
  const money = (n: number) => formatMoney(n, input.currency);
  const slot = describeDueSlot(input.dueSlot);
  const greeting = input.customerName ? `Hi ${input.customerName}, your` : 'Your';
  const what = `${greeting} order for ${listItems(input.lines)} on ${formatShortDate(input.date)}${slot ? ` (${slot})` : ''} is confirmed.`;
  const advance = Math.max(input.advance ?? 0, 0);
  const balance = Math.max(Math.round((input.total - advance) * 100) / 100, 0);
  const money_line = advance <= 0
    ? ` Total: ${money(input.total)}.`
    : balance <= 0
      ? ` Paid in full: ${money(input.total)}.`
      : ` Advance received: ${money(advance)}. Balance: ${money(balance)}.`;
  return `${what}${money_line}${input.businessName ? ` Thank you, ${input.businessName}.` : ''}`;
}
