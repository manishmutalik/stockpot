/**
 * useInventoryActions.ts
 *
 * Owns materials & category CRUD (add/update/patch/delete), CSV
 * import/export, and the Restock modal's own state + submit handler.
 * Extracted out of App.tsx as part of the Phase 4 breakup — behavior
 * preserved exactly from the original inline implementation.
 *
 * `materials`/`categories`/`menu` are NOT owned here — they're populated by
 * the shared Firestore listener in App.tsx (see useSettings.ts for the same
 * pattern/rationale) and passed in as read-only parameters.
 */
import type React from 'react';
import { useState } from 'react';
import Papa from 'papaparse';
import { auth, db, doc, setDoc, deleteDoc, writeBatch } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { apiFetch } from '../utils/apiClient';
import { RawMaterial, MenuItem } from '../types';
// Type-only: erased at build time, so the search functions themselves
// (axios calls, USDA_API_KEY) never end up in the client bundle.
import type { NutritionSearchResult } from '../../lib/nutritionSearch';

export function useInventoryActions(
  materials: RawMaterial[],
  categories: string[],
  menu: MenuItem[],
  showAlert: (title: string, message: string) => void,
  showConfirm: (title: string, message: string, onConfirm: () => void) => void
) {
  // ── Restock Modal State ──────────────────────────────────────────────────
  const [restockMaterial, setRestockMaterial] = useState<RawMaterial | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [restockBaseTotal, setRestockBaseTotal] = useState('');
  const [restockExpiryDate, setRestockExpiryDate] = useState('');

  // ── Nutrition & Allergens Modal State ────────────────────────────────────
  const [nutritionEditMaterial, setNutritionEditMaterial] = useState<RawMaterial | null>(null);
  const [nutritionCalories, setNutritionCalories] = useState('');
  const [nutritionProtein, setNutritionProtein] = useState('');
  const [nutritionCarbs, setNutritionCarbs] = useState('');
  const [nutritionFat, setNutritionFat] = useState('');
  const [nutritionAllergens, setNutritionAllergens] = useState<string[]>([]);
  const [nutritionSourceUsed, setNutritionSourceUsed] = useState<'usda' | 'openfoodfacts' | 'manual'>('manual');

  // Lookup search: query, in-flight state, and each source's own results/
  // error kept separate (not merged into one list) so the UI can show both
  // sets side by side rather than one source silently masking the other.
  const [nutritionSearchQuery, setNutritionSearchQuery] = useState('');
  const [isSearchingNutrition, setIsSearchingNutrition] = useState(false);
  const [usdaSearchResults, setUsdaSearchResults] = useState<NutritionSearchResult[]>([]);
  const [usdaSearchError, setUsdaSearchError] = useState<string | null>(null);
  const [offSearchResults, setOffSearchResults] = useState<NutritionSearchResult[]>([]);
  const [offSearchError, setOffSearchError] = useState<string | null>(null);

  /**
   * Creates a blank material in the given category. The user edits it inline
   * afterwards (name, unit, stock, etc. all start at defaults/zero).
   */
  const addMaterial = async (category: string = 'Raw Materials') => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const id = Math.random().toString(36).substr(2, 9);
    const newMat: RawMaterial = {
      id,
      name: `New ${category} Item`,
      unit: 'g',
      initialStock: 0,
      costPerUnit: 0,
      category,
      threshold: 0,
      dateAdded: new Date().toISOString().split('T')[0]
    };
    try {
      await setDoc(doc(db, 'users', userId, 'materials', id), newMat);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userId}/materials/${id}`);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = "Name,Unit,Initial Stock,Cost,Threshold\nFlour,kg,100,2.5,20\nSugar,kg,50,1.2,10";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "RawMaterials_Template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>, targetCategory: string) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;
    const userId = auth.currentUser.uid;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: any) => {
        try {
          const batch = writeBatch(db);
          let count = 0;

          results.data.forEach((row: any) => {
            const name = row['Name']?.trim();
            if (!name) return; // Skip invalid rows

            const id = Math.random().toString(36).substr(2, 9);
            const newMat: RawMaterial = {
              id,
              name,
              unit: row['Unit']?.trim() || 'g',
              initialStock: parseFloat(row['Initial Stock']) || 0,
              costPerUnit: parseFloat(row['Cost']) || 0,
              category: targetCategory,
              threshold: parseFloat(row['Threshold']) || 0,
              dateAdded: new Date().toISOString().split('T')[0]
            };

            const docRef = doc(db, 'users', userId, 'materials', id);
            batch.set(docRef, newMat);
            count++;
          });

          if (count > 0) {
            await batch.commit();
            showAlert('Success', `Imported ${count} items from CSV.`);
          } else {
            showAlert('Warning', 'No valid items found in the CSV. Make sure you have a "Name" column.');
          }
        } catch (err: any) {
          showAlert('Error', `Failed to import CSV: ${err.message}`);
        }

        e.target.value = '';
      }
    });
  };

  /**
   * Adds a new named category to the local list and persists it to Firestore.
   * Skips blank strings and duplicates (case-sensitive).
   */
  const addCategory = async (name: string) => {
    if (!name || categories.includes(name) || !auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const newCategories = [...categories, name];
    try {
      await setDoc(doc(db, 'users', userId, 'settings', 'bakery'), { categories: newCategories }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userId}/settings/bakery`);
    }
  };

  /**
   * Removes a category from the list and persists the change to Firestore.
   * Materials in the deleted category are moved to 'Raw Materials' first.
   */
  const deleteCategory = async (name: string) => {
    if (name === 'Raw Materials') {
      showAlert("Cannot Delete", "Cannot delete the default 'Raw Materials' category.");
      return;
    }
    showConfirm(
      "Delete Category",
      `Are you sure you want to delete the '${name}' category? All materials in this category will be moved to 'Raw Materials'.`,
      async () => {
        if (!auth.currentUser) return;
        const userId = auth.currentUser.uid;
        const newCategories = categories.filter(c => c !== name);
        try {
          const matsToUpdate = materials.filter(m => m.category === name);
          for (const mat of matsToUpdate) {
            await setDoc(doc(db, 'users', userId, 'materials', mat.id), {
              ...mat,
              category: 'Raw Materials'
            }, { merge: true });
          }
          await setDoc(doc(db, 'users', userId, 'settings', 'bakery'), { categories: newCategories }, { merge: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${userId}/settings/bakery`);
        }
      }
    );
  };

  /**
   * Partially updates a material document in Firestore via `setDoc` with `merge: true`.
   */
  const updateMaterial = async (id: string, field: keyof RawMaterial, value: any) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const mat = materials.find(m => m.id === id);
    try {
      if (mat) {
        await setDoc(doc(db, 'users', userId, 'materials', id), {
          ...mat,
          [field]: value
        }, { merge: true });
      } else {
        await setDoc(doc(db, 'users', userId, 'materials', id), { [field]: value }, { merge: true });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/materials/${id}`);
    }
  };

  /**
   * Atomically updates multiple fields on a material in a single Firestore write.
   * Use this instead of calling updateMaterial() multiple times, which causes
   * race conditions (each call spreads the stale mat object, overwriting each other).
   */
  const patchMaterial = async (id: string, fields: Partial<RawMaterial>) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const mat = materials.find(m => m.id === id);
    try {
      await setDoc(
        doc(db, 'users', userId, 'materials', id),
        mat ? { ...mat, ...fields } : fields,
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/materials/${id}`);
    }
  };

  /**
   * Submits the Restock modal: adds the new quantity to on-hand stock and
   * recalculates the material's moving-average cost per unit.
   */
  const handleRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockMaterial || !auth.currentUser || !restockQty || !restockBaseTotal) return;
    try {
      const qty = Number(restockQty);
      const baseTotal = Number(restockBaseTotal);
      if (qty <= 0) return;

      const newStock = (restockMaterial.initialStock || 0) + qty;
      const oldTotalValue = (restockMaterial.initialStock || 0) * (restockMaterial.costPerUnit || 0);
      const newMAC = newStock > 0 ? (oldTotalValue + baseTotal) / newStock : 0;

      const userId = auth.currentUser.uid;
      const restockUpdate: Record<string, any> = {
        initialStock: newStock,
        costPerUnit: Number(newMAC.toFixed(2))
      };
      if (restockExpiryDate) {
        restockUpdate.expiryDate = restockExpiryDate;
      }
      await setDoc(doc(db, 'users', userId, 'materials', restockMaterial.id), restockUpdate, { merge: true });

      setRestockMaterial(null);
      setRestockQty('');
      setRestockBaseTotal('');
      setRestockExpiryDate('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser.uid}/materials/${restockMaterial.id}`);
    }
  };

  /**
   * Opens the Nutrition & Allergens modal for a material, pre-filling the
   * form from whatever nutrition/allergen data it already has (blank
   * fields, no tags selected, if it has none) so editing an existing entry
   * doesn't start from scratch.
   */
  const openNutritionEditor = (mat: RawMaterial) => {
    setNutritionEditMaterial(mat);
    setNutritionCalories(mat.nutrition?.calories?.toString() ?? '');
    setNutritionProtein(mat.nutrition?.protein?.toString() ?? '');
    setNutritionCarbs(mat.nutrition?.carbs?.toString() ?? '');
    setNutritionFat(mat.nutrition?.fat?.toString() ?? '');
    setNutritionAllergens(mat.allergens ?? []);
    setNutritionSourceUsed(mat.nutritionSource ?? 'manual');

    // Reset the lookup panel for the new material rather than carrying over
    // whatever was searched for the previously-edited one.
    setNutritionSearchQuery(mat.name);
    setUsdaSearchResults([]);
    setUsdaSearchError(null);
    setOffSearchResults([]);
    setOffSearchError(null);
  };

  const toggleNutritionAllergen = (tag: string) => {
    setNutritionAllergens(prev => (
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    ));
  };

  /**
   * Queries USDA FoodData Central and Open Food Facts in parallel for every
   * lookup — never one as a fallback for the other. USDA carries no
   * allergen data at all, so a fallback chain that only tries Open Food
   * Facts when USDA comes up empty would rarely actually reach the one
   * source this feature depends on for allergens. Each source's results
   * (and failure, if any) are kept separate so the UI can show both lists
   * and let the owner pick from either.
   */
  const searchNutritionSources = async () => {
    const query = nutritionSearchQuery.trim();
    if (!query) return;

    setIsSearchingNutrition(true);
    setUsdaSearchError(null);
    setOffSearchError(null);

    const [usdaOutcome, offOutcome] = await Promise.allSettled([
      apiFetch(`/api/nutrition/search-usda?q=${encodeURIComponent(query)}`).then(r => r.json()),
      apiFetch(`/api/nutrition/search-openfoodfacts?q=${encodeURIComponent(query)}`).then(r => r.json()),
    ]);

    if (usdaOutcome.status === 'fulfilled' && !usdaOutcome.value.error) {
      setUsdaSearchResults(usdaOutcome.value.results || []);
    } else {
      setUsdaSearchResults([]);
      setUsdaSearchError(
        usdaOutcome.status === 'fulfilled' ? usdaOutcome.value.error : 'USDA lookup failed'
      );
    }

    if (offOutcome.status === 'fulfilled' && !offOutcome.value.error) {
      setOffSearchResults(offOutcome.value.results || []);
    } else {
      setOffSearchResults([]);
      setOffSearchError(
        offOutcome.status === 'fulfilled' ? offOutcome.value.error : 'Open Food Facts lookup failed'
      );
    }

    setIsSearchingNutrition(false);
  };

  /**
   * Pre-fills the form from a chosen search result. Every field stays
   * manually editable afterwards — no database perfectly matches a
   * specific brand or supplier, so this is a starting point, not a final
   * answer. Allergens are merged with (not replacing) whatever's already
   * selected, since applying a USDA result after already having picked
   * allergens manually shouldn't silently clear them.
   */
  const applyNutritionSearchResult = (result: NutritionSearchResult) => {
    if (result.nutrition) {
      setNutritionCalories(result.nutrition.calories.toString());
      setNutritionProtein(result.nutrition.protein.toString());
      setNutritionCarbs(result.nutrition.carbs.toString());
      setNutritionFat(result.nutrition.fat.toString());
    }
    if (result.allergens.length > 0) {
      setNutritionAllergens(prev => Array.from(new Set([...prev, ...result.allergens])));
    }
    setNutritionSourceUsed(result.source);
  };

  /**
   * Saves the Nutrition & Allergens modal. Nutrition is only written when
   * at least one macro field was filled in — leaving all four blank means
   * "no nutrition data for this material" (so recipe rollups correctly
   * flag it as incomplete), not "zero calories". Allergens are always
   * saved exactly as selected, including an empty selection, since
   * clearing every tag is a valid, deliberate edit.
   */
  const saveNutritionInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nutritionEditMaterial) return;

    const hasNutritionInput = [nutritionCalories, nutritionProtein, nutritionCarbs, nutritionFat]
      .some(v => v.trim() !== '');

    await patchMaterial(nutritionEditMaterial.id, {
      ...(hasNutritionInput ? {
        nutrition: {
          calories: parseFloat(nutritionCalories) || 0,
          protein: parseFloat(nutritionProtein) || 0,
          carbs: parseFloat(nutritionCarbs) || 0,
          fat: parseFloat(nutritionFat) || 0,
        },
        nutritionSource: nutritionSourceUsed,
      } : {}),
      allergens: nutritionAllergens,
    });

    setNutritionEditMaterial(null);
  };

  /**
   * Deletes a material document from Firestore, then removes it from any
   * recipes that reference it.
   */
  const deleteMaterial = async (id: string) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    try {
      await deleteDoc(doc(db, 'users', userId, 'materials', id));
      const itemsToUpdate = menu.filter(item => item.recipe.some(r => r.materialId === id));
      for (const item of itemsToUpdate) {
        const newRecipe = item.recipe.filter(r => r.materialId !== id);
        await setDoc(doc(db, 'users', userId, 'menu', item.id), {
          ...item,
          recipe: newRecipe
        }, { merge: true });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${userId}/materials/${id}`);
    }
  };

  return {
    addMaterial,
    handleDownloadTemplate,
    handleImportCSV,
    addCategory,
    deleteCategory,
    updateMaterial,
    patchMaterial,
    deleteMaterial,
    restockMaterial,
    setRestockMaterial,
    restockQty,
    setRestockQty,
    restockBaseTotal,
    setRestockBaseTotal,
    restockExpiryDate,
    setRestockExpiryDate,
    handleRestock,
    nutritionEditMaterial,
    setNutritionEditMaterial,
    openNutritionEditor,
    nutritionCalories,
    setNutritionCalories,
    nutritionProtein,
    setNutritionProtein,
    nutritionCarbs,
    setNutritionCarbs,
    nutritionFat,
    setNutritionFat,
    nutritionAllergens,
    toggleNutritionAllergen,
    saveNutritionInfo,
    nutritionSourceUsed,
    nutritionSearchQuery,
    setNutritionSearchQuery,
    isSearchingNutrition,
    usdaSearchResults,
    usdaSearchError,
    offSearchResults,
    offSearchError,
    searchNutritionSources,
    applyNutritionSearchResult,
  };
}
