import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDemoAi } from '../useDemoAi';
import { buildDemoData } from '../../utils/demoData';
import { forSale } from '../../utils/itemParts';
import { todayInZone } from '../../utils/localDate';
import { DEMO_BAKE, DEMO_ORDER, DEMO_OWN_INPUT, DEMO_RECIPE } from '../../utils/demoAi';
import type { BakerySettings } from '../../types';

const today = todayInZone(undefined);
const demo = buildDemoData('demo', today);
const settings = demo.settings as unknown as BakerySettings;
const setup = (enabled = true) => renderHook(() => useDemoAi({
  enabled, orders: demo.orders, saleMenu: forSale(demo.menu), menu: demo.menu,
  materials: demo.materials.map(m => ({ ...m, remaining: m.initialStock })), settings, delayMs: 0,
})).result.current;

describe('useDemoAi', () => {
  it('is nothing outside the demo', () => {
    expect(setup(false)).toBeNull();
  });

  it('reads the order example into the form, with the known customer', async () => {
    const out = await setup()!.orderParser.parse(DEMO_ORDER.text);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.form.lineItems).toEqual([{ menuItemId: 'menu_pinecake', quantity: 1 }, { menuItemId: 'menu_muffin', quantity: 6 }]);
    expect(out.form).toMatchObject({ customerName: 'Priya Sharma', knownCustomer: true, advanceAmount: 500, advanceMethod: 'upi' });
  });

  it('reads the bake example, and the recipe example typed out', async () => {
    const ai = setup()!;
    const bake = await ai.productionParser.parse(DEMO_BAKE.text);
    expect(bake.ok && bake.form.rows[0]).toEqual({ recipeId: 'menu_croissant', quantity: 24, made: 22 });
    const recipe = await ai.recipeReader.read({ text: DEMO_RECIPE.text }, demo.materials);
    expect(recipe.ok && recipe.parsed.recipes[0].name).toBe('Choco chip cookies');
  });

  it('reads the example photo by its name, and nothing else', async () => {
    const ai = setup()!;
    const page = new File(['x'], 'stockpot-demo-recipe.webp', { type: 'image/webp' });
    expect((await ai.recipeReader.read({ photos: [page] }, demo.materials)).ok).toBe(true);
    const mine = new File(['x'], 'IMG_2041.jpg', { type: 'image/jpeg' });
    expect(await ai.recipeReader.read({ photos: [mine] }, demo.materials)).toEqual({ ok: false, message: DEMO_OWN_INPUT });
    expect(await ai.promoter.promote(mine, 'en')).toEqual({ ok: false, message: DEMO_OWN_INPUT });
    expect(ai.promoter.styling).toBeNull();
  });

  it('says the demo reads the example when given anything else', async () => {
    const ai = setup()!;
    expect(await ai.orderParser.parse('2 croissants for Rahul tomorrow')).toEqual({ ok: false, message: DEMO_OWN_INPUT });
    expect(await ai.productionParser.parse('Made 10 muffins')).toEqual({ ok: false, message: DEMO_OWN_INPUT });
    expect(await ai.recipeReader.read({ text: 'Ladoo\n1 cup besan' }, demo.materials)).toEqual({ ok: false, message: DEMO_OWN_INPUT });
  });
});
