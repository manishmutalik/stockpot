import { describe, it, expect } from 'vitest';
import { heapedFactor, isCountedByThePiece, matchMaterialByName, parseAmount, perItem, recipeUnitFor, resolveLine, suggestMaterialUnit, typicalWeightFor, type LineInput } from '../kitchenMeasures';
import type { ParsedIngredient } from '../recipeParse';

const ing = (over: Partial<ParsedIngredient> = {}): ParsedIngredient => ({
  nameAsWritten: 'maida', amountAsWritten: '2', amount: 2, unitAsWritten: 'cups', unit: 'cup', kind: 'other', materialId: 'm1', unclear: false, ...over,
});
const line = (over: Partial<LineInput> = {}, ingredient: Partial<ParsedIngredient> = {}): LineInput => ({
  ingredient: ing(ingredient), materialUnit: 'kg', materialName: 'Maida (All-Purpose)', costPerUnit: 45, makes: 12, ...over,
});

describe('parseAmount', () => {
  it.each([
    ['2', 2], ['2.5', 2.5], ['1/2', 0.5], ['1 1/2', 1.5], ['1½', 1.5], ['½', 0.5], ['¾', 0.75],
    ['two', 2], ['half', 0.5], ['a', 1], ['dedh', 1.5], ['dhai', 2.5], ['aadha', 0.5], ['sava 2', 2.25], ['paune 2', 1.75],
    ['2 dozen', 24], ['1,000', 1000],
  ])('reads "%s" as %s', (written, value) => {
    expect(parseAmount(written)).toBeCloseTo(value, 6);
  });
  it.each(['2-3', '2 to 3', 'few', '', 'some'])('leaves "%s" for the owner', written => {
    expect(parseAmount(written)).toBeNull();
  });
});

describe('typical weights and names', () => {
  it('finds the most specific name, in English, Hindi and Devanagari', () => {
    expect(typicalWeightFor('icing sugar')?.gramsPerTsp).toBe(2.5);
    expect(typicalWeightFor('chini')?.gramsPerTsp).toBe(4.2);
    expect(typicalWeightFor('हल्दी')?.gramsPerTsp).toBe(3);
    expect(typicalWeightFor('Garam Masala (MDH)')?.gramsPerTsp).toBe(2);
    expect(typicalWeightFor('jeera powder')?.gramsPerTsp).toBe(2.1);
    expect(typicalWeightFor('dragon fruit')).toBeNull();
    // The last word says what it is
    expect(typicalWeightFor('Full Cream Milk')?.names[0]).toBe('milk');
    expect(typicalWeightFor('fresh cream')?.names[0]).toBe('cream');
  });
  it('matches an ingredient to the owner\'s material by name, never to a different thing', () => {
    const materials = [{ id: 's', name: 'Sugar' }, { id: 'i', name: 'Icing Sugar' }, { id: 'b', name: 'Unsalted Butter' }];
    expect(matchMaterialByName('chini', materials)?.id).toBe('s');
    expect(matchMaterialByName('makhan', materials)?.id).toBe('b');
    expect(matchMaterialByName('powdered sugar', materials)?.id).toBe('i');
    expect(matchMaterialByName('cocoa', materials)).toBeNull();
    expect(matchMaterialByName('fresh cream', [{ id: 'm', name: 'Full Cream Milk' }])).toBeNull();
    // Two butters: the owner chooses
    expect(matchMaterialByName('butter', [...materials, { id: 'b2', name: 'Salted Butter' }])).toBeNull();
  });
  it('suggests the unit a new material is kept in', () => {
    expect(suggestMaterialUnit(ing({ nameAsWritten: 'vanilla essence', unit: 'tsp' }))).toBe('ml');
    expect(suggestMaterialUnit(ing({ nameAsWritten: 'garam masala', unit: 'tsp' }))).toBe('g');
    expect(suggestMaterialUnit(ing({ nameAsWritten: 'eggs', unit: 'none' }))).toBe('pcs');
    expect(suggestMaterialUnit(ing({ nameAsWritten: 'cream', unit: 'ml' }))).toBe('ml');
  });
  it('keeps recipe lines in g, ml or the material\'s own unit', () => {
    expect([recipeUnitFor('kg'), recipeUnitFor('l'), recipeUnitFor('pcs')]).toEqual(['g', 'ml', 'pcs']);
  });
  it('counts heaped spoons as half as much again', () => {
    expect(heapedFactor('1', 'heaped tsp')).toBe(1.5);
    expect(heapedFactor('1', 'bhara chammach')).toBe(1.5);
    expect(heapedFactor('1', 'tsp')).toBe(1);
  });
});

