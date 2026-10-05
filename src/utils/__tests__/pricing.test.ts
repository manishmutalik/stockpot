import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TARGET_MARGIN, itemsNeedingRepricing, marginDrift, marginOf, materialPriceStats, needsBaselineStamp,
  pricesFromPercent, pricingScenario, pricingStamp, recipesAffectedBy, repriceOptions, roundUpTo, suggestedPriceForTarget, targetFor,
} from '../pricing';
import { summarizeMenu } from '../menuStats';
import { stampFor } from '../orderPricing';

const TODAY = '2026-10-05';
const SETTINGS: any = { gstApplicable: false };

const mats = (butter = 500): any[] => [
  { id: 'butter', name: 'Butter', unit: 'kg', costPerUnit: butter, category: 'Raw Materials' },
  { id: 'flour', name: 'Flour', unit: 'kg', costPerUnit: 40, category: 'Raw Materials' },
  { id: 'box', name: 'Box', unit: 'pcs', costPerUnit: 10, category: 'Packaging Materials' },
];
// 0.2 kg butter + 0.5 kg flour + 1 box: 100 + 20 + 10 = 130 at butter 500
const recipe = [
  { materialId: 'butter', amount: 200, unit: 'g' },
  { materialId: 'flour', amount: 500, unit: 'g' },
  { materialId: 'box', amount: 1, unit: 'pcs' },
];
const cake = (over: Record<string, any> = {}): any => ({ id: 'cake', name: 'Cake', sellingPrice: 400, recipe, ...over });
/** A cake priced when butter cost `butter`, as the app stamps it. */
const pricedCake = (butter = 500, over: Record<string, any> = {}): any => ({ ...cake(), ...pricingStamp(cake(), mats(butter), '2026-06-01'), ...over });

const entry = (date: string, unitCost: number, over: Record<string, any> = {}): any => ({
  id: `${date}-${unitCost}-${Math.random()}`, materialId: 'butter', date, unitCost, unit: 'kg', source: 'restock', createdAt: 1, ...over,
});

describe('marginOf', () => {
  it('is on the pre-GST price: inclusive and exclusive give the same margin for the same base price', () => {
    const exclusive = marginOf(100, 40, { gstApplicable: true, gstRate: 18, gstPricingMode: 'exclusive' });
    const inclusive = marginOf(118, 40, { gstApplicable: true, gstRate: 18, gstPricingMode: 'inclusive' });
    expect(exclusive).toBeCloseTo(60, 6);
    expect(inclusive).toBeCloseTo(60, 6);
  });
  it('is 0 with no price', () => expect(marginOf(0, 40, SETTINGS)).toBe(0));
});

