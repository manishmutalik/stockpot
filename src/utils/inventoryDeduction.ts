/**
 * inventoryDeduction.ts
 *
 * Shared helper for deducting (or restoring, via a negative multiplier) raw
 * materials from inventory when a recipe is produced or an order is
 * fulfilled. Extracted out of App.tsx as part of the Phase 4 breakup so it
 * can be shared between useOrderActions and the (future) production hook
 * without duplicating the logic.
 */
import { db, doc, setDoc, writeBatch } from '../firebase';
import { convertAmount } from './conversions';
import { RawMaterial } from '../types';

/**
 * @param userId     The authenticated user's UID (Firestore path prefix).
 * @param materials  Current materials array, used to look up unit/stock for each ingredient.
 * @param recipe     Array of ingredient requirements to process.
 * @param multiplier Number of units produced (positive) or reversed (negative).
 * @param batch      Optional WriteBatch to add operations to for atomic commits.
 *                   When omitted, writes are executed immediately.
 * @returns          The materials as they stand after this deduction. A caller that goes on to
 *                   deduct for another recipe in the same sitting must pass THIS array on, not the
 *                   one it started with: two recipes that share an ingredient would otherwise each
 *                   work from the same starting stock, and the second write would silently undo
 *                   the first's deduction.
 *
 * A material that appears on more than one line of the recipe is deducted once, by the total.
 * Only the stock is written, never a copy of the rest of the material: a copy taken earlier
 * could otherwise put back an older cost or name.
 */
export async function deductIngredients(
  userId: string,
  materials: RawMaterial[],
  recipe: { materialId: string; amount: number; unit: string }[],
  multiplier: number,
  batch?: ReturnType<typeof writeBatch>
): Promise<RawMaterial[]> {
  const totals = new Map<string, number>();
  for (const req of recipe) {
    const mat = materials.find(m => m.id === req.materialId);
    if (!mat) continue;
    totals.set(mat.id, (totals.get(mat.id) ?? 0) + convertAmount(req.amount, req.unit || 'g', mat.unit) * multiplier);
  }

  const newStocks = new Map<string, number>();
  for (const [materialId, totalDeduction] of totals) {
    const mat = materials.find(m => m.id === materialId)!;
    const newStock = parseFloat((mat.initialStock - totalDeduction).toFixed(4));
    newStocks.set(materialId, newStock);
    const matRef = doc(db, 'users', userId, 'materials', materialId);
    if (batch) {
      batch.set(matRef, { initialStock: newStock }, { merge: true });
    } else {
      await setDoc(matRef, { initialStock: newStock }, { merge: true });
    }
  }
  return materials.map(m => (newStocks.has(m.id) ? { ...m, initialStock: newStocks.get(m.id)! } : m));
}
