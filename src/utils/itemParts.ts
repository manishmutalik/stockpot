/**
 * itemParts.ts
 *
 * Items made from other items: a sponge base in a cream cake, a ganache in a truffle cake, cookies in a hamper. An item's
 * `parts` lists the other items that go into one of it, beside its own `recipe` of materials. Two rules follow:
 *
 *  - **Costs flatten.** For anything worked out from materials (cost, margin, price stamps on orders, drift alerts, nutrition,
 *    reorder forecasts) an item is costed as if its parts' recipes were written into its own, scaled by how many go in:
 *    `effectiveRecipe` and `costView`. So the price of cake gel reaches every cream cake built on the base, and is named as
 *    cake gel in a drift alert.
 *  - **Stock does not.** Making an item takes its own materials from stock and its parts from their *finished* stock: the
 *    base's ingredients were taken when the base was made (plans/planProduction). An order takes the item itself, as before.
 *
 * An item cannot contain itself, directly or through others (`wouldLoop`), and flattening stops after MAX_PART_DEPTH
 * levels as a guard.
 */
import type { ItemPart, MenuItem, ProductionRun } from '../types';

/** How deep parts may nest (ganache in a base in a cake in a hamper is 3). */
export const MAX_PART_DEPTH = 5;

/** A recipe line, as every caller has it (a stored recipe always has a unit; some reading code allows none). */
type Line = { materialId: string; amount: number; unit?: string };
type WithParts<L extends Line = Line> = { id: string; recipe?: L[]; parts?: ItemPart[] };

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** The parts of an item that count: a positive quantity, not itself. */
export function partsOf(item: Pick<MenuItem, 'id' | 'parts'>): ItemPart[] {
  return (item.parts ?? []).filter(p => p && typeof p.itemId === 'string' && p.itemId !== item.id && p.quantity > 0 && Number.isFinite(p.quantity));
}

/** The item's recipe with its parts' recipes written in, scaled: materials only. Parts missing from `menu` add nothing. */
export function effectiveRecipe<L extends Line>(item: WithParts<L>, menu: WithParts<L>[], depth = 0, seen: ReadonlySet<string> = new Set()): L[] {
  const own = (item.recipe ?? []).map(r => ({ ...r }));
  if (depth >= MAX_PART_DEPTH) return own;
  const path = new Set(seen).add(item.id);
  for (const part of partsOf(item)) {
    if (path.has(part.itemId)) continue;
    const partItem = menu.find(m => m.id === part.itemId);
    if (!partItem) continue;
    for (const line of effectiveRecipe(partItem, menu, depth + 1, path)) {
      own.push({ ...line, amount: round6(line.amount * part.quantity) });
    }
  }
  return own;
}

/** The item as costing sees it: its recipe flattened (the same object when it has no parts). */
export function costView<L extends Line, T extends WithParts<L>>(item: T, menu: WithParts<L>[]): T {
  return partsOf(item).length > 0 ? { ...item, recipe: effectiveRecipe(item, menu) } : item;
}

/** Every item as costing sees it. */
export function costMenu<L extends Line, T extends WithParts<L>>(menu: T[]): T[] {
  return menu.some(m => partsOf(m).length > 0) ? menu.map(m => costView(m, menu)) : menu;
}

/** Whether putting `partId` into `itemId` would make an item contain itself (directly, or through other items). */
export function wouldLoop(menu: Pick<MenuItem, 'id' | 'parts'>[], itemId: string, partId: string): boolean {
  if (itemId === partId) return true;
  const stack = [partId];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === itemId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    const item = menu.find(m => m.id === id);
    for (const p of item ? partsOf(item) : []) stack.push(p.itemId);
  }
  return false;
}

/** The items that can go into `itemId`: any other item that would not make a loop, those made for other items first. */
export function partCandidates<T extends Pick<MenuItem, 'id' | 'name' | 'parts' | 'notForSale'>>(menu: T[], itemId: string): T[] {
  return menu
    .filter(m => !wouldLoop(menu, itemId, m.id))
    .sort((a, b) => Number(!!b.notForSale) - Number(!!a.notForSale) || a.name.localeCompare(b.name));
}

/** The items that use `itemId` as a part. */
export function itemsUsing<T extends Pick<MenuItem, 'id' | 'parts'>>(menu: T[], itemId: string): T[] {
  return menu.filter(m => partsOf(m).some(p => p.itemId === itemId));
}

/** The parts taken from stock to make `quantity` of an item, one entry per part item. */
export function partsNeeded(item: Pick<MenuItem, 'id' | 'parts'>, quantity: number): ItemPart[] {
  const totals = new Map<string, number>();
  for (const p of partsOf(item)) totals.set(p.itemId, (totals.get(p.itemId) ?? 0) + p.quantity * quantity);
  return [...totals].map(([itemId, q]) => ({ itemId, quantity: round6(q) }));
}

/** What a run spent on ingredients that day: its cost less the parts it took from stock, already counted when they were made. */
export const runSpend = (run: Pick<ProductionRun, 'costTotal' | 'partsCost'>): number =>
  Math.max((run.costTotal || 0) - (run.partsCost || 0), 0);

/** Items sold on the menu (not those made only for other items). */
export const forSale = <T extends Pick<MenuItem, 'notForSale'>>(menu: T[]): T[] => menu.filter(m => !m.notForSale);