describe('resolveLine', () => {
  it('weighs 2 cups of maida with the typical weight, since the guess costs little', () => {
    const r = resolveLine(line());
    expect(r).toMatchObject({ status: 'ok', recipeUnit: 'g', typical: true });
    if (r.status === 'ok') expect(r.batchAmount).toBeCloseTo(2 * 48 * 2.6, 6);
  });

  it('uses a staple\'s standard cup weight however much it costs, as for a cake\'s butter', () => {
    const r = resolveLine(line({ materialName: 'Unsalted Butter', costPerUnit: 570, makes: 1 }, { nameAsWritten: 'butter', amountAsWritten: '1' }));
    expect(r).toMatchObject({ status: 'ok', batchAmount: 225.6, typical: true });
  });

  it('asks about a cup of chocolate chips, where a guess could move the cost, suggesting the typical weight', () => {
    const chips = { nameAsWritten: 'choco chips', amountAsWritten: '1' };
    const r = resolveLine(line({ materialName: 'Chocolate Chips', costPerUnit: 600 }, chips));
    expect(r).toEqual({ status: 'ask', recipeUnit: 'g', question: { kind: 'measure_weight', measure: 'cup', suggestion: 168 } });
    const answered = resolveLine(line({ materialName: 'Chocolate Chips', costPerUnit: 600, answers: { gramsPerMeasure: 170 } }, chips));
    expect(answered).toMatchObject({ status: 'ok', batchAmount: 170, remember: { gramsPerTsp: 3.542 } });
  });

  it('uses a weight the owner confirmed before', () => {
    const r = resolveLine(line({ materialName: 'Garam Masala', gramsPerTsp: 2.4, costPerUnit: 800 }, { nameAsWritten: 'garam masala', amountAsWritten: '1', unit: 'tbsp', unitAsWritten: 'tbsp' }));
    expect(r).toMatchObject({ status: 'ok', batchAmount: 7.2, basis: '1 tbsp ≈ 7.2 g' });
  });

  it('gives an unlisted spice its kind\'s weight', () => {
    const r = resolveLine(line({ materialName: 'Kalonji', costPerUnit: 400 }, { nameAsWritten: 'kalonji', amountAsWritten: '1', unit: 'tsp', unitAsWritten: 'tsp', kind: 'whole_spice' }));
    expect(r).toMatchObject({ status: 'ok', batchAmount: 2.5, typical: true });
  });

  it('asks how much a spoon weighs when nothing is known', () => {
    expect(resolveLine(line({ materialName: 'Ragi Flour' }, { nameAsWritten: 'ragi flour', amountAsWritten: '1', unit: 'cup' }))).toMatchObject({ status: 'ask', question: { kind: 'measure_weight', measure: 'cup' } });
  });

  it('counts heaped spoons', () => {
    const r = resolveLine(line({ materialName: 'Haldi', costPerUnit: 300 }, { nameAsWritten: 'haldi', amountAsWritten: '1', unit: 'tsp', unitAsWritten: 'heaped tsp' }));
    expect(r).toMatchObject({ status: 'ok', batchAmount: 4.5 });
  });

  it('takes spoons of something kept in ml as millilitres', () => {
    expect(resolveLine(line({ materialUnit: 'ml', materialName: 'Vanilla Essence' }, { nameAsWritten: 'vanilla essence', amountAsWritten: '1', unit: 'tsp' }))).toMatchObject({ status: 'ok', batchAmount: 5, recipeUnit: 'ml' });
  });

  it('takes weights and volumes as written, in the recipe unit', () => {
    expect(resolveLine(line({}, { amountAsWritten: '1', unit: 'kg', unitAsWritten: 'kg' }))).toMatchObject({ status: 'ok', batchAmount: 1000, recipeUnit: 'g' });
    expect(resolveLine(line({ materialUnit: 'l' }, { nameAsWritten: 'milk', amountAsWritten: '200', unit: 'ml', unitAsWritten: 'ml' }))).toMatchObject({ status: 'ok', batchAmount: 200, recipeUnit: 'ml' });
  });

  it('always asks about a katori or a glass', () => {
    expect(resolveLine(line({}, { amountAsWritten: 'dedh', unit: 'katori', unitAsWritten: 'katori' }))).toMatchObject({ status: 'ask', question: { kind: 'household', measure: 'katori' } });
    expect(resolveLine(line({ answers: { batchAmount: 180 } }, { amountAsWritten: 'dedh', unit: 'katori', unitAsWritten: 'katori' }))).toMatchObject({ status: 'ok', batchAmount: 180 });
  });

  it('leaves out a pinch of something cheap, and asks about a pinch of kesar', () => {
    expect(resolveLine(line({ materialName: 'Salt', costPerUnit: 20 }, { nameAsWritten: 'salt', amountAsWritten: undefined, amount: undefined, unit: 'pinch', unitAsWritten: 'pinch' }))).toMatchObject({ status: 'ok', batchAmount: 0, skipped: true });
    expect(resolveLine(line({ materialName: 'Kesar', costPerUnit: undefined }, { nameAsWritten: 'kesar', unit: 'pinch' }))).toMatchObject({ status: 'ask', question: { kind: 'pinch' } });
    expect(resolveLine(line({ materialName: 'Kesar', answers: { batchAmount: 0.05 } }, { nameAsWritten: 'kesar', unit: 'pinch' }))).toMatchObject({ status: 'ok', batchAmount: 0.05 });
  });

  it('counts pieces for a material kept in pieces, and asks what one weighs for one kept by weight', () => {
    expect(resolveLine(line({ materialUnit: 'pcs', materialName: 'Eggs' }, { nameAsWritten: 'eggs', amountAsWritten: '2', unit: 'none', unitAsWritten: undefined }))).toMatchObject({ status: 'ok', batchAmount: 2, recipeUnit: 'pcs' });
    expect(resolveLine(line({ materialName: 'Cardamom' }, { nameAsWritten: 'elaichi', amountAsWritten: '4', unit: 'piece' }))).toEqual({ status: 'ask', recipeUnit: 'g', question: { kind: 'piece_weight' } });
    expect(resolveLine(line({ materialName: 'Cardamom', answers: { gramsPerPiece: 0.2 } }, { nameAsWritten: 'elaichi', amountAsWritten: '4', unit: 'piece' }))).toMatchObject({ status: 'ok', batchAmount: 0.8, remember: { gramsPerPiece: 0.2 } });
  });

  it('asks for an amount that is not written or is a range', () => {
    expect(resolveLine(line({}, { amountAsWritten: undefined, amount: undefined, unit: 'g' }))).toMatchObject({ status: 'ask', question: { kind: 'amount' } });
    expect(resolveLine(line({}, { amountAsWritten: '2-3', amount: 2.5, unit: 'g' }))).toMatchObject({ status: 'ask', question: { kind: 'amount' } });
    // A word code does not know is taken as the model read it
    expect(resolveLine(line({}, { amountAsWritten: 'saadhe teen', amount: 3.5, unit: 'g' }))).toMatchObject({ status: 'ok', batchAmount: 3.5 });
  });

  it('divides a batch into one item\'s share', () => {
    expect(perItem(250, 12)).toBeCloseTo(20.8333, 4);
  });
});

describe('isCountedByThePiece', () => {
  it('knows eggs are counted, in any of their names, and nothing else is', () => {
    for (const name of ['Eggs', 'egg', 'Farm eggs', 'Anda', 'अंडा']) expect(isCountedByThePiece(name)).toBe(true);
    for (const name of ['Eggless premix', 'Maida', 'Butter', '']) expect(isCountedByThePiece(name)).toBe(false);
  });
});
