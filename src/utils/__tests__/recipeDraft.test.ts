import { describe, it, expect } from 'vitest';
import { buildDraft, chooseLineMaterial, draftIssues, draftToImport, lineCostPerItem, questionPrompt, resolveDraftLine, usedNewMaterials, type RecipeDraft } from '../recipeDraft';
import type { ParsedIngredient, ParsedRecipe, ParsedRecipes } from '../recipeParse';
import type { MenuItem, RawMaterial } from '../../types';
import { planImportRecipes } from '../plans/planRecipes';

const mat = (id: string, name: string, unit: string, costPerUnit: number): RawMaterial => ({ id, name, unit, costPerUnit, initialStock: 0, category: 'Raw Materials', dateAdded: '2026-01-01' });
const materials = [mat('m_flour', 'Maida', 'kg', 45), mat('m_sugar', 'Sugar', 'kg', 48), mat('m_chips', 'Chocolate Chips', 'kg', 600), mat('m_eggs', 'Eggs', 'pcs', 7)];
const menu: MenuItem[] = [{ id: 'menu_cake', name: 'Black Forest Cake', sellingPrice: 900, recipe: [] }];

const ing = (nameAsWritten: string, amountAsWritten: string, unit: ParsedIngredient['unit'], over: Partial<ParsedIngredient> = {}): ParsedIngredient => ({
  nameAsWritten, amountAsWritten, amount: Number(amountAsWritten) || undefined, unit, unitAsWritten: unit, kind: 'other', materialId: null, unclear: false, ...over,
});
const cupcakes: ParsedRecipe = {
  name: 'Vanilla Cupcakes', makesAsWritten: 'makes 12', makes: 12, looksLikeComponent: false, looksCutOff: false,
  ingredients: [ing('maida', '2', 'cup', { materialId: 'm_flour' }), ing('chini', '1', 'cup'), ing('eggs', '2', 'none'), ing('vanilla essence', '1', 'tsp')],
};
const cream: ParsedRecipe = {
  name: 'Whipped cream', looksLikeComponent: true, looksCutOff: false,
  ingredients: [ing('whipping cream', '200', 'ml'), ing('icing sugar', '2', 'tbsp'), ing('vanilla essence', '1/2', 'tsp')],
};
const parsed: ParsedRecipes = { recipes: [cupcakes, cream], moreNotRead: false };
const draftOf = (p: ParsedRecipes = parsed) => buildDraft(p, { materials, menu, fromPhotos: true });

describe('buildDraft', () => {
  it('matches what it can, makes one new material per name across recipes, and leaves a component undecided', () => {
    const d = draftOf();
    const [cup, wc] = d.recipes;
    expect(cup.lines.map(l => l.choice)).toEqual([
      { kind: 'existing', id: 'm_flour' }, { kind: 'existing', id: 'm_sugar' }, { kind: 'existing', id: 'm_eggs' }, { kind: 'new', key: 'n1' },
    ]);
    expect(wc.lines.map(l => l.choice)).toEqual([{ kind: 'new', key: 'n2' }, { kind: 'new', key: 'n3' }, { kind: 'new', key: 'n1' }]);
    expect(d.newMaterials).toEqual([
      { key: 'n1', name: 'Vanilla essence', unit: 'ml', pricePerBuyUnit: null },
      { key: 'n2', name: 'Whipping cream', unit: 'ml', pricePerBuyUnit: null },
      { key: 'n3', name: 'Icing sugar', unit: 'g', pricePerBuyUnit: null },
    ]);
    expect(cup.use).toEqual({ kind: 'sell' });
    expect(wc.use).toEqual({ kind: 'undecided' });
    expect(cup.target).toEqual({ kind: 'new' });
  });

  it('offers to replace the recipe of an existing item with the same name', () => {
    const d = draftOf({ recipes: [{ ...cupcakes, name: 'black forest cake' }], moreNotRead: false });
    expect(d.recipes[0].target).toEqual({ kind: 'existing', menuItemId: 'menu_cake', mode: 'replace' });
  });
});

