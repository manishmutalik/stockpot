/**
 * billing.ts
 *
 * Pure logic behind customer bills: what a bill contains and adds up to, the
 * UPI payment link, WhatsApp links and the "view bill online" token. It is
 * shared by the browser (the bill modal) and the server (the public bill
 * page), so the two can never disagree about a bill, and it has no Firebase
 * or React dependency so it can be unit tested on its own.
 *
 * GST is not re-derived here: it goes through `splitSaleForGst`, the same
 * function the dashboard uses, applied to the same amount (items plus the
 * delivery charge, which is counted once per multi-item order).
 */
import type { BakerySettings, MenuItem, Order } from '../types';
import { splitSaleForGst, type GstPricingMode } from './gstCalculations';
import { summarizeOrders } from './orderStats';

export interface BillLine {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
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
  gst: { rate: number; mode: GstPricingMode; amount: number } | null;
  /** What the customer pays. */
  total: number;
  currency: { code: string; symbol: string };
  /** Present only when the business set a UPI ID and bills in rupees. */
  upiId?: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** A logo is kept only when it is a web URL or a small embedded image, so a bill stays small. */
const MAX_LOGO_CHARS = 200_000;
function usableLogo(logo: string | undefined): string | undefined {
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
}): Bill {
  const { orders, menu, settings, currency } = input;
  const first = [...orders].sort((a, b) => a.id.localeCompare(b.id))[0];

  const lines: BillLine[] = orders.map(o => {
    const item = menu.find(m => m.id === o.menuItemId);
    const unitPrice = item?.sellingPrice || 0;
    const quantity = o.quantity || 0;
    return { name: item?.name || 'Item', quantity, unitPrice, lineTotal: round2(unitPrice * quantity) };
  });
  const itemsTotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  // Same rule as the dashboard: a shared delivery charge counts once per order.
  const deliveryCharge = round2(summarizeOrders(orders, menu).deliveryCharged);
  const sale = itemsTotal + deliveryCharge;

  const rate = settings.gstRate || 0;
  const mode: GstPricingMode = settings.gstPricingMode || 'exclusive';
  const gst = settings.gstApplicable && rate > 0
    ? { rate, mode, amount: round2(splitSaleForGst(sale, rate, mode).gstAmount) }
    : null;
  const total = round2(gst && mode === 'exclusive' ? sale + gst.amount : sale);

  return {
    reference: first.id.slice(0, 8).toUpperCase(),
    date: first.date,
    customerName: first.customerName || undefined,
    business: { name: settings.name, address: settings.address, phone: settings.phone, logo: usableLogo(settings.logo) },
    lines,
    itemsTotal,
    deliveryCharge,
    gst,
    total,
    currency,
    upiId: canPayByUpi(settings.upiId, currency.code) ? settings.upiId!.trim() : undefined,
  };
}

/** UPI is India-only: a payment QR needs a UPI ID and a bill in rupees. */
export function canPayByUpi(upiId: string | undefined, currencyCode: string): boolean {
  return !!upiId && upiId.trim().length > 0 && currencyCode === 'INR';
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
  const base = `${greeting} your bill from ${bill.business.name} — ${formatMoney(bill.total, bill.currency)}.`;
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
export function resolveBillToken(orders: Pick<Order, 'billToken'>[]): { token: string; isNew: boolean } {
  const existing = orders.map(o => o.billToken).find(isValidBillToken);
  return existing ? { token: existing, isNew: false } : { token: generateBillToken(), isNew: true };
}
