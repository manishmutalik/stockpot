import { describe, it, expect } from 'vitest';
import { financialsForRange, fixedCostsForRange, orderContribution, productProfit, productProfits } from '../profit';
import { stampFor } from '../orderPricing';

const materials: any[] = [
  { id: 'flour', unit: 'kg', costPerUnit: 40, category: 'Raw Materials', gstRate: 5 },
  { id: 'box', unit: 'pcs', costPerUnit: 10, category: 'Packaging Materials', gstRate: 18 },
];
// Costs 0.5 kg x 40 = 20 of ingredients and 10 of packaging a unit.
const recipe = [{ materialId: 'flour', amount: 500, unit: 'g' }, { materialId: 'box', amount: 1, unit: 'pcs' }];
const cake = (price: number): any => ({ id: 'cake', name: 'Cake', sellingPrice: price, recipe });
const NO_GST = { gstApplicable: false };

/** An order stamped at creation, as the app writes it. */
const stamped = (id: string, over: Record<string, any> = {}, item = cake(100), mats = materials): any => ({
  id, menuItemId: 'cake', quantity: 1, date: '2026-03-10', ...stampFor(item, mats), ...over,
});
const legacy = (id: string, over: Record<string, any> = {}): any => ({ id, menuItemId: 'cake', quantity: 1, date: '2026-03-10', ...over });

