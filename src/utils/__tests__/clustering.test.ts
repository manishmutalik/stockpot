import { describe, it, expect } from 'vitest';
import { clusterByGroupId } from '../clustering';

interface Item { id: string; groupId?: string; }
const getGroupId = (i: Item) => i.groupId;

describe('clusterByGroupId', () => {
  it('every ungrouped item becomes its own single cluster, in input order', () => {
    const items: Item[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const clusters = clusterByGroupId(items, getGroupId);

    expect(clusters).toHaveLength(3);
    expect(clusters.every(c => c.type === 'single')).toBe(true);
    expect(clusters.map(c => (c as any).item.id)).toEqual(['a', 'b', 'c']);
  });

  it('items sharing a group id collapse into one group cluster containing all of them', () => {
    const items: Item[] = [
      { id: 'a', groupId: 'g1' },
      { id: 'b', groupId: 'g1' },
      { id: 'c' },
    ];
    const clusters = clusterByGroupId(items, getGroupId);

    expect(clusters).toHaveLength(2);
    const group = clusters.find(c => c.type === 'group') as Extract<typeof clusters[number], { type: 'group' }>;
    expect(group.groupId).toBe('g1');
    expect(group.items.map(i => i.id).sort()).toEqual(['a', 'b']);
  });

  it('a group appears once, at its first member\'s position, not once per member', () => {
    const items: Item[] = [
      { id: 'solo-before' },
      { id: 'g-a', groupId: 'g1' },
      { id: 'g-b', groupId: 'g1' },
      { id: 'g-c', groupId: 'g1' },
      { id: 'solo-after' },
    ];
    const clusters = clusterByGroupId(items, getGroupId);

    expect(clusters).toHaveLength(3);
    expect(clusters[0]).toMatchObject({ type: 'single', item: { id: 'solo-before' } });
    expect(clusters[1]).toMatchObject({ type: 'group', groupId: 'g1' });
    expect((clusters[1] as any).items).toHaveLength(3);
    expect(clusters[2]).toMatchObject({ type: 'single', item: { id: 'solo-after' } });
  });

  it('finds every member sharing a group id even when they are not adjacent in the input', () => {
    const items: Item[] = [
      { id: 'a', groupId: 'g1' },
      { id: 'x' },
      { id: 'y' },
      { id: 'b', groupId: 'g1' }, // separated from its sibling by unrelated items
    ];
    const clusters = clusterByGroupId(items, getGroupId);

    const group = clusters.find(c => c.type === 'group') as Extract<typeof clusters[number], { type: 'group' }>;
    expect(group.items.map(i => i.id).sort()).toEqual(['a', 'b']);
    expect(clusters).toHaveLength(3); // group + x + y
  });

  it('multiple distinct groups stay separate clusters', () => {
    const items: Item[] = [
      { id: 'a1', groupId: 'groupA' },
      { id: 'b1', groupId: 'groupB' },
      { id: 'a2', groupId: 'groupA' },
      { id: 'b2', groupId: 'groupB' },
    ];
    const clusters = clusterByGroupId(items, getGroupId);

    expect(clusters).toHaveLength(2);
    expect(clusters.map(c => (c as any).groupId).sort()).toEqual(['groupA', 'groupB']);
  });

  it('returns an empty array for no items', () => {
    expect(clusterByGroupId([], getGroupId)).toEqual([]);
  });
});
