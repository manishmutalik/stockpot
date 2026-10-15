/**
 * itemUnits.ts
 *
 * Items counted in pieces (a cake, a sponge base) or by weight or volume (a ganache, a custard, whipped cream): an item's
 * `countedIn`. Everything about an item is in its own unit, so its recipe is for one piece or for 1 kg (1 litre), and its
 * stock, batch size, production and cost per unit follow. Another item using it gives the amount that goes into one of it
 * in that unit (0.15 kg for 150 g), so costing and stock work as they do for pieces; only what is shown and typed differs.
 * Small amounts are shown and typed in grams (millilitres): 150 g of ganache, 1.2 kg on the shelf.
 */
import type { ItemUnitByMeasure, MenuItem } from '../types';

export type ItemUnit = 'pcs' | ItemUnitByMeasure;

/** The unit an item is counted in. */
export function itemUnit(item: Pick<MenuItem, 'countedIn'> | null | undefined): ItemUnit {
  const u = item?.countedIn;
  return u === 'kg' || u === 'l' ? u : 'pcs';
}

/** Whether an item is counted by weight or volume rather than in pieces. */
export const isByMeasure = (item: Pick<MenuItem, 'countedIn'> | null | undefined): boolean => itemUnit(item) !== 'pcs';

/** The unit, as a word after a number: pieces, kg, litres. */
export function unitWord(unit: ItemUnit, n?: number): string {
  if (unit === 'kg') return 'kg';
  if (unit === 'l') return n === 1 ? 'litre' : 'litres';
  return n === 1 ? 'piece' : 'pieces';
}

/** "per piece", "per kg", "per litre". */
export const perUnit = (unit: ItemUnit): string => `per ${unit === 'kg' ? 'kg' : unit === 'l' ? 'litre' : 'piece'}`;

/** The small unit amounts of a measured item are typed in (grams, millilitres); null for pieces. */
export const smallUnit = (unit: ItemUnit): 'g' | 'ml' | null => (unit === 'kg' ? 'g' : unit === 'l' ? 'ml' : null);

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;
const num = (n: number, dp: number) => round(n, dp).toLocaleString('en-IN', { maximumFractionDigits: dp });

/**
 * A quantity of an item, as it is said: "3" for pieces (the caller says what of), "150 g" or "1.2 kg", "300 ml" or
 * "1.5 l". Below 1 kg (1 litre) it is in grams (millilitres).
 */
export function formatItemQuantity(unit: ItemUnit, quantity: number): string {
  if (unit === 'pcs') return num(quantity, 2);
  const small = smallUnit(unit)!;
  if (Math.abs(quantity) < 1) return `${num(quantity * 1000, 1)} ${small}`;
  return `${num(quantity, 3)} ${unit}`;
}

/** A quantity in the item's unit to what is typed: grams (millilitres) for a measured item, pieces as they are. */
export const toEntry = (unit: ItemUnit, quantity: number): number => (unit === 'pcs' ? quantity : round(quantity * 1000, 3));

/** What was typed back to the item's unit. */
export const fromEntry = (unit: ItemUnit, typed: number): number => (unit === 'pcs' ? typed : round(typed / 1000, 6));
