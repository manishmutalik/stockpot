/**
 * payOnline.ts
 *
 * A customer paying a bill by card or online through the owner's own payment gateway (see lib/gateways). Three public routes:
 *
 *   GET /bill/:token          the bill page, with a "Pay by card or online" button when the owner has set a gateway up
 *   GET /bill/:token/pay      makes a payment link for what is owed right now and sends the customer to it
 *   GET /bill/:token/return   where the gateway sends the customer afterwards
 *
 * The rules that keep this safe:
 *  - The amount is worked out here, from the orders as they are now. Nothing the browser sends is used for it.
 *  - Coming back from the gateway proves nothing. The link is asked about with the owner's keys, and the orders are marked paid
 *    (by card, with the card fee) only if the gateway says it was paid in full.
 *  - Marking paid happens once: only orders still unpaid are touched, inside a transaction.
 *  - The owner's keys are decrypted only for the length of one call and never logged or sent anywhere but the gateway.
 *  - The token in the address is the only access check, as for the bill itself. A link already made for the same amount is
 *    reused, so opening the button again and again does not make a pile of links on the owner's account.
 */
import type { Request, Response } from 'express';
import { buildBill, billBalance, isValidBillToken } from '../src/utils/billing';
import { isUnpaid } from '../src/utils/payments';
import { planMarkPaid } from '../src/utils/plans';
import { billSettingsOf } from '../src/utils/quickViews';
import type { BakerySettings, Order } from '../src/types';
import type { BillRecord, BillRecords, PaymentAttempt } from './billStore';
import { messageHtml, NOT_FOUND_HTML, renderBillHtml, type BillPageExtras } from './billHtml';
import { PUBLIC_BILL_HEADERS } from './billRoutes';
import { getGateway, type FetchLike, type GatewayCredentials, type GatewayId } from './gateways';
import { credentialsOf } from './gatewayRoutes';
import type { GatewayStore } from './gatewayStore';
import type { QuickDb } from './quickDb';
import { asMenu } from './quickRoutes';