describe('draftIssues', () => {
  it('lists what is still to settle', () => {
    const d = draftOf();
    const messages = draftIssues(d, materials, menu).map(i => i.message);
    expect(messages).toContain('Whipped cream: do you sell it, or is it part of another item?');
    // A cup of sugar at ₹48/kg is cheap enough to weigh with the typical weight; nothing asked about it.
    expect(messages.some(m => m.includes('chini'))).toBe(false);
  });

  it('asks how many a batch makes, and what a component is part of and covers', () => {
    const d = draftOf();
    d.recipes[0].makes = null;
    d.recipes[1].use = { kind: 'part', of: null, covers: null };
    const messages = draftIssues(d, materials, menu).map(i => i.message);
    expect(messages).toEqual(expect.arrayContaining(['Vanilla Cupcakes: how many does one batch make?', 'Whipped cream: which item is it part of?', 'Whipped cream: how many does one batch cover?']));
  });
});

describe('draftToImport', () => {
  const settled = (): RecipeDraft => {
    const d = draftOf();
    d.recipes[1].use = { kind: 'part', of: 'recipe:r1', covers: 12 };
    d.newMaterials[0].pricePerBuyUnit = 400; // vanilla essence ₹400 a litre
    return d;
  };

  it('works out each item\'s share, folding the component into the item it is part of', () => {
    const d = settled();
    expect(draftIssues(d, materials, menu)).toEqual([]);
    const out = draftToImport(d, materials, menu)!;
    expect(out.items).toHaveLength(1);
    expect(out.items[0].target).toEqual({ kind: 'new', name: 'Vanilla Cupcakes' });
    const lines = out.items[0].lines.map(l => [JSON.stringify(l.material), l.amount, l.unit]);
    expect(lines).toEqual([
      ['{"existingId":"m_flour"}', 20.8, 'g'],          // 2 cups × 124.8 g ÷ 12
      ['{"existingId":"m_sugar"}', 16.8, 'g'],          // 1 cup × 201.6 g ÷ 12
      ['{"existingId":"m_eggs"}', 0.1667, 'pcs'],       // 2 ÷ 12
      ['{"newKey":"n1"}', 0.4167, 'ml'],                // 5 ml ÷ 12
      ['{"newKey":"n2"}', 16.6667, 'ml'],               // cream: 200 ml ÷ 12 cupcakes covered
      ['{"newKey":"n3"}', 1.25, 'g'],                   // 2 tbsp icing sugar (7.5 g each) ÷ 12
      ['{"newKey":"n1"}', 0.2083, 'ml'],                // ½ tsp vanilla ÷ 12
    ]);
    expect(out.newMaterials).toEqual([
      { key: 'n1', name: 'Vanilla essence', unit: 'ml', costPerUnit: 0.4 },
      { key: 'n2', name: 'Whipping cream', unit: 'ml' },
      { key: 'n3', name: 'Icing sugar', unit: 'g' },
    ]);
  });

  it('saves through the plan, with the same material from cake and cream as one line', () => {
    const out = draftToImport(settled(), materials, menu)!;
    let n = 0;
    const plan = planImportRecipes({ ...out, materials, menu, today: '2026-10-12', ctx: { newId: () => `id${++n}`, now: () => 0 } });
    if (plan.ok !== true) throw new Error('plan failed');
    const recipe = (plan.writes.find(w => w.collection === 'menu')!.data as unknown as MenuItem).recipe;
    const vanilla = recipe.filter(l => l.materialId === plan.newMaterialIds.n1);
    expect(vanilla).toHaveLength(1);
    expect(vanilla[0].amount).toBeCloseTo(0.625, 4);
  });

  it('asks about a cup of chocolate chips and remembers the answer on the material', () => {
    const d = draftOf({ recipes: [{ ...cupcakes, ingredients: [ing('choco chips', '1', 'cup')] }], moreNotRead: false });
    const line = d.recipes[0].lines[0];
    expect(line.choice).toEqual({ kind: 'existing', id: 'm_chips' });
    expect(resolveDraftLine(d, d.recipes[0], line, materials)).toMatchObject({ status: 'ask', question: { kind: 'measure_weight', suggestion: 168 } });
    expect(draftToImport(d, materials, menu)).toBeNull();
    line.answers = { gramsPerMeasure: 170 };
    const out = draftToImport(d, materials, menu)!;
    expect(out.remember).toEqual([{ materialId: 'm_chips', gramsPerTsp: 3.542 }]);
    expect(out.items[0].lines[0].amount).toBeCloseTo(14.1667, 4);
    expect(lineCostPerItem(d, d.recipes[0], line, materials)).toBeCloseTo(14.1667 * 0.6, 3);
  });

  it('adds a component to an existing menu item', () => {
    const d = draftOf({ recipes: [cream], moreNotRead: false });
    d.recipes[0].use = { kind: 'part', of: 'menu:menu_cake', covers: 2 };
    const out = draftToImport(d, materials, menu)!;
    expect(out.items[0].target).toEqual({ kind: 'existing', menuItemId: 'menu_cake', mode: 'add' });
    expect(out.items[0].lines[0].amount).toBe(100);
  });

  it('leaves out unticked recipes, skipped lines and their unused new materials', () => {
    const d = settled();
    d.recipes[1].include = false;
    d.recipes[0].lines[3].choice = { kind: 'skip' };
    expect(usedNewMaterials(d)).toEqual([]);
    const out = draftToImport(d, materials, menu)!;
    expect(out.items[0].lines).toHaveLength(3);
    expect(out.newMaterials).toEqual([]);
  });
});

