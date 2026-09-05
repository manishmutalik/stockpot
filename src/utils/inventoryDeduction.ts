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
 */
export async function deductIngredients(
  userId: string,
  materials: RawMaterial[],
  recipe: { materialId: string; amount: number; unit: string }[],
  multiplier: number,
  batch?: ReturnType<typeof writeBatch>
) {
  for (const req of recipe) {
    const mat = materials.find(m => m.id === req.materialId);
    if (!mat) continue;
    const convertedAmt = convertAmount(req.amount, req.unit || 'g', mat.unit);
    const totalDeduction = convertedAmt * multiplier;
    const newStock = parseFloat((mat.initialStock - totalDeduction).toFixed(4));
    const matRef = doc(db, 'users', userId, 'materials', mat.id);
    if (batch) {
      batch.set(matRef, { ...mat, initialStock: newStock }, { merge: true });
    } else {
      await setDoc(matRef, { ...mat, initialStock: newStock }, { merge: true });
    }
  }
}
