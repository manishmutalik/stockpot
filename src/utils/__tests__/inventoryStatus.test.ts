import { describe, it, expect } from 'vitest';
import { getStockStatus, getParDeficitPercent, getExpiryInfo } from '../inventoryStatus';

describe('getStockStatus', () => {
  it('is low at or below the threshold, matching the app-wide alert rule', () => {
    expect(getStockStatus(5, 5)).toBe('low');
    expect(getStockStatus(0.003, 0.05)).toBe('low');
    expect(getStockStatus(-2, 5)).toBe('low');
  });

  it('warns within 25% above the threshold', () => {
    expect(getStockStatus(6.25, 5)).toBe('reorder');
    expect(getStockStatus(6.26, 5)).toBe('ok');
  });

  it('never alerts when no threshold has been set', () => {
    expect(getStockStatus(0, 0)).toBe('ok');
    expect(getStockStatus(0, undefined)).toBe('ok');
  });
});

describe('getParDeficitPercent', () => {
  it('reports how far under the threshold a material is', () => {
    expect(getParDeficitPercent(0.003, 0.05)).toBe(94);
    expect(getParDeficitPercent(2.5, 5)).toBe(50);
  });

  it('clamps negative stock to 100% and healthy stock to 0', () => {
    expect(getParDeficitPercent(-3, 5)).toBe(100);
    expect(getParDeficitPercent(6, 5)).toBe(0);
    expect(getParDeficitPercent(1, 0)).toBe(0);
  });
});

describe('getExpiryInfo', () => {
  const now = new Date('2026-03-10T15:00:00');

  it('has no state without a (valid) date', () => {
    expect(getExpiryInfo(undefined, now).state).toBe('none');
    expect(getExpiryInfo('', now).state).toBe('none');
    expect(getExpiryInfo('not-a-date', now).state).toBe('none');
  });

  it('classifies expired, expiring and fine dates by whole days', () => {
    expect(getExpiryInfo('2026-03-09', now)).toEqual({ state: 'expired', daysLeft: -1 });
    expect(getExpiryInfo('2026-03-10', now)).toEqual({ state: 'expiring', daysLeft: 0 });
    expect(getExpiryInfo('2026-03-13', now)).toEqual({ state: 'expiring', daysLeft: 3 });
    expect(getExpiryInfo('2026-03-14', now)).toEqual({ state: 'ok', daysLeft: 4 });
  });
});
