import { describe, it, expect } from 'vitest';
import { getExperimentMaterialUsage } from '../experimentMaterialUsage';
import type { RawMaterial, RecipeExperiment } from '../../types';

const flour: RawMaterial = {
  id: 'flour', name: 'Flour', unit: 'kg', initialStock: 10, costPerUnit: 2, category: 'Raw Materials', dateAdded: '2026-01-01',
};
const sugar: RawMaterial = {
  id: 'sugar', name: 'Sugar', unit: 'g', initialStock: 5000, costPerUnit: 0.01, category: 'Raw Materials', dateAdded: '2026-01-01',
};

const experiment = (materials: RecipeExperiment['materials']): RecipeExperiment => ({
  id: 'exp1', name: 'Test', date: '2026-01-01', materials,
});

describe('getExperimentMaterialUsage', () => {
  it('sums an experiment\'s material requirements, converted to the material\'s own unit', () => {
    const usage = getExperimentMaterialUsage(
      [experiment([{ materialId: 'flour', amount: 500, unit: 'g' }])],
      [flour]
    );
    expect(usage.flour).toBeCloseTo(0.5); // 500g -> 0.5kg
  });

  it('sums across multiple experiments sharing a material', () => {
    const usage = getExperimentMaterialUsage(
      [
        experiment([{ materialId: 'sugar', amount: 200, unit: 'g' }]),
        experiment([{ materialId: 'sugar', amount: 300, unit: 'g' }]),
      ],
      [sugar]
    );
    expect(usage.sugar).toBe(500);
  });

  it('ignores a requirement whose material no longer exists', () => {
    const usage = getExperimentMaterialUsage(
      [experiment([{ materialId: 'does-not-exist', amount: 100, unit: 'g' }])],
      [flour]
    );
    expect(usage['does-not-exist']).toBeUndefined();
  });

  it('returns an empty map for no experiments', () => {
    expect(getExperimentMaterialUsage([], [flour])).toEqual({});
  });
});
