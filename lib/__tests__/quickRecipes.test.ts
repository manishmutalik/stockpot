import { describe, it, expect } from 'vitest';
import type { Response } from 'express';
import type { AuthedRequest } from '../auth';
import type { QuickRouteDeps } from '../quickRoutes';
import { createQuickRecipeSaveHandler, createQuickRecipeSetupHandler, readRecipeImportBody } from '../quickRecipes';
import type { RecipeSetupView } from '../../src/utils/quickApiTypes';
import { buildDraft, draftToImport } from '../../src/utils/recipeDraft';
import type { MenuItem, RawMaterial } from '../../src/types';
import { memoryQuickDb } from './memoryQuickDb';

const NOW = Date.parse('2026-10-13T06:30:00Z');
const UID = 'u1';

interface FakeRes { code: number; body: unknown; headers: Record<string, string>; status: (c: number) => FakeRes; json: (b: unknown) => FakeRes; setHeader: (k: string, v: string) => void }
const res = (): FakeRes => {
  const r = { code: 200, headers: {} } as FakeRes;
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
};
type Handler = (req: AuthedRequest, res: Response) => unknown;
const call = async (handler: Handler, req: Record<string, unknown>) => {
  const r = res();
  await handler({ uid: UID, headers: {}, query: {}, params: {}, ...req } as unknown as AuthedRequest, r as unknown as Response);
  return r;
};

function world() {
  const mem = memoryQuickDb(() => NOW);
  mem.seed(UID, 'settings', 'bakery', { name: 'Anita', timezone: 'Asia/Kolkata', currency: { code: 'INR', symbol: '₹' } });
  mem.seed(UID, 'materials', 'm_flour', { name: 'Maida', unit: 'kg', costPerUnit: 45, initialStock: 5, category: 'Raw Materials' });
  mem.seed(UID, 'materials', 'm_sugar', { name: 'Sugar', unit: 'kg', costPerUnit: 48, initialStock: 2, category: 'Raw Materials', gramsPerTsp: 4 });
  mem.seed(UID, 'menu', 'menu_cake', { name: 'Black Forest Cake', sellingPrice: 900, recipe: [{ materialId: 'm_sugar', amount: 50, unit: 'g' }] });
  let n = 0;
  const deps = { db: mem.db, now: () => NOW, newId: () => `id${++n}` } as unknown as QuickRouteDeps;
  return { mem, deps };
}
let k = 0;
const save = (deps: QuickRouteDeps, body: unknown) => call(createQuickRecipeSaveHandler(deps), { body, headers: { 'idempotency-key': `recipe-key-${String(++k).padStart(8, '0')}` } });

describe('GET /mobile/recipes/setup', () => {
  it('lists the materials and menu by name, with what the check screen needs, and the currency', async () => {
    const { deps } = world();
    const r = await call(createQuickRecipeSetupHandler(deps), {});
    const body = r.body as RecipeSetupView;
    expect(r.code).toBe(200);
    expect(body.materials).toEqual([
      { id: 'm_flour', name: 'Maida', unit: 'kg', costPerUnit: 45 },
      { id: 'm_sugar', name: 'Sugar', unit: 'kg', costPerUnit: 48, gramsPerTsp: 4 },
    ]);
    expect(body.menu).toEqual([{ id: 'menu_cake', name: 'Black Forest Cake' }]);
    expect(body.currency).toEqual({ code: 'INR', symbol: '₹' });
    expect(r.headers['Cache-Control']).toBe('private, no-store');
  });
});

