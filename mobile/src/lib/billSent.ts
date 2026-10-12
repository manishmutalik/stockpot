/**
 * billSent.ts
 *
 * After a bill or statement has gone out (WhatsApp or the share sheet opened with it), the phone tells the server, which marks
 * the unpaid orders as billed (POST /api/mobile/bills/sent). For two days the cards then show "Bill sent" with Mark as paid
 * instead of Send; after that, still unpaid, the owner gets a reminder and Send comes back as "Send reminder"
 * (src/utils/billReminders). Telling the server is best effort: the bill has gone either way, so a failure is not shown.
 */
import type { BillSentResponse, Currency, PaymentMethodId } from '../../../src/utils/quickApiTypes';
import { billState, type BillState } from '../../../src/utils/billReminders';
import type { Api } from './api';
import { claimWhen } from './paymentsDue';

export { billState, type BillState };

export const BILL_SENT_PATH = '/api/mobile/bills/sent';
export const PAYMENTS_PATH = '/api/mobile/payments';

/** Marks these orders as billed now (`idempotencyKey`: a fresh id per sending). Never throws: null when it could not be recorded. */
export async function markBillSent(api: Pick<Api, 'post'>, orderIds: string[], idempotencyKey: string): Promise<BillSentResponse | null> {
  if (orderIds.length === 0) return null;
  try {
    return await api.post<BillSentResponse>(BILL_SENT_PATH, { orderIds }, { idempotencyKey });
  } catch {
    return null;
  }
}

/** "Bill sent today, 3:15 pm", or two days on "Not paid 2 days after the bill". */
export function billLine(state: BillState, sentAt: number | null | undefined, now: number, what: 'Bill' | 'Invoice' = 'Bill'): string | null {
  if (state === 'not_sent' || !sentAt) return null;
  if (state === 'unpaid_after_bill') return `Not paid since the ${what.toLowerCase()} on ${claimWhen(sentAt, now)}`;
  return `${what} sent ${claimWhen(sentAt, now)}`;
}

/** The request behind Mark as paid: all that is owed, by one method. */
export const markPaidRequest = (customerKey: string, amount: number, method: PaymentMethodId) =>
  ({ path: PAYMENTS_PATH, body: { customerKey, amount, method } });

/** "Mark ₹1,300 from Priya as paid". */
export const markPaidTitle = (name: string, amount: string): string => `${amount} from ${name}`;

export type { Currency };
