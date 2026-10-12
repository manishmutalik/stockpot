import { describe, it, expect } from 'vitest';
import { base64Bytes, checkRecipePhoto, prepareRecipeText, RECIPE_MAX_RECIPES, validateParsedRecipes } from '../recipeParse';

const TEXT = `Chocolate Cupcakes (makes 12)
2 cups maida
1 cup sugar
100g makhan, softened
2 eggs
1 tsp vanilla essence

Whipped cream
200 ml cream
2 tbsp icing sugar`;

const ing = (over: Record<string, unknown> = {}) => ({
  nameAsWritten: 'maida', amountAsWritten: '2', amount: 2, unitAsWritten: 'cups', unit: 'cup', kind: 'other',
  materialId: 'm_flour', unclear: false, note: null, ...over,
});
const recipe = (over: Record<string, unknown> = {}) => ({
  name: 'Chocolate Cupcakes', makesAsWritten: 'makes 12', makes: 12, looksLikeComponent: false, looksCutOff: false, notes: null,
  ingredients: [ing()], ...over,
});
const check = (raw: unknown, text: string | null = TEXT) => validateParsedRecipes(raw, { text, materialIds: ['m_flour', 'm_sugar'] });
const problemsOf = (r: ReturnType<typeof check>): string[] => (r.ok === false ? r.problems : []);

describe('validateParsedRecipes', () => {
  it('accepts a reading of several recipes, keeping what was written', () => {
    const result = check({
      recipes: [
        recipe({ ingredients: [ing(), ing({ nameAsWritten: 'makhan', amountAsWritten: '100', amount: 100, unitAsWritten: 'g', unit: 'g', materialId: null, note: 'softened' })] }),
        recipe({ name: 'Whipped cream', makesAsWritten: null, makes: null, looksLikeComponent: true, ingredients: [ing({ nameAsWritten: 'cream', amountAsWritten: '200', amount: 200, unitAsWritten: 'ml', unit: 'ml', materialId: null })] }),
      ],
      moreNotRead: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.recipes).toHaveLength(2);
    expect(result.parsed.recipes[0]).toMatchObject({ name: 'Chocolate Cupcakes', makes: 12, makesAsWritten: 'makes 12' });
    expect(result.parsed.recipes[0].ingredients[1]).toEqual({ nameAsWritten: 'makhan', amountAsWritten: '100', amount: 100, unitAsWritten: 'g', unit: 'g', kind: 'other', materialId: null, unclear: false, note: 'softened' });
    expect(result.parsed.recipes[1]).toMatchObject({ looksLikeComponent: true });
    expect(result.parsed.recipes[1].makes).toBeUndefined();
  });

  it('refuses names, amounts and units that are not in the text', () => {
    const result = check({ recipes: [recipe({ ingredients: [ing({ nameAsWritten: 'cocoa' }), ing({ amountAsWritten: '3' }), ing({ unitAsWritten: 'katori' })] })], moreNotRead: false });
    expect(result.ok).toBe(false);
    const problems = problemsOf(result).join(' ');
    expect(problems).toMatch(/"cocoa" is not written/);
    expect(problems).toMatch(/amount "3" is not written/);
    expect(problems).toMatch(/unit "katori" is not written/);
  });

  it('accepts anything as read from a photo, but still checks ids, units and numbers', () => {
    expect(check({ recipes: [recipe({ name: 'Rasmalai', ingredients: [ing({ nameAsWritten: 'doodh', unitAsWritten: 'litre', unit: 'l', amountAsWritten: '1' , amount: 1, materialId: null })] })], moreNotRead: false }, null).ok).toBe(true);
    const bad = check({ recipes: [recipe({ ingredients: [ing({ materialId: 'm_unknown' }), ing({ unit: 'bucket' }), ing({ amount: -1 })] })], moreNotRead: false }, null);
    expect(bad.ok).toBe(false);
    expect(problemsOf(bad)).toHaveLength(3);
  });

  it('does not let the model invent an amount it did not copy', () => {
    const result = check({ recipes: [recipe({ ingredients: [ing({ amountAsWritten: null, amount: 2 })] })], moreNotRead: false });
    expect(result.ok).toBe(false);
  });

  it('leaves a makes count that is not a whole number for the owner, and refuses one with no words for it', () => {
    const fraction = check({ recipes: [recipe({ makes: 1.5 })], moreNotRead: false });
    expect(fraction.ok && fraction.parsed.recipes[0].makes).toBeUndefined();
    expect(check({ recipes: [recipe({ makesAsWritten: null, makes: 12 })], moreNotRead: false }).ok).toBe(false);
  });

  it('limits how many recipes are read at once', () => {
    const many = Array.from({ length: RECIPE_MAX_RECIPES + 1 }, () => recipe());
    expect(check({ recipes: many, moreNotRead: true }).ok).toBe(false);
    const result = check({ recipes: [recipe()], moreNotRead: true });
    expect(result.ok && result.parsed.moreNotRead).toBe(true);
  });

  it('accepts a page with no recipe on it as an empty reading', () => {
    const result = check({ recipes: [], moreNotRead: false }, null);
    expect(result).toEqual({ ok: true, parsed: { recipes: [], moreNotRead: false } });
  });
});

describe('prepareRecipeText', () => {
  it('keeps lines, tidies spaces and removes phone numbers', () => {
    expect(prepareRecipeText('Cake  for  Priya 98450 10101\r\n\r\n\r\n2 cups   maida')).toBe('Cake for Priya [phone]\n\n2 cups maida');
  });
});

describe('checkRecipePhoto', () => {
  const jpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD' + 'A'.repeat(40);
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' + 'A'.repeat(40);
  it('accepts a JPEG or PNG that is what it says it is', () => {
    expect(checkRecipePhoto({ mediaType: 'image/jpeg', data: jpeg })).toEqual({ mediaType: 'image/jpeg', data: jpeg });
    expect(checkRecipePhoto({ mediaType: 'image/png', data: png })).not.toBeNull();
  });
  it('refuses a mismatched type, another type, bad base64 or a photo that is too large', () => {
    expect(checkRecipePhoto({ mediaType: 'image/png', data: jpeg })).toBeNull();
    expect(checkRecipePhoto({ mediaType: 'image/gif', data: jpeg })).toBeNull();
    expect(checkRecipePhoto({ mediaType: 'image/jpeg', data: jpeg + '<script>' })).toBeNull();
    expect(checkRecipePhoto({ mediaType: 'image/jpeg', data: '/9j/' + 'A'.repeat(3_400_000) })).toBeNull();
    expect(checkRecipePhoto('nope')).toBeNull();
  });
  it('counts decoded bytes', () => {
    expect(base64Bytes('QUJD')).toBe(3);
    expect(base64Bytes('QUI=')).toBe(2);
  });
});
