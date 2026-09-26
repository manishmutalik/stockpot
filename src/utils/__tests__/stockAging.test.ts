import { describe, it, expect } from 'vitest';
import { daysBetween, getStockUrgency, getBatchesNeedingAttention, getWorstUrgencyForItem } from '../stockAging';
import type { ProductionRun } from '../../components/ProductionRunModal';

const run = (overrides: Partial<ProductionRun> & Pick<ProductionRun, 'id'>): ProductionRun => ({
  recipeId: 'cake',
  quantityProduced: 5,
  remainingQuantity: 5,
  date: '2026-01-01',
  costTotal: 10,
  createdAt: 0,
  ...overrides,
} as ProductionRun);

describe('daysBetween', () => {
  it('counts whole calendar days forward', () => {
    expect(daysBetween('2026-01-01', '2026-01-04')).toBe(3);
  });

  it('is zero for the same date', () => {
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('is negative when "to" is before "from"', () => {
    expect(daysBetween('2026-01-05', '2026-01-01')).toBe(-4);
  });
});

describe('getStockUrgency — with a known expiry date', () => {
  it('is fresh well before expiry', () => {
    expect(getStockUrgency({ date: '2026-01-01', expiryDate: '2026-01-10' }, '2026-01-05')).toBe('fresh');
  });

  it('is aging once within the expiring-soon window (expiring tomorrow)', () => {
    expect(getStockUrgency({ date: '2026-01-01', expiryDate: '2026-01-06' }, '2026-01-05')).toBe('aging');
  });

  it('is aging on the day it expires', () => {
    expect(getStockUrgency({ date: '2026-01-01', expiryDate: '2026-01-05' }, '2026-01-05')).toBe('aging');
  });

  it('is expired the day after expiry', () => {
    expect(getStockUrgency({ date: '2026-01-01', expiryDate: '2026-01-04' }, '2026-01-05')).toBe('expired');
  });

  it('is expired well past expiry', () => {
    expect(getStockUrgency({ date: '2026-01-01', expiryDate: '2025-12-01' }, '2026-01-05')).toBe('expired');
  });
});

describe('getStockUrgency — no known expiry (recipe has no shelfLifeDays)', () => {
  it('is fresh for a batch produced today', () => {
    expect(getStockUrgency({ date: '2026-01-05' }, '2026-01-05')).toBe('fresh');
  });

  it('is fresh the day after production', () => {
    expect(getStockUrgency({ date: '2026-01-04' }, '2026-01-05')).toBe('fresh');
  });

  it('is aging once the aging threshold is reached', () => {
    expect(getStockUrgency({ date: '2026-01-03' }, '2026-01-05')).toBe('aging');
  });

  it('never returns expired, however old, since there is no real expiry to have passed', () => {
    expect(getStockUrgency({ date: '2025-01-01' }, '2026-01-05')).toBe('aging');
  });
});

describe('getBatchesNeedingAttention', () => {
  it('excludes fresh batches and batches with nothing left to sell', () => {
    const runs = [
      run({ id: 'fresh', date: '2026-01-05', remainingQuantity: 5 }),
      run({ id: 'sold-out', date: '2025-01-01', remainingQuantity: 0 }), // would be aging, but nothing left
    ];
    expect(getBatchesNeedingAttention(runs, '2026-01-05')).toEqual([]);
  });

  it('includes aging and expired batches, sorted most urgent first', () => {
    const runs = [
      run({ id: 'aging', date: '2026-01-02', remainingQuantity: 3 }), // 3 days old, no expiry -> aging
      run({ id: 'expired', date: '2026-01-01', expiryDate: '2026-01-03', remainingQuantity: 2 }), // past expiry
    ];
    const result = getBatchesNeedingAttention(runs, '2026-01-05');
    expect(result.map(r => r.run.id)).toEqual(['expired', 'aging']);
    expect(result.map(r => r.urgency)).toEqual(['expired', 'aging']);
  });
});

describe('getWorstUrgencyForItem', () => {
  it('returns fresh when the item has no unsold batches needing attention', () => {
    const runs = [run({ id: 'r1', recipeId: 'cake', date: '2026-01-05', remainingQuantity: 5 })];
    expect(getWorstUrgencyForItem('cake', runs, '2026-01-05')).toBe('fresh');
  });

  it('reports the worst tier among the item\'s own batches, ignoring other items and sold-out batches', () => {
    const runs = [
      run({ id: 'r1', recipeId: 'cake', date: '2026-01-05', remainingQuantity: 5 }), // fresh
      run({ id: 'r2', recipeId: 'cake', date: '2026-01-01', expiryDate: '2026-01-02', remainingQuantity: 2 }), // expired
      run({ id: 'r3', recipeId: 'cookie', date: '2025-01-01', remainingQuantity: 9 }), // a different item — ignored
      run({ id: 'r4', recipeId: 'cake', date: '2025-01-01', remainingQuantity: 0 }), // sold out — ignored despite being ancient
    ];
    expect(getWorstUrgencyForItem('cake', runs, '2026-01-05')).toBe('expired');
  });
});
