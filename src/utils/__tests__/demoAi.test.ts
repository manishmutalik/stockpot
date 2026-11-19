import { describe, expect, it } from 'vitest';
import {
  DEMO_BAKE, DEMO_BAKE_READING, DEMO_ORDER, DEMO_PROMOTE_READINGS, DEMO_QUESTIONS, DEMO_RECIPE, DEMO_RECIPE_READING,
  demoAnswer, demoOrderReading, isDemoText,
} from '../demoAi';
import { buildDemoData } from '../demoData';
import { buildOrderForm, prepareOrderText, validateParsedOrder } from '../orderParse';
import { buildProductionForm, prepareProductionText, validateParsedProduction } from '../productionParse';
import { validateParsedRecipes } from '../recipeParse';
import { validatePromoteReading } from '../promote';
import { buildCustomerProfiles } from '../customers';
import { buildBusinessSnapshot } from '../aiSnapshot';
import { validateChatAnswer, chatPeriods } from '../aiChat';
import { renderAiText } from '../aiFigures';
import { forSale } from '../itemParts';
import type { BakerySettings } from '../../types';

const today = '2026-11-19';
const demo = buildDemoData('demo', today);
const materials = demo.materials.map(m => ({ ...m, remaining: m.initialStock }));
const settings = demo.settings as unknown as BakerySettings;
const customers = buildCustomerProfiles({ orders: demo.orders, menu: demo.menu, materials, settings, today });

describe('the demo examples pass the same checks as a real reading', () => {
  it('order: the message names a known customer, and the reading is one the server would accept', () => {
    const prepared = prepareOrderText(DEMO_ORDER.text, customers);
    expect(prepared.mentioned).toHaveLength(1);
    const reading = demoOrderReading(prepared.mentioned[0]);
    const checked = validateParsedOrder(reading, { text: prepared.text, menuIds: forSale(demo.menu).map(m => m.id) });
    expect(checked).toMatchObject({ ok: true });
    const form = buildOrderForm({ parsed: reading, menu: forSale(demo.menu), today, phones: prepared.phones, customers: customers.map(c => ({ label: c.label, name: c.name, phone: c.phone })) });
    expect(form.lineItems).toEqual([{ menuItemId: 'menu_pinecake', quantity: 1 }, { menuItemId: 'menu_muffin', quantity: 6 }]);
    expect(form).toMatchObject({ customerName: 'Priya Sharma', knownCustomer: true, date: '2026-11-21', advanceAmount: 500, advanceMethod: 'upi' });
  });

  it('bake: the reading passes, and two burnt croissants leave twenty-two made', () => {
    const checked = validateParsedProduction(DEMO_BAKE_READING, { text: prepareProductionText(DEMO_BAKE.text), menuIds: demo.menu.map(m => m.id) });
    expect(checked).toMatchObject({ ok: true });
    const form = buildProductionForm({ parsed: DEMO_BAKE_READING, menu: demo.menu, today });
    expect(form.rows).toEqual([
      { recipeId: 'menu_croissant', quantity: 24, made: 22 },
      { recipeId: 'menu_muffin', quantity: 12 },
      { recipeId: 'menu_bread', quantity: 3 },
    ]);
  });

  it('recipe: the reading passes for the typed version of the page, matched to the demo kitchen’s own materials', () => {
    const checked = validateParsedRecipes(DEMO_RECIPE_READING, { text: DEMO_RECIPE.text, materialIds: demo.materials.map(m => m.id) });
    expect(checked).toMatchObject({ ok: true });
    expect(DEMO_RECIPE_READING.recipes[0].ingredients.every(i => demo.materials.some(m => m.id === i.materialId))).toBe(true);
  });

  it('promote: both captions pass', () => {
    for (const reading of Object.values(DEMO_PROMOTE_READINGS)) {
      const raw = { isFood: reading.isFood, menuItemId: reading.menuItemId, dishName: reading.dishName, focusX: reading.focus.x, focusY: reading.focus.y, caption: reading.caption, hashtags: reading.hashtags };
      expect(validatePromoteReading(raw, { menuIds: demo.menu.map(m => m.id) })).toMatchObject({ ok: true });
    }
  });

  it('knows the example however its spacing and case change, and not another message', () => {
    expect(isDemoText(`  ${DEMO_BAKE.text.toUpperCase()} `, DEMO_BAKE.text)).toBe(true);
    expect(isDemoText('Made 10 croissants', DEMO_BAKE.text)).toBe(false);
  });
});

describe('demoAnswer', () => {
  const snapshotFor = (periodId: string) => {
    const choice = chatPeriods(today).find(p => p.id === periodId)!;
    return buildBusinessSnapshot({
      period: choice.period, comparison: choice.comparison, orders: demo.orders, menu: demo.menu, materials, experiments: demo.experiments,
      wastageLogs: [], productionRuns: demo.productionRuns, priceLog: demo.priceLog, settings, currency: { code: 'INR', symbol: '₹' },
      customers, today, includeSuggestedPrices: true,
    });
  };

  it.each(['month', '30d', '7d', 'last_month'])('answers every question for %s in tokens the server would accept', periodId => {
    const built = snapshotFor(periodId);
    for (const q of DEMO_QUESTIONS) {
      const answer = demoAnswer(q, built);
      expect(answer, q).toBeTruthy();
      expect(validateChatAnswer({ answer }, built.promptSnapshot, q), `${periodId}: ${q}`).toMatchObject({ ok: true });
    }
  });

  it('shows the demo kitchen’s own numbers', () => {
    const built = snapshotFor('month');
    const shown = renderAiText(demoAnswer(DEMO_QUESTIONS[0], built)!, built.registry, { currencySymbol: '₹' }, built.customerNames);
    const text = Array.isArray(shown) ? shown.map(p => (typeof p === 'string' ? p : '')).join('') : String(shown);
    expect(text).toMatch(/In this period you made ₹[\d,]+ of true profit on ₹[\d,]+ of sales, from \d+ orders\./);
  });

  it('answers nothing it was not given', () => {
    expect(demoAnswer('What should I bake tomorrow?', snapshotFor('month'))).toBeNull();
  });
});
