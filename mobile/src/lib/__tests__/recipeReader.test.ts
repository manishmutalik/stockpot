import { describe, it, expect, vi } from 'vitest';
import { ApiError } from '../api';
import {
  RECIPE_READ_PATH, RECIPE_READ_TIMEOUT_MS, RECIPE_SAVE_PATH, readNumber, readRecipe, recipeAvailability, recipeReadBody, recipeReadingLabel,
  recipesToSave, savedSummary, saveRecipes,
} from '../recipeReader';
import { buildDraft } from '../../../../src/utils/recipeDraft';

const materials = [{ id: 'm1', name: 'Maida', unit: 'kg', costPerUnit: 45 }];
const parsed = { moreNotRead: false, recipes: [{ name: 'Cupcakes', makes: 12, looksLikeComponent: false, looksCutOff: false, ingredients: [] }] };

describe('recipeAvailability', () => {
  it('says how many recipes are left today when reading is on', () => {
    expect(recipeAvailability({ available: true, limits: { recipe: { remaining: 9 } } })).toEqual({ available: true, remaining: 9 });
  });
  it('says why not, in words, when it is off', () => {
    expect(recipeAvailability({ available: false, reason: 'demo_account' })).toMatchObject({ available: false, message: expect.stringMatching(/demo/) });
    expect(recipeAvailability({ available: false, reason: 'not_allowed' })).toMatchObject({ available: false, message: expect.stringMatching(/not switched on/) });
    expect(recipeAvailability(null)).toMatchObject({ available: false });
  });
});

describe('recipeReadBody', () => {
  it('sends typed text, or the photos, with the materials as ids, names and units', () => {
    expect(recipeReadBody({ text: '  2 cups maida  ' }, materials)).toEqual({ text: '2 cups maida', materials: [{ id: 'm1', name: 'Maida', unit: 'kg' }] });
    const photo = { mediaType: 'image/jpeg' as const, data: 'abc' };
    expect(recipeReadBody({ photos: [photo] }, materials)).toMatchObject({ photos: [photo] });
  });
  it('refuses nothing to read, or too many photos', () => {
    expect(recipeReadBody({ text: ' ' }, materials)).toEqual({ error: 'Type or paste a recipe first.' });
    expect(recipeReadBody({ photos: [] }, materials)).toEqual({ error: 'Add a photo of the recipe first.' });
    const photo = { mediaType: 'image/jpeg' as const, data: 'abc' };
    expect(recipeReadBody({ photos: [photo, photo, photo, photo] }, materials)).toMatchObject({ error: expect.stringMatching(/Up to 3/) });
  });
});

describe('readRecipe', () => {
  it('asks the reader, waiting longer than usual, and returns what it read and how many are left', async () => {
    const post = vi.fn().mockResolvedValue({ parsed, remaining: 4 });
    expect(await readRecipe({ post } as any, { text: 'cupcakes' }, materials)).toEqual({ ok: true, parsed, remaining: 4 });
    expect(post).toHaveBeenCalledWith(RECIPE_READ_PATH, expect.objectContaining({ text: 'cupcakes' }), { timeoutMs: RECIPE_READ_TIMEOUT_MS });
  });
  it('turns every failure into words to show', async () => {
    const answer = (v: unknown) => readRecipe({ post: vi.fn().mockResolvedValue(v) } as any, { text: 'x' }, materials);
    const fail = (e: unknown) => readRecipe({ post: vi.fn().mockRejectedValue(e) } as any, { text: 'x' }, materials);
    expect(await answer({ parsed: null, code: 'unverified', error: 'I could not read that reliably.', remaining: 3 })).toEqual({ ok: false, message: 'I could not read that reliably.', remaining: 3 });
    expect(await answer({ parsed: { recipes: [], moreNotRead: false } })).toMatchObject({ ok: false, message: expect.stringMatching(/No recipe was found/) });
    expect(await fail(new ApiError(429, 'daily_limit', 'You have read 15 recipes today.'))).toEqual({ ok: false, message: 'You have read 15 recipes today.', remaining: 0 });
    expect(await fail(new ApiError(0, 'timeout', 'No connection.'))).toMatchObject({ message: expect.stringMatching(/took too long/) });
    expect(await fail(new ApiError(0, 'offline', 'No connection.'))).toMatchObject({ message: expect.stringMatching(/No connection/) });
    expect(await fail(new ApiError(413, 'error', 'x'))).toMatchObject({ message: expect.stringMatching(/too large/) });
  });
  it('does not ask the server when there is nothing to read', async () => {
    const post = vi.fn();
    expect(await readRecipe({ post } as any, { photos: [] }, materials)).toMatchObject({ ok: false });
    expect(post).not.toHaveBeenCalled();
  });
});

describe('saving', () => {
  it('sends what the check screen settled with the idempotency key', async () => {
    const post = vi.fn().mockResolvedValue({ menuItemIds: ['a'], newMaterials: 0 });
    const data = { items: [], newMaterials: [], remember: [] };
    await saveRecipes({ post } as any, data, 'key-1');
    expect(post).toHaveBeenCalledWith(RECIPE_SAVE_PATH, data, { idempotencyKey: 'key-1' });
  });
  it('counts only the ticked recipes sold on their own, and says what was saved', () => {
    const d = buildDraft({ moreNotRead: false, recipes: [parsed.recipes[0], { ...parsed.recipes[0], name: 'Ganache', looksLikeComponent: true }, { ...parsed.recipes[0], name: 'Cookies' }] }, { materials, menu: [], fromPhotos: true });
    d.recipes[1].use = { kind: 'part', of: 'recipe:r1', covers: 12 };
    d.recipes[2].include = false;
    expect(recipesToSave(d)).toBe(1);
    expect(savedSummary({ menuItemIds: ['a', 'b'], newMaterials: 1 })).toMatchObject({ title: '2 recipes saved', detail: expect.stringMatching(/one new material/) });
    expect(savedSummary({ menuItemIds: ['a'], newMaterials: 0 }).title).toBe('Recipe saved');
  });
});

describe('small helpers', () => {
  it('reads typed numbers, a comma as a decimal point', () => {
    expect(readNumber('12')).toBe(12);
    expect(readNumber('1,5')).toBe(1.5);
    expect(readNumber('')).toBeNull();
    expect(readNumber('0')).toBeNull();
    expect(readNumber('abc')).toBeNull();
  });
  it('says more as the wait goes on', () => {
    expect(recipeReadingLabel(0)).toBe('Reading the recipe…');
    expect(recipeReadingLabel(20_000)).toMatch(/up to a minute/);
  });
});

describe('wording', () => {
  it('says one recipe is on the menu, and units after "per" as they are said', async () => {
    const { perUnit } = await import('../recipeReader');
    expect(savedSummary({ menuItemIds: ['a'], newMaterials: 0 }).detail).toBe('It is on your menu now, with its cost worked out from your materials.');
    expect(perUnit('pcs')).toBe('piece');
    expect(perUnit('kg')).toBe('kg');
  });
});
