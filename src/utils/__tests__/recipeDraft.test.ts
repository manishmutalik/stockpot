import { describe, it, expect } from 'vitest';
import { asksWhatItIs, batchWeight, buildDraft, chooseLineMaterial, chooseUse, makesShown, makesUnitOf, measuredYield, recipeUnit, setMakes, setMakesUnit, draftIssues, draftToImport, keptPartsOf, keptPieceCost, lineCostPerItem, questionPrompt, resolveDraftLine, usedNewMaterials, type RecipeDraft } from '../recipeDraft';
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
    expect(messages).toContain('Whipped cream: do you sell it, mix it into another item, or make it ahead and keep it?');
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
    // What one batch makes is kept as the item's batch size.
    expect(out.items[0].batchMakes).toBe(12);
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

describe('a base made ahead and kept', () => {
  // A cream cake read with its sponge base: one batch of base makes 4.5.
  const cake: ParsedRecipe = { name: 'Pineapple Cake', makesAsWritten: 'one cake', makes: 1, looksLikeComponent: false, looksCutOff: false, ingredients: [ing('sugar', '100', 'g', { materialId: 'm_sugar' })] };
  const base: ParsedRecipe = { name: 'Sponge base', makesAsWritten: 'makes 4 to 5', looksLikeComponent: true, looksCutOff: false, ingredients: [ing('maida', '900', 'g', { materialId: 'm_flour' }), ing('eggs', '9', 'none', { materialId: 'm_eggs' })] };
  const kept = (over: Partial<{ of: string | null; perItem: number | null }> = {}) => {
    const d = buildDraft({ recipes: [cake, base], moreNotRead: false }, { materials, menu, fromPhotos: true });
    d.recipes[1].use = { kind: 'kept', of: 'recipe:r1', perItem: 1, ...over };
    d.recipes[1].makes = 4.5;
    return d;
  };

  it('asks its batch size, and how many go into one of the item it is used in', () => {
    const d = kept({ perItem: null });
    d.recipes[1].makes = null;
    d.recipes[1].name = ' ';
    const messages = draftIssues(d, materials, menu).map(i => i.message);
    expect(messages).toEqual(expect.arrayContaining(['Give the item made ahead a name.', 'A recipe: how many does one batch make?', 'A recipe: how many go into one Pineapple Cake?']));
    // Not used in anything yet is fine: it is saved on its own.
    expect(draftIssues(kept({ of: null, perItem: null }), materials, menu)).toEqual([]);
  });

  it('costs one piece, and adds it to the item it goes into', () => {
    const d = kept();
    // 900 g maida (₹40.50) and 9 eggs (₹63) for 4.5: ₹23 a base.
    expect(keptPieceCost(d, d.recipes[1], materials)).toBe(23);
    expect(keptPartsOf(d, d.recipes[0], materials)).toEqual([{ key: 'r2', name: 'Sponge base', perItem: 1, unit: 'pcs', cost: 23 }]);
  });

  it('is saved as its own item, not sold, with its batch size, and linked into the cake (made when ordered)', () => {
    const d = kept();
    d.recipes[0].madeToOrder = true;
    const out = draftToImport(d, materials, menu)!;
    expect(out.items.map(i => i.target)).toEqual([{ kind: 'new', name: 'Sponge base' }, { kind: 'new', name: 'Pineapple Cake' }]);
    expect(out.items[0]).toMatchObject({ key: 'recipe:r2', notForSale: true, batchMakes: 4.5 });
    expect(out.items[0].lines.map(l => [l.amount, l.unit])).toEqual([[200, 'g'], [2, 'pcs']]);
    expect(out.items[1]).toMatchObject({ madeToOrder: true, parts: [{ item: { newKey: 'recipe:r2' }, quantity: 1 }] });

    let n = 0;
    const plan = planImportRecipes({ ...out, materials, menu, today: '2026-10-14', ctx: { newId: () => `id${++n}`, now: () => 0 } });
    expect(plan.ok).toBe(true);
    if (plan.ok !== true) return;
    const [baseDoc, cakeDoc] = plan.writes.map(w => w.data);
    expect(baseDoc).toMatchObject({ id: 'id1', name: 'Sponge base', notForSale: true, batchMakes: 4.5 });
    expect(cakeDoc).toMatchObject({ id: 'id2', name: 'Pineapple Cake', madeToOrder: true, parts: [{ itemId: 'id1', quantity: 1 }] });
  });

  it('can be used in an item already on the menu, which keeps its recipe and gains the part', () => {
    const d = kept({ of: 'menu:menu_cake', perItem: 0.5 });
    d.recipes[0].include = false;
    const out = draftToImport(d, materials, menu)!;
    expect(out.items[1]).toEqual({ target: { kind: 'existing', menuItemId: 'menu_cake', mode: 'add' }, lines: [], parts: [{ item: { newKey: 'recipe:r2' }, quantity: 0.5 }] });
  });

  it('links an item already on the menu by its own id when the base replaces its recipe', () => {
    const d = kept();
    d.recipes[1].target = { kind: 'existing', menuItemId: 'menu_cake', mode: 'replace' };
    const out = draftToImport(d, materials, menu)!;
    expect(out.items[0]).not.toHaveProperty('notForSale');
    expect(out.items[1].parts).toEqual([{ item: { existingId: 'menu_cake' }, quantity: 1 }]);
  });
});

