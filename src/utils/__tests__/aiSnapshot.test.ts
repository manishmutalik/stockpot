import { describe, it, expect } from 'vitest';
import { buildBusinessSnapshot, comparisonPeriod, SNAPSHOT_LIMITS } from '../aiSnapshot';
import { buildCustomerProfiles } from '../customers';
import { financialsForRange } from '../profit';
import { renderAiText, validateAiText } from '../aiFigures';
import { buildDemoData } from '../demoData';

const TODAY = '2026-06-30';
const NO_GST = { gstApplicable: false };

const materials: any[] = [
  { id: 'flour', name: 'Flour', unit: 'kg', costPerUnit: 40, category: 'Raw Materials', initialStock: 10, remaining: 10, threshold: 2 },
  { id: 'butter', name: 'Butter', unit: 'kg', costPerUnit: 500, category: 'Raw Materials', initialStock: 0.5, remaining: 0.5, threshold: 2, expiryDate: '2026-07-01' },
  { id: 'box', name: 'Cake Box', unit: 'pcs', costPerUnit: 10, category: 'Packaging Materials', initialStock: 50, remaining: 50, threshold: 0 },
];
const cake = { id: 'cake', name: 'Chocolate Cake', sellingPrice: 100, recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }, { materialId: 'box', amount: 1, unit: 'pcs' }] };
const menu: any[] = [cake, { id: 'cookie', name: 'Cookie 500 g', sellingPrice: 10, recipe: [] }];

let n = 0;
const order = (daysAgo: number, over: Record<string, any> = {}): any => ({
  id: `o${String(++n).padStart(4, '0')}`, menuItemId: 'cake', quantity: 1, date: new Date(Date.UTC(2026, 5, 30 - daysAgo)).toISOString().split('T')[0],
  unitPriceAtSale: 100, unitIngredientCostAtSale: 20, unitPackagingCostAtSale: 10, unitInputGstAtSale: 0, itemNameAtSale: 'Chocolate Cake',
  customerName: 'Priya Sharma', customerPhone: '+91 98450 10101', ...over,
});

const build = (orders: any[], extra: Record<string, any> = {}) => {
  const settings: any = { name: 'Asha Bakes', ...NO_GST, timezone: 'Asia/Kolkata', ...extra.settings };
  const customers = buildCustomerProfiles({ orders, menu, materials, settings, today: TODAY });
  return buildBusinessSnapshot({
    period: { start: '2026-06-29', end: '2026-06-29' }, orders, menu, materials, experiments: [], wastageLogs: extra.wastageLogs ?? [],
    settings, currency: { code: 'INR', symbol: '₹' }, customers, today: TODAY, ...extra.input,
  });
};

describe('comparisonPeriod', () => {
  it('compares a single day with the same weekday a week earlier', () => {
    expect(comparisonPeriod({ start: '2026-06-29', end: '2026-06-29' })).toMatchObject({ start: '2026-06-22', end: '2026-06-22', label: 'the same day last week' });
  });

  it('compares a longer period with the same number of days just before it', () => {
    expect(comparisonPeriod({ start: '2026-06-01', end: '2026-06-30' })).toMatchObject({ start: '2026-05-02', end: '2026-05-31', label: 'the period just before' });
    expect(comparisonPeriod({ start: '2026-06-23', end: '2026-06-29' })).toMatchObject({ start: '2026-06-16', end: '2026-06-22' });
  });

  it('can be told which', () => {
    expect(comparisonPeriod({ start: '2026-06-29', end: '2026-06-29' }, 'previous_period')).toMatchObject({ start: '2026-06-28', end: '2026-06-28' });
  });
});

