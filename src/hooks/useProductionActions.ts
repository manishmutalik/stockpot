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
import { useMemo } from 'react';
import { auth, db, doc, writeBatch } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { deductIngredients } from '../utils/inventoryDeduction';
import { MenuItem, RawMaterial, Order } from '../types';
import { ProductionRun, ProductionPurpose } from '../components/ProductionRunModal';

export function useProductionActions(
  menu: MenuItem[],
  materials: RawMaterial[],
  productionRuns: ProductionRun[],
  orders: Order[],
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
    runData: Omit<ProductionRun, 'id' | 'createdAt'>,
    options?: { silent?: boolean } // silent: true skips the success alert (used by logProductionRunSession for multi-item sessions, which shows one consolidated alert instead of one per item)
  ) => {
    if (!auth.currentUser) return;

    // The selected recipe must exist in the current menu — a stale/unknown id
    // (e.g. a UI default picked before the real menu loaded) would otherwise
    // silently create a nameless phantom `menu/{recipeId}` doc and a dangling
    // Order, both of which render with a blank item name.
    const recipeItem = menu.find(m => m.id === runData.recipeId);
    if (!recipeItem) {
      showAlert('Error', 'Selected recipe could not be found. Please reselect it and try again.');
      throw new Error(`logProductionRun: no menu item found for recipeId "${runData.recipeId}"`);
    }

    const userId = auth.currentUser.uid;
    const id = Math.random().toString(36).substr(2, 9);

    // Firestore does not accept `undefined` — build object only with defined fields
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
    if (runData.productionSessionId) run.productionSessionId = runData.productionSessionId;

    try {
      const batch = writeBatch(db);

      // 1. Deduct raw materials (added to batch, not committed yet)
      await deductIngredients(userId, materials, recipeItem.recipe, runData.quantityProduced, batch);

      // 2. Add finished goods (if purpose warrants it)
      const STOCK_PURPOSES: ProductionPurpose[] = ['customer_order', 'market_stock', 'other'];
      if (STOCK_PURPOSES.includes(runData.purpose)) {
        const effectiveYield = runData.quantityYield ?? runData.quantityProduced;
        const currentStock = recipeItem.finishedGoodsStock ?? 0;
        batch.set(
          doc(db, 'users', userId, 'menu', runData.recipeId),
          { finishedGoodsStock: currentStock + effectiveYield },
          { merge: true }
        );
      }

      // 2.5. If this run was made for a specific customer order, also create
      // a linked Order so it shows up in the Orders tab. Marked `fulfilled`
      // immediately, since the inventory/stock effects above already cover
      // it — otherwise a later "Fulfill" click on this same order would
      // deduct inventory a second time for the same units.
      if (runData.purpose === 'customer_order') {
        const orderId = Math.random().toString(36).substr(2, 9);
        batch.set(doc(db, 'users', userId, 'orders', orderId), {
          id: orderId,
          menuItemId: runData.recipeId,
          quantity: runData.quantityProduced,
          date: runData.date,
          fulfilled: true,
          productionRunId: id,
        } as Order);
      }

      // 3. Persist the run record
      batch.set(doc(db, 'users', userId, 'productionRuns', id), run);

      await batch.commit();

      if (!options?.silent) {
        const orderNote = runData.purpose === 'customer_order' ? ' A matching order was added to the Orders tab.' : '';
        showAlert('Production Run Logged', `Recorded ${runData.quantityProduced} unit(s) of ${recipeItem.name}. Raw materials deducted.${orderNote}`);
      }
    } catch (err: any) {
      console.error('logProductionRun error:', err);
      showAlert('Error', `Failed to log production run: ${err?.message || 'Unknown error'}`);
      throw err; // re-throw so modal catch block handles isSaving reset
    }
  };

  /**
   * Logs one or more production runs from a single "Log Production Run"
   * submission (e.g. a session that made several different recipes at
   * once). Each row becomes its own independent ProductionRun document via
   * logProductionRun, unchanged - materials deduction, finished-goods
   * stock, and customer-order auto-linking all work exactly as they do for
   * a single run, called once per row.
   *
   * When there's more than one row, all resulting documents share one
   * productionSessionId (see ProductionRun.productionSessionId) so they can
   * be displayed/managed together - this is a display/UX grouping only,
   * not a change to what each document means. A single-row call (and no
   * `existingSessionId`) gets no session id at all, so it's byte-for-byte
   * identical to calling logProductionRun directly.
   *
   * `existingSessionId`: pass the `sessionId` this function returned from
   * an earlier call to keep retrying rows in the same group. Without this,
   * retrying a partial failure would generate a *new* session id for the
   * remaining rows, splitting one session into two unrelated groups.
   *
   * Rows are saved sequentially, not as one atomic transaction: each row's
   * own writeBatch commits independently, so if row 3 of 5 fails, rows 1-2
   * are already durably saved. Stops at the first failure rather than
   * continuing, so the caller can see exactly which row needs attention.
   * Per-row success alerts are suppressed for multi-row sessions (one
   * consolidated alert at the end instead of N stacked ones); a failure's
   * error alert always shows, from logProductionRun itself, regardless of
   * row count, so the reason is never hidden.
   *
   * @returns succeededCount - how many rows saved before stopping.
   *          failedIndex - the 0-based index of the row that failed, or
   *          null if every row succeeded. The caller should drop rows
   *          [0, succeededCount) from its own pending list before letting
   *          the user retry, so a retry doesn't resubmit rows that are
   *          already saved (which would create duplicates).
   *          sessionId - the id used for this call, if any. Pass it back in
   *          as `existingSessionId` on a retry.
   */
  const logProductionRunSession = async (
    rows: Omit<ProductionRun, 'id' | 'createdAt' | 'productionSessionId'>[],
    existingSessionId?: string
  ): Promise<{ succeededCount: number; failedIndex: number | null; sessionId?: string }> => {
    if (rows.length === 0) return { succeededCount: 0, failedIndex: null };

    const isSession = rows.length > 1 || !!existingSessionId;
    const sessionId = isSession ? (existingSessionId || Math.random().toString(36).substr(2, 9)) : undefined;

    for (let i = 0; i < rows.length; i++) {
      try {
        await logProductionRun(
          { ...rows[i], ...(sessionId && { productionSessionId: sessionId }) },
          { silent: isSession }
        );
      } catch {
        // logProductionRun already showed its own error alert - just report
        // how far we got so the caller can drop the successful rows and
        // retry with the same sessionId.
        return { succeededCount: i, failedIndex: i, sessionId };
      }
    }

    if (isSession) {
      showAlert('Production Runs Logged', `Recorded ${rows.length} item(s) in this session.`);
    }
    return { succeededCount: rows.length, failedIndex: null, sessionId };
  };

  /**
   * Deletes a production run after confirmation using an atomic `writeBatch`,
   * then reverses its inventory effects. All-or-nothing:
   *  1. Restores raw materials using `deductIngredients` with a negative multiplier.
   *  2. Decrements `finishedGoodsStock` (clamped to 0) on the menu item.
   *  3. Deletes the run document from Firestore.
   *  4. Deletes the linked Order too, if this run was logged as a customer
   *     order (see logProductionRun) — otherwise deleting the run would
   *     leave an orphaned, already-fulfilled order behind with nothing
   *     backing it.
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

        const linkedOrder = orders.find(o => o.productionRunId === runId);
        if (linkedOrder) {
          batch.delete(doc(db, 'users', userId, 'orders', linkedOrder.id));
        }

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

  /**
   * Production runs tagged "Customer Order" that don't yet have a linked
   * Order — i.e. runs logged before the auto-linking in logProductionRun()
   * existed. Used to show/hide the one-time "Backfill Missing Orders"
   * button: once the list is empty, there's nothing left to backfill and
   * the button naturally disappears.
   */
  const runsNeedingOrderBackfill = useMemo(
    () => productionRuns.filter(
      r => r.purpose === 'customer_order' && !orders.some(o => o.productionRunId === r.id)
    ),
    [productionRuns, orders]
  );

  /**
   * One-time catch-up action: creates the missing linked Order for every
   * existing "Customer Order" production run that predates the auto-linking
   * feature. Unlike logProductionRun, this does NOT touch inventory —
   * materials/finished-goods stock were already correctly adjusted when
   * each run was originally logged, so this only creates the missing Order
   * records, marked pre-fulfilled for the same reason as the live path.
   */
  const backfillMissingOrders = async () => {
    if (!auth.currentUser || runsNeedingOrderBackfill.length === 0) return;
    const userId = auth.currentUser.uid;

    try {
      const batch = writeBatch(db);
      for (const run of runsNeedingOrderBackfill) {
        const orderId = Math.random().toString(36).substr(2, 9);
        batch.set(doc(db, 'users', userId, 'orders', orderId), {
          id: orderId,
          menuItemId: run.recipeId,
          quantity: run.quantityProduced,
          date: run.date,
          fulfilled: true,
          productionRunId: run.id,
        } as Order);
      }
      await batch.commit();
      showAlert('Backfill Complete', `Added ${runsNeedingOrderBackfill.length} missing order(s) to the Orders tab.`);
    } catch (err: any) {
      console.error('backfillMissingOrders error:', err);
      showAlert('Error', `Failed to backfill orders: ${err?.message || 'Unknown error'}`);
    }
  };

  return {
    logProductionRun,
    logProductionRunSession,
    deleteProductionRun,
    handleDiscardBatch,
    runsNeedingOrderBackfill,
    backfillMissingOrders,
  };
}
