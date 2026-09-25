import { ProductionRun } from '../components/ProductionRunModal';
import { clusterByGroupId } from './clustering';

export type ProductionRunCluster =
  | { type: 'single'; run: ProductionRun }
  | { type: 'group'; groupId: string; runs: ProductionRun[] };

/**
 * Groups a list of production runs into display clusters by
 * `productionSessionId` (see the multi-item "Log Production Run" flow).
 * Thin, ProductionRun-shaped wrapper around the generic clusterByGroupId —
 * see that function's doc comment for the full behavior. Unlike Orders
 * (which are clustered per-date), this is called on the full filtered/sorted
 * runs list directly: session siblings share a createdAt from the same save
 * loop, so they're normally adjacent after sorting, but clusterByGroupId
 * finds every member regardless of position anyway (e.g. if a recipe
 * filter hides some of a session's siblings).
 */
export function clusterProductionRunsBySession(runs: ProductionRun[]): ProductionRunCluster[] {
  return clusterByGroupId(runs, r => r.productionSessionId).map(cluster =>
    cluster.type === 'single'
      ? { type: 'single', run: cluster.item }
      : { type: 'group', groupId: cluster.groupId, runs: cluster.items }
  );
}
