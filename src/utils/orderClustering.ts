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
