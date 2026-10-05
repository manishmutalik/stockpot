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
import type { Order } from '../types';

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
