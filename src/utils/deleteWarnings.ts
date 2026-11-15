/**
 * deleteWarnings.ts
 *
 * What the "Are you sure?" popup says before something is deleted (or, later, merged): the thing's name and what else
 * goes with it, in plain words, so the owner knows what the one tap will undo. Every delete of an item, recipe, order or
 * test bake asks first (the hooks call showConfirm with these); none of them can be undone.
 */
import type { MenuItem, Order, RecipeExperiment } from '../types';
import { formatItemQuantity, itemUnit } from './itemUnits';

/** What the popup shows: its title, its message, and the word on the button that goes ahead. */
export interface Warning { title: string; message: string; confirmLabel: string }

const UNDO = 'This cannot be undone.';

/** "A", "A and B", "A, B and C", or "A, B and 3 more" past `max` names. */
export function nameList(names: string[], max = 3): string {
  const shown = names.slice(0, max);
  const more = names.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more} more`;
  if (shown.length <= 1) return shown[0] ?? '';
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

const named = (name: string | undefined, fallback: string) => (name?.trim() ? name.trim() : fallback);

/** Deleting an inventory item takes it out of every recipe that uses it, so their costs stop counting it. */
export function materialDeleteWarning(name: string | undefined, usedIn: string[]): Warning {
  const item = named(name, 'this item');
  const recipes = usedIn.length === 1 ? 'recipe' : 'recipes';
  return {
    title: `Delete ${item}?`,
    message: usedIn.length > 0
      ? `It is in ${usedIn.length} ${recipes}: ${nameList(usedIn)}. It will be taken out of ${usedIn.length === 1 ? 'it' : 'them'}, so ${usedIn.length === 1 ? 'its cost' : 'their costs'} will no longer count it. ${UNDO}`
      : `Its stock and price go with it. ${UNDO}`,
    confirmLabel: 'Delete',
  };
}

/** Deleting a menu item deletes its recipe and every order for it, which then leave the sales figures. */
export function menuItemDeleteWarning(name: string | undefined, orderCount: number): Warning {
  const item = named(name, 'this item');
  return {
    title: `Delete ${item}?`,
    message: orderCount > 0
      ? `Its recipe goes, and so ${orderCount === 1 ? 'does its 1 order' : `do its ${orderCount} orders`}: ${orderCount === 1 ? 'that sale comes' : 'those sales come'} off your sales and reports. ${UNDO}`
      : `Its recipe goes with it. ${UNDO}`,
    confirmLabel: 'Delete',
  };
}

/** One line of an order, as "2 × Butter Croissant" (or "1.5 kg Ganache" for an item counted by weight). */
function orderLine(order: Order, menu: MenuItem[]): string {
  const item = menu.find(m => m.id === order.menuItemId);
  const name = named(item?.name, 'an item');
  return item && itemUnit(item) !== 'pcs' ? `${formatItemQuantity(itemUnit(item), order.quantity)} ${name}` : `${order.quantity} × ${name}`;
}

/** Deleting orders gives back the stock they took, and takes them off the sales. One order or a whole multi-item order. */
export function ordersDeleteWarning(orders: Order[], menu: MenuItem[]): Warning {
  const customer = orders.find(o => o.customerName?.trim())?.customerName?.trim();
  const forWhom = customer ? ` for ${customer}` : '';
  const one = orders.length === 1;
  return {
    title: one ? 'Delete this order?' : 'Delete this whole order?',
    message: one
      ? `${orderLine(orders[0], menu)}${forWhom}. Any stock it took goes back, and it comes off your sales. ${UNDO}`
      : `All ${orders.length} items${forWhom}: ${nameList(orders.map(o => orderLine(o, menu)))}. Any stock they took goes back, and they come off your sales. ${UNDO}`,
    confirmLabel: 'Delete',
  };
}

/** Deleting a test-bake session gives back the bases and fillings it used. */
export function experimentDeleteWarning(exp: RecipeExperiment | undefined): Warning {
  const usedParts = exp?.parts?.some(p => p.quantity > 0);
  return {
    title: `Delete ${exp?.name?.trim() ? `"${exp.name.trim()}"` : 'this session'}?`,
    message: `The session and its notes go.${usedParts ? ' The bases and fillings it used go back to stock.' : ''} ${UNDO}`,
    confirmLabel: 'Delete',
  };
}
