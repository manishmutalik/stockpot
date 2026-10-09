import { describe, it, expect } from 'vitest';
import {
  CREEP, CREEP_COST_RISE, CREEP_ROWS, JOURNEY_ADVANCE_PCT, JOURNEY_BALANCE, JOURNEY_TOTAL, ORDER_MADE, ORDER_SALES,
  creepAriaLabel, journeyAriaLabel, orderAriaLabel, rupees, waterfall,
} from '../figures';

describe('rupees', () => {
  it('writes ₹ with Indian grouping and the decimals asked for', () => {
    expect(rupees(1200)).toBe('₹1,200');
    expect(rupees(1200, 2)).toBe('₹1,200.00');
    expect(rupees(396.96, 2)).toBe('₹396.96');
    expect(rupees(125000)).toBe('₹1,25,000');
  });
});

describe('Same price, smaller margin', () => {
  it('has the margins the infographic says: 62%, then 53% after butter, then 62% again at ₹185', () => {
    expect(CREEP_ROWS.map(r => r.marginPct)).toEqual([62, 53, 62]);
    expect(CREEP_ROWS.map(r => Math.round(r.cost))).toEqual([57, 70, 70]);
    expect(CREEP_COST_RISE).toBe(12.83);
    expect(CREEP.costNow).toBeCloseTo(CREEP.costThen + 12.83, 2);
  });

  it('draws each bar to its figures: the suggested price is the widest bar, and the cost is its share of its own bar', () => {
    expect(CREEP_ROWS.map(r => r.barWidthPct)).toEqual([81.08, 81.08, 100]);
    expect(CREEP_ROWS.map(r => r.costWidthPct)).toEqual([38.08, 46.63, 37.81]);
    for (const r of CREEP_ROWS) expect(r.costWidthPct + (100 - r.costWidthPct)).toBe(100);
  });

  it('states every figure in its text alternative', () => {
    const label = creepAriaLabel();
    for (const part of ['₹57.12', '62% margin', '₹150', '₹69.95', '53% margin', '₹185', 'rose 30%']) expect(label).toContain(part);
  });
});

describe('From a WhatsApp message to paid in full', () => {
  it('adds up: 12 croissants and 6 muffins make ₹2,520, and ₹500 down leaves ₹2,020', () => {
    expect(JOURNEY_TOTAL).toBe(2520);
    expect(JOURNEY_BALANCE).toBe(2020);
    expect(JOURNEY_ADVANCE_PCT).toBe(19.84);
    expect(journeyAriaLabel()).toBe("Order total ₹2,520: ₹500 advance paid at booking, ₹2,020 balance paid through the bill's UPI QR.");
  });
});

describe('₹1,200 in sales. ₹603 made.', () => {
  it('adds up: sales less every cost is what was made, to the paisa', () => {
    expect(ORDER_SALES).toBe(1200);
    expect(ORDER_MADE).toBe(603.04);
    const rows = waterfall();
    const costs = rows.filter(r => r.kind === 'cost').reduce((sum, r) => sum + r.amount, 0);
    expect(Math.round((ORDER_SALES - costs) * 100) / 100).toBe(ORDER_MADE);
  });

  it('draws the bars from the figures: each cost starts where the one before ended, and the last one ends where the made bar does', () => {
    const rows = waterfall();
    expect(rows.map(r => [r.id, r.leftPct, r.widthPct])).toEqual([
      ['sales', 0, 100], ['ingredients', 66.92, 33.08], ['packaging', 61.92, 5], ['courier', 54.42, 7.5], ['discount', 50.25, 4.17], ['made', 0, 50.25],
    ]);
    const costs = rows.filter(r => r.kind === 'cost');
    costs.forEach((r, i) => { if (i > 0) expect(Math.round((r.leftPct + r.widthPct) * 100) / 100).toBeCloseTo(costs[i - 1].leftPct, 1); });
    expect(rows.at(-1)!.widthPct).toBeCloseTo(costs.at(-1)!.leftPct, 1);
  });

  it('states every figure in its text alternative', () => {
    const label = orderAriaLabel();
    for (const part of ['8 Butter Croissants', '₹1,200', '₹396.96', '₹60', '₹90', '₹50', '₹603.04']) expect(label).toContain(part);
  });
});
