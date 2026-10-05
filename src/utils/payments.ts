/**
 * payments.ts
 *
 * Pending payments: which orders are still unpaid and which customer owes
 * what, for the consolidated bill. Pure and dependency-free so it can be
 * tested without React or Firebase.
 *
 * "Unpaid" is stored as `paymentStatus: 'unpaid'` on an order; an order with
 * no value counts as paid, so every order from before payments were tracked
 * stays paid and nothing is suddenly owed.
 */
import type { BakerySettings, MenuItem, Order } from '../types';
import { buildBill } from './billing';
import { countsAsSale } from './preorders';

export const isUnpaid = (order: Pick<Order, 'paymentStatus'>): boolean => order.paymentStatus === 'unpaid';

/**
 * Who an order belongs to for grouping: the phone number if there is one (the
 * last 10 digits, so "+91 98450 10101" and "098450-10101" match), otherwise
 * the name ignoring case. Orders with neither can't be matched to anyone, so
 * each is kept on its own (a multi-item order stays together).
 */
export function customerKey(order: Pick<Order, 'id' | 'orderGroupId' | 'customerPhone' | 'customerName'>): string {
  const digits = (order.customerPhone || '').replace(/\D/g, '');
  if (digits.length >= 10) return `phone:${digits.slice(-10)}`;
  const name = (order.customerName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (name) return `name:${name}`;
  return `anon:${order.orderGroupId || order.id}`;
}

export interface PendingCustomer {
  key: string;
  name: string;
  phone?: string;
  /** Every unpaid order item they have, oldest first. */
  orders: Order[];
  /** How many orders (a multi-item order counts once). */
  orderCount: number;
  oldestDate: string;
  /** What they owe: items, delivery and GST less any advance already received, the same sum a statement asks for. */
  dueTotal: number;
}

/** Unpaid orders grouped by customer, largest amount due first. */
export function groupPendingPayments(input: {
  orders: Order[];
  menu: MenuItem[];
  settings: Parameters<typeof buildBill>[0]['settings'];
  currency: { code: string; symbol: string };
  /**
   * Today in the business's time zone. When given, a pre-order due after today is not listed: nothing is owed on
   * it yet, and its balance is shown with the pre-order. A cancelled order never is.
   */
  today?: string;
}): PendingCustomer[] {
  const byCustomer = new Map<string, Order[]>();
  for (const o of input.orders) {
    if (!isUnpaid(o) || !countsAsSale(o) || (input.today && o.date > input.today)) continue;
    const key = customerKey(o);
    byCustomer.set(key, [...(byCustomer.get(key) ?? []), o]);
  }

  const result: PendingCustomer[] = [];
  for (const [key, list] of byCustomer) {
    const orders = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const newestFirst = [...orders].reverse();
    const bill = buildBill({ orders, menu: input.menu, settings: input.settings, currency: input.currency, statement: true });
    result.push({
      key,
      name: newestFirst.find(o => o.customerName)?.customerName || 'Customer not named',
      phone: newestFirst.find(o => o.customerPhone)?.customerPhone,
      orders,
      orderCount: new Set(orders.map(o => o.orderGroupId || o.id)).size,
      oldestDate: orders[0].date,
      dueTotal: bill.balanceDue,
    });
  }
  return result.sort((a, b) => b.dueTotal - a.dueTotal || a.oldestDate.localeCompare(b.oldestDate));
}
