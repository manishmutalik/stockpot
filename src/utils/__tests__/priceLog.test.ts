import { describe, it, expect } from 'vitest';
import { newPriceLogEntry, priceHistory, PRICE_SOURCE_LABELS } from '../priceLog';
import type { PriceLogEntry } from '../../types';

const entry = (id: string, over: Partial<PriceLogEntry> = {}): PriceLogEntry => ({
  id, materialId: 'flour', date: '2026-03-10', unitCost: 45, unit: 'kg', source: 'restock', createdAt: 1, ...over,
});

describe('newPriceLogEntry', () => {
  it('records the material, price, unit and source, dated and timestamped', () => {
    const now = Date.UTC(2026, 2, 10, 9, 0, 0);
    const e = newPriceLogEntry({ materialId: 'flour', unit: 'kg', unitCost: 45, quantity: 20, macAfter: 44.5, source: 'restock', now });
    expect(e).toMatchObject({ materialId: 'flour', unit: 'kg', unitCost: 45, quantity: 20, macAfter: 44.5, source: 'restock', date: '2026-03-10', createdAt: now });
    expect(e.id).toMatch(/^[a-z0-9]+$/);
  });

  it('leaves out quantity and macAfter when they are not known', () => {
    const e = newPriceLogEntry({ materialId: 'flour', unit: 'kg', unitCost: 45, source: 'manual_edit' });
    expect('quantity' in e).toBe(false);
    expect('macAfter' in e).toBe(false);
  });

  it('keeps six decimals of a per-gram cost instead of rounding it to cents', () => {
    expect(newPriceLogEntry({ materialId: 'm', unit: 'g', unitCost: 0.0452381, source: 'restock' }).unitCost).toBe(0.045238);
  });

  it('uses a date given, and gives every entry its own id', () => {
    const a = newPriceLogEntry({ materialId: 'm', unit: 'g', unitCost: 1, source: 'initial', date: '2026-01-02' });
    const b = newPriceLogEntry({ materialId: 'm', unit: 'g', unitCost: 1, source: 'initial', date: '2026-01-02' });
    expect(a.date).toBe('2026-01-02');
    expect(a.id).not.toBe(b.id);
  });

  it('has a label for every source', () => {
    expect(Object.keys(PRICE_SOURCE_LABELS).sort()).toEqual(['goods_receipt', 'initial', 'manual_edit', 'restock']);
  });
});

describe('priceHistory', () => {
  const flour = { id: 'flour', unit: 'kg' };

  it('lists only that material, newest first, with the latest of a day first', () => {
    const rows = priceHistory([
      entry('a', { date: '2026-03-01' }),
      entry('b', { date: '2026-03-10', createdAt: 1 }),
      entry('c', { date: '2026-03-10', createdAt: 2 }),
      entry('x', { materialId: 'sugar' }),
    ], flour);
    expect(rows.map(r => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('keeps an entry as recorded when the material is still in the same unit', () => {
    const [row] = priceHistory([entry('a', { unitCost: 45, quantity: 20, macAfter: 44 })], flour);
    expect(row).toMatchObject({ unitCost: 45, unit: 'kg', quantity: 20, macAfter: 44 });
  });

  it('shows old entries in the material\'s new unit after it changes from kg to g', () => {
    const [row] = priceHistory([entry('a', { unitCost: 45, unit: 'kg', quantity: 20, macAfter: 44 })], { id: 'flour', unit: 'g' });
    expect(row.unit).toBe('g');
    expect(row.unitCost).toBe(0.045);
    expect(row.quantity).toBe(20000);
    expect(row.macAfter).toBe(0.044);
  });

  it('converts the other way too, from g to kg', () => {
    const [row] = priceHistory([entry('a', { unitCost: 0.5, unit: 'g' })], flour);
    expect(row).toMatchObject({ unit: 'kg', unitCost: 500 });
  });

  it('keeps the unit it was recorded in when the two cannot be converted', () => {
    const [row] = priceHistory([entry('a', { unitCost: 45, unit: 'kg', quantity: 2 })], { id: 'flour', unit: 'pcs' });
    expect(row).toMatchObject({ unit: 'kg', unitCost: 45, quantity: 2 });
  });

  it('is empty when the material has no history', () => {
    expect(priceHistory([], flour)).toEqual([]);
  });
});
