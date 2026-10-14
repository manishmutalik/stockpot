/**
 * planOrders.ts
 *
 * What adding an order, handing one over and marking orders paid will write,
 * worked out without touching Firebase. Moved out of `useOrderActions` so the web
 * and the phone app's server endpoints run the same rules: stock is a hard cap,
 * a pre-order takes no stock until handover, prices and costs are stamped when
 * the order is made, and an advance can never exceed what is owed.
 *
 * Every message and error string here is the one the hook has always shown.
 *
 * An item made when it is ordered (utils/madeToOrder) has no shelf: selling one takes its ingredients and parts instead,
 * with no cap (short stock is warned about, as in production), and the order keeps what it took.
 */
import type { BakerySettings, MenuItem, Order, OrderTaken, PaymentMethod, RawMaterial } from '../../types';
import { costView } from '../itemParts';
import { giveBack, isMadeToOrder, shortagesIn, takeForSale, type Shortage, type Stock } from '../madeToOrder';
import { holdsStock } from '../preorders';
import { stampFor } from '../orderPricing';
import { saleAmounts } from '../profit';
import { collapseWrites, type PlanContext, type PlanError, type PlannedWrite } from './types';

type FeeRates = Partial<Record<PaymentMethod, number>>;

/** What to write to record how an order was paid, with the fee rate in force right now. */
export const paymentFields = (method: PaymentMethod, feeRates: FeeRates) => ({ paymentMethod: method, paymentFeeRate: feeRates[method] ?? 0 });

export interface OrderGroupCommon {
  date: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  paymentStatus?: 'paid' | 'unpaid';
  paymentMethod?: PaymentMethod;
  discount?: number;
  /** Booked ahead of time: `date` is then the due date, no stock is checked or taken until handover. */
  preorder?: boolean;
  /** 'morning', 'afternoon', 'evening' or a time. Pre-orders only. Shared by every item. */
  dueSlot?: string;
  /** Free text, shared by every item. Pre-orders only. */
  notes?: string;
  /** Money received now against a pre-order. Stored once, on the first item. */
  advance?: { amount: number; method: PaymentMethod };
}

export interface OrderLineItem {
  menuItemId: string;
  quantity: number;
  /** The agreed price of one unit, when it is not the menu price. */
  unitPrice?: number;
}

export type OrderGroupPlan =
  | { ok: true; writes: PlannedWrite[]; orders: Order[]; preorder: boolean; requestedByItem: Map<string, number>; /** What made-to-order items left short. */ shortages: Shortage[] }
  | { ok: false; error: PlanError };

/**
 * Creates one or more Order documents from a single "Add Order" submission. All
 * are written together (all or nothing). More than one line item shares one
 * orderGroupId; a single item gets none. Stock is a hard cap: an order from stock
 * can only claim what `finishedGoodsStock` covers, with the same item on several
 * lines counted together. A pre-order checks and takes no stock now. An item made to order is not capped: it takes its
 * ingredients and parts (going below nothing if short, reported in `shortages`), and the order records them.
 */
