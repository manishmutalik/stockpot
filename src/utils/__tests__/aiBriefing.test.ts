import { describe, it, expect } from 'vitest';
import {
  AI_ATTENTION_KINDS, BRIEFING_SCHEMA, buildBriefingHeadline, buildDeterministicBriefing, contentResolves, knownIdsFromSnapshot,
  MAX_ATTENTION_ITEMS, validateBriefingContent,
} from '../aiBriefing';
import { buildBusinessSnapshot } from '../aiSnapshot';
import { renderAiText, validateAiText } from '../aiFigures';
import { buildCustomerProfiles } from '../customers';
import { addDays } from '../localDate';

const TODAY = '2026-06-30';
const YESTERDAY = addDays(TODAY, -1);
const ctx = { currencySymbol: '₹' };
const NO_GST = { gstApplicable: false };

const materials: any[] = [
  { id: 'flour', name: 'Flour', unit: 'kg', costPerUnit: 40, category: 'Raw Materials', initialStock: 10, remaining: 10, threshold: 2 },
  { id: 'butter', name: 'Butter', unit: 'kg', costPerUnit: 500, category: 'Raw Materials', initialStock: 0.5, remaining: 0.5, threshold: 2, expiryDate: '2026-07-01' },
];
const menu: any[] = [{ id: 'cake', name: 'Chocolate Cake 1 kg', sellingPrice: 100, recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }] }];

let n = 0;
const order = (date: string, over: Record<string, any> = {}): any => ({
  id: `o${String(++n).padStart(4, '0')}`, menuItemId: 'cake', quantity: 1, date,
  unitPriceAtSale: 100, unitIngredientCostAtSale: 20, unitPackagingCostAtSale: 0, unitInputGstAtSale: 0, itemNameAtSale: 'Chocolate Cake 1 kg',
  customerName: 'Priya Sharma', customerPhone: '+91 98450 10101', ...over,
});

const snap = (orders: any[], extra: Record<string, any> = {}) => {
  const settings: any = { name: 'Asha Bakes', ...NO_GST, timezone: 'Asia/Kolkata', ...extra.settings };
  const customers = buildCustomerProfiles({ orders, menu, materials, settings, today: TODAY });
  return buildBusinessSnapshot({
    period: { start: YESTERDAY, end: YESTERDAY }, orders, menu, materials, experiments: [], wastageLogs: extra.wastageLogs ?? [],
    settings, currency: { code: 'INR', symbol: '₹' }, customers, today: TODAY,
  });
};

const week = (daysAgo: number) => addDays(YESTERDAY, -daysAgo);
const busy = () => snap([order(YESTERDAY, { quantity: 3 }), order(week(7), { quantity: 4 })]);

describe('the schema', () => {
  it('asks for exactly a why and a short list of kinds the app understands', () => {
    expect(BRIEFING_SCHEMA.required).toEqual(['why', 'attention']);
    expect(BRIEFING_SCHEMA.properties.attention.items.properties.kind.enum).toEqual([...AI_ATTENTION_KINDS]);
    expect(BRIEFING_SCHEMA.additionalProperties).toBe(false);
  });
});

describe('knownIdsFromSnapshot', () => {
  it('offers the ids in the snapshot and no others', () => {
    const { promptSnapshot } = busy();
    const known = knownIdsFromSnapshot(promptSnapshot);
    expect(known.figures).toContain('true_profit_change');
    expect(known.names.length).toBeGreaterThan(0);
    expect(known.figures).not.toContain('made_up');
  });
});

