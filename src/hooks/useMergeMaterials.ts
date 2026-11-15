/**
 * useMergeMaterials.ts
 *
 * Writes a merge of two inventory items (utils/mergeMaterials plans it). Every record that moves across is written first,
 * in batches Firestore accepts (at most 500 writes each); the kept item's new stock and cost and the deletion of the other
 * go last, in one batch together, so the two stocks are never both counted and never lost. If an earlier batch fails,
 * nothing about the two items has changed yet and the merge can simply be run again: the records already moved are
 * not found under the old item a second time.
 */
import { auth, db, doc, writeBatch } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import type { MenuItem, Order, PriceLogEntry, RawMaterial, RecipeExperiment, WastageLog } from '../types';
import { planMergeMaterials, type MergeWrite } from '../utils/mergeMaterials';

/** Firestore takes at most 500 writes in a batch; this leaves room. */
export const MERGE_BATCH_SIZE = 400;

export function useMergeMaterials(deps: {
  materials: RawMaterial[];
  menu: MenuItem[];
  experiments: RecipeExperiment[];
  orders: Order[];
  wastageLogs: WastageLog[];
  priceLog: PriceLogEntry[];
  showAlert: (title: string, message: string) => void;
}) {
  /** Merges `removeId` into `keepId`. Resolves whether it was done. */
  const mergeMaterials = async (keepId: string, removeId: string): Promise<boolean> => {
    if (!auth.currentUser) return false;
    const userId = auth.currentUser.uid;
    const keep = deps.materials.find(m => m.id === keepId);
    const remove = deps.materials.find(m => m.id === removeId);
    if (!keep || !remove) { deps.showAlert('Could not merge', 'One of those items is no longer in your inventory.'); return false; }
    const plan = planMergeMaterials({ keep, remove, menu: deps.menu, experiments: deps.experiments, orders: deps.orders, wastageLogs: deps.wastageLogs, priceLog: deps.priceLog });
    if ('error' in plan) { deps.showAlert('Cannot merge these', plan.error); return false; }

    const put = (batch: ReturnType<typeof writeBatch>, w: MergeWrite) => {
      const ref = doc(db, 'users', userId, w.collection, w.id);
      if (w.merge) batch.set(ref, w.data, { merge: true });
      else batch.set(ref, w.data);
    };
    try {
      for (let i = 0; i < plan.moves.length; i += MERGE_BATCH_SIZE) {
        const batch = writeBatch(db);
        plan.moves.slice(i, i + MERGE_BATCH_SIZE).forEach(w => put(batch, w));
        await batch.commit();
      }
      const last = writeBatch(db);
      put(last, plan.keep);
      last.delete(doc(db, 'users', userId, 'materials', plan.removeId));
      await last.commit();
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userId}/materials/${removeId}`);
      return false;
    }
  };

  return { mergeMaterials };
}
