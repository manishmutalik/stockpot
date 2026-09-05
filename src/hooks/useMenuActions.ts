/**
 * useMenuActions.ts
 *
 * Owns menu item CRUD (add/update/delete/copy) and recipe editing
 * (add/update/remove ingredient, quick-add ingredients). Extracted out of
 * App.tsx as part of the Phase 4 breakup — behavior preserved exactly from
 * the original inline implementation.
 *
 * `menu`/`materials`/`orders` are NOT owned here — they're populated by the
 * shared Firestore listener in App.tsx and passed in as read-only parameters
 * (same pattern as useSettings/useInventoryActions).
 */
import { auth, db, doc, setDoc, deleteDoc } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { MenuItem, RawMaterial, Order, IngredientRequirement, QuickIngredient, getDefaultRecipeUnit } from '../types';

export function useMenuActions(
  menu: MenuItem[],
  materials: RawMaterial[],
  orders: Order[],
  showAlert: (title: string, message: string) => void
) {
  /**
   * Creates a new blank menu item in Firestore. Starts with an empty recipe
   * and zero selling price; the user edits it inline in the Menu tab.
   */
  const addMenuItem = async () => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const id = Math.random().toString(36).substr(2, 9);
    const newItem: MenuItem = {
      id,
      name: 'New Menu Item',
      sellingPrice: 0,
      recipe: [],
      emoji: '🧁'
    };
    try {
      await setDoc(doc(db, 'users', userId, 'menu', id), newItem);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userId}/menu/${id}`);
    }
  };

  /**
   * Updates the `name` field of a menu item, spreading the existing item
   * data to prevent accidentally wiping recipe/price fields.
   */
  const updateMenuItem = async (id: string, name: string) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const item = menu.find(m => m.id === id);
    try {
      if (item) {
        await setDoc(doc(db, 'users', userId, 'menu', id), {
          ...item,
          name
        }, { merge: true });
      } else {
        await setDoc(doc(db, 'users', userId, 'menu', id), { name }, { merge: true });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/menu/${id}`);
    }
  };

  /**
   * Generically updates any single field on a menu item document.
   * Spreads the existing item to avoid clobbering other fields.
   */
  const updateMenuItemField = async (id: string, field: keyof MenuItem, value: any) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const item = menu.find(m => m.id === id);
    try {
      if (item) {
        await setDoc(doc(db, 'users', userId, 'menu', id), {
          ...item,
          [field]: value
        }, { merge: true });
      } else {
        await setDoc(doc(db, 'users', userId, 'menu', id), { [field]: value }, { merge: true });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/menu/${id}`);
    }
  };

  /**
   * Deletes a menu item and all associated sales orders from Firestore.
   * Cascading order deletion prevents orphaned records.
   */
  const deleteMenuItem = async (id: string) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    try {
      await deleteDoc(doc(db, 'users', userId, 'menu', id));
      const ordersToDelete = orders.filter(o => o.menuItemId === id);
      for (const order of ordersToDelete) {
        await deleteDoc(doc(db, 'users', userId, 'orders', order.id));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${userId}/menu/${id}`);
    }
  };

  /**
   * Resets `finishedGoodsStock` to 0 for a menu item after user confirmation.
   * Used from the Production Log tab when pre-baked goods have been sold or discarded.
   */
  const clearFinishedGoodsStock = async (id: string) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    if (window.confirm('Are you sure you want to clear the stock for this finished good?')) {
      try {
        await setDoc(doc(db, 'users', userId, 'menu', id), { finishedGoodsStock: 0 }, { merge: true });
        showAlert('Success', 'Finished goods stock cleared.');
      } catch (err: any) {
        console.error('clearFinishedGoodsStock error:', err);
        showAlert('Error', `Failed to clear stock: ${err?.message || 'Unknown error'}`);
      }
    }
  };

  /**
   * Duplicates an existing menu item with a "(Copy)" suffix on the name.
   * The new item gets a freshly generated ID and deeply copies the recipe array.
   */
  const copyMenuItem = async (item: MenuItem) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const id = Math.random().toString(36).substr(2, 9);
    const newItem: MenuItem = {
      ...item,
      id,
      name: `${item.name} (Copy)`,
      recipe: item.recipe.map(r => ({ ...r }))
    };
    try {
      await setDoc(doc(db, 'users', userId, 'menu', id), newItem);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userId}/menu/${id}`);
    }
  };

  /**
   * Adds a new blank ingredient requirement to a recipe. Defaults to the
   * first material found in the specified category.
   */
  const addIngredientToRecipe = async (itemId: string, category: string = 'Raw Materials') => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const filteredMaterials = materials.filter(m => m.category === category);
    if (filteredMaterials.length === 0) {
      showAlert("No Materials", `Please add some materials to the '${category}' category first.`);
      return;
    }
    const defaultMaterial = filteredMaterials[0];
    const item = menu.find(m => m.id === itemId);
    if (!item) return;

    const newRecipe = [...item.recipe, { materialId: defaultMaterial.id, amount: 0, unit: getDefaultRecipeUnit(defaultMaterial.unit) }];
    try {
      await setDoc(doc(db, 'users', userId, 'menu', itemId), {
        ...item,
        recipe: newRecipe
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/menu/${itemId}`);
    }
  };

  /** Appends multiple ingredients from the Quick Select modal into a recipe. */
  const addQuickIngredientsToRecipe = async (itemId: string, quickIngredients: QuickIngredient[]) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const item = menu.find(m => m.id === itemId);
    if (!item) return;

    const newRecipe = [...item.recipe, ...quickIngredients];
    try {
      await setDoc(doc(db, 'users', userId, 'menu', itemId), {
        ...item,
        recipe: newRecipe
      }, { merge: true });
      showAlert("Success", `Added ${quickIngredients.length} ingredients to recipe.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/menu/${itemId}`);
    }
  };

  /**
   * When the material selection changes on an ingredient row, automatically
   * updates the `unit` field to the default recipe unit for the new material.
   */
  const updateRecipeIngredient = async (itemId: string, index: number, field: keyof IngredientRequirement, value: string | number) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const item = menu.find(m => m.id === itemId);
    if (!item) return;

    const newRecipe = [...item.recipe];
    const updatedIngredient = { ...newRecipe[index], [field]: value };

    if (field === 'materialId') {
      const newMat = materials.find(m => m.id === value);
      if (newMat) {
        updatedIngredient.unit = getDefaultRecipeUnit(newMat.unit);
      }
    }

    newRecipe[index] = updatedIngredient;
    try {
      await setDoc(doc(db, 'users', userId, 'menu', itemId), {
        ...item,
        recipe: newRecipe
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/menu/${itemId}`);
    }
  };

  /** Removes an ingredient from a recipe by its index. */
  const removeIngredientFromRecipe = async (itemId: string, index: number) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const item = menu.find(m => m.id === itemId);
    if (!item) return;

    const newRecipe = [...item.recipe];
    newRecipe.splice(index, 1);
    try {
      await setDoc(doc(db, 'users', userId, 'menu', itemId), {
        ...item,
        recipe: newRecipe
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/menu/${itemId}`);
    }
  };

  return {
    addMenuItem,
    updateMenuItem,
    updateMenuItemField,
    deleteMenuItem,
    clearFinishedGoodsStock,
    copyMenuItem,
    addIngredientToRecipe,
    addQuickIngredientsToRecipe,
    updateRecipeIngredient,
    removeIngredientFromRecipe,
  };
}
