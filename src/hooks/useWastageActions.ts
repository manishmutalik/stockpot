/**
 * useWastageActions.ts
 *
 * Owns the "Discard" flow: logging wasted material or finished-goods stock
 * as a wastage entry and deducting it from inventory. Extracted out of
 * App.tsx as part of the Phase 4 breakup.
 *
 * Fixed since extraction: `setDiscardTarget` is now wired up from
 * InventoryView (materials) and MenuView (finished goods), and the phantom
 * `toast.success(...)` call (which had no runtime backing and would have
 * thrown `ReferenceError: toast is not defined`) has been replaced with
 * `showAlert`, matching the pattern used by every other hook in this app.
 *
 * `materials`/`menu` are NOT owned here — they're populated by the shared
 * Firestore listener in App.tsx and passed in as read-only parameters (same
 * pattern as the other extracted hooks).
 */
import type React from 'react';
import { useState, useEffect } from 'react';
import { auth, db, doc, writeBatch } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { RawMaterial, MenuItem } from '../types';

export type DiscardTarget = {
  id: string;
  name: string;
  type: 'material' | 'recipe';
  batchId?: string;
  maxQty: number;
  unit: string;
  costPerUnit: number;
  /** Pre-fills the Reason field for a quick action (e.g. Market Stock's
   * "Personal Use"/"Sampling" buttons) instead of leaving it blank for
   * freeform entry — still editable, just not starting empty. */
  presetReason?: string;
};

export function useWastageActions(
  materials: RawMaterial[],
  menu: MenuItem[],
  showAlert: (title: string, message: string) => void
) {
  const [discardTarget, setDiscardTarget] = useState<DiscardTarget | null>(null);
  const [discardQty, setDiscardQty] = useState('');
  const [discardReason, setDiscardReason] = useState('');

  // Seeds the Reason field from the target's presetReason (or clears it)
  // every time a new discard target is opened, so a leftover reason from a
  // previous item/flow can never leak into the next one.
  useEffect(() => {
    setDiscardReason(discardTarget?.presetReason ?? '');
  }, [discardTarget]);

  const handleDiscard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !discardTarget || !discardQty) return;
    const qty = Number(discardQty);
    if (qty <= 0) return;

    try {
      const userId = auth.currentUser.uid;
      const totalCost = qty * discardTarget.costPerUnit;

      const batchOp = writeBatch(db);

      const logId = 'waste_' + Date.now();
      batchOp.set(doc(db, 'users', userId, 'wastageLogs', logId), {
        id: logId,
        type: discardTarget.type,
        itemId: discardTarget.id,
        quantity: qty,
        cost: totalCost,
        date: new Date().toISOString().split('T')[0],
        reason: discardReason || 'Discarded'
      });

      if (discardTarget.type === 'material') {
        const mat = materials.find(m => m.id === discardTarget.id);
        if (mat) {
           let amountToDeduct = qty;
           const newBatches = Array.isArray(mat.batches) ? [...mat.batches].map(b => ({...b})) : [];

           if (discardTarget.batchId) {
             const b = newBatches.find(x => x.id === discardTarget.batchId);
             if (b) b.remainingQuantity = Math.max(0, b.remainingQuantity - amountToDeduct);
           } else {
             newBatches.sort((a,b) => a.expiryDate.localeCompare(b.expiryDate));
             for (const b of newBatches) {
               if (amountToDeduct <= 0) break;
               if (b.remainingQuantity >= amountToDeduct) {
                 b.remainingQuantity -= amountToDeduct;
                 amountToDeduct = 0;
               } else {
                 amountToDeduct -= b.remainingQuantity;
                 b.remainingQuantity = 0;
               }
             }
           }

           const newStock = parseFloat((mat.initialStock - qty).toFixed(4));
           batchOp.set(doc(db, 'users', userId, 'materials', mat.id), {
             initialStock: newStock,
             batches: newBatches
           }, { merge: true });
        }
      } else {
         const menuIt = menu.find(m => m.id === discardTarget.id);
         if (menuIt) {
            batchOp.set(doc(db, 'users', userId, 'menu', menuIt.id), {
              finishedGoodsStock: Math.max(0, (menuIt.finishedGoodsStock || 0) - qty)
            }, { merge: true });
         }
      }

      await batchOp.commit();

      setDiscardTarget(null);
      setDiscardQty('');
      setDiscardReason('');
      showAlert('Success', 'Wastage logged successfully.');
    } catch(err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${auth.currentUser?.uid}/wastageLogs`);
    }
  };

  return {
    discardTarget,
    setDiscardTarget,
    discardQty,
    setDiscardQty,
    discardReason,
    setDiscardReason,
    handleDiscard,
  };
}
