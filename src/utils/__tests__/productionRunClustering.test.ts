import { describe, it, expect } from 'vitest';
import { clusterProductionRunsBySession } from '../productionRunClustering';
import type { ProductionRun } from '../../components/ProductionRunModal';

const run = (overrides: Partial<ProductionRun> & Pick<ProductionRun, 'id'>): ProductionRun => ({
  recipeId: 'cake',
  quantityProduced: 1,
  date: '2026-01-01',
  purpose: 'market_stock',
  costTotal: 10,
  createdAt: 0,
  ...overrides,
});

describe('clusterProductionRunsBySession', () => {
  it('maps ungrouped runs to single clusters using the `run` field', () => {
    const runs = [run({ id: 'r1' }), run({ id: 'r2' })];
    const clusters = clusterProductionRunsBySession(runs);

    expect(clusters).toHaveLength(2);
    expect(clusters.every(c => c.type === 'single')).toBe(true);
    expect(clusters.map(c => (c as any).run.id)).toEqual(['r1', 'r2']);
  });

  it('groups runs sharing a productionSessionId under the `runs` field', () => {
    const runs = [
      run({ id: 'r1', recipeId: 'cake', productionSessionId: 'sess1' }),
      run({ id: 'r2', recipeId: 'cookie', productionSessionId: 'sess1' }),
      run({ id: 'r3' }), // unrelated single run
    ];
    const clusters = clusterProductionRunsBySession(runs);

    expect(clusters).toHaveLength(2);
    const group = clusters.find(c => c.type === 'group') as Extract<typeof clusters[number], { type: 'group' }>;
    expect(group.groupId).toBe('sess1');
    expect(group.runs.map(r => r.recipeId).sort()).toEqual(['cake', 'cookie']);
  });
});