describe('validateBriefingContent', () => {
  const { promptSnapshot } = busy();
  const good = { why: 'Profit fell by {{fig:true_profit_change}} as {{name:item_cake}} sold less.', attention: [{ kind: 'low_stock', text: 'Butter is low.' }] };

  it('accepts a well-formed answer made of words and known tokens', () => {
    const r = validateBriefingContent(good, promptSnapshot);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toEqual(good);
  });

  it('refuses an answer with a number in it, however it is hidden', () => {
    for (const why of ['Profit fell by 12% as sales dropped.', 'Down ₹500.', 'Fell twelve percent', 'A drop of {{fig:true_profit_change}}0']) {
      const r = validateBriefingContent({ ...good, why }, promptSnapshot);
      expect(r.ok, why).toBe(false);
    }
    expect(validateBriefingContent({ ...good, attention: [{ kind: 'wastage', text: 'Wasted 3 loaves.' }] }, promptSnapshot).ok).toBe(false);
  });

  it('refuses a token for something the snapshot did not offer', () => {
    expect(validateBriefingContent({ ...good, why: 'Fell by {{fig:invented}}' }, promptSnapshot).ok).toBe(false);
    expect(validateBriefingContent({ ...good, attention: [{ kind: 'low_stock', text: '{{name:item_nope}} is low' }] }, promptSnapshot).ok).toBe(false);
    expect(validateBriefingContent({ ...good, attention: [{ kind: 'reorder_customer', text: '{{cust:C-0000}} is due' }] }, promptSnapshot).ok).toBe(false);
  });

  it('refuses a kind it does not know, and too many items', () => {
    expect(validateBriefingContent({ ...good, attention: [{ kind: 'raise_prices', text: 'Raise prices.' }] }, promptSnapshot).ok).toBe(false);
    expect(validateBriefingContent({ ...good, attention: [{ kind: 'reprice', text: 'Raise prices.' }, { kind: 'price_move', text: 'Butter is dearer.' }] }, promptSnapshot).ok).toBe(true);
    const many = Array.from({ length: MAX_ATTENTION_ITEMS + 1 }, () => ({ kind: 'low_stock', text: 'Butter is low.' }));
    expect(validateBriefingContent({ ...good, attention: many }, promptSnapshot).ok).toBe(false);
  });

  it('refuses a malformed answer', () => {
    for (const raw of [null, undefined, 'text', 5, [], {}, { why: 'x' }, { why: 'Words.', attention: 'none' }, { why: 7, attention: [] }, { why: 'Words.', attention: [null] }]) {
      expect(validateBriefingContent(raw, promptSnapshot).ok, JSON.stringify(raw)).toBe(false);
    }
  });

  it('says what was wrong, so the model can be told', () => {
    const r = validateBriefingContent({ why: 'Fell 12 percent', attention: [] }, promptSnapshot);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.problems.join(' ')).toMatch(/why:.*digit/);
  });

  it('accepts an answer with no attention items', () => {
    expect(validateBriefingContent({ why: 'Nothing unusual.', attention: [] }, promptSnapshot).ok).toBe(true);
  });
});