export interface PayOnlineDeps {
  db: QuickDb;
  records: BillRecords;
  gateways: GatewayStore;
  /** From PAYMENT_SECRETS_KEY. Null: nothing can be decrypted, so no card payment is offered. */
  secretKey: Buffer | null;
  fetch: FetchLike;
  now: () => number;
  /** The app's public address; the gateway sends the customer back to it. */
  publicUrl?: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const base = (deps: PayOnlineDeps) => (deps.publicUrl ?? '').replace(/\/$/, '');

/** A link made for the same amount is reused for this long; the gateway's own link lasts a day. */
const REUSE_MS = 12 * 60 * 60 * 1000;
const LINK_LIFE_SECONDS = 24 * 60 * 60;
/** The gateway is asked about a waiting link at most this often, however often the page is opened. */
const CHECK_EVERY_MS = 10_000;

// ─── What is owed right now ─────────────────────────────────────────────────

interface Owing {
  /** Every live order on the bill is paid. */
  allPaid: boolean;
  unpaidIds: string[];
  balance: number;
  customerName?: string;
  customerPhone?: string;
  businessName: string;
  businessPhone?: string;
  reference: string;
}

async function loadOwing(deps: PayOnlineDeps, record: BillRecord): Promise<Owing> {
  return deps.db.run(record.uid, async tx => {
    const found = await tx.getMany('orders', record.orderIds);
    const live = [...found.values()].filter(o => !o.cancelledOn) as unknown as Order[];
    const unpaid = live.filter(isUnpaid);
    const settings = ((await tx.get('settings', 'bakery')) ?? {}) as Partial<BakerySettings>;
    const owing: Owing = {
      allPaid: live.length > 0 && unpaid.length === 0, unpaidIds: unpaid.map(o => o.id), balance: 0,
      businessName: record.bill.business.name, businessPhone: settings.phone || undefined, reference: record.bill.reference,
    };
    if (unpaid.length === 0) return owing;
    const menu = asMenu(await tx.getMany('menu', unpaid.map(o => o.menuItemId)));
    const bill = buildBill({
      orders: unpaid, menu, settings: billSettingsOf(settings), currency: record.bill.currency,
      statement: record.bill.kind === 'statement',
    });
    return { ...owing, balance: round2(billBalance(bill)), customerName: bill.customerName, customerPhone: unpaid.find(o => o.customerPhone)?.customerPhone };
  });
}

// ─── The owner's keys ───────────────────────────────────────────────────────

async function accessFor(deps: PayOnlineDeps, uid: string, provider: GatewayId): Promise<{ creds: GatewayCredentials } | null> {
  if (!deps.secretKey) return null;
  const rec = await deps.gateways.get(uid);
  if (!rec || rec.provider !== provider) return null;
  const creds = credentialsOf(rec, deps.secretKey, uid);
  return creds ? { creds } : null;
}

// ─── Asking the gateway, and marking paid ───────────────────────────────────

/** Marks the bill's orders paid by card, once. Returns how many were still unpaid. */
async function markPaid(deps: PayOnlineDeps, uid: string, orderIds: string[]): Promise<number> {
  return deps.db.run(uid, async tx => {
    const found = await tx.getMany('orders', orderIds);
    const ids = [...found.values()].filter(o => !o.cancelledOn && isUnpaid(o as unknown as Order)).map(o => o.id);
    if (ids.length === 0) return 0;
    const settings = ((await tx.get('settings', 'bakery')) ?? {}) as Partial<BakerySettings>;
    tx.apply(planMarkPaid({ ids, paid: true, method: 'card', feeRates: settings.paymentFeeRates }));
    return ids.length;
  });
}

/**
 * If a payment is waiting on a link, asks the gateway whether it was paid, and settles it if it was paid in full. A gateway that
 * cannot be reached, or keys that no longer work, leave it waiting; the next look tries again.
 */
async function reconcile(deps: PayOnlineDeps, token: string, record: BillRecord, opts: { force?: boolean } = {}): Promise<PaymentAttempt | undefined> {
  const payment = record.payment;
  if (!payment || payment.status !== 'created') return payment;
  const now = deps.now();
  if (!opts.force && payment.checkedAt && now - payment.checkedAt < CHECK_EVERY_MS) return payment;

  const access = await accessFor(deps, record.uid, payment.provider);
  if (!access) return payment;
  let state;
  try {
    state = await getGateway(payment.provider).getLink(access.creds, payment.linkId, deps.fetch);
  } catch (err: any) {
    console.error('Online payment check failed:', err?.message);
    return payment;
  }

  if (state.status !== 'paid' || state.amountPaid + 0.005 < payment.amount) {
    const waiting = { ...payment, checkedAt: now };
    await deps.records.savePayment(token, waiting);
    return waiting;
  }

  const marked = await markPaid(deps, record.uid, payment.orderIds);
  if (marked === 0) {
    // Another look settled it a moment ago: leave that record as it is.
    const fresh = await deps.records.get(token);
    if (fresh?.payment?.status === 'settled') return fresh.payment;
    console.warn(`Online payment received for a bill whose orders were already paid (bill ${token.slice(0, 6)}…)`);
  }
  const settled: PaymentAttempt = {
    ...payment, status: 'settled', checkedAt: now, settledAt: now,
    ...(state.paymentId && { paymentId: state.paymentId }), ...(marked === 0 && { note: 'orders_already_paid' as const }),
  };
  await deps.records.savePayment(token, settled);
  return settled;
}

// ─── GET /bill/:token ───────────────────────────────────────────────────────

async function pageExtras(deps: PayOnlineDeps, token: string, record: BillRecord, cameBack: boolean): Promise<BillPageExtras> {
  // A bill with no owner or orders on record (an old one): the page is the bill, as it always was.
  if (!record.uid || record.orderIds.length === 0) return {};
  const rec = await deps.gateways.get(record.uid);
  // An owner with no gateway, and no payment ever started: the same.
  if (!rec && !record.payment) return {};

  const payment = await reconcile(deps, token, record);
  const owing = await loadOwing(deps, { ...record, payment });
  if (owing.allPaid) return { paid: true, ...(cameBack && payment?.status === 'settled' && { notice: { tone: 'good' as const, text: 'Payment received. Thank you!' } }) };

  const extras: BillPageExtras = {};
  if (cameBack && payment?.status === 'created') {
    extras.notice = { tone: 'info', text: 'We have not received the payment yet. If you have just paid, it can take a minute to show here. Refresh this page in a moment.' };
  }
  if (owing.unpaidIds.length === 0 || record.bill.currency.code !== 'INR' || !rec) return extras;
  if (rec.provider === 'link') {
    if (rec.link && /^https:\/\//.test(rec.link)) extras.payOnline = { href: rec.link, amount: owing.balance };
  } else if (deps.secretKey && deps.publicUrl && owing.balance >= 1 && credentialsOf(rec, deps.secretKey, record.uid)) {
    extras.payOnline = { href: `/bill/${token}/pay`, amount: owing.balance };
  }
  return extras;
}

export function createBillPageHandler(deps: PayOnlineDeps) {
  return async (req: Request, res: Response) => {
    res.set(PUBLIC_BILL_HEADERS);
    const token = req.params.token;
    if (!isValidBillToken(token)) return res.status(404).type('html').send(NOT_FOUND_HTML);
    try {
      const record = await deps.records.get(token);
      if (!record) return res.status(404).type('html').send(NOT_FOUND_HTML);
      // The page is the bill first: if the payment side fails, the bill is still shown.
      const extras = await pageExtras(deps, token, record, req.query?.back === '1').catch((err: any) => {
        console.error('Bill page payment details failed:', err?.message);
        return {} as BillPageExtras;
      });
      return res.status(200).type('html').send(renderBillHtml(record.bill, extras));
    } catch (err: any) {
      console.error('Failed to load public bill:', err?.message);
      return res.status(500).type('html').send(NOT_FOUND_HTML);
    }
  };
}

// ─── GET /bill/:token/pay ───────────────────────────────────────────────────

const sameIds = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);
const NOT_NOW = 'We could not start the card payment just now. Please try again in a moment, or pay by UPI, or ask the business how else to pay.';

export function createPayHandler(deps: PayOnlineDeps) {
  return async (req: Request, res: Response) => {
    res.set(PUBLIC_BILL_HEADERS);
    const token = req.params.token;
    if (!isValidBillToken(token)) return res.status(404).type('html').send(NOT_FOUND_HTML);
    const back = `/bill/${token}`;
    try {
      const record = await deps.records.get(token);
      if (!record || !record.uid) return res.status(404).type('html').send(NOT_FOUND_HTML);
      const rec = await deps.gateways.get(record.uid);
      if (!rec) return res.redirect(302, back);
      if (rec.provider === 'link') return rec.link && /^https:\/\//.test(rec.link) ? res.redirect(302, rec.link) : res.redirect(302, back);
      if (!deps.secretKey || !deps.publicUrl || record.bill.currency.code !== 'INR') return res.status(503).type('html').send(messageHtml('Card payment unavailable', NOT_NOW, back));

      // The gateway is asked about a waiting link at most every few seconds, however often this is opened.
      const payment = await reconcile(deps, token, record);
      const owing = await loadOwing(deps, { ...record, payment });
      if (owing.unpaidIds.length === 0) return res.redirect(302, back); // paid already (or nothing to pay)
      if (owing.balance < 1) return res.status(409).type('html').send(messageHtml('Nothing to pay online', 'The amount left is too small to pay by card. Please pay it another way.', back));

      const now = deps.now();
      if (payment?.status === 'created' && payment.provider === rec.provider && now - payment.createdAt < REUSE_MS
          && Math.abs(payment.amount - owing.balance) < 0.005 && sameIds(payment.orderIds, owing.unpaidIds)) {
        return res.redirect(302, payment.url);
      }

      const access = await accessFor(deps, record.uid, rec.provider);
      if (!access) return res.status(503).type('html').send(messageHtml('Card payment unavailable', NOT_NOW, back));
      const created = await getGateway(rec.provider).createLink(access.creds, {
        amount: owing.balance,
        description: `${owing.businessName} · ${record.bill.kind === 'statement' ? 'statement' : 'bill'} ${owing.reference}`,
        reference: `sp-${token.slice(0, 12)}-${now.toString(36)}`,
        customer: { name: owing.customerName, phone: owing.customerPhone },
        businessPhone: owing.businessPhone,
        returnUrl: `${base(deps)}/bill/${token}/return`,
        expiresAt: Math.floor(now / 1000) + LINK_LIFE_SECONDS,
      }, deps.fetch);
      await deps.records.savePayment(token, {
        provider: rec.provider, linkId: created.id, url: created.url, amount: owing.balance,
        orderIds: owing.unpaidIds, createdAt: now, status: 'created',
      });
      return res.redirect(302, created.url);
    } catch (err: any) {
      // What the gateway said can name the owner's setup (a missing phone, a disabled product): that is for the owner, not the customer.
      console.error('Starting an online payment failed:', err?.message);
      return res.status(502).type('html').send(messageHtml('Card payment unavailable', NOT_NOW, back));
    }
  };
}

// ─── GET /bill/:token/return ────────────────────────────────────────────────

export function createReturnHandler(deps: PayOnlineDeps) {
  return async (req: Request, res: Response) => {
    res.set(PUBLIC_BILL_HEADERS);
    const token = req.params.token;
    if (!isValidBillToken(token)) return res.status(404).type('html').send(NOT_FOUND_HTML);
    try {
      const record = await deps.records.get(token);
      // Whatever the gateway put on the address is ignored: the link is asked about, with the owner's keys.
      if (record?.uid) await reconcile(deps, token, record, { force: true });
    } catch (err: any) {
      console.error('Online payment return failed:', err?.message);
    }
    return res.redirect(303, `/bill/${token}?back=1`);
  };
}
