/**
 * madeToOrder.ts
 *
 * Items made when they are ordered: a cream cake assembled on a base made ahead, a thali, a hamper. Such an item
 * (`madeToOrder`) is not kept on the shelf. Its recipe is recorded once, in Recipes & Menus, and every sale of it takes
 * what it is made from, at the moment it is made:
 *  - its own ingredients from materials, in each material's unit;
 *  - its parts (the base) from their finished stock (utils/itemParts).
 * An order from stock takes them when it is created; a pre-order when it is handed over. The order keeps exactly what it
 * took (`Order.taken`), so deleting or changing it gives exactly that back, whatever the recipe says by then. Short stock
 * goes below nothing, with a warning, as a short ingredient does in production: the item has been made.
 *
 * Costs are unchanged: an order is stamped from the item as costing sees it (parts included), as any order is.
 */
import type { MenuItem, Order, OrderTaken, RawMaterial } from '../types';
import { convertAmount } from './conversions';
import { partsNeeded } from './itemParts';
import type { PlannedWrite } from './plans/types';

/** The stock a take starts from, and leaves for the next one. */
export type Stock = { materials: RawMaterial[]; menu: MenuItem[] };

/** Something a sale left below nothing: a material (in its unit) or a part (in pieces). */
export interface Shortage { materialId: string; name: string; unit: string; short: number }

const round4 = (n: number) => parseFloat(n.toFixed(4));
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export const isMadeToOrder = (item: Pick<MenuItem, 'madeToOrder'> | undefined): boolean => !!item?.madeToOrder;

/**
 * What `quantity` of the item takes: its own recipe in each material's unit (one entry per material), its parts, and what
 * the materials cost now (the parts were paid for when they were made).
 */
export function needsFor(item: Pick<MenuItem, 'id' | 'recipe' | 'parts'>, quantity: number, stock: Stock): OrderTaken {
  const totals = new Map<string, number>();
  for (const req of item.recipe ?? []) {
    const mat = stock.materials.find(m => m.id === req.materialId);
    if (!mat) continue;
    totals.set(mat.id, (totals.get(mat.id) ?? 0) + convertAmount(req.amount, req.unit || 'g', mat.unit) * quantity);
  }
  const materials = [...totals].map(([materialId, amount]) => ({ materialId, amount: round6(amount) })).filter(m => m.amount > 0);
  const cost = materials.reduce((sum, m) => sum + m.amount * (stock.materials.find(x => x.id === m.materialId)!.costPerUnit || 0), 0);
  return {
    materials,
    parts: partsNeeded(item, quantity).filter(p => stock.menu.some(m => m.id === p.itemId)),
    cost: Math.round(cost * 100) / 100,
  };
}

/** Moves `taken` out of stock (sign 1) or back into it (sign -1): the writes, and the stock afterwards. */
function move(taken: OrderTaken, stock: Stock, sign: 1 | -1): { writes: PlannedWrite[]; stock: Stock } {
  const writes: PlannedWrite[] = [];
  let { materials, menu } = stock;
  for (const t of taken.materials) {
    const mat = materials.find(m => m.id === t.materialId);
    if (!mat) continue;
    const next = round4(mat.initialStock - sign * t.amount);
    writes.push({ collection: 'materials', id: mat.id, data: { initialStock: next }, merge: true });
    materials = materials.map(m => (m.id === mat.id ? { ...m, initialStock: next } : m));
  }
  for (const p of taken.parts) {
    const part = menu.find(m => m.id === p.itemId);
    if (!part) continue;
    const next = round4((part.finishedGoodsStock ?? 0) - sign * p.quantity);
    writes.push({ collection: 'menu', id: part.id, data: { finishedGoodsStock: next }, merge: true });
    menu = menu.map(m => (m.id === part.id ? { ...m, finishedGoodsStock: next } : m));
  }
  return { writes, stock: { materials, menu } };
}

/** Takes what `quantity` of a made-to-order item is made from. */
export function takeForSale(item: Pick<MenuItem, 'id' | 'recipe' | 'parts'>, quantity: number, stock: Stock): { taken: OrderTaken; writes: PlannedWrite[]; stock: Stock } {
  const taken = needsFor(item, quantity, stock);
  return { taken, ...move(taken, stock, 1) };
}

/** Puts back what an order took. */
export function giveBack(taken: OrderTaken, stock: Stock): { writes: PlannedWrite[]; stock: Stock } {
  return move(taken, stock, -1);
}

/** What the materials and parts in `taken` are short of in `stock` (below nothing), for a warning. */
export function shortagesIn(stock: Stock, touched: OrderTaken[]): Shortage[] {
  const materialIds = new Set(touched.flatMap(t => t.materials.map(m => m.materialId)));
  const partIds = new Set(touched.flatMap(t => t.parts.map(p => p.itemId)));
  return [
    ...stock.materials.filter(m => materialIds.has(m.id) && m.initialStock < -1e-9).map(m => ({ materialId: m.id, name: m.name, unit: m.unit, short: round4(-m.initialStock) })),
    ...stock.menu.filter(m => partIds.has(m.id) && (m.finishedGoodsStock ?? 0) < -1e-9).map(m => ({ materialId: m.id, name: m.name, unit: 'pcs', short: round4(-(m.finishedGoodsStock ?? 0)) })),
  ];
}

/** One line of what a sale will take, with what is there now, for the order form. */
export interface NeedLine { id: string; name: string; unit: string; need: number; have: number; part: boolean }

/** What `quantity` of the item will take, line by line, against stock as it is: shown before the order is saved. */
export function saleNeeds(item: Pick<MenuItem, 'id' | 'recipe' | 'parts'>, quantity: number, stock: Stock): NeedLine[] {
  const t = needsFor(item, quantity, stock);
  return [
    ...t.parts.map(p => {
      const part = stock.menu.find(m => m.id === p.itemId)!;
      return { id: p.itemId, name: part.name, unit: 'pcs', need: p.quantity, have: part.finishedGoodsStock ?? 0, part: true };
    }),
    ...t.materials.map(m => {
      const mat = stock.materials.find(x => x.id === m.materialId)!;
      return { id: m.materialId, name: mat.name, unit: mat.unit, need: m.amount, have: mat.initialStock, part: false };
    }),
  ];
}

/**
 * Material used by made-to-order sales, as production runs would show it: one entry per order that took something, on the
 * day it was made (its date; a pre-order's due date, when it is handed over). For reorder forecasts and spend.
 */
export function madeToOrderUse(orders: Pick<Order, 'date' | 'taken' | 'cancelledOn'>[]): { date: string; materials: OrderTaken['materials'] }[] {
  return orders.filter(o => o.taken && !o.cancelledOn && o.taken.materials.length > 0).map(o => ({ date: o.date, materials: o.taken!.materials }));
}

/** What made-to-order sales spent on their own ingredients when they were made (parts were counted when they were made). */
export function madeToOrderSpend(orders: Pick<Order, 'taken' | 'cancelledOn'>[]): number {
  return Math.round(orders.filter(o => o.taken && !o.cancelledOn).reduce((s, o) => s + (o.taken!.cost || 0), 0) * 100) / 100;
}