describe('orderContribution', () => {
  it('works out what a single order made: revenue minus ingredients, packaging and courier fee', () => {
    const o = stamped('a', { quantity: 3, deliveryMethod: 'third_party', deliveryCharge: 60, deliveryFee: 45 });
    const c = orderContribution([o], [cake(100)], materials, NO_GST);
    expect(c.itemsRevenue).toBe(300);
    expect(c.deliveryCharged).toBe(60);
    expect(c.ingredients).toBe(60);
    expect(c.packaging).toBe(30);
    expect(c.courierFee).toBe(45);
    expect(c.contribution).toBe(300 + 60 - 60 - 30 - 45); // 225
    expect(c.gstOnSale).toBe(0);
    expect(c.estimated).toBe(false);
  });

  it('counts a multi-item order\'s delivery charge and courier fee once, not once per item', () => {
    const members = [
      stamped('g1', { orderGroupId: 'g', deliveryCharge: 50, deliveryFee: 30 }),
      stamped('g2', { orderGroupId: 'g', quantity: 2 }),
    ];
    const c = orderContribution(members, [cake(100)], materials, NO_GST);
    expect(c.itemsRevenue).toBe(300);
    expect(c.deliveryCharged).toBe(50);
    expect(c.courierFee).toBe(30);
    expect(c.contribution).toBe(300 + 50 - 3 * 30 - 30); // 230
  });

  describe('GST', () => {
    it('adds GST on top in exclusive mode: revenue stays the price, GST is separate', () => {
      const c = orderContribution([stamped('a', { deliveryCharge: 20 })], [cake(100)], materials, { gstApplicable: true, gstRate: 18, gstPricingMode: 'exclusive' });
      expect(c.itemsRevenue).toBe(100);
      expect(c.deliveryCharged).toBe(20);
      expect(c.gstOnSale).toBeCloseTo(21.6, 6); // 18% of 120
    });

    it('backs GST out of the price in inclusive mode: revenue is the base, never the GST', () => {
      const o = stamped('a', { deliveryCharge: 11.8 }, cake(118));
      const c = orderContribution([o], [cake(118)], materials, { gstApplicable: true, gstRate: 18, gstPricingMode: 'inclusive' });
      expect(c.itemsRevenue).toBeCloseTo(100, 6); // 118 / 1.18
      expect(c.deliveryCharged).toBeCloseTo(10, 6); // 11.8 / 1.18
      expect(c.gstOnSale).toBeCloseTo(19.8, 6); // 129.8 - 110
    });

    it('gives the same contribution for the same base amount whether pricing is inclusive or exclusive', () => {
      const exclusive = orderContribution([stamped('a', { quantity: 4, deliveryCharge: 50, deliveryFee: 35 })], [cake(100)], materials,
        { gstApplicable: true, gstRate: 18, gstPricingMode: 'exclusive' });
      const inclusive = orderContribution([stamped('a', { quantity: 4, deliveryCharge: 59, deliveryFee: 35 }, cake(118))], [cake(118)], materials,
        { gstApplicable: true, gstRate: 18, gstPricingMode: 'inclusive' });
      expect(inclusive.contribution).toBeCloseTo(exclusive.contribution, 6);
      expect(inclusive.itemsRevenue).toBeCloseTo(exclusive.itemsRevenue, 6);
      expect(inclusive.gstOnSale).toBeCloseTo(exclusive.gstOnSale, 6);
    });

    it('ignores GST when it is switched off or the rate is 0', () => {
      for (const s of [{ gstApplicable: false, gstRate: 18 }, { gstApplicable: true, gstRate: 0 }]) {
        const c = orderContribution([stamped('a')], [cake(100)], materials, s as any);
        expect(c.gstOnSale).toBe(0);
        expect(c.itemsRevenue).toBe(100);
      }
    });
  });

  it('marks an order from before stamping as estimated, and values it at today\'s price and costs', () => {
    const c = orderContribution([legacy('old', { quantity: 2 })], [cake(100)], materials, NO_GST);
    expect(c.estimated).toBe(true);
    expect(c.itemsRevenue).toBe(200);
    expect(c.ingredients).toBe(40);
    expect(c.contribution).toBe(200 - 40 - 20);
  });

  it('is estimated if any one item of a multi-item order is', () => {
    const c = orderContribution([stamped('a', { orderGroupId: 'g' }), legacy('b', { orderGroupId: 'g' })], [cake(100)], materials, NO_GST);
    expect(c.estimated).toBe(true);
  });

  describe('history is never rewritten', () => {
    it("does not change an order's revenue or contribution when the menu price changes later", () => {
      const o = stamped('a', { quantity: 5 });
      const before = orderContribution([o], [cake(100)], materials, NO_GST);
      const after = orderContribution([o], [cake(700)], materials, NO_GST);
      expect(after).toEqual(before);
      expect(after.itemsRevenue).toBe(500);
    });
    it("does not change an order's costs when a material is restocked at a higher price later", () => {
      const o = stamped('a', { quantity: 5 });
      const dearer = materials.map(m => ({ ...m, costPerUnit: m.costPerUnit * 3 }));
      expect(orderContribution([o], [cake(100)], dearer, NO_GST)).toEqual(orderContribution([o], [cake(100)], materials, NO_GST));
    });
    it('still values an order whose menu item was deleted', () => {
      const c = orderContribution([stamped('a', { quantity: 2 })], [], materials, NO_GST);
      expect(c.itemsRevenue).toBe(200);
      expect(c.estimated).toBe(false);
    });
  });
});

