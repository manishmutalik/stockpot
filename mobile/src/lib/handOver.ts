/**
 * handOver.ts
 *
 * Handing a pre-order over: what to send, and what to tell the owner afterwards. Pure; the sheet only draws it.
 */
import type { Currency, HandOverSaved, PaymentMethodId, UpcomingOrder } from '../../../src/utils/quickApiTypes';
import { formatAmount } from '../../../src/utils/money';

export const METHOD_LABEL: Record<PaymentMethodId, string> = { upi: 'UPI', cash: 'Cash', card: 'Card', other: 'Other' };
export const METHODS: PaymentMethodId[] = ['upi', 'cash', 'card', 'other'];

/** The path and body of the hand-over save. The balance is recorded as received only when the owner says so, and there is one. */
export function handOverRequest(order: Pick<UpcomingOrder, 'orderId' | 'balanceDue'>, choice: { receiveBalance: boolean; method: PaymentMethodId }): { path: string; body: unknown } {
  const receiving = choice.receiveBalance && order.balanceDue > 0.005;
  return { path: `/api/mobile/orders/${encodeURIComponent(order.orderId)}/hand-over`, body: receiving ? { balanceReceived: { method: choice.method } } : {} };
}

/** Why the order cannot be handed over today: finished stock is short. Null when it can be tried. */
export function stockProblem(order: Pick<UpcomingOrder, 'stockShort'>): string | null {
  if (order.stockShort.length === 0) return null;
  return `Not enough finished stock: ${order.stockShort.map(s => `${s.name} is short by ${s.short}`).join(', ')}. Log a production run first.`;
}

export interface HandOverSummary { title: string; lines: string[]; canShare: boolean }

/** What to tell the owner once the server has answered. */
export function summarizeHandOver(saved: HandOverSaved, currency: Currency): HandOverSummary {
  const money = (n: number) => formatAmount(n, currency);
  if (!saved.handedOver) return { title: 'Already handed over', lines: ['Nothing was changed.'], canShare: false };
  const lines: string[] = [];
  if ((saved.balanceReceived ?? 0) > 0) lines.push(`Balance received: ${money(saved.balanceReceived!)}${saved.method ? ` by ${METHOD_LABEL[saved.method]}` : ''}`);
  else if ((saved.balanceDue ?? 0) > 0) lines.push(`Balance still due: ${money(saved.balanceDue!)}`);
  else lines.push('Paid in full');
  return { title: 'Handed over', lines, canShare: !!saved.shareMessage };
}
