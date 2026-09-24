import { Order } from '../types';

export type OrderCluster =
  | { type: 'single'; order: Order }
  | { type: 'group'; groupId: string; orders: Order[] };

/**
 * Groups a list of orders (expected to already be scoped to one date, e.g.
 * OrdersView's `byDate[date]`) into display clusters: orders sharing an
 * `orderGroupId` (see the Multi-Item Order flow) become one 'group' cluster
 * so the UI can render them together with group-level actions, instead of
 * as unrelated rows. Every other order — everything logged before this
 * feature existed, and every single-item order since — becomes its own
 * 'single' cluster, rendered exactly as before. Purely additive: existing
 * data with no `orderGroupId` produces exactly the same one-cluster-per-order
 * shape it always did.
 *
 * Preserves each order's first-seen position, so the overall render order
 * matches the input order (a group appears where its first member did).
 */
export function clusterOrdersByGroup(orders: Order[]): OrderCluster[] {
  const clusters: OrderCluster[] = [];
  const seenGroupIds = new Set<string>();

  orders.forEach(order => {
    if (order.orderGroupId) {
      if (seenGroupIds.has(order.orderGroupId)) return; // already added with its group
      seenGroupIds.add(order.orderGroupId);
      clusters.push({
        type: 'group',
        groupId: order.orderGroupId,
        orders: orders.filter(o => o.orderGroupId === order.orderGroupId),
      });
    } else {
      clusters.push({ type: 'single', order });
    }
  });

  return clusters;
}
