/**
 * paymentsDue.ts
 *
 * The words and requests behind the Payments due list and Today's "To collect" card. The server decides who owes what and writes
 * the message to send; this only says how long someone has waited, which button to offer, and what to put in the Payment screen.
 */
import type { ClaimReviewSaved, Currency, PaymentClaimSummary, PaymentDueSummary, PaymentSetupView, StatementResponse } from '../../../src/utils/quickApiTypes';
import { formatAmount } from '../../../src/utils/money';
import type { Api } from './api';

export const STATEMENT_PATH = '/api/mobile/payments/statement';

export const requestStatement = (api: Pick<Api, 'post'>, customerKey: string): Promise<StatementResponse> =>
  api.post<StatementResponse>(STATEMENT_PATH, { customerKey });

/** "Today", "1 day", "12 days": how long their oldest unpaid order has been waiting. */
export const waitingLabel = (days: number): string => (days <= 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`);

/** A week is worth a nudge and a fortnight is late. */
export const waitingTone = (days: number): 'coral' | 'amber' | 'grey' => (days >= 14 ? 'coral' : days >= 7 ? 'amber' : 'grey');

/** One order gets an invoice; several get one statement, so the customer is asked once. */
export const sendLabel = (c: Pick<PaymentDueSummary, 'orderCount'>): string => (c.orderCount === 1 ? 'Send invoice' : 'Send statement');

/** "1 order", "3 orders". */
export const ordersLabel = (n: number): string => `${n} order${n === 1 ? '' : 's'}`;

const NO_NAME = 'Customer not named';

/**
 * What to put in the Payment screen for someone who owes: "Priya paid 1300", which the owner can change before reading it. A
 * customer with no name has nothing the reading could match, so the box starts empty.
 */
export function recordPaymentText(c: Pick<PaymentDueSummary, 'name' | 'dueTotal'>): string {
  return c.name === NO_NAME ? '' : `${c.name} paid ${c.dueTotal}`;
}

// ─── A customer's "I've paid by UPI" ────────────────────────────────────────

export const CLAIM_PATH = '/api/mobile/payments/claim';

/** Confirm (marks those orders paid by UPI) or dismiss ("not received": the claim goes, they stay unpaid). */
export const reviewClaim = (api: Pick<Api, 'post'>, customerKey: string, action: 'confirm' | 'dismiss', idempotencyKey: string): Promise<ClaimReviewSaved> =>
  api.post<ClaimReviewSaved>(CLAIM_PATH, { customerKey, action }, { idempotencyKey });

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * When the customer said it, in the phone's own time: "today, 2:15 pm", "yesterday, 9:05 am", "3 Oct". `offsetMinutes` is the
 * phone's offset from UTC (east positive); it is passed in so this is tested the same everywhere.
 */
export function claimWhen(at: number, now: number, offsetMinutes = -new Date(at).getTimezoneOffset()): string {
  const local = (t: number) => new Date(t + offsetMinutes * 60_000);
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const a = local(at), n = local(now);
  const daysAgo = Math.round((day(n) - day(a)) / 86_400_000);
  const h = a.getUTCHours(), m = a.getUTCMinutes();
  const time = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  if (daysAgo <= 0) return `today, ${time}`;
  if (daysAgo === 1) return `yesterday, ${time}`;
  return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]}`;
}

/** "Says they paid ₹900 by UPI · today, 2:15 pm", with how many orders when it is not all of them. */
export function claimLine(claim: PaymentClaimSummary, customer: Pick<PaymentDueSummary, 'orderCount'>, currency: Currency, now: number): string {
  const part = claim.orderCount < customer.orderCount ? ` for ${ordersLabel(claim.orderCount)}` : '';
  return `Says they paid ${formatAmount(claim.amount, currency)} by UPI${part} · ${claimWhen(claim.at, now)}`;
}

// ─── How customers can pay (Settings) ───────────────────────────────────────

export const PAYMENT_SETUP_PATH = '/api/mobile/payment-setup';

/** The two ways a customer can pay from a bill, said plainly for Settings. Both are set up in the web app. */
export function paymentSetupLines(v: PaymentSetupView): { title: string; detail: string; on: boolean }[] {
  const upi = v.upi
    ? { title: 'UPI', detail: 'Bills have a Pay with UPI button, and an “I’ve paid” button that tells you here so you can confirm it.', on: true }
    : { title: 'UPI', detail: 'Off. Add your UPI ID in Settings on the web so bills can be paid by UPI.', on: false };
  const online = v.online === null
    ? { title: 'Card and online', detail: 'Not set up. Add your Razorpay or Cashfree keys in Settings › Online payments on the web.', on: false }
    : v.online.kind === 'link'
      ? { title: 'Card and online', detail: 'Your payment link is on every bill. Mark those payments paid yourself.', on: true }
      : { title: 'Card and online', detail: `Through your ${v.online.label} account${v.online.test ? ' (test keys: no real money moves)' : ''}. Paid bills are marked paid by themselves.`, on: true };
  return [upi, online];
}