describe('POST /mobile/recipes', () => {
  it('saves what the phone check screen settled, as the web does: a new item, a new material, a part folded in', async () => {
    const { mem, deps } = world();
    const setup = (await call(createQuickRecipeSetupHandler(deps), {})).body as RecipeSetupView;
    const draft = buildDraft({
      moreNotRead: false,
      recipes: [
        { name: 'Cupcakes', makes: 10, looksLikeComponent: false, looksCutOff: false, ingredients: [
          { nameAsWritten: 'maida', amountAsWritten: '200', amount: 200, unit: 'g', kind: 'other', materialId: 'm_flour', unclear: false },
          { nameAsWritten: 'cocoa', amountAsWritten: '50', amount: 50, unit: 'g', kind: 'other', materialId: null, unclear: false },
        ] },
        { name: 'Ganache', looksLikeComponent: true, looksCutOff: false, ingredients: [
          { nameAsWritten: 'sugar', amountAsWritten: '100', amount: 100, unit: 'g', kind: 'other', materialId: 'm_sugar', unclear: false },
        ] },
      ],
    }, { materials: setup.materials as unknown as RawMaterial[], menu: setup.menu as unknown as MenuItem[], fromPhotos: true });
    draft.recipes[0].sellingPrice = 60;
    draft.recipes[1].use = { kind: 'part', of: 'recipe:r1', covers: 10 };
    draft.newMaterials[0].pricePerBuyUnit = 800;
    const body = draftToImport(draft, setup.materials as unknown as RawMaterial[], setup.menu as unknown as MenuItem[]);
    expect(body).not.toBeNull();

    const r = await save(deps, JSON.parse(JSON.stringify(body)));
    expect(r.code).toBe(201);
    expect(r.body).toEqual({ menuItemIds: ['id3'], newMaterials: 1 });
    expect(mem.read(UID, 'materials', 'id1')).toMatchObject({ name: 'Cocoa', unit: 'g', costPerUnit: 0.8, initialStock: 0 });
    expect(mem.read(UID, 'menu', 'id3')).toMatchObject({
      name: 'Cupcakes', sellingPrice: 60,
      recipe: [{ materialId: 'm_flour', amount: 20, unit: 'g' }, { materialId: 'id1', amount: 5, unit: 'g' }, { materialId: 'm_sugar', amount: 10, unit: 'g' }],
    });
    // Matched materials keep their stock and price.
    expect(mem.read(UID, 'materials', 'm_flour')).toMatchObject({ initialStock: 5, costPerUnit: 45 });
  });

  it('replaces the recipe of an existing item, and remembers a confirmed spoon weight', async () => {
    const { mem, deps } = world();
    const r = await save(deps, {
      items: [{ target: { kind: 'existing', menuItemId: 'menu_cake', mode: 'replace' }, lines: [{ material: { existingId: 'm_flour' }, amount: 120, unit: 'g' }] }],
      newMaterials: [], remember: [{ materialId: 'm_flour', gramsPerTsp: 2.6 }],
    });
    expect(r.code).toBe(201);
    expect(mem.read(UID, 'menu', 'menu_cake').recipe).toEqual([{ materialId: 'm_flour', amount: 120, unit: 'g' }]);
    expect(mem.read(UID, 'materials', 'm_flour')).toMatchObject({ gramsPerTsp: 2.6, costPerUnit: 45 });
  });

  it('refuses a material or item deleted while the owner was checking, and saves nothing', async () => {
    const { mem, deps } = world();
    const r = await save(deps, {
      items: [{ target: { kind: 'new', name: 'Brownie' }, lines: [{ material: { existingId: 'm_gone' }, amount: 10, unit: 'g' }] }],
      newMaterials: [], remember: [],
    });
    expect(r.code).toBe(409);
    expect((r.body as { code: string }).code).toBe('unknown_material');
    expect(mem.stats.writes).toBe(0);
    const r2 = await save(deps, {
      items: [{ target: { kind: 'existing', menuItemId: 'menu_gone', mode: 'add' }, lines: [{ material: { existingId: 'm_flour' }, amount: 10, unit: 'g' }] }],
      newMaterials: [], remember: [],
    });
    expect(r2.code).toBe(409);
  });

  it('needs an idempotency key, and replays a retried save instead of saving twice', async () => {
    const { mem, deps } = world();
    const body = { items: [{ target: { kind: 'new', name: 'Brownie' }, lines: [{ material: { existingId: 'm_flour' }, amount: 10, unit: 'g' }] }], newMaterials: [], remember: [] };
    expect((await call(createQuickRecipeSaveHandler(deps), { body })).code).toBe(400);
    const headers = { 'idempotency-key': 'recipe-retry-0000001' };
    const a = await call(createQuickRecipeSaveHandler(deps), { body, headers });
    const b = await call(createQuickRecipeSaveHandler(deps), { body, headers });
    expect(a.code).toBe(201);
    expect(b.body).toEqual(a.body);
    expect(b.headers['Idempotent-Replayed']).toBe('true');
    expect(mem.all(UID, 'menu').filter(m => m.name === 'Brownie')).toHaveLength(1);
  });
});

