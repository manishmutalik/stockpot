/**
 * useOrderActions.ts
 *
 * Owns sales order CRUD (add/update/delete/reset) plus `fulfillOrder`.
 * Extracted out of App.tsx as part of the Phase 4 breakup — behavior
 * preserved exactly from the original inline implementation.
 *
 * `fulfillOrder` is wired to a "Fulfill" button per order in OrdersView.
 * It's idempotent: once `order.fulfilled` is true, calling it again is a
 * no-op, since re-running it would deduct inventory a second time for the
 * same order.
 *
 * `menu`/`orders`/`materials`/`productionRuns` are NOT owned here — they're
 * populated by the shared Firestore listener in App.tsx and passed in as
 * read-only parameters (same pattern as the other extracted hooks).
 */
import { auth, db, doc, setDoc, deleteDoc, writeBatch } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { deductIngredients } from '../utils/inventoryDeduction';
import { MenuItem, Order, RawMaterial } from '../types';
import { ProductionRun } from '../components/ProductionRunModal';

export function useOrderActions(
  menu: MenuItem[],
  orders: Order[],
  materials: RawMaterial[],
  productionRuns: ProductionRun[],
  orderDate: string,
  showConfirm: (title: string, message: string, onConfirm: () => void) => void,
  showAlert: (title: string, message: string) => void
) {
  /**
   * Adds a blank order for `orderDate`, defaulting to the first menu item.
   * The user edits the item and quantity inline on the Orders tab.
   */
  const addOrder = async () => {
    if (menu.length === 0 || !auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const id = Math.random().toString(36).substr(2, 9);
    const newOrder: Order = {
      id,
      menuItemId: menu[0].id,
      quantity: 1,
      date: orderDate
    };
    try {
      await setDoc(doc(db, 'users', userId, 'orders', id), newOrder);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userId}/orders/${id}`);
    }
  };

  /**
   * Handles inventory deduction when an order is marked as fulfilled.
   * Uses `writeBatch` for atomic multi-doc writes. No-ops if the order was
   * already fulfilled, to avoid double-deducting inventory.
   *
   * Priority logic:
   *  - If `finishedGoodsStock === 0`: deducts raw materials directly.
   *  - If stock >= order.quantity: deducts from finished goods only.
   *  - Partial stock: asks the user whether to use raw materials for the full order.
   */
  const fulfillOrder = async (order: Order) => {
    if (!auth.currentUser) return;
    if (order.fulfilled) return;
    const userId = auth.currentUser.uid;
    const item = menu.find(m => m.id === order.menuItemId);
    if (!item) {
      showAlert('Error', 'This order refers to a menu item that no longer exists.');
      return;
    }

    const stock = item.finishedGoodsStock ?? 0;

    if (stock === 0) {
      const batch = writeBatch(db);
      await deductIngredients(userId, materials, item.recipe, order.quantity, batch);
      batch.set(doc(db, 'users', userId, 'orders', order.id), { fulfilled: true }, { merge: true });
      await batch.commit();
      showAlert('Order Fulfilled', `Deducted raw materials for ${order.quantity} unit(s) of ${item.name}.`);
    } else if (stock >= order.quantity) {
      const batch = writeBatch(db);

      let remainingToDeduct = order.quantity;
      const relevantRuns = productionRuns
        .filter(r => r.recipeId === item.id && (r.remainingQuantity ?? 0) > 0)
        .sort((a, b) => a.date.localeCompare(b.date));

      for (const run of relevantRuns) {
        if (remainingToDeduct <= 0) break;
        const available = run.remainingQuantity ?? 0;
        const deduct = Math.min(available, remainingToDeduct);
        batch.set(
          doc(db, 'users', userId, 'productionRuns', run.id),
          { remainingQuantity: available - deduct },
          { merge: true }
        );
        remainingToDeduct -= deduct;
      }

      batch.set(
        doc(db, 'users', userId, 'menu', item.id),
        { finishedGoodsStock: stock - order.quantity },
        { merge: true }
      );
      batch.set(doc(db, 'users', userId, 'orders', order.id), { fulfilled: true }, { merge: true });
      await batch.commit();
      showAlert('Order Fulfilled', `Deducted ${order.quantity} unit(s) of ${item.name} from finished-goods stock.`);
    } else {
      const choice = window.confirm(
        `Only ${stock} unit(s) of "${item.name}" in finished stock, but order is for ${order.quantity}.\n\nClick OK to use raw materials for the full order.\nClick Cancel to log a production run first.`
      );
      if (choice) {
        const batch = writeBatch(db);
        await deductIngredients(userId, materials, item.recipe, order.quantity, batch);
        batch.set(
          doc(db, 'users', userId, 'menu', item.id),
          { finishedGoodsStock: 0 },
          { merge: true }
        );
        batch.set(doc(db, 'users', userId, 'orders', order.id), { fulfilled: true }, { merge: true });
        await batch.commit();
        showAlert('Order Fulfilled', `Used all remaining finished stock plus raw materials for ${order.quantity} unit(s) of ${item.name}.`);
      }
    }
  };

  const updateOrder = async (id: string, field: keyof Order, value: string | number) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const order = orders.find(o => o.id === id);
    try {
      if (order) {
        await setDoc(doc(db, 'users', userId, 'orders', id), {
          ...order,
          [field]: value
        }, { merge: true });
      } else {
        await setDoc(doc(db, 'users', userId, 'orders', id), { [field]: value }, { merge: true });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/orders/${id}`);
    }
  };

  /**
   * Deletes an order document from Firestore.
   * Note: Raw material stock is NOT automatically restored on delete;
   * use `fulfillOrder` with a negative quantity adjustment if needed.
   */
  const deleteOrder = async (id: string) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    try {
      await deleteDoc(doc(db, 'users', userId, 'orders', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${userId}/orders/${id}`);
    }
  };

  /**
   * Bulk-deletes all orders for the currently selected `orderDate` after confirmation.
   * Does not restore inventory for fulfilled orders.
   */
  const resetOrders = () => {
    showConfirm(
      "Reset Orders",
      `Are you sure you want to reset all orders for ${orderDate}?`,
      async () => {
        if (!auth.currentUser) return;
        const userId = auth.currentUser.uid;
        const ordersToDelete = orders.filter(o => o.date === orderDate);
        try {
          for (const order of ordersToDelete) {
            await deleteDoc(doc(db, 'users', userId, 'orders', order.id));
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `users/${userId}/orders`);
        }
      }
    );
  };

  return {
    addOrder,
    fulfillOrder,
    updateOrder,
    deleteOrder,
    resetOrders,
  };
}