describe('financialsForRange', () => {
  const base = { menu: [cake(100)], materials, experiments: [] as any[], wastageLogs: [] as any[], settings: NO_GST };
  const range = { start: '2026-03-01', end: '2026-03-31' };

  it('adds up income, order costs, courier fees and profit for orders in the range only', () => {
    const f = financialsForRange({
      ...base, ...range,
      orders: [
        stamped('a', { quantity: 2, deliveryCharge: 30, deliveryFee: 25 }),
        stamped('b', { date: '2026-03-20' }),
        stamped('out', { date: '2026-02-28', quantity: 9 }),
      ],
    });
    expect(f.income).toBe(200 + 30 + 100);
    expect(f.orderExpenses).toBe(3 * 30); // 20 + 10 a unit, 3 units
    expect(f.packagingExpenses).toBe(30);
    expect(f.deliveryExpenses).toBe(25);
    expect(f.expenses).toBe(90 + 25);
    expect(f.profit).toBe(330 - 90 - 25);
    expect(f.totalContribution).toBe(f.profit);
    expect(f.orderCount).toBe(2);
    expect(f.avgOrderContribution).toBe(f.profit / 2);
    expect(f.estimated).toBe(false);
  });

  it('counts a multi-item order once, with its delivery counted once', () => {
    const f = financialsForRange({
      ...base, ...range,
      orders: [stamped('g1', { orderGroupId: 'g', deliveryCharge: 40, deliveryFee: 25 }), stamped('g2', { orderGroupId: 'g' })],
    });
    expect(f.orderCount).toBe(1);
    expect(f.income).toBe(200 + 40);
    expect(f.deliveryExpenses).toBe(25);
  });

  it('subtracts wastage once, and keeps R&D out of profit', () => {
    const f = financialsForRange({
      ...base, ...range,
      orders: [stamped('a')],
      wastageLogs: [{ id: 'w1', date: '2026-03-05', cost: 12 }, { id: 'w2', date: '2026-03-06', cost: 8 }, { id: 'old', date: '2026-01-01', cost: 99 }] as any[],
      experiments: [{ id: 'e1', date: '2026-03-08', materials: [{ materialId: 'flour', amount: 250, unit: 'g' }] }] as any[],
    });
    expect(f.wastageExpenses).toBe(20);
    expect(f.experimentExpenses).toBe(10); // 0.25 kg x 40
    expect(f.profit).toBe(100 - 30 - 20); // wastage out, experiment not
    expect(f.expenses).toBe(30 + 10 + 20);
  });

  it('reports the same profit for an inclusive and an exclusive business selling the same base amount', () => {
    const excl = financialsForRange({
      ...base, ...range, menu: [cake(100)], settings: { gstApplicable: true, gstRate: 18, gstPricingMode: 'exclusive' },
      orders: [stamped('a', { quantity: 3, deliveryCharge: 50, deliveryFee: 20 })],
    });
    const incl = financialsForRange({
      ...base, ...range, menu: [cake(118)], settings: { gstApplicable: true, gstRate: 18, gstPricingMode: 'inclusive' },
      orders: [stamped('a', { quantity: 3, deliveryCharge: 59, deliveryFee: 20 }, cake(118))],
    });
    expect(incl.income).toBeCloseTo(excl.income, 6);
    expect(incl.profit).toBeCloseTo(excl.profit, 6);
    expect(incl.gstCollected).toBeCloseTo(excl.gstCollected, 6);
    expect(excl.income).toBe(350);
  });

  it('puts inclusive-mode income and profit exactly the GST collected below the old gross figure', () => {
    const f = financialsForRange({
      ...base, ...range, menu: [cake(118)], settings: { gstApplicable: true, gstRate: 18, gstPricingMode: 'inclusive' },
      orders: [stamped('a', { quantity: 5 }, cake(118))],
    });
    const oldIncome = 5 * 118; // what the dashboard used to show
    expect(f.income + f.gstCollected).toBeCloseTo(oldIncome, 6);
    expect(f.gstCollected).toBeCloseTo(90, 6);
  });

  it('reports GST collected only while GST is on, and input GST from the stamped costs', () => {
    const orders = [stamped('a', { quantity: 2 })];
    expect(financialsForRange({ ...base, ...range, orders }).gstCollected).toBe(0);
    // flour 20 x 5% + box 10 x 18% = 2.8 a unit
    expect(financialsForRange({ ...base, ...range, orders }).gstPaid).toBeCloseTo(5.6, 6);
  });

  it('does not change a past period when a menu price or material cost changes afterwards', () => {
    const orders = [stamped('a', { quantity: 4 })];
    const before = financialsForRange({ ...base, ...range, orders });
    const dearer = materials.map(m => ({ ...m, costPerUnit: m.costPerUnit * 2 }));
    const after = financialsForRange({ ...base, ...range, orders, menu: [cake(900)], materials: dearer });
    expect(after).toEqual(before);
  });

  it('is estimated when an old order is included, and exact otherwise', () => {
    expect(financialsForRange({ ...base, ...range, orders: [stamped('a'), legacy('b')] }).estimated).toBe(true);
    expect(financialsForRange({ ...base, ...range, orders: [stamped('a')] }).estimated).toBe(false);
  });

  it('keeps every key the dashboard has always had, with unchanged values for an exclusive business with no extras', () => {
    const f = financialsForRange({ ...base, ...range, orders: [stamped('a', { quantity: 2, deliveryCharge: 10, deliveryFee: 7 })] });
    for (const key of ['income', 'expenses', 'orderExpenses', 'experimentExpenses', 'deliveryExpenses', 'wastageExpenses', 'gstCollected', 'gstPaid', 'profit']) {
      expect(f).toHaveProperty(key);
    }
    expect(f.income).toBe(210);
    expect(f.orderExpenses).toBe(60);
    expect(f.profit).toBe(210 - 60 - 7);
  });

  it('is all zeros for an empty range', () => {
    const f = financialsForRange({ ...base, ...range, orders: [] });
    expect(f).toMatchObject({ income: 0, profit: 0, orderCount: 0, avgOrderContribution: 0, estimated: false });
  });
});

