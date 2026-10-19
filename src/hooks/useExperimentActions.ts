/**
 * useExperimentActions.ts
 *
 * Owns recipe experiment CRUD (add/update/delete) and the materials list
 * within each experiment (add/remove/update quantity). Extracted out of
 * App.tsx as part of the Phase 4 breakup — behavior preserved exactly from
 * the original inline implementation.
 *
 * `experiments`/`materials` are NOT owned here — they're populated by the
 * shared Firestore listener in App.tsx and passed in as read-only
 * parameters (same pattern as the other extracted hooks).
 */
import { auth, db, doc, setDoc, deleteDoc, writeBatch } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { ItemPart, MenuItem, RecipeExperiment, RawMaterial } from '../types';

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function useExperimentActions(
  experiments: RecipeExperiment[],
  materials: RawMaterial[],
  menu: MenuItem[] = []
) {
  /**
   * Saves an experiment's bases and fillings (`parts`) and, in the same write, takes what more it now uses of each from
   * that item's finished stock (`used`: item id → amount; negative gives back), as making an item does. Stock may go
   * below zero, as there: it comes right when the made items are logged.
   */
  const saveParts = async (exp: RecipeExperiment, parts: ItemPart[] | null, used: Record<string, number>) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const batch = writeBatch(db);
    const expRef = doc(db, 'users', userId, 'experiments', exp.id);
    if (parts) batch.set(expRef, { ...exp, parts }, { merge: true });
    else batch.delete(expRef);
    for (const [itemId, amount] of Object.entries(used)) {
      const item = menu.find(m => m.id === itemId);
      if (!item || !amount) continue;
      batch.set(doc(db, 'users', userId, 'menu', itemId), { finishedGoodsStock: round4((item.finishedGoodsStock ?? 0) - amount) }, { merge: true });
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, parts ? OperationType.UPDATE : OperationType.DELETE, `users/${userId}/experiments/${exp.id}`);
    }
  };

  /** Adds a base, filling or other made item to an experiment, with nothing used yet. */
  const addPartToExperiment = async (expId: string, itemId: string) => {
    const exp = experiments.find(e => e.id === expId);
    const parts = exp?.parts ?? [];
    if (!exp || parts.some(p => p.itemId === itemId) || !menu.some(m => m.id === itemId)) return;
    await saveParts(exp, [...parts, { itemId, quantity: 0 }], {});
  };

  /** Sets how much of a made item an experiment used (in the item's unit), taking the difference from its stock. */
  const updateExperimentPart = async (expId: string, itemId: string, quantity: number) => {
    const exp = experiments.find(e => e.id === expId);
    const before = exp?.parts?.find(p => p.itemId === itemId);
    if (!exp || !before) return;
    const next = Math.max(0, quantity);
    await saveParts(exp, (exp.parts ?? []).map(p => (p.itemId === itemId ? { ...p, quantity: next } : p)), { [itemId]: next - before.quantity });
  };

  /** Takes a made item out of an experiment, giving what it used back to stock. */
  const removePartFromExperiment = async (expId: string, itemId: string) => {
    const exp = experiments.find(e => e.id === expId);
    const before = exp?.parts?.find(p => p.itemId === itemId);
    if (!exp || !before) return;
    await saveParts(exp, (exp.parts ?? []).filter(p => p.itemId !== itemId), { [itemId]: -before.quantity });
  };

  /**
   * Creates a new recipe experiment document in Firestore. The experiment
   * starts with no materials assigned.
   */
  const addExperiment = async () => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const id = Math.random().toString(36).substr(2, 9);
    const newExp: RecipeExperiment = {
      id,
      name: 'New Experiment',
      date: new Date().toISOString().split('T')[0],
      materials: []
    };
    try {
      await setDoc(doc(db, 'users', userId, 'experiments', id), newExp);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userId}/experiments/${id}`);
    }
  };

  const updateExperiment = async (id: string, field: keyof RecipeExperiment, value: any) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const exp = experiments.find(e => e.id === id);
    try {
      if (exp) {
        await setDoc(doc(db, 'users', userId, 'experiments', id), {
          ...exp,
          [field]: value
        }, { merge: true });
      } else {
        await setDoc(doc(db, 'users', userId, 'experiments', id), { [field]: value }, { merge: true });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/experiments/${id}`);
    }
  };

  /** Removes an experiment document from Firestore, giving the bases and fillings it used back to stock. */
  const deleteExperiment = async (id: string) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const exp = experiments.find(e => e.id === id);
    if (exp?.parts?.some(p => p.quantity > 0)) {
      await saveParts(exp, null, Object.fromEntries(exp.parts.map(p => [p.itemId, -p.quantity])));
      return;
    }
    try {
      await deleteDoc(doc(db, 'users', userId, 'experiments', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${userId}/experiments/${id}`);
    }
  };

  const addMaterialToExperiment = async (expId: string, materialId: string) => {
    const exp = experiments.find(e => e.id === expId);
    if (!exp || !auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const mat = materials.find(m => m.id === materialId);
    if (!mat) return;

    if (exp.materials.some(m => m.materialId === materialId)) return;

    const newMaterials = [...exp.materials, { materialId, amount: 0, unit: mat.unit }];
    try {
      await setDoc(doc(db, 'users', userId, 'experiments', expId), {
        ...exp,
        materials: newMaterials
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/experiments/${expId}`);
    }
  };

  const removeMaterialFromExperiment = async (expId: string, materialId: string) => {
    const exp = experiments.find(e => e.id === expId);
    if (!exp || !auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const newMaterials = exp.materials.filter(m => m.materialId !== materialId);
    try {
      await setDoc(doc(db, 'users', userId, 'experiments', expId), {
        ...exp,
        materials: newMaterials
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/experiments/${expId}`);
    }
  };

  /**
   * Updates the required amount of a specific material in an experiment.
   * Spreads existing data to prevent data loss on other materials.
   */
  const updateExperimentMaterial = async (expId: string, materialId: string, amount: number) => {
    const exp = experiments.find(e => e.id === expId);
    if (!exp || !auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const newMaterials = exp.materials.map(m => m.materialId === materialId ? { ...m, amount } : m);
    try {
      await setDoc(doc(db, 'users', userId, 'experiments', expId), {
        ...exp,
        materials: newMaterials
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/experiments/${expId}`);
    }
  };

  return {
    addExperiment,
    updateExperiment,
    deleteExperiment,
    addMaterialToExperiment,
    removeMaterialFromExperiment,
    updateExperimentMaterial,
    addPartToExperiment,
    updateExperimentPart,
    removePartFromExperiment,
  };
}
