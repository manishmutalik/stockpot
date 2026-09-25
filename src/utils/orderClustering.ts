import { Order } from '../types';
import { clusterByGroupId } from './clustering';

export type OrderCluster =
  | { type: 'single'; order: Order }
  | { type: 'group'; groupId: string; orders: Order[] };

/**
 * Groups a list of orders (expected to already be scoped to one date, e.g.
 * OrdersView's `byDate[date]`) into display clusters by `orderGroupId` (see
 * the Multi-Item Order flow). Thin, Order-shaped wrapper around the generic
 * clusterByGroupId — see that function's doc comment for the full behavior.
 */
export function clusterOrdersByGroup(orders: Order[]): OrderCluster[] {
  return clusterByGroupId(orders, o => o.orderGroupId).map(cluster =>
    cluster.type === 'single'
      ? { type: 'single', order: cluster.item }
      : { type: 'group', groupId: cluster.groupId, orders: cluster.items }
  );
}

/**
 * Maps each order to how much of a delivery-related field (`deliveryCharge`
 * or `deliveryFee`) it should be attributed for financial totals: orders
 * sharing an `orderGroupId` share one delivery, so summing every member's
 * value would multiply-count it by the group size. Only one representative
 * member of each group is attributed the value — its own, if it actually
 * has one set (there should be at most one nonzero member in the normal
 * case, since only one order in a group ever gets its delivery fields
 * filled in) — every other member is attributed 0. Summing this map's
 * values therefore counts a shared delivery charge/fee exactly once per
 * group, however many documents that group spans.
 *
 * Ungrouped orders map to their own value unchanged — this is a no-op for
 * every order logged before grouping existed, and for every single-item
 * order since.
 *
 * If more than one member of a group somehow has a nonzero value (a data
 * anomaly, not the expected case — e.g. delivery info was entered on two
 * different rows by mistake), the lowest-id member's value is used,
 * deterministically, rather than picking arbitrarily by iteration order.
 */
export function attributeDeliveryFieldByGroup(
  orders: Order[],
  field: 'deliveryCharge' | 'deliveryFee'
): Map<string, number> {
  const attribution = new Map<string, number>();

  for (const cluster of clusterOrdersByGroup(orders)) {
    if (cluster.type === 'single') {
      attribution.set(cluster.order.id, cluster.order[field] || 0);
      continue;
    }
    const withValue = cluster.orders.filter(o => (o[field] || 0) !== 0);
    const representative = (withValue.length > 0 ? withValue : cluster.orders)
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    for (const o of cluster.orders) {
      attribution.set(o.id, o.id === representative.id ? (representative[field] || 0) : 0);
    }
  }

  return attribution;
}
