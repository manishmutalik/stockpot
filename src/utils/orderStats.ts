import { MenuItem, Order } from '../types';
import { attributeDeliveryFieldByGroup, clusterOrdersByGroup } from './orderClustering';
import { resolveUnitPrice } from './orderPricing';
import { saleAmounts } from './profit';

export interface OrderStats {
  /** Customer orders: a multi-item order counts once, not once per item. */
  orderCount: number;
  itemsSold: number;
  /** Item sales plus delivery charged to customers, minus discounts: what customers are billed before any GST added on top. */
  revenue: number;
  /** Discounts given, counted once per order. */
  discounts: number;
  /** Delivery charged to customers, counted once per order. */
  deliveryCharged: number;
  /** Delivery fees paid out, counted once per order. */
  courierCost: number;
  /** Orders that go out via a third-party courier. */
  courierDeliveries: number;
  /** Orders with at least one item not yet handed over. */
  pendingOrders: number;
  /** Items not yet handed over. */
  pendingItems: number;
}

/** What one order line sold for: its price when the order was created (today's menu price only for orders from before prices were stamped). */
export function orderLineTotal(order: Order, menu: MenuItem[]): number {
  return resolveUnitPrice(order, menu).value * (order.quantity || 0);
}

/**
 * Headline figures for a set of orders. Delivery charge and courier fee are
 * shared by every item of a multi-item order, so they are attributed once
 * per order group (see attributeDeliveryFieldByGroup) — summing raw fields
 * would multiply-count them.
 */
export function summarizeOrders(orders: Order[], menu: MenuItem[]): OrderStats {
  const chargeByOrder = attributeDeliveryFieldByGroup(orders, 'deliveryCharge');
  const feeByOrder = attributeDeliveryFieldByGroup(orders, 'deliveryFee');

  let itemsSold = 0;
  let pendingItems = 0;
  for (const o of orders) {
    itemsSold += o.quantity || 0;
    if (!o.fulfilled) pendingItems += o.quantity || 0;
  }

  const deliveryCharged = Array.from(chargeByOrder.values()).reduce((a, b) => a + b, 0);

  // Same rule as the dashboard's delivery expense: every attributed fee counts.
  const courierCost = Array.from(feeByOrder.values()).reduce((a, b) => a + b, 0);

  const clusters = clusterOrdersByGroup(orders);
  const membersOf = (c: (typeof clusters)[number]) => (c.type === 'single' ? [c.order] : c.orders);
  const courierDeliveries = clusters.filter(c => membersOf(c).some(o => o.deliveryMethod === 'third_party')).length;
  // Billed per order (a multi-item order together), so its shared delivery charge and discount count once.
  let revenue = 0;
  let discounts = 0;
  for (const c of clusters) {
    const sale = saleAmounts(membersOf(c), menu, {});
    revenue += sale.sale;
    discounts += sale.discount;
  }
  return {
    orderCount: clusters.length,
    itemsSold,
    revenue,
    discounts,
    deliveryCharged,
    courierCost,
    courierDeliveries,
    pendingOrders: clusters.filter(c => membersOf(c).some(o => !o.fulfilled)).length,
    pendingItems,
  };
}