describe('materialPriceStats', () => {
  const butter = { id: 'butter', unit: 'kg' };

  it('has nothing to say without purchases', () => {
    const s = materialPriceStats(butter, [], TODAY);
    expect(s).toEqual({ lastPrice: null, lastPurchaseDate: null, avgPrice90d: null, change30d: null, change90d: null, hasEnoughHistory: { d30: false, d90: false } });
  });

  it('compares the last price with the latest purchase on or before 30 and 90 days ago', () => {
    const log = [
      entry('2026-06-01', 400), // too old for the 90-day compare? 2026-07-07 is today-90: this is before it
      entry('2026-07-07', 420), // exactly 90 days ago: counts for 90d
      entry('2026-08-20', 450),
      entry('2026-09-05', 460), // exactly 30 days ago
      entry('2026-09-25', 500), // last
    ];
    const s = materialPriceStats(butter, log, TODAY);
    expect(s.lastPrice).toBe(500);
    expect(s.lastPurchaseDate).toBe('2026-09-25');
    expect(s.change30d).toBeCloseTo((500 - 460) / 460 * 100, 6);
    expect(s.change90d).toBeCloseTo((500 - 420) / 420 * 100, 6);
    expect(s.hasEnoughHistory).toEqual({ d30: true, d90: true });
  });

  it('is null, not 0, when no purchase is old enough to compare with', () => {
    const log = [entry('2026-09-20', 450), entry('2026-09-28', 500)]; // two weeks of history
    const s = materialPriceStats(butter, log, TODAY);
    expect(s.lastPrice).toBe(500);
    expect(s.change30d).toBeNull();
    expect(s.change90d).toBeNull();
    expect(s.hasEnoughHistory).toEqual({ d30: false, d90: false });
  });

  it('is 0% (a real answer) when the last known price is older than 30 days and unchanged since', () => {
    const s = materialPriceStats(butter, [entry('2026-08-01', 450)], TODAY);
    expect(s.change30d).toBe(0);
    expect(s.change90d).toBeNull();
  });

  it('weights the 90-day average by the quantity bought, and ignores older purchases', () => {
    const log = [
      entry('2026-05-01', 100, { quantity: 1000 }), // outside 90 days
      entry('2026-08-01', 400, { quantity: 10 }),
      entry('2026-09-01', 500, { quantity: 30 }),
    ];
    expect(materialPriceStats(butter, log, TODAY).avgPrice90d).toBeCloseTo((400 * 10 + 500 * 30) / 40, 6);
  });

  it('falls back to a plain average when no purchase has a quantity', () => {
    const log = [entry('2026-08-01', 400), entry('2026-09-01', 500)];
    expect(materialPriceStats(butter, log, TODAY).avgPrice90d).toBe(450);
  });

  it('counts only purchases: opening costs and hand edits are not prices paid', () => {
    const log = [
      entry('2026-08-01', 400, { source: 'initial' }),
      entry('2026-09-01', 999, { source: 'manual_edit' }),
      entry('2026-09-10', 500, { source: 'goods_receipt' }),
    ];
    const s = materialPriceStats(butter, log, TODAY);
    expect(s.lastPrice).toBe(500);
    expect(s.change30d).toBeNull(); // the only purchase is recent
  });

  it('ignores other materials and shows prices in the current unit', () => {
    const log = [
      entry('2026-08-01', 0.4, { unit: 'g' }), // ₹0.4 per g = ₹400 per kg
      entry('2026-09-25', 600),
      entry('2026-09-26', 1, { materialId: 'flour' }),
    ];
    const s = materialPriceStats(butter, log, TODAY);
    expect(s.lastPrice).toBe(600);
    expect(s.change30d).toBeCloseTo(50, 6);
  });

  it('leaves out an entry in a unit that cannot be converted rather than guess', () => {
    const s = materialPriceStats(butter, [entry('2026-08-01', 20, { unit: 'pcs' }), entry('2026-09-25', 600)], TODAY);
    expect(s.change30d).toBeNull();
  });
});

describe('recipesAffectedBy', () => {
  it('gives each recipe the material\'s share of its cost and what a 10% rise adds', () => {
    const menu = [cake(), cake({ id: 'plain', recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }] })];
    const out = recipesAffectedBy('butter', menu, mats());
    expect(out).toHaveLength(1);
    expect(out[0].menuItemId).toBe('cake');
    expect(out[0].costShare).toBeCloseTo(100 / 130, 6);
    expect(out[0].unitCostImpactOf10pct).toBeCloseTo(10, 6);
  });
  it('lists the biggest impact first and is empty for an unknown material', () => {
    const menu = [cake({ id: 'small', recipe: [{ materialId: 'butter', amount: 50, unit: 'g' }] }), cake()];
    expect(recipesAffectedBy('butter', menu, mats()).map(r => r.menuItemId)).toEqual(['cake', 'small']);
    expect(recipesAffectedBy('nope', menu, mats())).toEqual([]);
  });
});