describe('materials that will run out soon', () => {
  const run = (daysAgo: number, quantityProduced: number) => ({ recipeId: 'cake', quantityProduced, date: new Date(Date.UTC(2026, 5, 30 - daysAgo)).toISOString().split('T')[0] });
  // 4 cakes a day x 0.5 kg = 2 kg of flour a day; flour has 10 kg, so 5 days: above the 4-day line.
  const steady = Array.from({ length: 28 }, (_, i) => run(i, 4));
  const buildWithFlour = (remaining: number, runs: any[] = steady) => {
    const mats = materials.map(m => (m.id === 'flour' ? { ...m, remaining, dateAdded: '2026-05-01' } : m));
    const settings: any = { name: 'Asha Bakes', ...NO_GST, timezone: 'Asia/Kolkata' };
    return buildBusinessSnapshot({
      period: { start: '2026-06-29', end: '2026-06-29' }, orders: [], menu, materials: mats, experiments: [], wastageLogs: [],
      settings, currency: { code: 'INR', symbol: '₹' }, customers: [], today: TODAY, productionRuns: runs,
    });
  };

  it('lists a material that runs out within lead time plus safety, with the day and a quantity as figures', () => {
    const { promptSnapshot, registry } = buildWithFlour(6);
    expect(promptSnapshot.inventory.reorderSoon).toHaveLength(1);
    const r = promptSnapshot.inventory.reorderSoon[0];
    expect(r).toMatchObject({ name: 'mat_flour', flag: 'before_threshold', confidence: 'normal' });
    expect(registry.figures[r.daysOfCover]).toMatchObject({ kind: 'days', value: 3 });
    expect(registry.figures[r.runOutDate]).toMatchObject({ kind: 'date', value: '2026-07-03' });
    expect(registry.figures[r.suggestedQty]).toMatchObject({ kind: 'quantity', value: 16, unit: 'kg' });
    expect(registry.names.mat_flour).toBe('Flour');
    expect(promptSnapshot.figures[r.suggestedQty].text).toBe('16 kg');
    expect(promptSnapshot.figures[r.runOutDate].text).toBe('Fri 3 Jul');
  });

  it('lists nothing when stock is comfortable, when there are no runs, or when none were given', () => {
    expect(buildWithFlour(20).promptSnapshot.inventory.reorderSoon).toEqual([]);
    expect(buildWithFlour(6, []).promptSnapshot.inventory.reorderSoon).toEqual([]);
    expect(build([]).promptSnapshot.inventory.reorderSoon).toEqual([]);
  });

  it('is rendered by the app from its own figures, and passes the figure guard', () => {
    const { promptSnapshot, registry } = buildWithFlour(6);
    const r = promptSnapshot.inventory.reorderSoon[0];
    const text = `{{name:${r.name}}} may run out around {{fig:${r.runOutDate}}}; about {{fig:${r.suggestedQty}}} would cover the next week.`;
    expect(validateAiText(text, { figures: Object.keys(promptSnapshot.figures), names: Object.keys(promptSnapshot.names) }).ok).toBe(true);
    expect(renderAiText(text, registry, { currencySymbol: '₹' })).toBe('Flour may run out around Fri 3 Jul; about 16 kg would cover the next week.');
  });

  it('is capped', () => {
    expect(SNAPSHOT_LIMITS.reorderSoon).toBe(5);
  });
});

describe('the figures', () => {
  it('match what the dashboard computes for the same period, exactly', () => {
    const orders = [order(1), order(1, { quantity: 2, discount: 15 }), order(8), order(2)];
    const { registry } = build(orders);
    const now = financialsForRange({ orders, menu, materials, experiments: [], wastageLogs: [], settings: { ...NO_GST } as any, start: '2026-06-29', end: '2026-06-29' });
    expect(registry.figures.revenue_now.value).toBeCloseTo(now.income, 2);
    expect(registry.figures.true_profit_now.value).toBeCloseTo(now.trueProfit, 2);
    expect(registry.figures.orders_now.value).toBe(now.orderCount);
  });

  it('give the change in true profit and revenue, so the model has no sums to do', () => {
    const { registry } = build([order(1, { quantity: 3 }), order(8, { quantity: 1 })]); // 29 Jun: 3 cakes; 22 Jun: 1 cake
    expect(registry.figures.revenue_now.value).toBe(300);
    expect(registry.figures.revenue_before.value).toBe(100);
    expect(registry.figures.revenue_change_pct.value).toBe(200);
    expect(registry.figures.true_profit_change.value).toBe(210 - 70);
    expect(registry.figures.true_profit_change_pct.value).toBe(200);
  });

  it('leave out a percentage change when there is nothing to compare with', () => {
    const { registry } = build([order(1)]);
    expect(registry.figures.revenue_change_pct).toBeUndefined();
    expect(registry.figures.true_profit_change_pct).toBeUndefined();
    expect(registry.figures.true_profit_change.value).toBe(70);
  });

  it('the drivers add up to the change in true profit, to within rounding', () => {
    const orders = [
      order(1, { quantity: 4, discount: 30, paymentMethod: 'card', paymentFeeRate: 2, deliveryCharge: 20, deliveryFee: 35 }),
      order(8, { quantity: 2 }), order(8, { quantity: 1, unitPriceAtSale: 90 }),
    ];
    const { registry, promptSnapshot } = build(orders, {
      wastageLogs: [{ id: 'w1', type: 'material', itemId: 'flour', quantity: 1, cost: 40, date: '2026-06-29', reason: 'x' }],
      settings: { fixedCosts: [{ id: 'r', name: 'Rent', monthlyAmount: 3000 }] },
    });
    const total = promptSnapshot.drivers.reduce((sum, d) => sum + Number(registry.figures[d.figure].value), 0);
    expect(total).toBeCloseTo(Number(registry.figures.true_profit_change.value), 1);
    expect(promptSnapshot.drivers.length).toBeGreaterThan(3);
  });

  it('order the drivers by size, and say which way each pushed profit', () => {
    const { registry, promptSnapshot } = build([order(1, { quantity: 5 }), order(8, { quantity: 1 })]);
    const sizes = promptSnapshot.drivers.map(d => Math.abs(Number(registry.figures[d.figure].value)));
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(promptSnapshot.drivers[0]).toMatchObject({ label: 'Sales before discounts', effect: 'raised' });
    expect(promptSnapshot.drivers.find(d => d.label === 'Ingredient costs')!.effect).toBe('lowered');
  });

  it('leave a driver out when nothing changed', () => {
    const { promptSnapshot } = build([order(1), order(8)]);
    expect(promptSnapshot.drivers).toEqual([]);
  });

  it('every figure the prompt shows has a label and text made by the application', () => {
    const { promptSnapshot, registry } = build([order(1, { quantity: 2 })]);
    expect(Object.keys(promptSnapshot.figures).sort()).toEqual(Object.keys(registry.figures).sort());
    expect(promptSnapshot.figures.revenue_now.text).toBe('₹200');
    expect(promptSnapshot.figures.revenue_now.label).toMatch(/revenue/i);
  });
});

