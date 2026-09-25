/**
 * useOrderActions.ts
 *
 * Owns sales order CRUD (add/update/delete/reset) plus `fulfillOrder`.
 * Extracted out of App.tsx as part of the Phase 4 breakup — behavior
 * preserved exactly from the original inline implementation.
 *
 * As of the production-run/order redesign, stock is a hard cap enforced at
 * order-creation time (see addOrderGroup) rather than at a later
 * fulfilment step — an order can only be created, or edited, for
 * quantities `MenuItem.finishedGoodsStock` currently covers. `fulfillOrder`
 * is now a plain completion-status flag with no inventory effect of its
 * own; `updateOrder`, `deleteOrder`, and `resetOrders` all rebalance the
 * stock an order has claimed whenever that order's item/quantity changes
 * or the order goes away.
 *
 * `menu`/`orders` are NOT owned here — they're populated by the shared
 * Firestore listener in App.tsx and passed in as read-only parameters
 * (same pattern as the other extracted hooks).
 */
import { auth, db, doc, setDoc, writeBatch } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { MenuItem, Order } from '../types';

export function useOrderActions(
  menu: MenuItem[],
  orders: Order[],
  orderDate: string,
  showConfirm: (title: string, message: string, onConfirm: () => void) => void,
  showAlert: (title: string, message: string) => void
) {
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
   *
   * Stock is a hard cap: this is inventory tracking, not a storefront, so
   * an order can only claim quantities `finishedGoodsStock` currently
   * covers — if there isn't enough, the answer is to log another
   * production run, not to fall back to raw materials. Validated up front
   * (combining quantities when the same item appears in more than one
   * line, so two rows for the same item can't each pass individually and
   * jointly overshoot) so a bad submission fails before any writes happen,
   * then claimed atomically in the same batch as the order documents.
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

    const requestedByItem = new Map<string, number>();
    for (const li of lineItems) {
      requestedByItem.set(li.menuItemId, (requestedByItem.get(li.menuItemId) ?? 0) + li.quantity);
    }
    for (const [menuItemId, requested] of requestedByItem) {
      const item = menu.find(m => m.id === menuItemId)!;
      const available = item.finishedGoodsStock ?? 0;
      if (requested > available) {
        showAlert(
          'Not Enough Stock',
          `Only ${available} unit(s) of "${item.name}" in stock, but this order needs ${requested}. Log another production run to cover the rest.`
        );
        throw new Error(`addOrderGroup: insufficient stock for menuItemId "${menuItemId}" (requested ${requested}, available ${available})`);
      }
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
      for (const [menuItemId, requested] of requestedByItem) {
        const item = menu.find(m => m.id === menuItemId)!;
        const current = item.finishedGoodsStock ?? 0;
        batch.set(doc(db, 'users', userId, 'menu', menuItemId), { finishedGoodsStock: current - requested }, { merge: true });
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
   * Marks an order as fulfilled — a plain completion status ("has this
   * order actually been handed over/paid") with no inventory effect of its
   * own. Stock was already claimed when the order was created (see
   * addOrderGroup), so there's nothing left to deduct here. No-ops if the
   * order was already fulfilled.
   */
  const fulfillOrder = async (order: Order) => {
    if (!auth.currentUser) return;
    if (order.fulfilled) return;
    const userId = auth.currentUser.uid;
    try {
      await setDoc(doc(db, 'users', userId, 'orders', order.id), { fulfilled: true }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/orders/${order.id}`);
    }
  };

  /**
   * Updates one field on an order. `menuItemId`/`quantity` are stock-aware:
   * changing either re-balances what this order has claimed — releasing
   * what it currently holds and claiming what the new item/quantity needs,
   * capped at what's actually available (same hard cap as creating a new
   * order) — instead of just overwriting the field. Every other field
   * (customer name/phone, delivery details, etc.) is a plain write with no
   * stock effect.
   */
  const updateOrder = async (id: string, field: keyof Order, value: string | number) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const order = orders.find(o => o.id === id);

    if (order && (field === 'menuItemId' || field === 'quantity')) {
      const newMenuItemId = field === 'menuItemId' ? String(value) : order.menuItemId;
      const newQuantity = field === 'quantity' ? Number(value) : order.quantity;
      if (!newMenuItemId || newQuantity < 1) return; // ignore transient/invalid input mid-edit

      const sameItem = newMenuItemId === order.menuItemId;
      const targetItem = menu.find(m => m.id === newMenuItemId);
      if (!targetItem) {
        showAlert('Error', 'That menu item could not be found.');
        return;
      }
      // This order already holds `order.quantity` of its current item — that's
      // available to reclaim on top of finishedGoodsStock when the item isn't
      // changing, since it's this same order's own claim being resized.
      const alreadyClaimedOfTarget = sameItem ? order.quantity : 0;
      const availableForTarget = (targetItem.finishedGoodsStock ?? 0) + alreadyClaimedOfTarget;
      if (newQuantity > availableForTarget) {
        showAlert('Not Enough Stock', `Only ${availableForTarget} unit(s) of "${targetItem.name}" available.`);
        return;
      }

      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'users', userId, 'orders', id), { menuItemId: newMenuItemId, quantity: newQuantity }, { merge: true });

        if (sameItem) {
          const delta = order.quantity - newQuantity; // positive = release back, negative = claim more
          batch.set(doc(db, 'users', userId, 'menu', newMenuItemId), { finishedGoodsStock: (targetItem.finishedGoodsStock ?? 0) + delta }, { merge: true });
        } else {
          const oldItem = menu.find(m => m.id === order.menuItemId);
          if (oldItem) {
            batch.set(doc(db, 'users', userId, 'menu', order.menuItemId), { finishedGoodsStock: (oldItem.finishedGoodsStock ?? 0) + order.quantity }, { merge: true });
          }
          batch.set(doc(db, 'users', userId, 'menu', newMenuItemId), { finishedGoodsStock: (targetItem.finishedGoodsStock ?? 0) - newQuantity }, { merge: true });
        }

        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/orders/${id}`);
      }
      return;
    }

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
   * Deletes an order document, restoring the stock it had claimed back to
   * `finishedGoodsStock` in the same atomic batch — a deleted order can't
   * be left permanently holding stock that's no longer claimed by anything.
   */
  const deleteOrder = async (id: string) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const order = orders.find(o => o.id === id);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', userId, 'orders', id));
      if (order) {
        const item = menu.find(m => m.id === order.menuItemId);
        if (item) {
          batch.set(doc(db, 'users', userId, 'menu', order.menuItemId), { finishedGoodsStock: (item.finishedGoodsStock ?? 0) + order.quantity }, { merge: true });
        }
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${userId}/orders/${id}`);
    }
  };

  /**
   * Bulk-deletes all orders for the currently selected `orderDate` after
   * confirmation, restoring each one's claimed stock — aggregated per menu
   * item first (more than one deleted order can share an item), so each
   * menu document gets exactly one write in the batch.
   */
  const resetOrders = () => {
    showConfirm(
      "Reset Orders",
      `Are you sure you want to reset all orders for ${orderDate}?`,
      async () => {
        if (!auth.currentUser) return;
        const userId = auth.currentUser.uid;
        const ordersToDelete = orders.filter(o => o.date === orderDate);
        if (ordersToDelete.length === 0) return;

        const restoreByItem = new Map<string, number>();
        for (const order of ordersToDelete) {
          restoreByItem.set(order.menuItemId, (restoreByItem.get(order.menuItemId) ?? 0) + order.quantity);
        }

        try {
          const batch = writeBatch(db);
          for (const order of ordersToDelete) {
            batch.delete(doc(db, 'users', userId, 'orders', order.id));
          }
          for (const [menuItemId, restoreQty] of restoreByItem) {
            const item = menu.find(m => m.id === menuItemId);
            if (!item) continue;
            batch.set(doc(db, 'users', userId, 'menu', menuItemId), { finishedGoodsStock: (item.finishedGoodsStock ?? 0) + restoreQty }, { merge: true });
          }
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `users/${userId}/orders`);
        }
      }
    );
  };

  return {
    addOrderGroup,
    fulfillOrder,
    updateOrder,
    deleteOrder,
    resetOrders,
  };
}
