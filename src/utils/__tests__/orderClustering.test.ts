import { describe, it, expect } from 'vitest';
import { clusterOrdersByGroup } from '../orderClustering';
import type { Order } from '../../types';

const order = (overrides: Partial<Order> & Pick<Order, 'id'>): Order => ({
  menuItemId: 'cake',
  quantity: 1,
  date: '2026-01-01',
  ...overrides,
});

describe('clusterOrdersByGroup', () => {
  it('every ungrouped order becomes its own single cluster, in input order', () => {
    const orders = [order({ id: 'o1' }), order({ id: 'o2' }), order({ id: 'o3' })];
    const clusters = clusterOrdersByGroup(orders);

    expect(clusters).toHaveLength(3);
    expect(clusters.every(c => c.type === 'single')).toBe(true);
    expect(clusters.map(c => (c as any).order.id)).toEqual(['o1', 'o2', 'o3']);
  });

  it('orders sharing an orderGroupId collapse into one group cluster containing all of them', () => {
    const orders = [
      order({ id: 'o1', orderGroupId: 'g1', menuItemId: 'cake' }),
      order({ id: 'o2', orderGroupId: 'g1', menuItemId: 'cookie' }),
      order({ id: 'o3' }), // unrelated single order
    ];
    const clusters = clusterOrdersByGroup(orders);

    expect(clusters).toHaveLength(2); // one group cluster + one single cluster
    const group = clusters.find(c => c.type === 'group') as Extract<typeof clusters[number], { type: 'group' }>;
    expect(group.groupId).toBe('g1');
    expect(group.orders.map(o => o.id).sort()).toEqual(['o1', 'o2']);
    expect(clusters.some(c => c.type === 'single' && c.order.id === 'o3')).toBe(true);
  });

  it('a group cluster appears once, at the position of its first member, not duplicated for every member', () => {
    const orders = [
      order({ id: 'solo-before' }),
      order({ id: 'g-a', orderGroupId: 'g1' }),
      order({ id: 'g-b', orderGroupId: 'g1' }),
      order({ id: 'g-c', orderGroupId: 'g1' }),
      order({ id: 'solo-after' }),
    ];
    const clusters = clusterOrdersByGroup(orders);

    expect(clusters).toHaveLength(3); // solo-before, the group (once), solo-after
    expect(clusters[0]).toMatchObject({ type: 'single', order: { id: 'solo-before' } });
    expect(clusters[1]).toMatchObject({ type: 'group', groupId: 'g1' });
    expect((clusters[1] as any).orders).toHaveLength(3);
    expect(clusters[2]).toMatchObject({ type: 'single', order: { id: 'solo-after' } });
  });

  it('two different groups on the same date stay separate clusters', () => {
    const orders = [
      order({ id: 'a1', orderGroupId: 'groupA' }),
      order({ id: 'b1', orderGroupId: 'groupB' }),
      order({ id: 'a2', orderGroupId: 'groupA' }),
      order({ id: 'b2', orderGroupId: 'groupB' }),
    ];
    const clusters = clusterOrdersByGroup(orders);

    expect(clusters).toHaveLength(2);
    const groupIds = clusters.map(c => (c as any).groupId).sort();
    expect(groupIds).toEqual(['groupA', 'groupB']);
    for (const c of clusters) {
      expect((c as any).orders).toHaveLength(2);
    }
  });

  it('returns an empty array for no orders', () => {
    expect(clusterOrdersByGroup([])).toEqual([]);
  });
});
