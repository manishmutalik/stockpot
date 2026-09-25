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
   * Creates one or more Order documents from a single "Add Order"
   * submission — e.g. a customer ordering several different items at once
   * ("2 cakes and 3 cookies"). All documents are written in ONE atomic
   * writeBatch: either every line item is created, or none are. Unlike a
   * production-run session, a plain Order document has no side effects to
   * partially unwind (no inventory deduction, no cross-document writes),
   * so there's no reason to allow a partial group here — retry the whole
   * thing, or don't, rather than reconciling which rows already saved.
   *
   * When there's more than one line item, every resulting Order shares one
   * freshly-generated orderGroupId (see Order.orderGroupId) so they can be
   * displayed/managed together — display/UX grouping only, each document
   * is still fully independent (its own fulfilled status, its own
   * eventual refund status). A single line item gets no group id at all.
   *
   * customerName/customerPhone/date are shared across every line item.
   * Delivery fields are deliberately NOT part of this yet — putting a
   * shared delivery charge on every grouped document would double-count
   * it in getFinancialsForRange until that function dedupes by
   * orderGroupId (see the handoff doc's open question); until then,
   * delivery info is only set through the existing per-order inline
   * editing in the Orders tab, one order at a time.
   */
  const addOrderGroup = async (
    common: { date: string; customerName?: string; customerPhone?: string },
    lineItems: { menuItemId: string; quantity: number }[]
  ) => {
    if (!auth.currentUser || lineItems.length === 0) return;

    const badItem = lineItems.find(li => !menu.some(m => m.id === li.menuItemId));
    if (badItem) {
      showAlert('Error', 'One of the selected items could not be found. Please reselect it and try again.');
      throw new Error(`addOrderGroup: no menu item found for menuItemId "${badItem.menuItemId}"`);
    }

    const userId = auth.currentUser.uid;
    const orderGroupId = lineItems.length > 1 ? Math.random().toString(36).substr(2, 9) : undefined;

    try {
      const batch = writeBatch(db);
      for (const item of lineItems) {
        const id = Math.random().toString(36).substr(2, 9);
        const newOrder: Order = {
          id,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          date: common.date,
          ...(common.customerName && { customerName: common.customerName }),
          ...(common.customerPhone && { customerPhone: common.customerPhone }),
          ...(orderGroupId && { orderGroupId }),
        };
        batch.set(doc(db, 'users', userId, 'orders', id), newOrder);
      }
      await batch.commit();
      const firstItemName = menu.find(m => m.id === lineItems[0].menuItemId)?.name;
      showAlert(
        'Order Added',
        lineItems.length > 1
          ? `Added an order with ${lineItems.length} items.`
          : `Added order for ${lineItems[0].quantity} unit(s) of ${firstItemName}.`
      );
    } catch (err: any) {
      console.error('addOrderGroup error:', err);
      showAlert('Error', `Failed to add order: ${err?.message || 'Unknown error'}`);
      throw err;
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
    addOrderGroup,
    fulfillOrder,
    updateOrder,
    deleteOrder,
    resetOrders,
  };
}
