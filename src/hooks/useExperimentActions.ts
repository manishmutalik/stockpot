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
import { auth, db, doc, setDoc, deleteDoc } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { RecipeExperiment, RawMaterial } from '../types';

export function useExperimentActions(
  experiments: RecipeExperiment[],
  materials: RawMaterial[]
) {
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

  /** Removes an experiment document from Firestore. */
  const deleteExperiment = async (id: string) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
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
  };
}
