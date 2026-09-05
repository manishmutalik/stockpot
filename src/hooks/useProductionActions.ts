/**
 * useProductionActions.ts
 *
 * Owns production-run logging/deletion and expired-batch discarding.
 * Extracted out of App.tsx as part of the Phase 4 breakup — behavior
 * preserved exactly from the original inline implementation.
 *
 * Also consolidates onto the shared `deductIngredients` helper
 * (src/utils/inventoryDeduction.ts) instead of the App.tsx-local copy —
 * this hook was the last consumer, so the local copy in App.tsx can now be
 * deleted entirely.
 *
 * `menu`/`productionRuns`/`materials` are NOT owned here — they're populated
 * by the shared Firestore listener in App.tsx and passed in as read-only
 * parameters (same pattern as the other extracted hooks).
 */
import { auth, db, doc, writeBatch } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { deductIngredients } from '../utils/inventoryDeduction';
import { MenuItem, RawMaterial } from '../types';
import { ProductionRun, ProductionPurpose } from '../components/ProductionRunModal';

export function useProductionActions(
  menu: MenuItem[],
  materials: RawMaterial[],
  productionRuns: ProductionRun[],
  showAlert: (title: string, message: string) => void
) {
  /**
   * Records a production run in Firestore using an atomic `writeBatch`.
   * All operations either succeed together or fail together — no partial writes:
   *  1. Deducts raw materials from inventory.
   *  2. Increments `finishedGoodsStock` on the menu item (if purpose allows).
   *  3. Writes the run document to `users/{userId}/productionRuns/{id}`.
   */
  const logProductionRun = async (
    runData: Omit<ProductionRun, 'id' | 'createdAt'>
  ) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const id = Math.random().toString(36).substr(2, 9);

    // Firestore does not accept `undefined` — build object only with defined fields
    const recipeItem = menu.find(m => m.id === runData.recipeId);
    let expiryDate = undefined;
    if (recipeItem?.shelfLifeDays) {
       const d = new Date(runData.date);
       d.setDate(d.getDate() + recipeItem.shelfLifeDays);
       expiryDate = d.toISOString().split('T')[0];
    }
    const yieldAmt = runData.quantityYield ?? runData.quantityProduced;
    const run: Record<string, any> = {
      id,
      recipeId: runData.recipeId,
      quantityProduced: runData.quantityProduced,
      remainingQuantity: yieldAmt,
      ...(expiryDate && { expiryDate }),
      date: runData.date,
      purpose: runData.purpose,
      costTotal: runData.costTotal,
      createdAt: Date.now(),
    };
    if (runData.quantityYield !== undefined) run.quantityYield = runData.quantityYield;
    if (runData.notes) run.notes = runData.notes;

    try {
      const batch = writeBatch(db);

      // 1. Deduct raw materials (added to batch, not committed yet)
      const item = menu.find(m => m.id === runData.recipeId);
      if (item) {
        await deductIngredients(userId, materials, item.recipe, runData.quantityProduced, batch);
      }

      // 2. Add finished goods (if purpose warrants it)
      const STOCK_PURPOSES: ProductionPurpose[] = ['customer_order', 'market_stock', 'other'];
      if (STOCK_PURPOSES.includes(runData.purpose)) {
        const effectiveYield = runData.quantityYield ?? runData.quantityProduced;
        const currentStock = item?.finishedGoodsStock ?? 0;
        batch.set(
          doc(db, 'users', userId, 'menu', runData.recipeId),
          { finishedGoodsStock: currentStock + effectiveYield },
          { merge: true }
        );
      }

      // 3. Persist the run record
      batch.set(doc(db, 'users', userId, 'productionRuns', id), run);

      await batch.commit();

      showAlert('Production Run Logged', `Recorded ${runData.quantityProduced} unit(s) of ${item?.name || 'recipe'}. Raw materials deducted.`);
    } catch (err: any) {
      console.error('logProductionRun error:', err);
      showAlert('Error', `Failed to log production run: ${err?.message || 'Unknown error'}`);
      throw err; // re-throw so modal catch block handles isSaving reset
    }
  };

  /**
   * Deletes a production run after confirmation using an atomic `writeBatch`,
   * then reverses its inventory effects. All-or-nothing:
   *  1. Restores raw materials using `deductIngredients` with a negative multiplier.
   *  2. Decrements `finishedGoodsStock` (clamped to 0) on the menu item.
   *  3. Deletes the run document from Firestore.
   */
  const deleteProductionRun = async (runId: string) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const run = productionRuns.find(r => r.id === runId);
    if (!run) return;

    if (window.confirm('Are you sure you want to delete this production run? This will restore raw materials and deduct finished goods stock.')) {
      try {
        const batch = writeBatch(db);

        const item = menu.find(m => m.id === run.recipeId);
        if (item) {
          await deductIngredients(userId, materials, item.recipe, -run.quantityProduced, batch);

          const STOCK_PURPOSES: ProductionPurpose[] = ['customer_order', 'market_stock', 'other'];
          if (STOCK_PURPOSES.includes(run.purpose)) {
            const effectiveYield = run.quantityYield ?? run.quantityProduced;
            const currentStock = item.finishedGoodsStock ?? 0;
            batch.set(
              doc(db, 'users', userId, 'menu', run.recipeId),
              { finishedGoodsStock: Math.max(0, currentStock - effectiveYield) },
              { merge: true }
            );
          }
        }

        batch.delete(doc(db, 'users', userId, 'productionRuns', runId));

        await batch.commit();

        showAlert('Success', 'Production run deleted and inventory restored.');
      } catch (err: any) {
        console.error('deleteProductionRun error:', err);
        showAlert('Error', `Failed to delete production run: ${err?.message || 'Unknown error'}`);
      }
    }
  };

  /**
   * Discards an expired production batch: logs it as wastage, zeroes the
   * run's remaining quantity, and decrements finished-goods stock.
   */
  const handleDiscardBatch = async (batch: ProductionRun) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const qty = batch.remainingQuantity ?? 0;
    if (qty <= 0) return;

    // We prorate the historic cost based on the quantity being discarded vs produced
    const originalQty = batch.quantityYield ?? batch.quantityProduced;
    const proratedCost = originalQty > 0 ? (batch.costTotal * (qty / originalQty)) : 0;

    const recipe = menu.find(m => m.id === batch.recipeId);

    try {
      const batchOp = writeBatch(db);

      const logId = 'waste_' + Date.now();
      batchOp.set(doc(db, 'users', userId, 'wastageLogs', logId), {
        id: logId,
        type: 'recipe',
        itemId: batch.recipeId,
        quantity: qty,
        cost: proratedCost,
        date: new Date().toISOString().split('T')[0],
        reason: 'Expired'
      });

      batchOp.set(
        doc(db, 'users', userId, 'productionRuns', batch.id),
        { remainingQuantity: 0 },
        { merge: true }
      );

      if (recipe && (recipe.finishedGoodsStock ?? 0) > 0) {
        batchOp.set(
          doc(db, 'users', userId, 'menu', recipe.id),
          { finishedGoodsStock: Math.max(0, (recipe.finishedGoodsStock ?? 0) - qty) },
          { merge: true }
        );
      }

      await batchOp.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userId}/wastageLogs (batch discard)`);
    }
  };

  return {
    logProductionRun,
    deleteProductionRun,
    handleDiscardBatch,
  };
}