describe('POST /mobile/recipes, a base made ahead and kept', () => {
  const sugarLine = { material: { existingId: 'm_sugar' }, amount: 10, unit: 'g' };
  const flourLine = { material: { existingId: 'm_flour' }, amount: 200, unit: 'g' };

  it('saves the base as its own item, not sold, and the cake with it as a part, made when ordered', async () => {
    const { mem, deps } = world();
    const r = await save(deps, { newMaterials: [], remember: [], items: [
      { key: 'recipe:r2', target: { kind: 'new', name: 'Sponge base' }, lines: [flourLine], batchMakes: 4.5, notForSale: true },
      { target: { kind: 'new', name: 'Pineapple cake', sellingPrice: 900 }, lines: [sugarLine], madeToOrder: true, parts: [{ item: { newKey: 'recipe:r2' }, quantity: 1 }] },
    ] });
    expect(r.code).toBe(201);
    expect(mem.read(UID, 'menu', 'id1')).toMatchObject({ name: 'Sponge base', notForSale: true, batchMakes: 4.5 });
    // Priced with its base: 10 g sugar (₹0.48) and 200 g maida (₹9).
    expect(mem.read(UID, 'menu', 'id2')).toMatchObject({ name: 'Pineapple cake', madeToOrder: true, parts: [{ itemId: 'id1', quantity: 1 }], costAtPricing: 9.48 });
  });

  it('adds a base to a cake already on the menu, and refuses a cake inside its own base', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'menu', 'menu_base', { name: 'Sponge base', sellingPrice: 0, notForSale: true, recipe: [], parts: [] });
    const added = await save(deps, { newMaterials: [], remember: [], items: [
      { target: { kind: 'existing', menuItemId: 'menu_cake', mode: 'add' }, lines: [], parts: [{ item: { existingId: 'menu_base' }, quantity: 1 }] },
    ] });
    expect(added.code).toBe(201);
    expect(mem.read(UID, 'menu', 'menu_cake')!.parts).toEqual([{ itemId: 'menu_base', quantity: 1 }]);
    const loop = await save(deps, { newMaterials: [], remember: [], items: [
      { target: { kind: 'existing', menuItemId: 'menu_base', mode: 'add' }, lines: [], parts: [{ item: { existingId: 'menu_cake' }, quantity: 1 }] },
    ] });
    expect(loop.code).toBe(422);
    expect((loop.body as { code: string }).code).toBe('part_loop');
  });
});

describe('POST /mobile/recipes, a ganache kept by weight', () => {
  it('lists an item counted by weight as such, and saves a new one counted in kg, used in grams', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'menu', 'menu_cream', { name: 'Whipped cream', sellingPrice: 0, notForSale: true, countedIn: 'l', recipe: [] });
    const setup = (await call(createQuickRecipeSetupHandler(deps), {})).body as RecipeSetupView;
    expect(setup.menu).toEqual([{ id: 'menu_cake', name: 'Black Forest Cake' }, { id: 'menu_cream', name: 'Whipped cream', countedIn: 'l' }]);

    const r = await save(deps, { newMaterials: [], remember: [], items: [
      { key: 'recipe:r2', target: { kind: 'new', name: 'Ganache' }, lines: [{ material: { existingId: 'm_sugar' }, amount: 500, unit: 'g' }], batchMakes: 0.8, notForSale: true, countedIn: 'kg' },
      { target: { kind: 'existing', menuItemId: 'menu_cake', mode: 'add' }, lines: [], parts: [{ item: { newKey: 'recipe:r2' }, quantity: 0.15 }] },
    ] });
    expect(r.code).toBe(201);
    expect(mem.read(UID, 'menu', 'id1')).toMatchObject({ name: 'Ganache', notForSale: true, countedIn: 'kg', batchMakes: 0.8 });
    expect(mem.read(UID, 'menu', 'menu_cake')!.parts).toEqual([{ itemId: 'id1', quantity: 0.15 }]);
  });

  it('refuses counting by weight on an item sold on the menu, or in a unit it does not know', () => {
    const line = { material: { existingId: 'm_flour' }, amount: 10, unit: 'g' };
    const body = (item: Record<string, unknown>) => ({ items: [{ target: { kind: 'new', name: 'Ganache' }, lines: [line], ...item }], newMaterials: [], remember: [] });
    expect(readRecipeImportBody(body({ notForSale: true, countedIn: 'kg' })).ok).toBe(true);
    expect(readRecipeImportBody(body({ countedIn: 'kg' })).ok).toBe(false);
    expect(readRecipeImportBody(body({ notForSale: true, countedIn: 'g' })).ok).toBe(false);
  });
});