export function planOrderGroup(input: {
  common: OrderGroupCommon;
  lineItems: OrderLineItem[];
  menu: MenuItem[];
  /** Needed to stamp each order with what its item costs to make right now. */
  materials: RawMaterial[];
  /** Fee % per payment method. The rate is copied onto an order when its method is recorded. */
  feeRates?: FeeRates;
  /** GST settings, to decide whether an advance covers what the customer pays. Absent: no GST. */
  gst?: Pick<BakerySettings, 'gstApplicable' | 'gstRate' | 'gstPricingMode'>;
  /** Today in the business's time zone (YYYY-MM-DD): when the order is booked and an advance received. */
  today: string;
  ctx: Pick<PlanContext, 'newId'>;
}): OrderGroupPlan {
  const { common, lineItems, menu, materials, today, ctx } = input;
  const feeRates = input.feeRates ?? {};

  const badItem = lineItems.find(li => !menu.some(m => m.id === li.menuItemId));
  if (badItem) {
    return { ok: false, error: {
      code: 'unknown_item', title: 'Error',
      message: 'One of the selected items could not be found. Please reselect it and try again.',
      thrown: `addOrderGroup: no menu item found for menuItemId "${badItem.menuItemId}"`,
    } };
  }

  // An item made only to go into others (a sponge base) is not sold on its own.
  const notSold = lineItems.map(li => menu.find(m => m.id === li.menuItemId)!).find(m => m.notForSale);
  if (notSold) {
    return { ok: false, error: {
      code: 'not_for_sale', title: 'Not sold on its own',
      message: `${notSold.name} is made for other items and is not sold on its own. Turn on "Sold on the menu" for it in Recipes & Menus to sell it.`,
      thrown: `addOrderGroup: menu item "${notSold.id}" is not for sale`,
    } };
  }

  const preorder = common.preorder === true;
  const requestedByItem = new Map<string, number>();
  for (const li of lineItems) {
    requestedByItem.set(li.menuItemId, (requestedByItem.get(li.menuItemId) ?? 0) + li.quantity);
  }
  // A pre-order takes no stock until it is handed over, so only an order from stock is capped; an item made to order has no shelf.
  if (!preorder) {
    for (const [menuItemId, requested] of requestedByItem) {
      const item = menu.find(m => m.id === menuItemId)!;
      if (isMadeToOrder(item)) continue;
      const available = item.finishedGoodsStock ?? 0;
      if (requested > available) {
        return { ok: false, error: {
          code: 'insufficient_stock', title: 'Not Enough Stock',
          message: `Only ${available} unit(s) of "${item.name}" in stock, but this order needs ${requested}. Log another production run to cover the rest.`,
          thrown: `addOrderGroup: insufficient stock for menuItemId "${menuItemId}" (requested ${requested}, available ${available})`,
        } };
      }
    }
  }

  const advance = preorder ? common.advance : undefined;
  const orderGroupId = lineItems.length > 1 ? ctx.newId() : undefined;

  // What the new orders are, before they are written: the same stamps, so the total below is the one the bill will show.
  const drafts = lineItems.map((item, index) => {
    const id = ctx.newId();
    const order: Order = {
      id,
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      date: common.date,
      bookedOn: today,
      // What the item sells for (or the agreed price) and costs now, kept on the order for good (see utils/orderPricing).
      ...stampFor(costView(menu.find(m => m.id === item.menuItemId)!, menu), materials, item.unitPrice),
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
    const owed = Math.round(saleAmounts(drafts, menu, input.gst ?? {}).customerPays * 100) / 100;
    if (!(advance.amount > 0) || !Number.isFinite(advance.amount)) {
      return { ok: false, error: {
        code: 'advance_invalid', title: 'Error', message: 'The advance must be more than nothing.', thrown: 'addOrderGroup: advance must be positive',
      } };
    }
    if (advance.amount > owed + 0.005) {
      return { ok: false, error: {
        code: 'advance_too_large', title: 'Error',
        message: `The advance (${advance.amount}) is more than the order comes to (${owed}). Please check it and try again.`,
        thrown: 'addOrderGroup: advance exceeds the order total',
      } };
    }
    advanceCoversAll = advance.amount >= owed - 0.005;
  }

  const writes: PlannedWrite[] = [];
  const stockWrites: PlannedWrite[] = [];
  const orders: Order[] = [];
  let stock: Stock = { materials, menu };
  const taken: OrderTaken[] = [];
  drafts.forEach((draft, index) => {
    const order: Order = { ...draft };
    const item = menu.find(m => m.id === order.menuItemId)!;
    // Made now, from what it is made of.
    if (!preorder && isMadeToOrder(item)) {
      const t = takeForSale(item, order.quantity, stock);
      order.taken = t.taken;
      stock = t.stock;
      stockWrites.push(...t.writes);
      taken.push(t.taken);
    }
    // With an advance, whether the balance is still owed decides the payment status for the whole order.
    const unpaid = advance ? !advanceCoversAll : common.paymentStatus === 'unpaid';
    // Only "pay later" is stored; an order with no value counts as paid.
    if (unpaid) order.paymentStatus = 'unpaid';
    if (advance && index === 0) order.advance = { amount: advance.amount, method: advance.method, feeRate: feeRates[advance.method] ?? 0, date: today };
    // How it was paid (a pay-later order has not been paid yet), with the fee rate in force now. An advance that
    // covered everything was paid by its own method.
    if (!unpaid) {
      const method = advance ? advance.method : common.paymentMethod;
      if (method) Object.assign(order, paymentFields(method, feeRates));
    }
    orders.push(order);
    writes.push({ collection: 'orders', id: order.id, data: order as unknown as Record<string, unknown>, merge: false });
  });
  if (!preorder) {
    for (const [menuItemId, requested] of requestedByItem) {
      const item = stock.menu.find(m => m.id === menuItemId)!;
      if (isMadeToOrder(item)) continue;
      const current = item.finishedGoodsStock ?? 0;
      stockWrites.push({ collection: 'menu', id: menuItemId, data: { finishedGoodsStock: current - requested }, merge: true });
      stock = { ...stock, menu: stock.menu.map(m => (m.id === menuItemId ? { ...m, finishedGoodsStock: current - requested } : m)) };
    }
  }
  return { ok: true, writes: [...writes, ...collapseWrites(stockWrites)], orders, preorder, requestedByItem, shortages: shortagesIn(stock, taken) };
}

export type HandOverPlan =
  /** Nothing to do: already handed over. */
  | { kind: 'noop' }
  /** Handing over is not allowed (cancelled) or not possible (short of stock). */
  | { kind: 'error'; title: string; message: string; code: 'cancelled' | 'insufficient_stock' }
  /** `atomic` is false for an ordinary order, which is one plain field write. */
  | { kind: 'ok'; writes: PlannedWrite[]; atomic: boolean; /** What made-to-order items left short. */ shortages?: Shortage[] };

/**
 * Marks an order as handed over. An ordinary order is a plain completion flag, since its stock was claimed when it
 * was created. A pre-order takes its stock now: every item of the order (handed over whole, all or nothing) is checked
 * against the same hard cap, then the stock is claimed, every item marked claimed and handed over, and the ingredient
 * and packaging costs re-stamped, because that is when the item was made. The price agreed at booking is kept. An item
 * made to order takes its ingredients and parts now instead, with no cap, and the order records them.
 */
export function planHandOver(input: { order: Order; orders: Order[]; menu: MenuItem[]; materials: RawMaterial[] }): HandOverPlan {
  const { order, orders, menu, materials } = input;
  const members = order.orderGroupId ? orders.filter(o => o.orderGroupId === order.orderGroupId) : [order];
  const group = members.length > 0 ? members : [order];

  if (!group.some(o => o.preorder)) {
    // An ordinary order: unchanged.
    if (order.fulfilled) return { kind: 'noop' };
    return { kind: 'ok', atomic: false, writes: [{ collection: 'orders', id: order.id, data: { fulfilled: true }, merge: true }] };
  }

  if (group.some(o => o.cancelledOn)) {
    return { kind: 'error', code: 'cancelled', title: 'Cancelled', message: 'This pre-order was cancelled, so it cannot be handed over.' };
  }
  const toHandOver = group.filter(o => !o.fulfilled);
  if (toHandOver.length === 0) return { kind: 'noop' };

  const requestedByItem = new Map<string, number>();
  for (const o of toHandOver) requestedByItem.set(o.menuItemId, (requestedByItem.get(o.menuItemId) ?? 0) + o.quantity);
  for (const [menuItemId, requested] of requestedByItem) {
    const item = menu.find(m => m.id === menuItemId);
    const available = item?.finishedGoodsStock ?? 0;
    if (item && isMadeToOrder(item)) continue;
    if (!item || requested > available) {
      return { kind: 'error', code: 'insufficient_stock', title: 'Not Enough Stock',
        message: `Only ${available} unit(s) of "${item?.name ?? 'this item'}" in stock, but this pre-order needs ${requested}. Log a production run first.` };
    }
  }

  const writes: PlannedWrite[] = [];
  const stockWrites: PlannedWrite[] = [];
  let stock: Stock = { materials, menu };
  const taken: OrderTaken[] = [];
  for (const o of toHandOver) {
    const item = menu.find(m => m.id === o.menuItemId)!;
    const costs = stampFor(costView(item, menu), materials);
    let made: OrderTaken | undefined;
    if (isMadeToOrder(item)) {
      const t = takeForSale(item, o.quantity, stock);
      made = t.taken;
      stock = t.stock;
      stockWrites.push(...t.writes);
      taken.push(t.taken);
    }
    writes.push({ collection: 'orders', id: o.id, merge: true, data: {
      stockClaimed: true,
      fulfilled: true,
      // The costs are those of today, when it was made; the booked price and name stay as they were.
      unitIngredientCostAtSale: costs.unitIngredientCostAtSale,
      unitPackagingCostAtSale: costs.unitPackagingCostAtSale,
      unitInputGstAtSale: costs.unitInputGstAtSale,
      ...(made && { taken: made }),
    } });
  }
  for (const [menuItemId, requested] of requestedByItem) {
    const item = stock.menu.find(m => m.id === menuItemId)!;
    if (isMadeToOrder(item)) continue;
    stockWrites.push({ collection: 'menu', id: menuItemId, merge: true, data: { finishedGoodsStock: (item.finishedGoodsStock ?? 0) - requested } });
  }
  return { kind: 'ok', atomic: true, writes: [...writes, ...collapseWrites(stockWrites)], shortages: shortagesIn(stock, taken) };
}

/**
 * What deleting orders puts back: an order made to order gives back exactly what it took; an order that holds finished
 * stock gives back its quantity; a pre-order not handed over, or a cancelled order, gives back nothing.
 */
export function planOrderGiveBack(input: { orders: Order[]; menu: MenuItem[]; materials: RawMaterial[] }): PlannedWrite[] {
  let stock: Stock = { materials: input.materials, menu: input.menu };
  const writes: PlannedWrite[] = [];
  for (const o of input.orders) {
    if (o.cancelledOn) continue;
    if (o.taken) {
      const back = giveBack(o.taken, stock);
      stock = back.stock;
      writes.push(...back.writes);
    } else if (holdsStock(o)) {
      const item = stock.menu.find(m => m.id === o.menuItemId);
      if (!item) continue;
      const next = (item.finishedGoodsStock ?? 0) + o.quantity;
      writes.push({ collection: 'menu', id: item.id, merge: true, data: { finishedGoodsStock: next } });
      stock = { ...stock, menu: stock.menu.map(m => (m.id === item.id ? { ...m, finishedGoodsStock: next } : m)) };
    }
  }
  return collapseWrites(writes);
}

export type OrderChangePlan =
  | { ok: true; writes: PlannedWrite[]; shortages: Shortage[] }
  | { ok: false; error: PlanError };

/**
 * Changes the item or quantity of an order that has already taken its stock (an order from stock, or a pre-order handed
 * over): what it took is given back and the new item and quantity are taken again, in one go. A shelf item is capped by
 * what is there (its own units count, being given back first); an item made to order takes its ingredients and parts. A
 * different item is priced and costed as that item; only the quantity keeps the agreed price.
 */
export function planOrderChange(input: { order: Order; menuItemId: string; quantity: number; menu: MenuItem[]; materials: RawMaterial[] }): OrderChangePlan {
  const { order, menuItemId, quantity, menu, materials } = input;
  const target = menu.find(m => m.id === menuItemId);
  if (!target) {
    return { ok: false, error: { code: 'unknown_item', title: 'Error', message: 'That menu item could not be found.', thrown: `planOrderChange: no menu item "${menuItemId}"` } };
  }
  const back = planOrderGiveBack({ orders: [order], menu, materials });
  // The stock as it is once this order's own claim is back.
  let stock: Stock = {
    materials: materials.map(m => { const w = back.find(x => x.collection === 'materials' && x.id === m.id); return w ? { ...m, initialStock: w.data.initialStock as number } : m; }),
    menu: menu.map(m => { const w = back.find(x => x.collection === 'menu' && x.id === m.id); return w ? { ...m, finishedGoodsStock: w.data.finishedGoodsStock as number } : m; }),
  };
  const writes: PlannedWrite[] = [...back];
  const stamp = menuItemId === order.menuItemId ? {} : stampFor(costView(target, menu), materials);

  if (isMadeToOrder(target)) {
    const t = takeForSale(target, quantity, stock);
    stock = t.stock;
    writes.push(...t.writes);
    writes.push({ collection: 'orders', id: order.id, merge: true, data: { menuItemId, quantity, ...stamp, taken: t.taken } });
    return { ok: true, writes: collapseWrites(writes), shortages: shortagesIn(stock, [t.taken]) };
  }

  const available = stock.menu.find(m => m.id === menuItemId)!.finishedGoodsStock ?? 0;
  if (quantity > available) {
    return { ok: false, error: { code: 'insufficient_stock', title: 'Not Enough Stock', message: `Only ${available} unit(s) of "${target.name}" available.`, thrown: `planOrderChange: insufficient stock for "${menuItemId}"` } };
  }
  writes.push({ collection: 'menu', id: menuItemId, merge: true, data: { finishedGoodsStock: available - quantity } });
  writes.push({ collection: 'orders', id: order.id, merge: true, data: { menuItemId, quantity, ...stamp, ...(order.taken && { taken: null }) } });
  return { ok: true, writes: collapseWrites(writes), shortages: [] };
}

/**
 * Marks orders paid (with how, and the fee rate in force now) or unpaid again. Either way a customer's "I've paid" claim on them is
 * settled, so it is cleared: a paid order needs no claim, and an order marked unpaid again should not show an old one.
 */
export function planMarkPaid(input: { ids: string[]; paid: boolean; method?: PaymentMethod; feeRates?: FeeRates }): PlannedWrite[] {
  const feeRates = input.feeRates ?? {};
  return input.ids.map(id => ({
    collection: 'orders' as const, id, merge: true,
    data: { paymentStatus: input.paid ? 'paid' : 'unpaid', ...(input.paid && input.method && paymentFields(input.method, feeRates)), paymentClaim: null },
  }));
}

/** The owner says a customer's "I've paid" was not received: the claim goes, and the orders stay unpaid. */
export function planDismissClaim(ids: string[]): PlannedWrite[] {
  return ids.map(id => ({ collection: 'orders' as const, id, merge: true, data: { paymentClaim: null } }));
}

/** A bill or statement for these orders was just sent (WhatsApp or the share sheet opened with it). */
export function planMarkBillSent(ids: string[], at: number): PlannedWrite[] {
  return ids.map(id => ({ collection: 'orders' as const, id, merge: true, data: { billSentAt: at } }));
}

/** The owner has been reminded about these orders' unpaid bill. */
export function planBillReminded(ids: string[], at: number): PlannedWrite[] {
  return ids.map(id => ({ collection: 'orders' as const, id, merge: true, data: { billRemindedAt: at } }));
}

/** A claim that is really there (an old order has none, and a cleared one is null). */
export const hasPaymentClaim = (o: Pick<Order, 'paymentClaim'>): o is Order & { paymentClaim: NonNullable<Order['paymentClaim']> } =>
  !!o.paymentClaim && typeof o.paymentClaim.at === 'number' && typeof o.paymentClaim.amount === 'number';
