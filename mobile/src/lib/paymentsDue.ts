/**
 * paymentsDue.ts
 *
 * The words and requests behind the Payments due list and Today's "To collect" card. The server decides who owes what and writes
 * the message to send; this only says how long someone has waited, which button to offer, and what to put in the Payment screen.
 */
import type { PaymentDueSummary, StatementResponse } from '../../../src/utils/quickApiTypes';
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
