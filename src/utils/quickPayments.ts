/**
 * quickPayments.ts
 *
 * What each customer owes, split into whole orders, oldest first. The phone app's payment save and its reading of "Priya
 * paid 1300" both use it, so what is asked and what is accepted can never disagree. There are no part-payments yet (only a
 * pre-order's advance), so a payment is accepted only when it comes to exactly what one or more whole orders are owed.
 */
import type { BakerySettings, MenuItem, Order } from '../types';
import { buildBill, billBalance } from './billing';
import { clusterOrdersByGroup } from './orderClustering';
import { groupPendingPayments, type PendingCustomer } from './payments';
import { billSettingsOf } from './quickViews';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CustomerDues {
  customer: PendingCustomer;
  /** One entry per whole order (a multi-item order counts once), oldest first, with what that order is owed. */
  dues: { orders: Order[]; due: number }[];
  /** The amounts that would pay whole orders, oldest first: 900, then 900 + 400, and so on. */
  options: number[];
}

/** Everyone who owes something, largest amount first (a pre-order due after today is not owed yet). */
export function customerDues(input: {
  unpaid: Order[];
  menu: MenuItem[];
  settings: Partial<BakerySettings>;
  currency: { code: string; symbol: string };
  today: string;
}): CustomerDues[] {
  const { unpaid, menu, settings, currency, today } = input;
  return groupPendingPayments({ orders: unpaid, menu, settings: billSettingsOf(settings), currency, today }).map(customer => {
    const dues = clusterOrdersByGroup(customer.orders).map(c => {
      const orders = c.type === 'single' ? [c.order] : c.orders;
      return { orders, due: round2(billBalance(buildBill({ orders, menu, settings: billSettingsOf(settings), currency }))) };
    });
    let running = 0;
    const options = dues.map(d => (running = round2(running + d.due)));
    return { customer, dues, options };
  });
}

/** Which whole-order total the amount is, or -1. */
export const matchingOption = (options: number[], amount: number): number => options.findIndex(total => Math.abs(total - amount) < 0.005);