describe('the products, inventory and trend', () => {
  it('lists the biggest sellers by revenue with the same sums as the Menu screen', () => {
    const { promptSnapshot, registry } = build([
      order(1, { quantity: 2 }),
      order(1, { menuItemId: 'cookie', itemNameAtSale: 'Cookie 500 g', unitPriceAtSale: 10, unitIngredientCostAtSale: 0, unitPackagingCostAtSale: 0, quantity: 5 }),
    ]);
    expect(promptSnapshot.products).toHaveLength(2);
    const first = promptSnapshot.products[0];
    expect(promptSnapshot.names[first.name]).toBe('Chocolate Cake');
    expect(registry.figures[first.units].value).toBe(2);
    expect(registry.figures[first.revenue].value).toBe(200);
    expect(registry.figures[first.contribution].value).toBe(200 - 60);
    expect(registry.figures[first.perUnit].value).toBe(70);
  });

  it('keeps names with digits in them as names, never as figures', () => {
    const { promptSnapshot } = build([order(1, { menuItemId: 'cookie', itemNameAtSale: 'Cookie 500 g', unitPriceAtSale: 10, unitIngredientCostAtSale: 0, unitPackagingCostAtSale: 0 })]);
    expect(Object.values(promptSnapshot.names)).toContain('Cookie 500 g');
    expect(Object.values(promptSnapshot.figures).map(f => f.label).join()).toMatch(/Cookie 500 g/); // in a label, for the model to read
  });

  it('caps the product list', () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ id: `m${i}`, name: `Item ${i}`, sellingPrice: 10 + i, recipe: [] }));
    const orders = many.map((m, i) => order(1, { menuItemId: m.id, itemNameAtSale: m.name, unitPriceAtSale: m.sellingPrice, unitIngredientCostAtSale: 0, unitPackagingCostAtSale: 0, customerName: `C${i}`, customerPhone: undefined }));
    const built = buildBusinessSnapshot({
      period: { start: '2026-06-29', end: '2026-06-29' }, orders, menu: many as any, materials, experiments: [], wastageLogs: [],
      settings: { name: 'x', ...NO_GST } as any, currency: { code: 'INR', symbol: '₹' }, customers: [], today: TODAY,
    });
    expect(built.promptSnapshot.products).toHaveLength(SNAPSHOT_LIMITS.products);
    expect(built.promptSnapshot.names[built.promptSnapshot.products[0].name]).toBe('Item 44'); // the biggest
  });

  it('names low-stock and soon-to-expire materials and the cash tied up in stock', () => {
    const { promptSnapshot, registry } = build([order(1)]);
    expect(promptSnapshot.inventory.lowStock.map(id => promptSnapshot.names[id])).toEqual(['Butter']);
    expect(promptSnapshot.inventory.expiringSoon.map(id => promptSnapshot.names[id])).toEqual(['Butter']);
    expect(registry.figures[promptSnapshot.inventory.cashTiedUp].value).toBe(10 * 40 + 0.5 * 500 + 50 * 10);
  });

  it('has a seven-day trend ending on the last day, named by weekday', () => {
    const { promptSnapshot, registry } = build([order(1, { quantity: 2 }), order(3)]);
    expect(promptSnapshot.trend).toHaveLength(7);
    expect(promptSnapshot.trend.map(t => t.day)).toEqual(['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday']);
    expect(registry.figures[promptSnapshot.trend[6].revenue].value).toBe(200);
    expect(registry.figures[promptSnapshot.trend[4].revenue].value).toBe(100);
  });
});