describe('a ganache made ahead and kept by weight', () => {
  const chocolate = mat('m_choc', 'Dark chocolate', 'kg', 800);
  const creamMat = mat('m_cream', 'Whipping cream', 'l', 400);
  const mats = [...materials, chocolate, creamMat];
  const cake: ParsedRecipe = { name: 'Truffle Cake', makesAsWritten: 'one cake', makes: 1, looksLikeComponent: false, looksCutOff: false, ingredients: [ing('sugar', '100', 'g', { materialId: 'm_sugar' })] };
  const ganache = (makesAsWritten?: string, makes?: number): ParsedRecipe => ({
    name: 'Chocolate ganache', ...(makesAsWritten && { makesAsWritten }), ...(makes && { makes }), looksLikeComponent: true, looksCutOff: false,
    ingredients: [ing('dark chocolate', '400', 'g', { materialId: 'm_choc' }), ing('cream', '400', 'ml', { materialId: 'm_cream' })],
  });
  const draft = (g: ParsedRecipe) => buildDraft({ recipes: [cake, g], moreNotRead: false }, { materials: mats, menu, fromPhotos: false });

  it('reads a yield written as a weight or volume', () => {
    expect(measuredYield('makes 800 g')).toEqual({ unit: 'kg', amount: 0.8, writtenIn: 'g' });
    expect(measuredYield('about 1.5 kg')).toEqual({ unit: 'kg', amount: 1.5, writtenIn: 'kg' });
    expect(measuredYield('1/2 kg')).toEqual({ unit: 'kg', amount: 0.5, writtenIn: 'kg' });
    expect(measuredYield('750ml')).toEqual({ unit: 'l', amount: 0.75, writtenIn: 'ml' });
    expect(measuredYield('2 litres')).toEqual({ unit: 'l', amount: 2, writtenIn: 'l' });
    expect(measuredYield('makes 12')).toBeNull();
    expect(measuredYield('one 8 inch cake')).toBeNull();
    expect(measuredYield(undefined)).toBeNull();
  });

  it('never takes "makes 800 g" as 800 pieces, and counts it in kg once it is made ahead and kept', () => {
    // Not flagged as a component by the reader: a yield by weight still asks what it is.
    const d = draft({ ...ganache('makes 800 g', 800), looksLikeComponent: false });
    const g = d.recipes[1];
    expect(g.makes).toBeNull();
    expect(g.use).toEqual({ kind: 'undecided' });
    expect(asksWhatItIs(g)).toBe(true);
    expect(asksWhatItIs(d.recipes[0])).toBe(false);
    expect(g.measuredYield).toEqual({ unit: 'kg', amount: 0.8, writtenIn: 'g' });
    chooseUse(g, 'kept');
    expect(g).toMatchObject({ countedIn: 'kg', makes: 0.8, use: { kind: 'kept', of: null, perItem: null } });
    expect(recipeUnit(g, menu)).toBe('kg');
    // Shown as written: 800 g.
    expect(makesUnitOf(g, menu)).toBe('g');
    expect(makesShown(g, menu)).toBe(800);
    chooseUse(g, 'part');
    expect(g.countedIn).toBeUndefined();
    expect(g.makes).toBeNull();
    // Sold, it starts in pieces: a weight is not a number of pieces.
    chooseUse(g, 'sell');
    expect(recipeUnit(g, menu)).toBe('pcs');
    expect(g.makes).toBeNull();
  });

  it('takes "One batch makes" with its unit, and keeps the number when the unit changes: 1.5 becomes 1.5 kg', () => {
    const d = draft(ganache('makes 4', 4));
    const g = d.recipes[1];
    chooseUse(g, 'kept');
    expect(g).toMatchObject({ makes: 4, use: { perItem: 1 } });
    expect(makesUnitOf(g, menu)).toBe('pcs');
    setMakes(g, 1.5, menu);
    expect(g.makes).toBe(1.5);
    setMakesUnit(g, 'kg', menu);
    // Counted in kg now: the 1.5 is 1.5 kg, and how much goes into one is asked afresh (grams, not pieces).
    expect(g).toMatchObject({ countedIn: 'kg', makes: 1.5, use: { perItem: null } });
    expect(recipeUnit(g, menu)).toBe('kg');
    setMakesUnit(g, 'g', menu);
    // Typed in grams, the same number is 1.5 g: the number stays as typed, the unit says what it is.
    expect(g.makes).toBe(0.0015);
    setMakes(g, 1500, menu);
    expect(g.makes).toBe(1.5);
    setMakesUnit(g, 'pcs', menu);
    expect(g.countedIn).toBeUndefined();
    expect(g).toMatchObject({ makes: 1500, use: { perItem: 1 } });
  });

  it('flags a sold recipe counted by weight: selling by weight comes later', () => {
    const d = draft({ ...ganache('makes 4', 4), name: 'Fudge' });
    const g = d.recipes[1];
    chooseUse(g, 'sell');
    setMakesUnit(g, 'kg', menu);
    expect(draftIssues(d, mats, menu).map(i => i.message)).toContain('Fudge: selling by weight is not available yet. Say how many pieces one batch makes, or choose "Made ahead and kept" to keep it by weight.');
    setMakesUnit(g, 'pcs', menu);
    expect(draftIssues(d, mats, menu).some(i => i.message.startsWith('Fudge: selling by weight'))).toBe(false);
  });

  it('keeps the unit of an item already on the menu', () => {
    const onMenu = [{ id: 'g1', name: 'Chocolate ganache', countedIn: 'kg' as const }];
    const d = buildDraft({ recipes: [ganache('makes 4', 4)], moreNotRead: false }, { materials: mats, menu: onMenu, fromPhotos: false });
    const g = d.recipes[0];
    chooseUse(g, 'kept', onMenu);
    setMakesUnit(g, 'pcs', onMenu);
    expect(recipeUnit(g, onMenu)).toBe('kg');
    setMakesUnit(g, 'g', onMenu);
    expect(makesUnitOf(g, onMenu)).toBe('g');
  });

  it('suggests the batch size from what the ingredients weigh', () => {
    const d = draft(ganache());
    const g = d.recipes[1];
    chooseUse(g, 'kept');
    setMakesUnit(g, 'kg', menu);
    expect(batchWeight(d, g, mats)).toBe(0.8);
  });

  it('costs a kg, asks how much goes into the cake, and saves it counted in kg, linked in kg', () => {
    const d = draft(ganache('makes 800 g'));
    const g = d.recipes[1];
    chooseUse(g, 'kept');
    g.use = { kind: 'kept', of: 'recipe:r1', perItem: null };
    expect(draftIssues(d, mats, menu).map(i => i.message)).toContain('Chocolate ganache: how much goes into one Truffle Cake?');
    g.use.perItem = 0.15;
    // 400 g chocolate (₹320) and 400 ml cream (₹160) make 0.8 kg: ₹600 a kg; 150 g of it in a cake is ₹90.
    expect(keptPieceCost(d, g, mats)).toBe(600);
    expect(keptPartsOf(d, d.recipes[0], mats)).toEqual([{ key: 'r2', name: 'Chocolate ganache', perItem: 0.15, unit: 'kg', cost: 600 }]);
    const out = draftToImport(d, mats, menu)!;
    expect(out.items[0]).toMatchObject({ notForSale: true, countedIn: 'kg', batchMakes: 0.8 });
    // The recipe is per kg: 500 g chocolate and 500 ml cream.
    expect(out.items[0].lines.map(l => [l.amount, l.unit])).toEqual([[500, 'g'], [500, 'ml']]);
    expect(out.items[1].parts).toEqual([{ item: { newKey: 'recipe:r2' }, quantity: 0.15 }]);

    let n = 0;
    const plan = planImportRecipes({ ...out, materials: mats, menu, today: '2026-10-15', ctx: { newId: () => `id${++n}`, now: () => 0 } });
    expect(plan.ok).toBe(true);
    if (plan.ok !== true) return;
    const [ganacheDoc, cakeDoc] = plan.writes.map(w => w.data);
    expect(ganacheDoc).toMatchObject({ name: 'Chocolate ganache', notForSale: true, countedIn: 'kg', batchMakes: 0.8 });
    expect(cakeDoc).toMatchObject({ parts: [{ itemId: 'id1', quantity: 0.15 }] });
  });

  it('follows the unit of an item already on the menu', () => {
    const d = buildDraft({ recipes: [ganache('makes 800 g')], moreNotRead: false }, { materials: mats, menu: [{ id: 'g1', name: 'Chocolate ganache', countedIn: 'kg' }], fromPhotos: false });
    const g = d.recipes[0];
    chooseUse(g, 'kept', [{ id: 'g1', name: 'Chocolate ganache', countedIn: 'kg' }]);
    expect(g.target).toEqual({ kind: 'existing', menuItemId: 'g1', mode: 'replace' });
    expect(g).toMatchObject({ countedIn: 'kg', makes: 0.8 });
    expect(recipeUnit(g, [{ id: 'g1', name: 'Chocolate ganache', countedIn: 'kg' }])).toBe('kg');
    expect(recipeUnit(g, [{ id: 'g1', name: 'Chocolate ganache' }])).toBe('pcs');
    // Kept in pieces on the menu: so it is here, whatever the recipe says.
    chooseUse(g, 'kept', [{ id: 'g1', name: 'Chocolate ganache' }]);
    expect(g.countedIn).toBeUndefined();
    expect(g.use).toEqual({ kind: 'kept', of: null, perItem: 1 });
  });
});

