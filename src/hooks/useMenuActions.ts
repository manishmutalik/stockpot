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
import { auth, db, doc, setDoc, deleteDoc, deleteField } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { MenuItem, RawMaterial, Order, IngredientRequirement, ItemPart, ItemUnitByMeasure, QuickIngredient, getDefaultRecipeUnit } from '../types';
import { needsBaselineStamp, pricingStamp } from '../utils/pricing';
import { DEFAULT_TIME_ZONE, todayInZone } from '../utils/localDate';
import { costView, itemsUsing, partsOf, wouldLoop } from '../utils/itemParts';
import { rescaleForBatchSize } from '../utils/batches';
import { formatItemQuantity, itemUnit, unitWord } from '../utils/itemUnits';

export function useMenuActions(
  menu: MenuItem[],
  materials: RawMaterial[],
  orders: Order[],
  showAlert: (title: string, message: string) => void,
  options: { today?: () => string } = {}
) {
  const today = options.today ?? (() => todayInZone(DEFAULT_TIME_ZONE));

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
   *
   * Setting a price also writes the pricing stamp (the day, the unit cost and each recipe material's cost per
   * unit), so margin drift can later be measured against the cost the price was set at. Callers must pass the
   * final price (the Menu screen commits on blur), not every keystroke, or each one would reset the baseline.
   */
  const updateMenuItemField = async (id: string, field: keyof MenuItem, value: any) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const item = menu.find(m => m.id === id);
    // Selling by weight comes later: an item counted by weight stays made for other items.
    if (item && field === 'notForSale' && value === false && itemUnit(item) !== 'pcs') {
      showAlert('Not yet', `${item.name} is counted in ${unitWord(itemUnit(item))}. Only items counted in pieces can be sold on the menu for now: count it in pieces first.`);
      return;
    }
    try {
      if (item) {
        const stamp = field === 'sellingPrice' && Number(value) > 0 ? { ...pricingStamp(costView(item, menu), materials, today()), pricingIsBaseline: false } : {};
        await setDoc(doc(db, 'users', userId, 'menu', id), {
          ...item,
          [field]: value,
          ...stamp
        }, { merge: true });
      } else {
        await setDoc(doc(db, 'users', userId, 'menu', id), { [field]: value }, { merge: true });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/menu/${id}`);
    }
  };

  /**
   * Gives every priced item that has no pricing stamp a baseline one at today's costs, marked as a baseline
   * (the cost it was really priced at is not knowable, so past costs are not reconstructed). Each item is
   * stamped once: after the write it has a stamp and drops out. Returns how many it stamped.
   */
  const stampPricingBaselines = async (): Promise<number> => {
    if (!auth.currentUser) return 0;
    const userId = auth.currentUser.uid;
    const pending = menu.filter(needsBaselineStamp);
    let done = 0;
    for (const item of pending) {
      try {
        await setDoc(doc(db, 'users', userId, 'menu', item.id), { ...pricingStamp(costView(item, menu), materials, today()), pricingIsBaseline: true }, { merge: true });
        done++;
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/menu/${item.id}`);
      }
    }
    return done;
  };

  /**
   * Deletes a menu item and all associated sales orders from Firestore.
   * Cascading order deletion prevents orphaned records.
   */
  const deleteMenuItem = async (id: string) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    // An item other items are made from (a sponge base) cannot go while they use it: their costs would quietly drop.
    const users = itemsUsing(menu, id);
    if (users.length > 0) {
      const names = users.slice(0, 3).map(u => u.name).join(', ') + (users.length > 3 ? ` and ${users.length - 3} more` : '');
      showAlert('Still in use', `${menu.find(m => m.id === id)?.name ?? 'This item'} is used in ${names}. Remove it from ${users.length === 1 ? 'that item' : 'those items'} first.`);
      return;
    }
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
      recipe: item.recipe.map(r => ({ ...r })),
      ...(item.parts && { parts: item.parts.map(p => ({ ...p })) }),
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

  /**
   * Sets the other items `itemId` is made from (a sponge base in a cream cake), per one of it. A part that would put the
   * item inside itself, directly or through others, is refused; a quantity of nothing is dropped.
   */
  const setItemParts = async (itemId: string, parts: ItemPart[]) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const looping = parts.find(p => wouldLoop(menu, itemId, p.itemId));
    if (looping) {
      showAlert('Not possible', `${menu.find(m => m.id === looping.itemId)?.name ?? 'That item'} already uses ${menu.find(m => m.id === itemId)?.name ?? 'this item'}, so it cannot go into it.`);
      return;
    }
    const kept = partsOf({ id: itemId, parts: parts.filter(p => p.quantity > 0) }).map(p => ({ itemId: p.itemId, quantity: p.quantity }));
    try {
      await setDoc(doc(db, 'users', userId, 'menu', itemId), { parts: kept }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/menu/${itemId}`);
    }
  };

  /**
   * How many one batch of the item makes (utils/batches); nothing clears it. The recipe stays per one item, unless:
   *  - `keep-batch`: one batch still uses the same ingredients (it turned out to make 4.2, not 4.5), so the recipe and parts
   *    are scaled to the new size;
   *  - `from-whole-batch`: the recipe was written for the whole batch, so it is divided by the batch size.
   */
  const setBatchSize = async (itemId: string, makes: number | null, scale?: 'keep-batch' | 'from-whole-batch') => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const item = menu.find(m => m.id === itemId);
    if (!item) return;
    const n = makes !== null && Number.isFinite(makes) && makes > 0 ? Math.round(makes * 1000) / 1000 : null;
    const data = n === null ? { batchMakes: deleteField() }
      : scale === 'keep-batch' ? rescaleForBatchSize(item, n)
      : scale === 'from-whole-batch' ? rescaleForBatchSize({ ...item, batchMakes: 1 }, n)
      : { batchMakes: n };
    try {
      await setDoc(doc(db, 'users', userId, 'menu', itemId), data, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/menu/${itemId}`);
    }
  };

  /**
   * Made when it is ordered, or kept on the shelf (utils/madeToOrder). An item made to order has no shelf, so units still
   * on it are cleared once the owner agrees; otherwise it stays as it is, to sell those first.
   */
  const setMadeToOrder = async (itemId: string, on: boolean) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const item = menu.find(m => m.id === itemId);
    if (!item) return;
    const onShelf = Math.round((item.finishedGoodsStock ?? 0) * 100) / 100;
    if (on && onShelf > 0 && !window.confirm(`${onShelf} ${item.name} ${onShelf === 1 ? 'is' : 'are'} on the shelf. Made to order, it has no shelf: clear ${onShelf === 1 ? 'it' : 'them'} and make it when ordered from now on?\n\nCancel to sell ${onShelf === 1 ? 'it' : 'them'} first.`)) return;
    try {
      await setDoc(doc(db, 'users', userId, 'menu', itemId), on ? { madeToOrder: true, finishedGoodsStock: 0 } : { madeToOrder: false }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/menu/${itemId}`);
    }
  };

  /**
   * Counts an item in pieces, kilograms or litres (utils/itemUnits). Its recipe, stock, batch size and cost then mean that
   * unit, so the owner is told what changes and asked once:
   *  - an item sold on the menu counted by weight is taken off the menu (selling by weight comes later);
   *  - items that use it keep their numbers, now in the new unit (0.15 of it reads 150 g), to be checked;
   *  - stock counted the old way is cleared;
   *  - the recipe goes back to being for the whole batch and the batch size is cleared (4 bases are not 4 kg), so setting
   *    the new size offers to divide it again.
   * Resolves whether it changed.
   */
  const setCountedIn = async (itemId: string, unit: ItemUnitByMeasure | null): Promise<boolean> => {
    if (!auth.currentUser) return false;
    const userId = auth.currentUser.uid;
    const item = menu.find(m => m.id === itemId);
    if (!item) return false;
    const from = itemUnit(item);
    const to = unit ?? 'pcs';
    if (to === from) return true;
    const offMenu = unit !== null && !item.notForSale;
    const users = itemsUsing(menu, itemId);
    const inStock = Math.round((item.finishedGoodsStock ?? 0) * 1000) / 1000;
    const amount = (u: typeof to, n: number) => (u === 'pcs' ? `${Math.round(n * 1000) / 1000} ${unitWord('pcs', n)}` : formatItemQuantity(u, n));
    const changes = [
      ...(offMenu ? [`It is sold on the menu: it will be made for other items instead (selling by weight comes later).`] : []),
      ...users.map(u => {
        const q = partsOf(u).filter(p => p.itemId === itemId).reduce((sum, p) => sum + p.quantity, 0);
        return `${u.name} uses ${amount(from, q)} of it: that will read ${amount(to, q)}. Check it afterwards.`;
      }),
      ...(inStock !== 0 ? [`Its stock (${amount(from, inStock)}) is cleared: log what you have again.`] : []),
    ];
    if (changes.length > 0 && !window.confirm(`Count ${item.name} in ${unitWord(to)}?\n\n${changes.join('\n')}`)) return false;
    const wholeBatch = item.batchMakes && item.batchMakes > 0 && item.batchMakes !== 1 ? rescaleForBatchSize(item, 1) : null;
    try {
      await setDoc(doc(db, 'users', userId, 'menu', itemId), {
        countedIn: unit ?? deleteField(),
        ...(offMenu && { notForSale: true, madeToOrder: false }),
        ...(inStock !== 0 && { finishedGoodsStock: 0 }),
        ...(wholeBatch && { recipe: wholeBatch.recipe, ...(wholeBatch.parts && { parts: wholeBatch.parts }) }),
        ...(item.batchMakes !== undefined && { batchMakes: deleteField() }),
      }, { merge: true });
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/menu/${itemId}`);
      return false;
    }
  };

  return {
    addMenuItem,
    setCountedIn,
    setItemParts,
    setMadeToOrder,
    setBatchSize,
    updateMenuItem,
    updateMenuItemField,
    stampPricingBaselines,
    deleteMenuItem,
    clearFinishedGoodsStock,
    copyMenuItem,
    addIngredientToRecipe,
    addQuickIngredientsToRecipe,
    updateRecipeIngredient,
    removeIngredientFromRecipe,
  };
}
