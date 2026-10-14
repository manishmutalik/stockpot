import { describe, it, expect } from 'vitest';
import { mergeRecipeLines, planImportRecipes } from '../planRecipes';
import type { MenuItem, RawMaterial } from '../../../types';

const flour: RawMaterial = { id: 'm_flour', name: 'Maida', unit: 'kg', initialStock: 10, costPerUnit: 45, category: 'Raw Materials', dateAdded: '2026-01-01' };
const sugar: RawMaterial = { id: 'm_sugar', name: 'Sugar', unit: 'kg', initialStock: 5, costPerUnit: 48, category: 'Raw Materials', dateAdded: '2026-01-01' };
const muffin: MenuItem = { id: 'menu_muffin', name: 'Chocolate Muffin', sellingPrice: 80, recipe: [{ materialId: 'm_flour', amount: 60, unit: 'g' }] };
const ctx = () => { let n = 0; return { newId: () => `id${++n}`, now: () => 1_760_000_000_000 }; };
const base = { materials: [flour, sugar], menu: [muffin], today: '2026-10-12', remember: [], newMaterials: [] };

describe('planImportRecipes', () => {
  it('creates new materials without stock, with a price and its history entry only when one was given', () => {
    const plan = planImportRecipes({
      ...base, ctx: ctx(),
      newMaterials: [
        { key: 'n1', name: 'Vanilla Essence', unit: 'ml', costPerUnit: 2.4 },
        { key: 'n2', name: 'Garam Masala', unit: 'g', gramsPerTsp: 2 },
      ],
      items: [{ target: { kind: 'new', name: 'Vanilla Cupcake' }, lines: [{ material: { newKey: 'n1' }, amount: 0.42, unit: 'ml' }, { material: { newKey: 'n2' }, amount: 0.1, unit: 'g' }] }],
    });
    expect(plan.ok).toBe(true);
    if (plan.ok !== true) return;
    expect(plan.newMaterialIds).toEqual({ n1: 'id1', n2: 'id3' });
    expect(plan.writes.map(w => `${w.collection}/${w.id}`)).toEqual(['materials/id1', 'priceLog/id2', 'materials/id3', 'menu/id4']);
    expect(plan.writes[0].data).toEqual({ id: 'id1', name: 'Vanilla Essence', unit: 'ml', initialStock: 0, costPerUnit: 2.4, category: 'Raw Materials', threshold: 0, dateAdded: '2026-10-12' });
    expect(plan.writes[1].data).toMatchObject({ materialId: 'id1', unitCost: 2.4, source: 'initial', date: '2026-10-12' });
    expect(plan.writes[2].data).toMatchObject({ name: 'Garam Masala', costPerUnit: 0, gramsPerTsp: 2 });
    expect(plan.writes[3].data).toEqual({ id: 'id4', name: 'Vanilla Cupcake', sellingPrice: 0, emoji: '🧁', recipe: [{ materialId: 'id1', amount: 0.42, unit: 'ml' }, { materialId: 'id3', amount: 0.1, unit: 'g' }] });
  });

  it('stamps a new item that has a selling price, as setting a price does', () => {
    const plan = planImportRecipes({ ...base, ctx: ctx(), items: [{ target: { kind: 'new', name: 'Cupcake', sellingPrice: 60 }, lines: [{ material: { existingId: 'm_flour' }, amount: 20, unit: 'g' }] }] });
    expect(plan.ok === true && plan.writes[0].data).toMatchObject({ sellingPrice: 60, pricedAt: '2026-10-12', costAtPricing: 0.9, materialCostsAtPricing: { m_flour: 45 }, pricingIsBaseline: false });
  });

  it('merges a frosting folded into a cake: the same material twice becomes one line', () => {
    expect(mergeRecipeLines([{ materialId: 's', amount: 10, unit: 'g' }, { materialId: 'f', amount: 5, unit: 'g' }, { materialId: 's', amount: 2.5, unit: 'g' }]))
      .toEqual([{ materialId: 's', amount: 12.5, unit: 'g' }, { materialId: 'f', amount: 5, unit: 'g' }]);
  });

  it('keeps what one batch makes on a new item, or one whose recipe it replaces, but not when it only adds', () => {
    const line = { material: { existingId: 'm_flour' }, amount: 15, unit: 'g' };
    const made = planImportRecipes({ ...base, ctx: ctx(), items: [{ target: { kind: 'new', name: 'Sponge base' }, lines: [line], batchMakes: 4.5 }] });
    expect(made.ok === true && made.writes[0].data).toMatchObject({ name: 'Sponge base', batchMakes: 4.5 });
    const one = planImportRecipes({ ...base, ctx: ctx(), items: [{ target: { kind: 'new', name: 'Big cake' }, lines: [line], batchMakes: 1 }] });
    expect(one.ok === true && 'batchMakes' in one.writes[0].data).toBe(false);
    const replaced = planImportRecipes({ ...base, ctx: ctx(), items: [{ target: { kind: 'existing', menuItemId: 'menu_muffin', mode: 'replace' }, lines: [line], batchMakes: 12 }] });
    expect(replaced.ok === true && replaced.writes[0].data).toMatchObject({ batchMakes: 12 });
    const added = planImportRecipes({ ...base, ctx: ctx(), items: [{ target: { kind: 'existing', menuItemId: 'menu_muffin', mode: 'add' }, lines: [line], batchMakes: 12 }] });
    expect(added.ok === true && 'batchMakes' in added.writes[0].data).toBe(false);
  });

  it('replaces or adds to an existing item\'s recipe, touching only its recipe', () => {
    const line = { material: { existingId: 'm_flour' }, amount: 15, unit: 'g' };
    const replaced = planImportRecipes({ ...base, ctx: ctx(), items: [{ target: { kind: 'existing', menuItemId: 'menu_muffin', mode: 'replace' }, lines: [line] }] });
    expect(replaced.ok === true && replaced.writes).toEqual([{ collection: 'menu', id: 'menu_muffin', data: { recipe: [{ materialId: 'm_flour', amount: 15, unit: 'g' }] }, merge: true }]);
    const added = planImportRecipes({ ...base, ctx: ctx(), items: [{ target: { kind: 'existing', menuItemId: 'menu_muffin', mode: 'add' }, lines: [line] }] });
    expect(added.ok === true && added.writes[0].data).toEqual({ recipe: [{ materialId: 'm_flour', amount: 75, unit: 'g' }] });
  });

  it('remembers weights the owner confirmed on existing materials, and changes nothing else about them', () => {
    const plan = planImportRecipes({ ...base, ctx: ctx(), remember: [{ materialId: 'm_sugar', gramsPerTsp: 4.2 }], items: [{ target: { kind: 'new', name: 'Ladoo' }, lines: [{ material: { existingId: 'm_sugar' }, amount: 8, unit: 'g' }] }] });
    expect(plan.ok === true && plan.writes[0]).toEqual({ collection: 'materials', id: 'm_sugar', data: { gramsPerTsp: 4.2 }, merge: true });
  });

  it('refuses rather than writing anything wrong', () => {
    const line = { material: { existingId: 'm_flour' }, amount: 10, unit: 'g' };
    expect(planImportRecipes({ ...base, ctx: ctx(), items: [] })).toEqual({ ok: false, reason: 'nothing_to_save' });
    expect(planImportRecipes({ ...base, ctx: ctx(), items: [{ target: { kind: 'new', name: 'X' }, lines: [{ ...line, material: { existingId: 'gone' } }] }] })).toEqual({ ok: false, reason: 'unknown_material' });
    expect(planImportRecipes({ ...base, ctx: ctx(), items: [{ target: { kind: 'new', name: 'X' }, lines: [{ ...line, amount: 0 }] }] })).toEqual({ ok: false, reason: 'invalid_amount' });
    expect(planImportRecipes({ ...base, ctx: ctx(), items: [{ target: { kind: 'existing', menuItemId: 'gone', mode: 'add' }, lines: [line] }] })).toEqual({ ok: false, reason: 'unknown_menu_item' });
    expect(planImportRecipes({ ...base, ctx: ctx(), items: [{ target: { kind: 'new', name: '  ' }, lines: [line] }] })).toEqual({ ok: false, reason: 'invalid_name' });
  });
});