describe('pricingStamp and needsBaselineStamp', () => {
  it('records the day, the unit cost and every recipe material\'s cost per unit', () => {
    const s = pricingStamp(cake(), mats(), '2026-10-05');
    expect(s).toEqual({ pricedAt: '2026-10-05', costAtPricing: 130, materialCostsAtPricing: { butter: 500, flour: 40, box: 10 } });
  });
  it('flags a priced item with no stamp, and neither an unpriced nor a stamped one', () => {
    expect(needsBaselineStamp(cake())).toBe(true);
    expect(needsBaselineStamp(cake({ sellingPrice: 0 }))).toBe(false);
    expect(needsBaselineStamp(pricedCake())).toBe(false);
  });
});

describe('marginDrift', () => {
  it('is null for an item with no stamp or no price', () => {
    expect(marginDrift(cake(), mats(), SETTINGS)).toBeNull();
    expect(marginDrift(pricedCake(500, { sellingPrice: 0 }), mats(), SETTINGS)).toBeNull();
  });

  it('shows no drift when nothing has changed', () => {
    const d = marginDrift(pricedCake(), mats(), SETTINGS)!;
    expect(d.pointsLost).toBeCloseTo(0, 9);
    expect(d.drivers).toEqual([]);
    expect(d.recipeChangeImpact).toBeCloseTo(0, 9);
    expect(d.alert).toBeNull();
  });

  it('pins a butter price rise on butter, with the right percentage and cost impact', () => {
    // butter 500 -> 570 (+14%): 0.2 kg x 70 = 14 more a unit; cost 130 -> 144
    const d = marginDrift(pricedCake(500), mats(570), SETTINGS)!;
    expect(d.marginAtPricing).toBeCloseTo((400 - 130) / 400 * 100, 6); // 67.5
    expect(d.marginNow).toBeCloseTo((400 - 144) / 400 * 100, 6); // 64
    expect(d.pointsLost).toBeCloseTo(3.5, 6);
    expect(d.drivers).toHaveLength(1);
    expect(d.drivers[0].materialId).toBe('butter');
    expect(d.drivers[0].pctChange).toBeCloseTo(14, 6);
    expect(d.drivers[0].costImpact).toBeCloseTo(14, 6);
    expect(d.recipeChangeImpact).toBeCloseTo(0, 9);
  });

  it('counts an ingredient added to the recipe as a recipe change, never as price drift', () => {
    const stamped = pricedCake(500);
    const edited = { ...stamped, recipe: [...recipe, { materialId: 'extra', amount: 1, unit: 'pcs' }] };
    const m = [...mats(500), { id: 'extra', name: 'Extra', unit: 'pcs', costPerUnit: 30, category: 'Raw Materials' }];
    const d = marginDrift(edited, m, SETTINGS)!;
    expect(d.drivers).toEqual([]);
    expect(d.recipeChangeImpact).toBeCloseTo(30, 9);
    expect(d.pointsLost).toBeCloseTo(7.5, 6);
  });

  it('does not blame butter when the owner added more of it', () => {
    // butter amount 200 g -> 300 g at an unchanged price: +50 of cost, all recipe change
    const edited = { ...pricedCake(500), recipe: [{ materialId: 'butter', amount: 300, unit: 'g' }, ...recipe.slice(1)] };
    const d = marginDrift(edited, mats(500), SETTINGS)!;
    expect(d.drivers).toEqual([]);
    expect(d.recipeChangeImpact).toBeCloseTo(50, 9);
  });

  it('splits a change that is both: price at today\'s amount, the rest is the recipe', () => {
    // 300 g of butter now, at 570: price impact = 0.3 x 70 = 21; total = 130 - 100 + 0.3 x 570 = 201 -> change 71; recipe = 50
    const edited = { ...pricedCake(500), recipe: [{ materialId: 'butter', amount: 300, unit: 'g' }, ...recipe.slice(1)] };
    const d = marginDrift(edited, mats(570), SETTINGS)!;
    expect(d.drivers[0].costImpact).toBeCloseTo(21, 6);
    expect(d.recipeChangeImpact).toBeCloseTo(50, 6);
    expect(d.costNow - d.costAtPricing).toBeCloseTo(21 + 50, 6);
  });

  it('treats a removed ingredient as a recipe change', () => {
    const edited = { ...pricedCake(500), recipe: recipe.slice(1) };
    const d = marginDrift(edited, mats(500), SETTINGS)!;
    expect(d.drivers).toEqual([]);
    expect(d.recipeChangeImpact).toBeCloseTo(-100, 9);
    expect(d.pointsLost).toBeLessThan(0);
  });

  it('orders drivers by the size of their cost impact and shows a price fall as a negative impact', () => {
    const m = mats(570).map(x => (x.id === 'flour' ? { ...x, costPerUnit: 36 } : x)); // flour -10%: 0.5 x -4 = -2
    const d = marginDrift(pricedCake(500), m, SETTINGS)!;
    expect(d.drivers.map(x => x.materialId)).toEqual(['butter', 'flour']);
    expect(d.drivers[1].costImpact).toBeCloseTo(-2, 9);
  });

  it('gives the same margins in inclusive and exclusive GST for the same base price', () => {
    const ex = marginDrift(pricedCake(500, { sellingPrice: 400 }), mats(570), { gstApplicable: true, gstRate: 18, gstPricingMode: 'exclusive' } as any)!;
    const inc = marginDrift(pricedCake(500, { sellingPrice: 472 }), mats(570), { gstApplicable: true, gstRate: 18, gstPricingMode: 'inclusive' } as any)!;
    expect(inc.marginNow).toBeCloseTo(ex.marginNow, 6);
    expect(inc.marginAtPricing).toBeCloseTo(ex.marginAtPricing, 6);
  });

  describe('alerts', () => {
    it('flags "slipped" at the alert threshold (5 points by default) and not before', () => {
      expect(marginDrift(pricedCake(500), mats(570), SETTINGS)!.alert).toBeNull(); // 3.5 points
      expect(marginDrift(pricedCake(500), mats(640), SETTINGS)!.alert).toBe('slipped'); // +0.2 x 140 = 28 -> 7 points
      expect(marginDrift(pricedCake(500), mats(570), { ...SETTINGS, marginAlertPoints: 3 })!.alert).toBe('slipped');
    });
    it('flags "below_target" when the owner set a target the margin has fallen under', () => {
      const d = marginDrift(pricedCake(500, { targetMargin: 66 }), mats(570), SETTINGS)!; // margin 64 < 66
      expect(d.alert).toBe('below_target');
      expect(marginDrift(pricedCake(500), mats(570), { ...SETTINGS, defaultTargetMargin: 66 })!.alert).toBe('below_target');
    });
    it('below_target wins over slipped when both apply', () => {
      expect(marginDrift(pricedCake(500, { targetMargin: 70 }), mats(640), SETTINGS)!.alert).toBe('below_target');
    });
    it('never says below_target when no target was set, so nothing is flagged by surprise', () => {
      // margin 38.5% is far below the implicit 71.4% but the owner never asked for that
      const item = pricedCake(500, { sellingPrice: 211 });
      expect(marginDrift({ ...item, sellingPrice: 211 }, mats(500), SETTINGS)!.alert).toBeNull();
    });
    it('an item\'s own target beats the default', () => {
      const item = pricedCake(500, { targetMargin: 50 });
      expect(marginDrift(item, mats(570), { ...SETTINGS, defaultTargetMargin: 80 })!.alert).toBeNull(); // 64 >= 50
    });
  });
});