describe('chooseLineMaterial', () => {
  it('points a line at another material, a new one named after it (made once), or none, and asks again', () => {
    const d = draftOf();
    const line = d.recipes[0].lines[1]; // chini, matched to Sugar
    line.answers = { gramsPerMeasure: 200 };
    chooseLineMaterial(d, line, { kind: 'new_from_line' });
    expect(line.choice).toEqual({ kind: 'new', key: 'n4' });
    expect(d.newMaterials[3]).toEqual({ key: 'n4', name: 'Chini', unit: 'g', pricePerBuyUnit: null });
    expect(line.answers).toEqual({});
    const again = d.recipes[0].lines[0];
    again.ingredient = { ...again.ingredient, nameAsWritten: 'chini' };
    chooseLineMaterial(d, again, { kind: 'new_from_line' });
    expect(again.choice).toEqual({ kind: 'new', key: 'n4' });
    expect(d.newMaterials).toHaveLength(4);
    chooseLineMaterial(d, line, { kind: 'skip' });
    expect(line.choice).toEqual({ kind: 'skip' });
    chooseLineMaterial(d, line, { kind: 'existing', id: 'm_sugar' });
    expect(line.choice).toEqual({ kind: 'existing', id: 'm_sugar' });
  });
});

describe('questionPrompt', () => {
  const line = draftOf().recipes[0].lines[0];
  it('puts each kind of question in words, with the unit and what an answer sets', () => {
    const w = questionPrompt({ kind: 'measure_weight', measure: 'cup', suggestion: 125 }, line, 'Maida', 'g');
    expect(w).toMatchObject({ prompt: '1 cup of Maida weighs', unit: 'g', suggestion: 125, canLeaveOut: false });
    expect(w.answer(120)).toEqual({ gramsPerMeasure: 120 });
    expect(questionPrompt({ kind: 'piece_weight' }, line, 'Eggs', 'g').answer(50)).toEqual({ gramsPerPiece: 50 });
    expect(questionPrompt({ kind: 'household', measure: 'katori' }, line, 'Maida', 'g').prompt).toBe('How much is 2 katori, for the whole batch?');
    const pinch = questionPrompt({ kind: 'pinch' }, line, 'Saffron', 'g');
    expect(pinch).toMatchObject({ canLeaveOut: true, unit: 'g' });
    expect(pinch.answer(0.5)).toEqual({ batchAmount: 0.5 });
  });
});