describe('customers in the snapshot', () => {
  const orders = [
    ...[38, 31, 24, 17, 10].map(d => order(d, { customerName: 'Weekly Wendy', customerPhone: '+91 98450 20202' })),
    ...[200, 190, 180].map(d => order(d, { customerName: 'Gone Gita', customerPhone: '+91 98450 30303' })),
    order(1, { customerName: 'Priya Sharma', customerPhone: '+91 98450 10101' }),
  ];

  it('are labels and counts, with each list capped', () => {
    const { promptSnapshot, registry } = build(orders);
    expect(registry.figures[promptSnapshot.customers.total].value).toBe(3);
    expect(registry.figures[promptSnapshot.customers.due].value).toBe(1);
    expect(registry.figures[promptSnapshot.customers.lapsed].value).toBe(1);
    expect(promptSnapshot.customers.dueList).toHaveLength(1);
    expect(promptSnapshot.customers.dueList[0].label).toMatch(/^C-[0-9A-Z]{4,7}/);
  });

  it('keep names on the client: the label map has them, the prompt does not', () => {
    const { promptSnapshot, customerNames } = build(orders);
    expect(Object.values(customerNames).sort()).toEqual(['Gone Gita', 'Weekly Wendy']);
    const prompt = JSON.stringify(promptSnapshot);
    for (const name of ['Weekly Wendy', 'Gone Gita', 'Priya', 'Sharma', 'Wendy', 'Gita']) expect(prompt).not.toContain(name);
  });

  it('never put a phone number anywhere in what is sent', () => {
    const prompt = JSON.stringify(build(orders).promptSnapshot);
    for (const phone of ['98450 10101', '9845010101', '98450 20202', '9845020202', '98450 30303', '9845030303', '+91', 'phone']) expect(prompt).not.toContain(phone);
    expect(prompt).not.toMatch(/\d{10}/);
  });

  it('use a label that can be turned back into a name on the client', () => {
    const { promptSnapshot, customerNames } = build(orders);
    const label = promptSnapshot.customers.dueList[0].label;
    expect(customerNames[label]).toBe('Weekly Wendy');
    const text = '{{cust:' + label + '}} usually reorders by now.';
    const known = { figures: Object.keys(promptSnapshot.figures), names: Object.keys(promptSnapshot.names), customers: Object.keys(customerNames) };
    expect(validateAiText(text, known).ok).toBe(true);
    expect(renderAiText(text, build(orders).registry, { currencySymbol: '₹' }, customerNames)).toBe('Weekly Wendy usually reorders by now.');
  });
});

describe('the snapshot as a whole', () => {
  it('is small enough to send: a demo business stays well under the budget', () => {
    const demo = buildDemoData('u', '2026-06-30');
    const settings: any = demo.settings;
    const mats = demo.materials.map((m: any) => ({ ...m, remaining: m.initialStock })) as any[];
    const customers = buildCustomerProfiles({ orders: demo.orders as any, menu: demo.menu as any, materials: mats, settings, today: '2026-06-30' });
    const built = buildBusinessSnapshot({
      period: { start: '2026-06-29', end: '2026-06-29' }, orders: demo.orders as any, menu: demo.menu as any, materials: mats,
      experiments: [], wastageLogs: [], settings, currency: { code: 'INR', symbol: '₹' }, customers, today: '2026-06-30',
    });
    const chars = JSON.stringify(built.promptSnapshot).length;
    expect(chars).toBeLessThan(12000); // about 3,000 tokens at 4 characters a token
  });

  it('says honestly what data is missing', () => {
    const { promptSnapshot } = build([order(1)]);
    expect(promptSnapshot.notes).toContain('Price-change and repricing data are not available yet.');
  });

  it('flags orders valued at today\'s prices', () => {
    const old = order(1, { unitPriceAtSale: undefined, unitIngredientCostAtSale: undefined, unitPackagingCostAtSale: undefined });
    expect(build([old]).promptSnapshot.notes.join(' ')).toMatch(/today's prices/);
    expect(build([order(1)]).promptSnapshot.notes.join(' ')).not.toMatch(/today's prices/);
  });

  it('carries the business context and time zone', () => {
    expect(build([order(1)]).promptSnapshot.business).toEqual({ name: 'Asha Bakes', currency: 'INR', gstApplicable: false, timezone: 'Asia/Kolkata' });
  });
});
