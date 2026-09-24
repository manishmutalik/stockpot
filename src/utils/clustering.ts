export type Cluster<T> =
  | { type: 'single'; item: T }
  | { type: 'group'; groupId: string; items: T[] };

/**
 * Groups a list of items into display clusters based on a shared group id
 * (e.g. Order.orderGroupId, ProductionRun.productionSessionId): items with
 * the same group id become one 'group' cluster containing all of them, so
 * a view can render them together with group-level actions instead of as
 * unrelated rows. Every other item — anything with no group id — becomes
 * its own 'single' cluster, unaffected. Purely additive: a list with no
 * group ids at all produces exactly one 'single' cluster per item, in the
 * same order they came in.
 *
 * A group cluster appears once, at the position of its first member, so
 * the overall render order matches the input order. Members don't need to
 * be adjacent in the input — every member sharing a group id is found and
 * included in that one cluster regardless of where else it sits in the
 * list (e.g. after a filter has hidden some of its siblings).
 */
export function clusterByGroupId<T>(items: T[], getGroupId: (item: T) => string | undefined): Cluster<T>[] {
  const clusters: Cluster<T>[] = [];
  const seenGroupIds = new Set<string>();

  items.forEach(item => {
    const groupId = getGroupId(item);
    if (groupId) {
      if (seenGroupIds.has(groupId)) return; // already added with its group
      seenGroupIds.add(groupId);
      clusters.push({ type: 'group', groupId, items: items.filter(i => getGroupId(i) === groupId) });
    } else {
      clusters.push({ type: 'single', item });
    }
  });

  return clusters;
}
