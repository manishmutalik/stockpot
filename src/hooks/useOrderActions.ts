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
import { BakerySettings, MenuItem, Order, PaymentMethod, RawMaterial } from '../types';
import { stampFor } from '../utils/orderPricing';
import { holdsStock, isOpenPreorder } from '../utils/preorders';
import { saleAmounts } from '../utils/profit';

export function useOrderActions(
  menu: MenuItem[],
  orders: Order[],
  orderDate: string,
  showConfirm: (title: string, message: string, onConfirm: () => void) => void,
  showAlert: (title: string, message: string) => void,
  /** Needed to stamp each new order with what its item costs to make right now. */
  materials: RawMaterial[],
  /** Fee % per payment method (Settings). The rate is copied onto an order when its method is recorded, so later changes don't alter past profit. */
  paymentFeeRates: Partial<Record<PaymentMethod, number>> = {},
  options: {
    /** Today in the business's time zone (YYYY-MM-DD): when an order is booked, an advance received or an order cancelled. Defaults to the UTC date. */
    today?: () => string;
    /** GST settings, to work out what the customer pays when deciding whether an advance covers it. Absent: no GST. */
    gst?: Pick<BakerySettings, 'gstApplicable' | 'gstRate' | 'gstPricingMode'>;
  } = {}
) {
  const todayDate = () => (options.today ? options.today() : new Date().toISOString().split('T')[0]);
  /** What to write to record how an order was paid, with the fee rate in force right now. */
  const paymentFields = (method: PaymentMethod) => ({ paymentMethod: method, paymentFeeRate: paymentFeeRates[method] ?? 0 });

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /** "Tue 6 Oct", built by hand so it does not depend on the runtime's locale. */
  const formatDueDate = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
  };
  const describeLines = (lines: { menuItemId: string; quantity: number }[], items: MenuItem[]) =>
    lines.map(l => `${l.quantity} ${items.find(m => m.id === l.menuItemId)?.name ?? 'item'}`).join(', ');

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
    common: {
      date: string; customerName?: string; customerPhone?: string; deliveryAddress?: string; paymentStatus?: 'paid' | 'unpaid'; paymentMethod?: PaymentMethod; discount?: number;
      /** Booked ahead of time: `date` is then the due date, no stock is checked or taken until handover. */
      preorder?: boolean;
      /** 'morning', 'afternoon', 'evening' or a time. Pre-orders only. Shared by every item. */
      dueSlot?: string;
      /** Free text, shared by every item. Pre-orders only. */
      notes?: string;
      /** Money received now against a pre-order. Stored once, on the first item. */
      advance?: { amount: number; method: PaymentMethod };
    },
    lineItems: { menuItemId: string; quantity: number; /** The agreed price of one unit, when it is not the menu price. */ unitPrice?: number }[]
  ) => {
    if (!auth.currentUser || lineItems.length === 0) return;

    const badItem = lineItems.find(li => !menu.some(m => m.id === li.menuItemId));
    if (badItem) {
      showAlert('Error', 'One of the selected items could not be found. Please reselect it and try again.');
      throw new Error(`addOrderGroup: no menu item found for menuItemId "${badItem.menuItemId}"`);
    }

    const preorder = common.preorder === true;
    const requestedByItem = new Map<string, number>();
    for (const li of lineItems) {
      requestedByItem.set(li.menuItemId, (requestedByItem.get(li.menuItemId) ?? 0) + li.quantity);
    }
    // A pre-order takes no stock until it is handed over, so only an order from stock is capped.
    if (!preorder) {
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
    }

    const userId = auth.currentUser.uid;
    const today = todayDate();
    const orderGroupId = lineItems.length > 1 ? Math.random().toString(36).substr(2, 9) : undefined;
    const advance = preorder ? common.advance : undefined;

    // What the new orders are, before they are written: the same stamps, so the total below is the one the bill will show.
    const drafts = lineItems.map((item, index) => {
      const id = Math.random().toString(36).substr(2, 9);
      const order: Order = {
        id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        date: common.date,
        bookedOn: today,
        // What the item sells for (or the agreed price) and costs now, kept on the order for good (see utils/orderPricing).
        ...stampFor(menu.find(m => m.id === item.menuItemId)!, materials, item.unitPrice),
        ...(common.customerName && { customerName: common.customerName }),
        ...(common.customerPhone && { customerPhone: common.customerPhone }),
        // Where it is going belongs to the whole order, so it is on every item of the group.
        ...(common.deliveryAddress && { deliveryAddress: common.deliveryAddress }),
        ...(orderGroupId && { orderGroupId }),
        // A discount belongs to the whole order, so it goes on the first item only and is counted once.
        ...(index === 0 && (common.discount ?? 0) > 0 && { discount: common.discount }),
        ...(preorder && { preorder: true, stockClaimed: false }),
        ...(preorder && common.dueSlot && { dueSlot: common.dueSlot }),
        ...(preorder && common.notes && { notes: common.notes }),
      };
      return order;
    });

    // An advance is checked against what the customer owes, GST and discount included, before anything is written.
    let advanceCoversAll = false;
    if (advance) {
      const owed = Math.round(saleAmounts(drafts, menu, options.gst ?? {}).customerPays * 100) / 100;
      if (!(advance.amount > 0) || !Number.isFinite(advance.amount)) {
        showAlert('Error', 'The advance must be more than nothing.');
        throw new Error('addOrderGroup: advance must be positive');
      }
      if (advance.amount > owed + 0.005) {
        showAlert('Error', `The advance (${advance.amount}) is more than the order comes to (${owed}). Please check it and try again.`);
        throw new Error('addOrderGroup: advance exceeds the order total');
      }
      advanceCoversAll = advance.amount >= owed - 0.005;
    }

    try {
      const batch = writeBatch(db);
      drafts.forEach((draft, index) => {
        const order: Order = { ...draft };
        // With an advance, whether the balance is still owed decides the payment status for the whole order.
        const unpaid = advance ? !advanceCoversAll : common.paymentStatus === 'unpaid';
        // Only "pay later" is stored; an order with no value counts as paid.
        if (unpaid) order.paymentStatus = 'unpaid';
        if (advance && index === 0) order.advance = { amount: advance.amount, method: advance.method, feeRate: paymentFeeRates[advance.method] ?? 0, date: today };
        // How it was paid (a pay-later order has not been paid yet), with the fee rate in force now. An advance that
        // covered everything was paid by its own method.
        if (!unpaid) {
          const method = advance ? advance.method : common.paymentMethod;
          if (method) Object.assign(order, paymentFields(method));
        }
        batch.set(doc(db, 'users', userId, 'orders', order.id), order);
      });
      if (!preorder) {
        for (const [menuItemId, requested] of requestedByItem) {
          const item = menu.find(m => m.id === menuItemId)!;
          const current = item.finishedGoodsStock ?? 0;
          batch.set(doc(db, 'users', userId, 'menu', menuItemId), { finishedGoodsStock: current - requested }, { merge: true });
        }
      }
      await batch.commit();
      if (preorder) {
        const due = formatDueDate(common.date);
        const notBaked = [...requestedByItem]
          .map(([id, qty]) => ({ item: menu.find(m => m.id === id)!, qty }))
          .filter(({ item, qty }) => qty > (item.finishedGoodsStock ?? 0))
          .map(({ item, qty }) => `${qty} ${item.name}`);
        showAlert(
          'Pre-order Added',
          `Booked ${lineItems.length > 1 ? `${lineItems.length} items` : describeLines(lineItems, menu)} due ${due}.` +
            (notBaked.length > 0 ? ` Not baked yet: ${notBaked.join(', ')}. Stock is taken when you hand the order over.` : ' Stock is taken when you hand the order over.')
        );
      } else {
        const firstItemName = menu.find(m => m.id === lineItems[0].menuItemId)?.name;
        showAlert(
          'Order Added',
          lineItems.length > 1
            ? `Added an order with ${lineItems.length} items.`
            : `Added order for ${lineItems[0].quantity} unit(s) of ${firstItemName}.`
        );
      }
    } catch (err: any) {
      console.error('addOrderGroup error:', err);
      showAlert('Error', `Failed to add order: ${err?.message || 'Unknown error'}`);
      throw err;
    }
  };

  /**
   * Marks an order as handed over. For an ordinary order that is a plain
   * completion status with no inventory effect of its own: stock was already
   * claimed when the order was created (see addOrderGroup), so there is nothing
   * left to deduct. No-ops if the order was already fulfilled.
   *
   * A pre-order takes its stock now. Every item of the order (a multi-item
   * order is handed over whole, all or nothing) is checked against the same hard
   * cap an order from stock meets, and if anything is short nothing is written.
   * Otherwise one atomic batch claims the stock, marks every item claimed and
   * handed over, and re-stamps the ingredient and packaging costs, because that
   * is when the item was actually made. The price the customer agreed at booking
   * and the item's name are kept. Returns whether the order was handed over.
   */
  const fulfillOrder = async (order: Order): Promise<boolean> => {
    if (!auth.currentUser) return false;
    const userId = auth.currentUser.uid;
    const members = order.orderGroupId ? orders.filter(o => o.orderGroupId === order.orderGroupId) : [order];
    const group = members.length > 0 ? members : [order];

    if (!group.some(o => o.preorder)) {
      // An ordinary order: unchanged.
      if (order.fulfilled) return false;
      try {
        await setDoc(doc(db, 'users', userId, 'orders', order.id), { fulfilled: true }, { merge: true });
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/orders/${order.id}`);
        return false;
      }
    }

    if (group.some(o => o.cancelledOn)) {
      showAlert('Cancelled', 'This pre-order was cancelled, so it cannot be handed over.');
      return false;
    }
    const toHandOver = group.filter(o => !o.fulfilled);
    if (toHandOver.length === 0) return false;

    const requestedByItem = new Map<string, number>();
    for (const o of toHandOver) requestedByItem.set(o.menuItemId, (requestedByItem.get(o.menuItemId) ?? 0) + o.quantity);
    for (const [menuItemId, requested] of requestedByItem) {
      const item = menu.find(m => m.id === menuItemId);
      const available = item?.finishedGoodsStock ?? 0;
      if (!item || requested > available) {
        showAlert(
          'Not Enough Stock',
          `Only ${available} unit(s) of "${item?.name ?? 'this item'}" in stock, but this pre-order needs ${requested}. Log a production run first.`
        );
        return false;
      }
    }

    try {
      const batch = writeBatch(db);
      for (const o of toHandOver) {
        const item = menu.find(m => m.id === o.menuItemId)!;
        const costs = stampFor(item, materials);
        batch.set(doc(db, 'users', userId, 'orders', o.id), {
          stockClaimed: true,
          fulfilled: true,
          // The costs are those of today, when it was made; the booked price and name stay as they were.
          unitIngredientCostAtSale: costs.unitIngredientCostAtSale,
          unitPackagingCostAtSale: costs.unitPackagingCostAtSale,
          unitInputGstAtSale: costs.unitInputGstAtSale,
        }, { merge: true });
      }
      for (const [menuItemId, requested] of requestedByItem) {
        const item = menu.find(m => m.id === menuItemId)!;
        batch.set(doc(db, 'users', userId, 'menu', menuItemId), { finishedGoodsStock: (item.finishedGoodsStock ?? 0) - requested }, { merge: true });
      }
      await batch.commit();
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/orders/${order.id}`);
      return false;
    }
  };

  /**
   * Cancels a pre-order that has not been handed over (every item of it). A
   * cancelled order is never a sale. Stock is untouched, since a pre-order never
   * held any before handover. If an advance was paid, `advanceOutcome` says
   * whether it was refunded (counts as nothing) or kept (income on today's date);
   * it is required then, and stored on the item that holds the advance.
   */
  const cancelPreorder = async (order: Order, advanceOutcome?: 'refunded' | 'kept'): Promise<boolean> => {
    if (!auth.currentUser) return false;
    const userId = auth.currentUser.uid;
    const members = order.orderGroupId ? orders.filter(o => o.orderGroupId === order.orderGroupId) : [order];
    const group = members.length > 0 ? members : [order];

    if (!group.some(o => o.preorder)) {
      showAlert('Cannot Cancel', 'Only a pre-order can be cancelled. Delete an ordinary order to give its stock back.');
      return false;
    }
    if (group.some(o => o.cancelledOn)) {
      showAlert('Already Cancelled', 'This pre-order was already cancelled.');
      return false;
    }
    if (!group.every(isOpenPreorder)) {
      showAlert('Cannot Cancel', 'This pre-order was already handed over, so it cannot be cancelled.');
      return false;
    }
    const holder = group.find(o => (o.advance?.amount ?? 0) > 0);
    if (holder && !advanceOutcome) {
      showAlert('Advance Received', 'An advance was paid on this pre-order. Choose whether it was refunded or kept.');
      return false;
    }

    try {
      const today = todayDate();
      const batch = writeBatch(db);
      for (const o of group) {
        batch.set(doc(db, 'users', userId, 'orders', o.id), {
          cancelledOn: today,
          ...(holder && o.id === holder.id && { advanceOutcome }),
        }, { merge: true });
      }
      await batch.commit();
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/orders/${order.id}`);
      return false;
    }
  };

  /**
   * Marks orders paid or unpaid in one atomic write, optionally recording how
   * they were paid. A paid order with no `paymentStatus` counts as paid, so the
   * explicit 'paid' just records that it was once pending. The method, when
   * given, is stored with the fee rate in force now.
   */
  const markOrdersPaid = async (ids: string[], paid: boolean, method?: PaymentMethod) => {
    if (!auth.currentUser || ids.length === 0) return;
    const userId = auth.currentUser.uid;
    try {
      const batch = writeBatch(db);
      for (const id of ids) {
        batch.set(doc(db, 'users', userId, 'orders', id), {
          paymentStatus: paid ? 'paid' : 'unpaid',
          ...(paid && method && paymentFields(method)),
        }, { merge: true });
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/orders`);
    }
  };

  /** Records how already-paid orders were paid (every item of a multi-item order together). */
  const setOrdersPaymentMethod = async (ids: string[], method: PaymentMethod) => {
    if (!auth.currentUser || ids.length === 0) return;
    const userId = auth.currentUser.uid;
    try {
      const batch = writeBatch(db);
      for (const id of ids) batch.set(doc(db, 'users', userId, 'orders', id), paymentFields(method), { merge: true });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/orders`);
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

    // An order that holds no stock (a pre-order not yet handed over, or a cancelled order) has nothing to
    // rebalance: changing its item or quantity must neither check nor move stock, or it would add units that never left the shelf.
    if (order && !holdsStock(order) && (field === 'menuItemId' || field === 'quantity')) {
      const newMenuItemId = field === 'menuItemId' ? String(value) : order.menuItemId;
      const newQuantity = field === 'quantity' ? Number(value) : order.quantity;
      if (!newMenuItemId || newQuantity < 1) return; // ignore transient/invalid input mid-edit
      const targetItem = menu.find(m => m.id === newMenuItemId);
      if (!targetItem) {
        showAlert('Error', 'That menu item could not be found.');
        return;
      }
      try {
        await setDoc(doc(db, 'users', userId, 'orders', id), {
          menuItemId: newMenuItemId,
          quantity: newQuantity,
          // A different item is priced and costed as that item; only the quantity keeps the agreed price.
          ...(newMenuItemId === order.menuItemId ? {} : stampFor(targetItem, materials)),
        }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/orders/${id}`);
      }
      return;
    }

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
        // Changing the item re-stamps the order from the new item; changing only the quantity
        // keeps the stamp, since the unit price and cost didn't change.
        batch.set(doc(db, 'users', userId, 'orders', id), {
          menuItemId: newMenuItemId,
          quantity: newQuantity,
          ...(sameItem ? {} : stampFor(targetItem, materials)),
        }, { merge: true });

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
      // Only an order that held stock gives any back: deleting a pre-order that never took it must not add phantom units.
      if (order && holdsStock(order)) {
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
        // Only the orders that held stock give any back.
        for (const order of ordersToDelete.filter(holdsStock)) {
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
    cancelPreorder,
    markOrdersPaid,
    setOrdersPaymentMethod,
    updateOrder,
    deleteOrder,
    resetOrders,
  };
}