describe('buildBriefingHeadline', () => {
  it('is built from the figures: orders, revenue, true profit and the change on a week earlier', () => {
    const { promptSnapshot, registry } = busy(); // yesterday 3 cakes, a week earlier 4 cakes
    expect(buildBriefingHeadline(promptSnapshot, registry, ctx))
      .toBe('Yesterday (Mon 29 Jun): 1 order, ₹300 revenue and ₹240 true profit, down 25% on the same day last week.');
  });

  it('says up when profit rose, and handles one order', () => {
    const { promptSnapshot, registry } = snap([order(YESTERDAY, { quantity: 5 }), order(week(7), { quantity: 1 })]);
    expect(buildBriefingHeadline(promptSnapshot, registry, ctx)).toMatch(/true profit, up 400% on the same day last week\.$/);
    const one = snap([order(YESTERDAY), order(week(7))]);
    expect(buildBriefingHeadline(one.promptSnapshot, one.registry, ctx)).toBe('Yesterday (Mon 29 Jun): 1 order, ₹100 revenue and ₹80 true profit, the same as the same day last week.');
  });

  it('says how much profit moved, not a percentage, when it was a loss before', () => {
    const { promptSnapshot, registry } = snap([order(YESTERDAY), order(week(7), { unitIngredientCostAtSale: 150 })]);
    const text = buildBriefingHeadline(promptSnapshot, registry, ctx);
    expect(text).toMatch(/true profit, up ₹[\d,]+ on the same day last week\.$/);
    expect(text).not.toContain('%');
  });

  it('says so when there is nothing to compare with', () => {
    const { promptSnapshot, registry } = snap([order(YESTERDAY)]);
    expect(buildBriefingHeadline(promptSnapshot, registry, ctx)).toBe('Yesterday (Mon 29 Jun): 1 order, ₹100 revenue and ₹80 true profit, with nothing to compare against from the same day last week.');
  });

  it('says there were no orders, and what the week before had', () => {
    const quiet = snap([order(week(7), { quantity: 2 }), order(week(20))]);
    expect(buildBriefingHeadline(quiet.promptSnapshot, quiet.registry, ctx)).toBe('Yesterday (Mon 29 Jun): no orders, compared with 1 order the same day last week.');
    const none = snap([order(week(20))]);
    expect(buildBriefingHeadline(none.promptSnapshot, none.registry, ctx)).toBe('Yesterday (Mon 29 Jun): no orders.');
  });

  it('shows a loss as a loss', () => {
    const { promptSnapshot, registry } = snap([order(YESTERDAY, { unitPriceAtSale: 10, unitIngredientCostAtSale: 40 })]);
    expect(buildBriefingHeadline(promptSnapshot, registry, ctx)).toContain('-₹30 true profit');
  });

  it('uses only numbers the registry holds', () => {
    const { promptSnapshot, registry } = busy();
    const text = buildBriefingHeadline(promptSnapshot, registry, ctx);
    const figures = Object.values(registry.figures).map(f => Math.abs(Number(f.value)));
    for (const m of text.replace(/Mon 29 Jun/, '').matchAll(/\d[\d,]*/g)) expect(figures).toContain(Number(m[0].replace(/,/g, '')));
  });
});