describe('discounts, payment fees and fixed costs', () => {
  const base = { menu: [cake(100)], materials, experiments: [] as any[], wastageLogs: [] as any[], settings: NO_GST };
  const range = { start: '2026-03-01', end: '2026-03-31' };

  describe('discount', () => {
    it('comes off what the customer pays and what the business made', () => {
      const c = orderContribution([stamped('a', { quantity: 2, discount: 30 })], [cake(100)], materials, NO_GST);
      expect(c.itemsRevenue).toBe(200);
      expect(c.discount).toBe(30);
      expect(c.customerPays).toBe(170);
      expect(c.contribution).toBe(170 - 2 * 30);
    });

    it('is counted once for a multi-item order, however many items it has', () => {
      const members = [
        stamped('g1', { orderGroupId: 'g', discount: 25 }),
        stamped('g2', { orderGroupId: 'g', quantity: 2 }),
      ];
      const c = orderContribution(members, [cake(100)], materials, NO_GST);
      expect(c.discount).toBe(25);
      expect(c.contribution).toBe(300 - 25 - 3 * 30);
    });

    it('cannot exceed what was billed', () => {
      const c = orderContribution([stamped('a', { discount: 500 })], [cake(100)], materials, NO_GST);
      expect(c.discount).toBe(100);
      expect(c.customerPays).toBe(0);
    });

    it('is worked out before GST, so GST is charged on the discounted amount', () => {
      const gst = { gstApplicable: true, gstRate: 10, gstPricingMode: 'exclusive' as const };
      const c = orderContribution([stamped('a', { discount: 20 })], [cake(100)], materials, gst);
      expect(c.gstOnSale).toBe(8);
      expect(c.customerPays).toBe(88);
    });

    it('lowers income by the discount in the period totals', () => {
      const f = financialsForRange({ ...base, ...range, orders: [stamped('a', { discount: 40 }), stamped('b')] });
      expect(f.income).toBe(200 - 40);
      expect(f.discounts).toBe(40);
      expect(f.profit).toBe(160 - 60);
    });

    it('keeps an inclusive and an exclusive business level when both give the same discount', () => {
      const orders = [stamped('a', { discount: 20 })];
      const excl = financialsForRange({ ...base, ...range, orders, settings: { gstApplicable: true, gstRate: 18, gstPricingMode: 'exclusive' } });
      const incl = financialsForRange({ ...base, menu: [cake(118)], ...range, orders: [stamped('a', { discount: 23.6 }, cake(118))], settings: { gstApplicable: true, gstRate: 18, gstPricingMode: 'inclusive' } });
      expect(incl.income).toBeCloseTo(excl.income, 6);
      expect(incl.profit).toBeCloseTo(excl.profit, 6);
    });
  });

  describe('payment fee', () => {
    it('is the stamped rate applied to what the customer paid', () => {
      const c = orderContribution([stamped('a', { quantity: 2, paymentMethod: 'card', paymentFeeRate: 2 })], [cake(100)], materials, NO_GST);
      expect(c.paymentFee).toBe(4);
      expect(c.contribution).toBe(200 - 60 - 4);
    });

    it('is worked out on the amount after discount and including GST added on top', () => {
      const gst = { gstApplicable: true, gstRate: 10, gstPricingMode: 'exclusive' as const };
      const c = orderContribution([stamped('a', { discount: 20, paymentMethod: 'card', paymentFeeRate: 2 })], [cake(100)], materials, gst);
      expect(c.paymentFee).toBeCloseTo(0.02 * 88, 10);
    });

    it('is not charged until the order is paid', () => {
      const c = orderContribution([stamped('a', { paymentStatus: 'unpaid', paymentMethod: 'card', paymentFeeRate: 2 })], [cake(100)], materials, NO_GST);
      expect(c.paymentFee).toBe(0);
    });

    it('is zero when no method was recorded', () => {
      expect(orderContribution([stamped('a')], [cake(100)], materials, NO_GST).paymentFee).toBe(0);
    });

    it('uses the rate it was stamped with, not the current settings', () => {
      const o = stamped('a', { paymentMethod: 'card', paymentFeeRate: 2 });
      const before = orderContribution([o], [cake(100)], materials, { ...NO_GST, paymentFeeRates: { card: 2 } } as any);
      const after = orderContribution([o], [cake(100)], materials, { ...NO_GST, paymentFeeRates: { card: 9 } } as any);
      expect(after.paymentFee).toBe(before.paymentFee);
    });

    it('is counted once per order group, with the method taken from the items', () => {
      const members = [
        stamped('g1', { orderGroupId: 'g', paymentMethod: 'card', paymentFeeRate: 2 }),
        stamped('g2', { orderGroupId: 'g', paymentMethod: 'card', paymentFeeRate: 2 }),
      ];
      expect(orderContribution(members, [cake(100)], materials, NO_GST).paymentFee).toBe(4);
    });

    it('shows up in the period totals', () => {
      const f = financialsForRange({ ...base, ...range, orders: [stamped('a', { paymentMethod: 'card', paymentFeeRate: 3 })] });
      expect(f.paymentFees).toBe(3);
      expect(f.trueProfit).toBe(100 - 30 - 3);
    });
  });

  describe('fixedCostsForRange', () => {
    it('charges one full month for a range covering that month', () => {
      expect(fixedCostsForRange([{ id: 'r', name: 'Rent', monthlyAmount: 3100 }], '2026-03-01', '2026-03-31')).toBeCloseTo(3100, 6);
    });

    it('prorates a part month by days', () => {
      expect(fixedCostsForRange([{ id: 'r', name: 'Rent', monthlyAmount: 3100 }], '2026-03-01', '2026-03-10')).toBeCloseTo(1000, 6);
    });

    it('adds up each month a range crosses, using that month\'s length', () => {
      const total = fixedCostsForRange([{ id: 'r', name: 'Rent', monthlyAmount: 2800 }], '2026-02-15', '2026-03-15');
      expect(total).toBeCloseTo(2800 * (14 / 28) + 2800 * (15 / 31), 6);
    });

    it('starts and stops on the cost\'s own dates', () => {
      const cost = { id: 'r', name: 'Loan', monthlyAmount: 3000, startDate: '2026-03-11', endDate: '2026-03-20' };
      expect(fixedCostsForRange([cost], '2026-03-01', '2026-03-31')).toBeCloseTo(3000 * (10 / 31), 6);
      expect(fixedCostsForRange([cost], '2026-04-01', '2026-04-30')).toBe(0);
      expect(fixedCostsForRange([cost], '2026-02-01', '2026-02-28')).toBe(0);
    });

    it('is zero with no costs or an inverted range', () => {
      expect(fixedCostsForRange(undefined, '2026-03-01', '2026-03-31')).toBe(0);
      expect(fixedCostsForRange([{ id: 'r', name: 'Rent', monthlyAmount: 100 }], '2026-03-31', '2026-03-01')).toBe(0);
    });
  });

  describe('true profit', () => {
    it('is what the orders contributed, less wastage and the fixed costs for the period', () => {
      const f = financialsForRange({
        ...base, ...range,
        orders: [stamped('a', { quantity: 2 })],
        wastageLogs: [{ id: 'w', date: '2026-03-12', cost: 15 }] as any[],
        settings: { ...NO_GST, fixedCosts: [{ id: 'r', name: 'Rent', monthlyAmount: 31 }] } as any,
      });
      expect(f.fixedCosts).toBeCloseTo(31, 6);
      expect(f.totalContribution).toBe(200 - 60);
      expect(f.trueProfit).toBeCloseTo(200 - 60 - 15 - 31, 6);
    });

    it('does not move net profit when fixed costs change', () => {
      const orders = [stamped('a')];
      const without = financialsForRange({ ...base, ...range, orders });
      const withCosts = financialsForRange({ ...base, ...range, orders, settings: { ...NO_GST, fixedCosts: [{ id: 'r', name: 'Rent', monthlyAmount: 500 }] } as any });
      expect(withCosts.profit).toBe(without.profit);
    });
  });

  describe('unpaid income', () => {
    it('counts unpaid orders as income, and reports how much of it is not yet paid', () => {
      const f = financialsForRange({ ...base, ...range, orders: [stamped('a'), stamped('b', { paymentStatus: 'unpaid', quantity: 2 })] });
      expect(f.income).toBe(300);
      expect(f.unpaidIncome).toBe(200);
    });

    it('is zero when everything is paid', () => {
      expect(financialsForRange({ ...base, ...range, orders: [stamped('a')] }).unpaidIncome).toBe(0);
    });
  });
});

