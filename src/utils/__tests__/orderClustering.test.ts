import { describe, it, expect } from 'vitest';
import { clusterOrdersByGroup, attributeDeliveryFieldByGroup } from '../orderClustering';
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

describe('attributeDeliveryFieldByGroup', () => {
  it('ungrouped orders pass their own value through unchanged', () => {
    const orders = [
      order({ id: 'o1', deliveryCharge: 40 }),
      order({ id: 'o2', deliveryCharge: 0 }),
      order({ id: 'o3' }), // undefined
    ];
    const attribution = attributeDeliveryFieldByGroup(orders, 'deliveryCharge');

    expect(attribution.get('o1')).toBe(40);
    expect(attribution.get('o2')).toBe(0);
    expect(attribution.get('o3')).toBe(0);
  });

  it('a group with the value on exactly one member attributes it only there, so the total is not multiplied by group size', () => {
    const orders = [
      order({ id: 'o1', orderGroupId: 'g1', deliveryCharge: 50 }),
      order({ id: 'o2', orderGroupId: 'g1', deliveryCharge: 0 }),
      order({ id: 'o3', orderGroupId: 'g1', deliveryCharge: 0 }),
    ];
    const attribution = attributeDeliveryFieldByGroup(orders, 'deliveryCharge');

    expect(attribution.get('o1')).toBe(50);
    expect(attribution.get('o2')).toBe(0);
    expect(attribution.get('o3')).toBe(0);

    const total = [...attribution.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(50); // not 150 (50 * 3), which naively summing order.deliveryCharge would give
  });

  it('finds the value regardless of which member of the group actually has it set (not just the first)', () => {
    const orders = [
      order({ id: 'o1', orderGroupId: 'g1' }), // no value
      order({ id: 'o2', orderGroupId: 'g1' }), // no value
      order({ id: 'o3', orderGroupId: 'g1', deliveryCharge: 75 }), // value is on the LAST member
    ];
    const attribution = attributeDeliveryFieldByGroup(orders, 'deliveryCharge');

    expect(attribution.get('o1')).toBe(0);
    expect(attribution.get('o2')).toBe(0);
    expect(attribution.get('o3')).toBe(75);
  });

  it('a group where no member has a value attributes 0 to everyone', () => {
    const orders = [
      order({ id: 'o1', orderGroupId: 'g1' }),
      order({ id: 'o2', orderGroupId: 'g1' }),
    ];
    const attribution = attributeDeliveryFieldByGroup(orders, 'deliveryCharge');

    expect(attribution.get('o1')).toBe(0);
    expect(attribution.get('o2')).toBe(0);
  });

  it('a data anomaly with two conflicting nonzero values picks the lowest-id member deterministically, still counted once', () => {
    const orders = [
      order({ id: 'z-order', orderGroupId: 'g1', deliveryCharge: 100 }),
      order({ id: 'a-order', orderGroupId: 'g1', deliveryCharge: 60 }),
    ];
    const attribution = attributeDeliveryFieldByGroup(orders, 'deliveryCharge');

    expect(attribution.get('a-order')).toBe(60); // 'a-order' sorts before 'z-order'
    expect(attribution.get('z-order')).toBe(0);
    const total = [...attribution.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(60); // counted once, not 160
  });

  it('deliveryCharge and deliveryFee are attributed independently', () => {
    const orders = [
      order({ id: 'o1', orderGroupId: 'g1', deliveryCharge: 50, deliveryFee: 0 }),
      order({ id: 'o2', orderGroupId: 'g1', deliveryCharge: 0, deliveryFee: 30 }),
    ];
    const chargeAttribution = attributeDeliveryFieldByGroup(orders, 'deliveryCharge');
    const feeAttribution = attributeDeliveryFieldByGroup(orders, 'deliveryFee');

    expect(chargeAttribution.get('o1')).toBe(50);
    expect(chargeAttribution.get('o2')).toBe(0);
    expect(feeAttribution.get('o1')).toBe(0);
    expect(feeAttribution.get('o2')).toBe(30);
  });

  it('handles a realistic mixed range: singles and a group together', () => {
    const orders = [
      order({ id: 'solo1', deliveryCharge: 20 }),
      order({ id: 'g1a', orderGroupId: 'sess', deliveryCharge: 45 }),
      order({ id: 'g1b', orderGroupId: 'sess' }),
      order({ id: 'solo2' }),
    ];
    const attribution = attributeDeliveryFieldByGroup(orders, 'deliveryCharge');
    const total = [...attribution.values()].reduce((a, b) => a + b, 0);

    expect(total).toBe(65); // 20 (solo1) + 45 (the group, once) + 0 + 0
  });
});