describe('buildDeterministicBriefing', () => {
  it('explains the largest drivers using tokens only, and the result passes the guard', () => {
    const { promptSnapshot, registry } = busy();
    const content = buildDeterministicBriefing(promptSnapshot);
    expect(validateBriefingContent(content, promptSnapshot).ok).toBe(true);
    const shown = renderAiText(content.why, registry, ctx);
    expect(shown).toBe('The biggest change was sales before discounts (-₹100 on true profit), then ingredient costs (+₹20 on true profit).');
  });

  it('says nothing changed enough when it did not', () => {
    const { promptSnapshot } = snap([order(YESTERDAY), order(week(7))]);
    expect(buildDeterministicBriefing(promptSnapshot).why).toBe('Nothing changed enough to explain, compared with the same day last week.');
  });

  it('raises low stock, expiring stock, a due customer and unpaid sales, from the data', () => {
    const orders = [
      ...[38, 31, 24, 17, 10].map(d => order(addDays(TODAY, -d), { customerName: 'Weekly Wendy', customerPhone: '+91 98450 20202' })),
      order(YESTERDAY, { paymentStatus: 'unpaid' }),
    ];
    const { promptSnapshot, registry, customerNames } = snap(orders);
    const content = buildDeterministicBriefing(promptSnapshot);
    const kinds = content.attention.map(a => a.kind);
    expect(kinds).toEqual(expect.arrayContaining(['low_stock', 'expiring', 'unpaid', 'reorder_customer']));
    expect(content.attention.length).toBeLessThanOrEqual(MAX_ATTENTION_ITEMS);
    const rendered = content.attention.map(a => renderAiText(a.text, registry, ctx, customerNames));
    expect(rendered.join(' | ')).toMatch(/Weekly Wendy is due to reorder: \d+ days since the last order/);
    expect(rendered.join(' | ')).toContain('Butter');
    expect(validateBriefingContent(content, promptSnapshot).ok).toBe(true);
  });

  it('raises a material that will run out soon, with the day and a quantity from the app, unless the low-stock line already has it', () => {
    const runs = Array.from({ length: 28 }, (_, i) => ({ recipeId: 'cake', quantityProduced: 6, date: addDays(TODAY, -i) }));
    const build = (mats: any[]) => buildBusinessSnapshot({
      period: { start: YESTERDAY, end: YESTERDAY }, orders: [order(YESTERDAY)], menu, materials: mats, experiments: [], wastageLogs: [],
      settings: { name: 'Asha Bakes', ...NO_GST, timezone: 'Asia/Kolkata' } as any, currency: { code: 'INR', symbol: '₹' }, customers: [], today: TODAY, productionRuns: runs,
    });
    // 6 cakes a day x 0.5 kg = 3 kg of flour a day: 10 kg lasts 3 days.
    const soon = build(materials.map(m => (m.id === 'flour' ? { ...m, threshold: 0, dateAdded: addDays(TODAY, -60) } : { ...m, threshold: 0, expiryDate: undefined })));
    const content = buildDeterministicBriefing(soon.promptSnapshot);
    const line = content.attention.find(a => a.kind === 'low_stock');
    expect(line && renderAiText(line.text, soon.registry, ctx)).toBe('Flour may run out around Fri 3 Jul; about 23 kg would cover the next week.'); // 3 kg a day x 11 days, less 10 on hand
    expect(validateBriefingContent(content, soon.promptSnapshot).ok).toBe(true);

    // When flour is already below its alert level the low-stock line names it, so it is not said twice.
    const alreadyLow = build(materials.map(m => (m.id === 'flour' ? { ...m, remaining: 1, threshold: 2, dateAdded: addDays(TODAY, -60) } : { ...m, threshold: 0, expiryDate: undefined })));
    const texts = buildDeterministicBriefing(alreadyLow.promptSnapshot).attention.filter(a => a.kind === 'low_stock').map(a => a.text);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatch(/^Running low:/);
  });

  it('is empty of attention items when nothing needs it', () => {
    const calm = buildBusinessSnapshot({
      period: { start: YESTERDAY, end: YESTERDAY }, orders: [order(YESTERDAY, { customerName: undefined, customerPhone: undefined })], menu,
      materials: [{ ...materials[0] }], experiments: [], wastageLogs: [], settings: { name: 'x', ...NO_GST } as any,
      currency: { code: 'INR', symbol: '₹' }, customers: [], today: TODAY,
    });
    expect(buildDeterministicBriefing(calm.promptSnapshot).attention).toEqual([]);
  });

  it('never contains a digit of its own', () => {
    const { promptSnapshot } = busy();
    const c = buildDeterministicBriefing(promptSnapshot);
    for (const text of [c.why, ...c.attention.map(a => a.text)]) {
      const known = knownIdsFromSnapshot(promptSnapshot);
      expect(validateAiText(text, known).ok, text).toBe(true);
    }
  });
});

describe('contentResolves', () => {
  it('is true while every token still points at something', () => {
    const { registry, customerNames, promptSnapshot } = busy();
    expect(contentResolves(buildDeterministicBriefing(promptSnapshot), registry, customerNames)).toBe(true);
  });

  it('is false when a figure it mentions no longer exists, so a stale cached text is not shown', () => {
    const { registry, customerNames } = busy();
    const stale = { why: 'Profit moved {{fig:driver_that_is_gone}}.', attention: [] };
    expect(contentResolves(stale, registry, customerNames)).toBe(false);
    expect(contentResolves({ why: 'Fine.', attention: [{ kind: 'low_stock', text: '{{name:item_gone}} is low' }] }, registry, customerNames)).toBe(false);
  });
});