describe('product profit', () => {
  const cookie = (price: number): any => ({ id: 'cookie', name: 'Cookie', sellingPrice: price, recipe: [{ materialId: 'flour', amount: 100, unit: 'g' }] }); // costs 4 a unit
  const menu = [cake(100), cookie(10)];
  const cookieOrder = (id: string, over: Record<string, any> = {}): any => ({ id, menuItemId: 'cookie', quantity: 1, date: '2026-03-10', ...stampFor(cookie(10), materials), ...over });

  it('is units sold, revenue and what the product made, for a plain order', () => {
    const p = productProfit('cake', [stamped('a', { quantity: 3 })], menu, materials, NO_GST);
    expect(p).toMatchObject({ unitsSold: 3, orderCount: 1, revenue: 300, contribution: 300 - 3 * 30, avgContributionPerUnit: 70, estimated: false });
  });

  it('adds up several orders of the same product', () => {
    const p = productProfit('cake', [stamped('a', { quantity: 2 }), stamped('b'), stamped('c', { menuItemId: 'cookie' })], menu, materials, NO_GST);
    expect(p.unitsSold).toBe(3);
    expect(p.orderCount).toBe(2);
    expect(p.revenue).toBe(300);
  });

  it('reports a product\'s billed sales before discount and its share of payment fees, for what-if pricing', () => {
    const orders = [stamped('a', { quantity: 4, discount: 40, paymentMethod: 'card', paymentFeeRate: 2, paymentStatus: 'paid' })];
    const p = productProfit('cake', orders, [cake(100)], materials, NO_GST);
    expect(p.grossRevenue).toBe(400);
    expect(p.revenue).toBe(360);
    expect(p.paymentFees).toBeCloseTo(360 * 0.02, 9);
    expect(p.costOfGoods).toBe(4 * 30); // 20 of ingredients and 10 of packaging a unit
  });

  it('is zero for a product with no orders', () => {
    expect(productProfit('cake', [], menu, materials, NO_GST)).toEqual({ menuItemId: 'cake', unitsSold: 0, orderCount: 0, revenue: 0, grossRevenue: 0, paymentFees: 0, costOfGoods: 0, contribution: 0, avgContributionPerUnit: 0, estimated: false });
  });

  it('shows a well-priced product that is made poor by discounts, card fees and courier costs', () => {
    const o = stamped('a', { quantity: 2, discount: 60, deliveryMethod: 'third_party', deliveryFee: 40, paymentMethod: 'card', paymentFeeRate: 5 });
    const p = productProfit('cake', [o], menu, materials, NO_GST);
    // revenue 200 - 60 discount; costs 2 x 30; courier 40; card fee 5% of 140
    expect(p.revenue).toBe(140);
    expect(p.contribution).toBeCloseTo(200 - 60 - 60 - 40 - 7, 10);
  });

  it('splits what a multi-item order shares between its items by their sales, so nothing is counted twice', () => {
    const members = [
      stamped('g1', { orderGroupId: 'g', quantity: 1, discount: 20, deliveryCharge: 30, deliveryFee: 25 }), // cake: 100 of 120
      cookieOrder('g2', { orderGroupId: 'g', quantity: 2 }),                                               // cookie: 20 of 120
    ];
    const all = productProfits(members, menu, materials, NO_GST);
    const cakeP = all.get('cake')!, cookieP = all.get('cookie')!;
    expect(cakeP.revenue).toBeCloseTo(100 - 20 * (100 / 120), 10);
    expect(cookieP.revenue).toBeCloseTo(20 - 20 * (20 / 120), 10);
    // Each keeps its own costs: cake 30, cookie 2 x 4
    expect(cakeP.contribution).toBeCloseTo(100 + (30 - 20 - 25) * (100 / 120) - 30, 10);
    expect(cookieP.contribution).toBeCloseTo(20 + (30 - 20 - 25) * (20 / 120) - 8, 10);
    expect(cakeP.orderCount).toBe(1);
  });

  it('adds up to what the orders made, however they are shared', () => {
    const orders = [
      stamped('a', { quantity: 2, discount: 15, paymentMethod: 'card', paymentFeeRate: 2 }),
      stamped('g1', { orderGroupId: 'g', discount: 20, deliveryCharge: 30, deliveryFee: 25, paymentMethod: 'upi', paymentFeeRate: 1 }),
      cookieOrder('g2', { orderGroupId: 'g', quantity: 3, paymentMethod: 'upi', paymentFeeRate: 1 }),
      cookieOrder('c', { quantity: 5, paymentStatus: 'unpaid' }),
    ];
    const products = [...productProfits(orders, menu, materials, NO_GST).values()];
    const total = financialsForRange({ menu, materials, experiments: [], wastageLogs: [], settings: NO_GST, orders, start: '2026-03-01', end: '2026-03-31' });
    expect(products.reduce((sum, p) => sum + p.contribution, 0)).toBeCloseTo(total.totalContribution, 8);
    expect(products.reduce((sum, p) => sum + p.unitsSold, 0)).toBe(2 + 1 + 3 + 5);
  });

  it('is on the pre-GST base in inclusive pricing, matching the exclusive business', () => {
    const excl = productProfit('cake', [stamped('a', { discount: 10 })], menu, materials, { gstApplicable: true, gstRate: 18, gstPricingMode: 'exclusive' });
    const incl = productProfit('cake', [stamped('a', { discount: 11.8 }, cake(118))], [cake(118)], materials, { gstApplicable: true, gstRate: 18, gstPricingMode: 'inclusive' });
    expect(incl.revenue).toBeCloseTo(excl.revenue, 8);
    expect(incl.contribution).toBeCloseTo(excl.contribution, 8);
  });

  it('is not moved by a later menu price change, and is estimated for an order from before stamping', () => {
    const orders = [stamped('a')];
    expect(productProfit('cake', orders, [cake(500)], materials, NO_GST)).toEqual(productProfit('cake', orders, [cake(100)], materials, NO_GST));
    expect(productProfit('cake', [legacy('old')], menu, materials, NO_GST).estimated).toBe(true);
  });
});
