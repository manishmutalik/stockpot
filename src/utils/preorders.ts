/**
 * preorders.ts
 *
 * The rules that make pre-orders safe, in one small place so every screen and
 * every sum asks the same question (docs/PROJECT_STATE.md, "Pre-orders").
 *
 * A pre-order is an Order booked ahead of time: `date` is its due date, it does
 * not touch stock until it is handed over, and it may hold an advance. Two
 * questions matter everywhere:
 *  - holdsStock: has this order taken units out of `finishedGoodsStock`? Deleting
 *    or editing an order may give stock back only when it did, otherwise a
 *    deleted pre-order would add units that never left the shelf.
 *  - countsAsSale: is it a sale at all? A cancelled order is not.
 *
 * Revenue lands on the due date. And, the owner's decision, an "actual" figure
 * counts only orders due today or earlier (`isActual`): a pre-order due next
 * Friday is not in this month's revenue today, because the weekly and monthly
 * ranges run to the end of the period. Orders due later are "booked for later".
 */
import type { MenuItem, Order } from '../types';
import { clusterOrdersByGroup } from './orderClustering';

/** Does this order currently hold units of finishedGoodsStock? */
export const holdsStock = (o: Pick<Order, 'cancelledOn' | 'preorder' | 'stockClaimed'>): boolean =>
  !o.cancelledOn && (o.preorder ? o.stockClaimed === true : true);

/** Counts toward revenue, profit, customers, payments and AI figures at all (a cancelled order never does). */
export const countsAsSale = (o: Pick<Order, 'cancelledOn'>): boolean => !o.cancelledOn;

/** A sale due today or earlier: what the actual figures count. `today` is the business's own date. */
export const isActual = (o: Pick<Order, 'cancelledOn' | 'date'>, today: string): boolean => countsAsSale(o) && o.date <= today;

/** The orders the actual figures count. */
export const actualOrders = <T extends Pick<Order, 'cancelledOn' | 'date'>>(orders: T[], today: string): T[] => orders.filter(o => isActual(o, today));

/** A sale booked for a day after today. */
export const isBookedForLater = (o: Pick<Order, 'cancelledOn' | 'date'>, today: string): boolean => countsAsSale(o) && o.date > today;

/** A pre-order that has not been handed over or cancelled. */
export const isOpenPreorder = (o: Pick<Order, 'cancelledOn' | 'preorder' | 'fulfilled'>): boolean => !!o.preorder && !o.cancelledOn && !o.fulfilled;

/** The advance of a multi-item order (or a single one): it is stored on one member only, like a discount. */
export function advanceOf(members: Pick<Order, 'advance'>[]): NonNullable<Order['advance']> | undefined {
  return members.map(m => m.advance).find(a => a && a.amount > 0);
}

export interface DueSummary {
  /** Orders (a multi-item order counts once). */
  orderCount: number;
  /** What has to be made or handed over: units per item, most first. */
  items: { menuItemId: string; name: string; quantity: number }[];
}

/**
 * The open pre-orders whose due date passes `isDue`, as a count of orders and the units of each item. Open means
 * not handed over and not cancelled. Null when there are none.
 */
export function summarizeDue(orders: Order[], menu: Pick<MenuItem, 'id' | 'name'>[], isDue: (date: string) => boolean): DueSummary | null {
  const open = orders.filter(o => isOpenPreorder(o) && isDue(o.date));
  if (open.length === 0) return null;
  const units = new Map<string, { name: string; quantity: number }>();
  for (const o of open) {
    const name = menu.find(m => m.id === o.menuItemId)?.name ?? o.itemNameAtSale ?? 'Item';
    const entry = units.get(o.menuItemId) ?? { name, quantity: 0 };
    entry.quantity += o.quantity || 0;
    units.set(o.menuItemId, entry);
  }
  return {
    orderCount: clusterOrdersByGroup(open).length,
    items: [...units].map(([menuItemId, v]) => ({ menuItemId, ...v })).sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)),
  };
}
