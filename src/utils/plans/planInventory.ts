/**
 * planInventory.ts
 *
 * What restocking a material will write, worked out without touching Firebase.
 * Moved out of `useInventoryActions.handleRestock` so the web and the phone
 * app's server endpoint run the same maths: the quantity may be given in another
 * unit of the same kind, stock and cost are held in the material's own unit, and
 * the cost becomes the moving average of what was on hand and what was just bought.
 */
import type { RawMaterial } from '../../types';
import { convertAmount } from '../conversions';
import { newPriceLogEntry } from '../priceLog';
import type { PlanContext, PlannedWrite } from './types';

export type RestockPlan =
  | {
      ok: true;
      writes: PlannedWrite[];
      /** The material's stock after this purchase, in its own unit. */
      newStock: number;
      /** The material's cost per unit before and after (the moving average). */
      previousCostPerUnit: number;
      newCostPerUnit: number;
    }
  | { ok: false; reason: 'invalid_quantity' };

/**
 * Adds a purchase to a material: the new quantity goes onto on-hand stock and the cost per unit is recalculated
 * as the moving average. The material and its price-log entry are written together, so a restock is never half recorded.
 *
 * `quantity` is in `quantityUnit` (the material's own unit when omitted); `total` is what was paid for all of it.
 */
export function planRestock(input: {
  material: RawMaterial;
  quantity: number;
  quantityUnit?: string;
  total: number;
  /** YYYY-MM-DD; stored on the material when given. */
  expiryDate?: string;
  ctx: PlanContext;
}): RestockPlan {
  const { material, total, ctx } = input;
  // The quantity may be typed in another unit of the same kind (500 g for an item kept in kg); stock and
  // cost are always held in the material's own unit, so it is converted here, and the price paid then
  // works out per that unit (520 for 500 g is 1,040 a kg).
  const materialUnit = material.unit || 'g';
  const qty = Math.round(convertAmount(input.quantity, input.quantityUnit || materialUnit, materialUnit) * 1e6) / 1e6;
  if (!(qty > 0)) return { ok: false, reason: 'invalid_quantity' };

  const newStock = (material.initialStock || 0) + qty;
  const oldTotalValue = (material.initialStock || 0) * (material.costPerUnit || 0);
  const newMAC = newStock > 0 ? (oldTotalValue + total) / newStock : 0;

  const update: Record<string, unknown> = {
    initialStock: newStock,
    // Keep real precision: costs are per gram or ml (e.g. 0.045), so rounding to 2 decimals
    // would shift them by 10% or more (0.045 -> 0.04) and distort every recipe cost.
    costPerUnit: parseFloat(newMAC.toFixed(6)),
  };
  if (input.expiryDate) update.expiryDate = input.expiryDate;

  const entry = newPriceLogEntry({
    materialId: material.id, unit: material.unit || 'g',
    unitCost: total / qty, quantity: qty, macAfter: update.costPerUnit as number, source: 'restock',
    id: ctx.newId(), now: ctx.now(),
  });
  return {
    ok: true,
    writes: [
      { collection: 'materials', id: material.id, data: update, merge: true },
      { collection: 'priceLog', id: entry.id, data: entry as unknown as Record<string, unknown>, merge: false },
    ],
    newStock,
    previousCostPerUnit: material.costPerUnit || 0,
    newCostPerUnit: update.costPerUnit as number,
  };
}
