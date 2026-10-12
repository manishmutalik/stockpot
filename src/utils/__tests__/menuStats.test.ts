import { describe, it, expect } from 'vitest';
import { salesPeriodRange, SALES_PERIODS, unpricedMaterials } from '../menuStats';

describe('salesPeriodRange', () => {
  it('counts today as the last of N days, so 7 days is today and the six before it', () => {
    expect(salesPeriodRange('7', '2026-03-10')).toEqual({ start: '2026-03-04', end: '2026-03-10' });
    expect(salesPeriodRange('30', '2026-03-10')).toEqual({ start: '2026-02-09', end: '2026-03-10' });
    expect(salesPeriodRange('90', '2026-03-10')).toEqual({ start: '2025-12-11', end: '2026-03-10' });
  });

  it('crosses month and year ends', () => {
    expect(salesPeriodRange('7', '2026-01-03')).toEqual({ start: '2025-12-28', end: '2026-01-03' });
    expect(salesPeriodRange('30', '2024-03-05').start).toBe('2024-02-05'); // a leap year
  });

  it('has no start for all time', () => {
    expect(salesPeriodRange('all', '2026-03-10')).toEqual({ start: null, end: '2026-03-10' });
  });

  it('offers the four periods, each with a phrase that reads after "No sales"', () => {
    expect(SALES_PERIODS.map(p => p.value)).toEqual(['7', '30', '90', 'all']);
    expect(SALES_PERIODS.find(p => p.value === 'all')!.phrase).toBe('yet');
  });
});

describe('unpricedMaterials', () => {
  it('names the recipe\'s materials that have no price yet, once each', () => {
    const materials = [
      { id: 'a', name: 'Maida', unit: 'kg', costPerUnit: 45, initialStock: 0, category: 'Raw Materials', dateAdded: '2026-01-01' },
      { id: 'b', name: 'Kesar', unit: 'g', costPerUnit: 0, initialStock: 0, category: 'Raw Materials', dateAdded: '2026-01-01' },
    ];
    const recipe = [{ materialId: 'a', amount: 10, unit: 'g' }, { materialId: 'b', amount: 0.01, unit: 'g' }, { materialId: 'b', amount: 0.02, unit: 'g' }, { materialId: 'gone', amount: 1, unit: 'g' }];
    expect(unpricedMaterials({ recipe }, materials)).toEqual(['Kesar']);
    expect(unpricedMaterials({ recipe: [recipe[0]] }, materials)).toEqual([]);
  });
});