describe('targetFor', () => {
  it('uses the item, then the setting, then the implicit 3.5x margin (not explicit)', () => {
    expect(targetFor({ targetMargin: 60 }, { defaultTargetMargin: 70 })).toEqual({ margin: 60, explicit: true });
    expect(targetFor({}, { defaultTargetMargin: 70 })).toEqual({ margin: 70, explicit: true });
    expect(targetFor({}, {})).toEqual({ margin: DEFAULT_TARGET_MARGIN, explicit: false });
    expect(targetFor({ targetMargin: 120 }, {})).toEqual({ margin: DEFAULT_TARGET_MARGIN, explicit: false });
  });
});

describe('suggestedPriceForTarget', () => {
  it('with the default target reproduces the old 3.5x markup before rounding', () => {
    const s = suggestedPriceForTarget(130, DEFAULT_TARGET_MARGIN, { ...SETTINGS, priceRounding: 0.01 });
    expect(s.basePrice).toBeCloseTo(130 * 3.5, 9);
    expect(s.menuPrice).toBe(455);
  });
  it('price = cost / (1 - target) and earns at least the target', () => {
    const s = suggestedPriceForTarget(130, 60, SETTINGS); // 325 exactly
    expect(s.basePrice).toBeCloseTo(325, 9);
    expect(s.menuPrice).toBe(325);
    expect(s.marginAtMenuPrice).toBeCloseTo(60, 6);
  });
  it('rounds up to the rounding step (default 5), never down', () => {
    expect(suggestedPriceForTarget(130, 60, { ...SETTINGS }).menuPrice).toBe(325);
    expect(suggestedPriceForTarget(131, 60, SETTINGS).menuPrice).toBe(330); // 327.5 -> 330
    expect(suggestedPriceForTarget(131, 60, { ...SETTINGS, priceRounding: 1 }).menuPrice).toBe(328);
    expect(suggestedPriceForTarget(131, 60, SETTINGS).marginAtMenuPrice).toBeGreaterThanOrEqual(60);
  });
  it('grosses up for GST in inclusive mode and the margin is still on the base price', () => {
    const s = suggestedPriceForTarget(130, 60, { gstApplicable: true, gstRate: 18, gstPricingMode: 'inclusive', priceRounding: 0.01 } as any);
    expect(s.basePrice).toBeCloseTo(325, 9);
    expect(s.menuPrice).toBeCloseTo(383.5, 6);
    expect(s.marginAtMenuPrice).toBeCloseTo(60, 6);
  });
  it('adds nothing for GST in exclusive mode', () => {
    const s = suggestedPriceForTarget(130, 60, { gstApplicable: true, gstRate: 18, gstPricingMode: 'exclusive', priceRounding: 0.01 } as any);
    expect(s.menuPrice).toBe(325);
  });
  it('is 0 with no cost, and clamps an impossible target', () => {
    expect(suggestedPriceForTarget(0, 60, SETTINGS)).toEqual({ basePrice: 0, menuPrice: 0, marginAtMenuPrice: 0 });
    expect(Number.isFinite(suggestedPriceForTarget(130, 150, SETTINGS).menuPrice)).toBe(true);
  });
});

