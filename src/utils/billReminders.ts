/**
 * billReminders.ts
 *
 * When a sent bill counts as sent, and when it is time to remind the owner, shared by the server's views, the notification
 * job and the phone app. A bill is "sent" once WhatsApp or the share sheet opened with it (orders carry `billSentAt`). For two
 * days the phone shows "Bill sent" with Mark as paid instead of Send; after that, still unpaid, the owner is reminded once
 * (a notification) and Send comes back as "Send reminder". Sending again starts the two days again.
 */
/** The two fields of an order this works from (kept local so the phone app can use this file without the web app's types). */
export interface BillFields { billSentAt?: number; billRemindedAt?: number | null }

export const BILL_REMIND_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

const sentAtOf = (o: Pick<BillFields, 'billSentAt'>): number | null => (typeof o.billSentAt === 'number' && o.billSentAt > 0 ? o.billSentAt : null);

/**
 * When the bill for these unpaid orders was sent: the earliest sending that covered them, so the oldest bill is the one
 * reminded about. Undefined when any of them has not been sent yet (a new order since the last statement means there is
 * something new to send).
 */
export function billSentAtFor(unpaid: Pick<BillFields, 'billSentAt'>[]): number | undefined {
  if (unpaid.length === 0) return undefined;
  const times = unpaid.map(sentAtOf);
  if (times.some(t => t === null)) return undefined;
  return Math.min(...(times as number[]));
}

export type BillState = 'not_sent' | 'sent' | 'unpaid_after_bill';

/** What the phone shows: Send; "Bill sent" with Mark as paid; or, two days on, "Send reminder". */
export function billState(sentAt: number | undefined | null, now: number): BillState {
  if (!sentAt) return 'not_sent';
  return now - sentAt >= BILL_REMIND_AFTER_MS ? 'unpaid_after_bill' : 'sent';
}

/** Unpaid orders whose bill went out two days ago or more and that have not been reminded about since that sending. */
export function ordersToRemind<T extends BillFields>(unpaid: T[], now: number): T[] {
  return unpaid.filter(o => {
    const sent = sentAtOf(o);
    if (sent === null || now - sent < BILL_REMIND_AFTER_MS) return false;
    return !(typeof o.billRemindedAt === 'number' && o.billRemindedAt >= sent);
  });
}
