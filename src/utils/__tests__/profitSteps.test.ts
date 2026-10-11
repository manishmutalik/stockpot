import { describe, it, expect } from 'vitest';
import { profitSteps, trendFigures } from '../profit';

const base = { income: 50000, orderExpenses: 22000, deliveryExpenses: 1500, wastageExpenses: 500, profit: 26000, paymentFees: 600, fixedCosts: 15000, trueProfit: 10400 };

describe('the profit breakdown', () => {
  it('steps from sales to true profit, and every line adds up to the subtotal and the total', () => {
    const steps = profitSteps(base);
    expect(steps.map(s => s.key)).toEqual(['sales', 'materials', 'couriers', 'wastage', 'beforeOverheads', 'paymentFees', 'fixedCosts', 'trueProfit']);
    let running = 0;
    for (const s of steps) {
      if (s.kind === 'subtotal' || s.kind === 'total') expect(s.amount).toBeCloseTo(running, 6);
      else running += s.amount;
    }
    expect(steps.find(s => s.key === 'beforeOverheads')!.amount).toBe(26000);
    expect(steps.at(-1)!.amount).toBe(10400);
  });

  it('leaves out costs that are nothing, but always shows ingredients and packaging', () => {
    const simple = profitSteps({ ...base, deliveryExpenses: 0, wastageExpenses: 0, paymentFees: 0, fixedCosts: 0, profit: 28000, trueProfit: 28000 });
    expect(simple.map(s => s.key)).toEqual(['sales', 'materials', 'beforeOverheads', 'trueProfit']);
  });

  it('adds advances kept from cancelled pre-orders, and says what sales are after', () => {
    const steps = profitSteps({ ...base, forfeitedAdvances: 500, profit: 26500, trueProfit: 10900, discounts: 1200 }, { gstApplicable: true, money: n => `₹${n}` });
    expect(steps[0]).toMatchObject({ label: 'Sales (excl. GST)', hint: 'After ₹1200 of discounts' });
    expect(steps[1]).toMatchObject({ key: 'advancesKept', amount: 500, kind: 'add' });
    expect(steps.at(-1)!.amount).toBe(10900);
  });

  it('gives the trend chart what came in, every cost, and what was kept', () => {
    expect(trendFigures(base)).toEqual({ income: 50000, costs: 39600, trueProfit: 10400 });
    expect(trendFigures({ income: 1000, trueProfit: -250, forfeitedAdvances: 100 })).toEqual({ income: 1100, costs: 1350, trueProfit: -250 });
  });
});