describe('the ganache from the field: 150 g chocolate, 250 g cream, 15 g butter, makes 400 g', () => {
  it('is saved per kg: 375 g chocolate, 625 g cream, 37.5 g butter', () => {
    const mats = [mat('m_choc', 'Chocolate', 'kg', 800), mat('m_cream', 'Amul cream', 'kg', 220), mat('m_butter', 'Butter', 'kg', 560)];
    const recipe: ParsedRecipe = {
      name: 'Chocolate ganache', makesAsWritten: 'Yield: 400gm', makes: 400, looksLikeComponent: false, looksCutOff: false,
      ingredients: [ing('Chocolate', '150', 'g', { materialId: 'm_choc' }), ing('Amul cream', '250', 'g', { materialId: 'm_cream' }), ing('Butter', '15', 'g', { materialId: 'm_butter' })],
    };
    const d = buildDraft({ recipes: [recipe], moreNotRead: false }, { materials: mats, menu: [], fromPhotos: false });
    chooseUse(d.recipes[0], 'kept');
    expect(d.recipes[0]).toMatchObject({ countedIn: 'kg', makes: 0.4 });
    const out = draftToImport(d, mats, [])!;
    expect(out.items[0]).toMatchObject({ countedIn: 'kg', batchMakes: 0.4 });
    expect(out.items[0].lines.map(l => [l.amount, l.unit])).toEqual([[375, 'g'], [625, 'g'], [37.5, 'g']]);
  });
});