describe('readRecipeImportBody', () => {
  const line = { material: { existingId: 'm_flour' }, amount: 10, unit: 'g' };
  const ok = { items: [{ target: { kind: 'new', name: 'Brownie', sellingPrice: 50 }, lines: [line] }], newMaterials: [], remember: [] };
  it('takes a well-formed import', () => {
    expect(readRecipeImportBody(ok)).toEqual({ ok: true, value: ok });
  });
  it('takes keys, parts, and items not sold or made when ordered, and refuses what does not fit', () => {
    const kept = { key: 'recipe:r2', target: { kind: 'new', name: 'Base' }, lines: [line], batchMakes: 4.5, notForSale: true };
    const cake = { target: { kind: 'new', name: 'Cake' }, lines: [line], madeToOrder: true, parts: [{ item: { newKey: 'recipe:r2' }, quantity: 1 }, { item: { existingId: 'menu_x' }, quantity: 0.5 }] };
    const body = { items: [kept, cake], newMaterials: [], remember: [] };
    expect(readRecipeImportBody(body)).toEqual({ ok: true, value: body });
    expect(readRecipeImportBody({ ...body, items: [kept, { ...cake, parts: [{ item: { newKey: 'recipe:r9' }, quantity: 1 }] }] }).ok).toBe(false);
    expect(readRecipeImportBody({ ...body, items: [kept, { ...cake, parts: [{ item: { existingId: 'menu_x' }, quantity: 0 }] }] }).ok).toBe(false);
    expect(readRecipeImportBody({ ...body, items: [kept, { ...kept }] }).ok).toBe(false);
    expect(readRecipeImportBody({ ...body, items: [{ ...kept, key: 'base' }] }).ok).toBe(false);
    expect(readRecipeImportBody({ ...body, items: [{ ...kept, notForSale: 'yes' }] }).ok).toBe(false);
  });

  it('keeps what one batch makes, when it is above nothing', () => {
    const batch = { ...ok, items: [{ ...ok.items[0], batchMakes: 4.5 }] };
    expect(readRecipeImportBody(batch)).toEqual({ ok: true, value: batch });
    expect(readRecipeImportBody({ ...ok, items: [{ ...ok.items[0], batchMakes: 0 }] }).ok).toBe(false);
    expect(readRecipeImportBody({ ...ok, items: [{ ...ok.items[0], batchMakes: '4' }] }).ok).toBe(false);
  });
  it.each([
    ['no items', { items: [], newMaterials: [], remember: [] }],
    ['a nameless new item', { items: [{ target: { kind: 'new', name: ' ' }, lines: [line] }] }],
    ['a bad mode', { items: [{ target: { kind: 'existing', menuItemId: 'menu_cake', mode: 'merge' }, lines: [line] }] }],
    ['a zero amount', { items: [{ target: { kind: 'new', name: 'B' }, lines: [{ ...line, amount: 0 }] }] }],
    ['a new key with no material', { items: [{ target: { kind: 'new', name: 'B' }, lines: [{ material: { newKey: 'n1' }, amount: 1, unit: 'g' }] }], newMaterials: [] }],
    ['a duplicate new key', { items: [{ target: { kind: 'new', name: 'B' }, lines: [line] }], newMaterials: [{ key: 'n1', name: 'A', unit: 'g' }, { key: 'n1', name: 'B', unit: 'g' }] }],
    ['an odd unit for a new material', { items: [{ target: { kind: 'new', name: 'B' }, lines: [line] }], newMaterials: [{ key: 'n1', name: 'A', unit: 'cup' }] }],
    ['a spoon weight out of range', { items: [{ target: { kind: 'new', name: 'B' }, lines: [line] }], remember: [{ materialId: 'm_flour', gramsPerTsp: 500 }] }],
  ])('refuses %s', (_label, body) => {
    expect(readRecipeImportBody(body).ok).toBe(false);
  });
});