describe('buildDeterministicBriefing: pricing', () => {
  const butterCake: any = {
    id: 'bc', name: 'Butter Cake', sellingPrice: 400,
    recipe: [{ materialId: 'butter', amount: 200, unit: 'g' }, { materialId: 'flour', amount: 500, unit: 'g' }],
    pricedAt: '2026-06-01', costAtPricing: 70, materialCostsAtPricing: { butter: 300, flour: 40 },
  };
  const log = (date: string, unitCost: number): any => ({ id: date, materialId: 'butter', date, unitCost, unit: 'kg', source: 'restock', createdAt: 1 });
  const withPricing = (over: Record<string, any> = {}) => buildBusinessSnapshot({
    period: { start: YESTERDAY, end: YESTERDAY }, orders: [], menu: [butterCake], materials, experiments: [], wastageLogs: [],
    settings: { name: 'Asha Bakes', ...NO_GST, timezone: 'Asia/Kolkata' } as any, currency: { code: 'INR', symbol: '₹' }, customers: [], today: TODAY, ...over,
  });

  it('raises the item whose margin slipped, naming the ingredient that moved and a price that restores it', () => {
    const { promptSnapshot, registry } = withPricing();
    const content = buildDeterministicBriefing(promptSnapshot);
    const item = content.attention.find(a => a.kind === 'reprice')!;
    expect(validateBriefingContent(content, promptSnapshot).ok).toBe(true);
    const shown = renderAiText(item.text, registry, ctx);
    expect(shown).toMatch(/^Butter Cake margin is down from 83% to 70%, with Butter up \+67%\. A price of ₹\d+ would restore it\.$/);
  });

  it('says "under your target" when the margin is below a target the owner set', () => {
    const { promptSnapshot, registry } = withPricing({ settings: { name: 'Asha Bakes', ...NO_GST, timezone: 'Asia/Kolkata', defaultTargetMargin: 75 } });
    const item = buildDeterministicBriefing(promptSnapshot).attention.find(a => a.kind === 'reprice')!;
    expect(renderAiText(item.text, registry, ctx)).toMatch(/^Butter Cake earns a margin of 70%, under your target\./);
  });

  it('raises an ingredient that got dearer, in words that need no digits', () => {
    const { promptSnapshot, registry } = withPricing({ menu: [{ ...butterCake, costAtPricing: 120, materialCostsAtPricing: { butter: 500, flour: 40 } }], priceLog: [log('2026-04-01', 400), log('2026-06-20', 500)] });
    const content = buildDeterministicBriefing(promptSnapshot);
    const item = content.attention.find(a => a.kind === 'price_move')!;
    expect(validateBriefingContent(content, promptSnapshot).ok).toBe(true);
    expect(renderAiText(item.text, registry, ctx)).toBe('Butter costs +25% more than it did in the last month.');
  });

  it('does not repeat the ingredient already named in the repricing line, and ignores price falls', () => {
    const rises = withPricing({ priceLog: [log('2026-04-01', 300), log('2026-06-20', 500)] }).promptSnapshot;
    expect(buildDeterministicBriefing(rises).attention.map(a => a.kind)).toContain('reprice');
    expect(buildDeterministicBriefing(rises).attention.map(a => a.kind)).not.toContain('price_move');
    const falls = withPricing({ menu: [{ ...butterCake, costAtPricing: 120, materialCostsAtPricing: { butter: 500, flour: 40 } }], priceLog: [log('2026-04-01', 600), log('2026-06-20', 500)] }).promptSnapshot;
    expect(buildDeterministicBriefing(falls).attention.map(a => a.kind)).not.toContain('price_move');
  });

  it('puts the repricing line after pre-orders and keeps the list within its limit', () => {
    const { promptSnapshot } = withPricing();
    const kinds = buildDeterministicBriefing(promptSnapshot).attention.map(a => a.kind);
    expect(kinds[0]).toBe('reprice');
    expect(kinds.length).toBeLessThanOrEqual(MAX_ATTENTION_ITEMS);
  });
});