describe('roundUpTo', () => {
  it('rounds up, leaves exact multiples alone and survives floating-point dust', () => {
    expect(roundUpTo(183.42, 5)).toBe(185);
    expect(roundUpTo(185, 5)).toBe(185);
    expect(roundUpTo(0.1 + 0.2 + 184.7, 5)).toBe(185);
    expect(roundUpTo(12.341, 0)).toBe(12.35);
    expect(roundUpTo(0, 5)).toBe(0);
  });
});

describe('summarizeMenu with GST', () => {
  it('works margins out on the pre-GST price in inclusive pricing', () => {
    const m: any[] = [{ id: 'a', name: 'A', sellingPrice: 118, recipe: [{ materialId: 'flour', amount: 1000, unit: 'g' }] }]; // cost 40
    const s = summarizeMenu(m, mats(), { gstApplicable: true, gstRate: 18, gstPricingMode: 'inclusive' });
    expect(s.avgFoodCostPercent).toBeCloseTo(40, 6); // 40 of a base price of 100
    expect(summarizeMenu(m, mats()).avgFoodCostPercent).toBeCloseTo(40 / 118 * 100, 6);
  });
});

describe('pricingScenario', () => {
  // Sells at ₹100 with ₹50 of cost: ₹50 contribution a unit, 100 units a month.
  const item: any = { id: 'x', name: 'X', sellingPrice: 100, recipe: [{ materialId: 'flour', amount: 1250, unit: 'g' }] }; // cost 50
  const stamp = (date: string, qty: number, over: Record<string, any> = {}): any => ({
    id: `${date}-${Math.random()}`, menuItemId: 'x', quantity: qty, date, ...stampFor(item, mats()), ...over,
  });
  const base = { lookbackDays: 30 as const, menu: [item], materials: mats(), settings: SETTINGS, today: TODAY };
  /** An old order of another product: the business has been trading for months, so the window is not cut short. */
  const anchor = (): any => stamp('2026-06-01', 1, { menuItemId: 'other' });
  const orders = [stamp('2026-09-10', 60), stamp('2026-09-20', 40), stamp('2026-08-01', 500)]; // the August order is outside 30 days

  it('works out monthly contribution now and after, and the break-even loss', () => {
    const s = pricingScenario({ ...base, orders, changes: [{ menuItemId: 'x', newPrice: 125 }] });
    expect(s.daysUsed).toBe(30);
    expect(s.perItem[0].unitsInPeriod).toBe(100);
    expect(s.perItem[0].noRecentSales).toBe(false);
    expect(s.monthlyContributionNow).toBeCloseTo(100 * 50, 6); // 5000
    expect(s.monthlyContributionAfter).toBeCloseTo(100 * 75, 6); // 7500
    expect(s.breakEven.type).toBe('can_lose');
    if (s.breakEven.type === 'can_lose') expect(s.breakEven.pct).toBeCloseTo((1 - 5000 / 7500) * 100, 6); // 33.3%
  });

  it('a break-even of 20% when unit contribution goes from 100 to 125', () => {
    const exp: any = { ...item, sellingPrice: 150 };
    const o = [anchor(), { ...stamp('2026-09-20', 10), unitPriceAtSale: 150 }];
    const s = pricingScenario({ ...base, menu: [exp], orders: o, changes: [{ menuItemId: 'x', newPrice: 175 }] });
    expect(s.breakEven.type).toBe('can_lose');
    if (s.breakEven.type === 'can_lose') expect(s.breakEven.pct).toBeCloseTo(20, 6);
  });

  it('says a price cut needs more sales, not fewer', () => {
    const s = pricingScenario({ ...base, orders, changes: [{ menuItemId: 'x', newPrice: 80 }] }); // 50 -> 30 a unit
    expect(s.breakEven.type).toBe('must_gain');
    if (s.breakEven.type === 'must_gain') expect(s.breakEven.pct).toBeCloseTo((50 / 30 - 1) * 100, 6);
  });

  it('applies the owner\'s volume guess to "after" but not to the break-even', () => {
    const none = pricingScenario({ ...base, orders, changes: [{ menuItemId: 'x', newPrice: 125 }] });
    const guess = pricingScenario({ ...base, orders, changes: [{ menuItemId: 'x', newPrice: 125 }], expectedVolumeChangePct: -10 });
    expect(guess.monthlyContributionAfter).toBeCloseTo(none.monthlyContributionAfter * 0.9, 6);
    expect(guess.breakEven).toEqual(none.breakEven);
  });

  it('keeps the discounts and payment fees the item really had', () => {
    const o = [anchor(), stamp('2026-09-20', 100, { paymentMethod: 'card', paymentFeeRate: 2, paymentStatus: 'paid', discount: 1000 })];
    const noChange = pricingScenario({ ...base, orders: o, changes: [{ menuItemId: 'x', newPrice: 100 }] });
    expect(noChange.monthlyContributionAfter).toBeCloseTo(noChange.monthlyContributionNow, 6); // same price, same money
    expect(noChange.breakEven.type).toBe('unchanged');
    const up = pricingScenario({ ...base, orders: o, changes: [{ menuItemId: 'x', newPrice: 110 }] });
    // revenue 10000 - 1000 discount = 9000 (90% kept); +10 x 100 x 0.9 = +900, less 2% fee on it
    expect(up.monthlyContributionAfter - up.monthlyContributionNow).toBeCloseTo(900 * 0.98, 4);
  });

  it('starts from today\'s menu price, so a price changed since the sales is not smuggled into the "+8%"', () => {
    // sold at ₹100, but the menu now says ₹150: "now" is 100 units at ₹150 (₹100 each), and +8% is ₹162
    const dearer = [{ ...item, sellingPrice: 150 }];
    const s = pricingScenario({ ...base, menu: dearer, orders, changes: [{ menuItemId: 'x', newPrice: 162 }] });
    expect(s.monthlyContributionNow).toBeCloseTo(100 * (150 - 50), 6);
    expect(s.monthlyContributionAfter).toBeCloseTo(100 * (162 - 50), 6);
  });

  it('uses today\'s costs, not the costs the units were sold at', () => {
    // flour is now ₹80 a kg, so a unit costs ₹100, not the ₹50 stamped on the orders: at ₹100 it makes nothing
    const dearFlour = mats().map(m => (m.id === 'flour' ? { ...m, costPerUnit: 80 } : m));
    const s = pricingScenario({ ...base, materials: dearFlour, orders, changes: [{ menuItemId: 'x', newPrice: 120 }] });
    expect(s.monthlyContributionNow).toBeCloseTo(0, 6);
    expect(s.monthlyContributionAfter).toBeCloseTo(100 * 20, 6);
    expect(s.breakEven.type).toBe('not_applicable'); // no profit to defend yet
  });

  it('keeps delivery charged and courier fees out of the price effect', () => {
    const o = [anchor(), stamp('2026-09-20', 100, { deliveryMethod: 'third_party', deliveryCharge: 300, deliveryFee: 200 })];
    const s = pricingScenario({ ...base, orders: o, changes: [{ menuItemId: 'x', newPrice: 110 }] });
    expect(s.monthlyContributionNow).toBeCloseTo(100 * 50 + 300 - 200, 6);
    expect(s.monthlyContributionAfter - s.monthlyContributionNow).toBeCloseTo(100 * 10, 6);
  });

  it('scales a 90-day window to a month', () => {
    const o = [anchor(), stamp('2026-07-20', 90), stamp('2026-09-20', 90)];
    const s = pricingScenario({ ...base, lookbackDays: 90, orders: o, changes: [{ menuItemId: 'x', newPrice: 100 }] });
    expect(s.daysUsed).toBe(90);
    expect(s.monthlyContributionNow).toBeCloseTo(180 * 50 / 3, 6); // 3000 a month
  });

  it('does not stretch a short history: with 10 days of orders, a month is scaled from 10 days', () => {
    const o = [stamp('2026-09-26', 50)]; // first order 10 days ago (26 Sep .. 5 Oct inclusive)
    const s = pricingScenario({ ...base, lookbackDays: 90, orders: o, changes: [{ menuItemId: 'x', newPrice: 100 }] });
    expect(s.daysUsed).toBe(10);
    expect(s.monthlyContributionNow).toBeCloseTo(50 * 50 * 3, 6);
  });

  it('says "no recent sales" for an item with none in the window, and never counts it as 0% impact', () => {
    const s = pricingScenario({ ...base, orders: [stamp('2026-06-01', 10), stamp('2026-09-25', 1, { menuItemId: 'other' })], changes: [{ menuItemId: 'x', newPrice: 125 }] });
    expect(s.perItem[0].noRecentSales).toBe(true);
    expect(s.monthlyContributionNow).toBe(0);
    expect(s.breakEven.type).toBe('not_applicable');
  });

  it('ignores cancelled orders and pre-orders due later', () => {
    const o = [stamp('2026-09-20', 10), stamp('2026-09-21', 99, { cancelledOn: '2026-09-21' }), stamp('2026-10-20', 99, { preorder: true })];
    const s = pricingScenario({ ...base, orders: o, changes: [{ menuItemId: 'x', newPrice: 125 }] });
    expect(s.perItem[0].unitsInPeriod).toBe(10);
  });

  it('is on the pre-GST price when prices include GST', () => {
    const settings: any = { gstApplicable: true, gstRate: 18, gstPricingMode: 'inclusive' };
    const o = [anchor(), stamp('2026-09-20', 100, { unitPriceAtSale: 118 })];
    const gstMenu = [{ ...item, sellingPrice: 118 }]; // ₹118 with GST in it: ₹100 to the business
    const s = pricingScenario({ ...base, menu: gstMenu, settings, orders: o, changes: [{ menuItemId: 'x', newPrice: 118 }] });
    expect(s.monthlyContributionAfter).toBeCloseTo(s.monthlyContributionNow, 6);
    expect(s.monthlyContributionNow).toBeCloseTo(100 * 50, 6);
    const up = pricingScenario({ ...base, menu: gstMenu, settings, orders: o, changes: [{ menuItemId: 'x', newPrice: 141.6 }] }); // base 120
    expect(up.monthlyContributionAfter - up.monthlyContributionNow).toBeCloseTo(100 * 20, 4);
  });
});

describe('pricesFromPercent', () => {
  it('moves each chosen priced item by a percentage, to cents', () => {
    const menu: any[] = [{ id: 'a', sellingPrice: 150 }, { id: 'b', sellingPrice: 33.33 }, { id: 'c', sellingPrice: 0 }, { id: 'd', sellingPrice: 10 }];
    expect(pricesFromPercent(menu, ['a', 'b', 'c'], 8)).toEqual([{ menuItemId: 'a', newPrice: 162 }, { menuItemId: 'b', newPrice: 36 }]);
  });
});

describe('itemsNeedingRepricing', () => {
  it('lists items with an alert, the biggest margin loss first', () => {
    const a = pricedCake(500, { id: 'a' });
    const b = { ...pricedCake(500, { id: 'b' }), recipe: [{ materialId: 'butter', amount: 400, unit: 'g' }, ...recipe.slice(1)] };
    const stampedB = { ...b, ...pricingStamp(b, mats(500), '2026-06-01') };
    const out = itemsNeedingRepricing([a, stampedB, cake({ id: 'plain' })], mats(700), SETTINGS);
    expect(out.map(o => o.item.id)).toEqual(['b', 'a']);
  });
});

describe('repriceOptions', () => {
  it('offers the price that restores the margin the item was priced at, rounded up', () => {
    const item = pricedCake(500);
    const d = marginDrift(item, mats(640), SETTINGS)!; // cost 158, margin 60.5 (was 67.5)
    const { restore, target } = repriceOptions(item, d, SETTINGS);
    expect(restore!.price).toBeGreaterThan(400);
    expect(restore!.margin).toBeGreaterThanOrEqual(67.5 - 1e-9);
    expect(restore!.price).toBe(roundUpTo(158 / (1 - 0.675), 5)); // 486.15 -> 490
    expect(target).toBeNull(); // no target set
  });
  it('also offers the target price when the owner set one the margin is under', () => {
    const item = pricedCake(500, { targetMargin: 70 });
    const d = marginDrift(item, mats(640), SETTINGS)!;
    const { target } = repriceOptions(item, d, SETTINGS);
    expect(target!.targetMargin).toBe(70);
    expect(target!.price).toBe(roundUpTo(158 / 0.3, 5)); // 526.67 -> 530
    expect(target!.margin).toBeGreaterThanOrEqual(70);
  });
  it('offers nothing when the margin has not slipped and is above target, and never a price below the current one', () => {
    const item = pricedCake(500, { sellingPrice: 1000, targetMargin: 70 });
    const d = marginDrift(item, mats(500), SETTINGS)!;
    expect(repriceOptions(item, d, SETTINGS)).toEqual({ restore: null, target: null });
    // a cost that fell: the margin improved, so there is no restore price to offer
    const cheaper = marginDrift(item, mats(400), SETTINGS)!;
    expect(cheaper.pointsLost).toBeLessThan(0);
    expect(repriceOptions(item, cheaper, SETTINGS).restore).toBeNull();
  });
});
