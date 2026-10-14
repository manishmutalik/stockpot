import { describe, it, expect } from 'vitest';
import type { Response } from 'express';
import type { AuthedRequest } from '../auth';
import { createQuickOrderHandler, createQuickProductionHandler, itemsWithParts, type QuickRouteDeps } from '../quickRoutes';
import { memoryQuickDb } from './memoryQuickDb';

const NOW = Date.parse('2026-10-14T06:30:00Z');
const UID = 'u1';
interface FakeRes { code: number; body: unknown; headers: Record<string, string>; status: (c: number) => FakeRes; json: (b: unknown) => FakeRes; setHeader: (k: string, v: string) => void }
const res = (): FakeRes => {
  const r = { code: 200, headers: {} } as FakeRes;
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
};
let k = 0;
const call = async (handler: (req: AuthedRequest, res: Response) => unknown, body: unknown) => {
  const r = res();
  await handler({ uid: UID, headers: { 'idempotency-key': `parts-key-${String(++k).padStart(8, '0')}` }, query: {}, params: {}, body } as unknown as AuthedRequest, r as unknown as Response);
  return r;
};

function world() {
  const mem = memoryQuickDb(() => NOW);
  mem.seed(UID, 'settings', 'bakery', { name: 'Anita', timezone: 'Asia/Kolkata' });
  mem.seed(UID, 'materials', 'gel', { name: 'Cake gel', unit: 'kg', costPerUnit: 300, initialStock: 5, category: 'Raw Materials' });
  mem.seed(UID, 'materials', 'cream', { name: 'Whipping cream', unit: 'kg', costPerUnit: 400, initialStock: 5, category: 'Raw Materials' });
  mem.seed(UID, 'menu', 'base', { name: 'Vanilla sponge base', sellingPrice: 0, notForSale: true, finishedGoodsStock: 4.5, recipe: [{ materialId: 'gel', amount: 200, unit: 'g' }] });
  mem.seed(UID, 'menu', 'cake', { name: 'Pineapple Cream Cake 1 kg', sellingPrice: 900, finishedGoodsStock: 0, recipe: [{ materialId: 'cream', amount: 150, unit: 'g' }], parts: [{ itemId: 'base', quantity: 1 }] });
  let n = 0;
  const deps = { db: mem.db, now: () => NOW, newId: () => `id${++n}` } as unknown as QuickRouteDeps;
  return { mem, deps };
}

describe('phone production of an item with parts', () => {
  it('loads the parts, takes them from finished stock, and records the run\'s cost with them', async () => {
    const { mem, deps } = world();
    const r = await call(createQuickProductionHandler(deps), { rows: [{ recipeId: 'cake', quantityProduced: 3 }] });
    expect(r.code).toBe(201);
    expect(mem.read(UID, 'menu', 'base').finishedGoodsStock).toBe(1.5);
    expect(mem.read(UID, 'menu', 'cake').finishedGoodsStock).toBe(3);
    expect(mem.read(UID, 'materials', 'gel').initialStock).toBe(5); // the bases' gel was taken when they were made
    expect(mem.read(UID, 'materials', 'cream').initialStock).toBeCloseTo(4.55, 6);
    const run = mem.all(UID, 'productionRuns')[0];
    expect(run).toMatchObject({ partsUsed: [{ itemId: 'base', quantity: 3 }], partsCost: 180, costTotal: 360 });
  });
  it('says when it used more bases than there were', async () => {
    const { deps } = world();
    const r = await call(createQuickProductionHandler(deps), { rows: [{ recipeId: 'cake', quantityProduced: 6 }] });
    expect((r.body as { shortages: unknown[] }).shortages).toEqual([{ materialId: 'base', name: 'Vanilla sponge base', unit: 'pcs', short: 1.5 }]);
  });
});

describe('phone orders and items with parts', () => {
  it('stamps a cream cake with its base in the cost, and refuses to sell the base itself', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'menu', 'cake', { ...mem.read(UID, 'menu', 'cake'), finishedGoodsStock: 2 });
    const ok = await call(createQuickOrderHandler(deps), { common: { customerName: 'Priya' }, lineItems: [{ menuItemId: 'cake', quantity: 1 }] });
    expect(ok.code).toBe(201);
    expect(mem.all(UID, 'orders')[0].unitIngredientCostAtSale).toBeCloseTo(60 + 60, 6);
    const no = await call(createQuickOrderHandler(deps), { common: {}, lineItems: [{ menuItemId: 'base', quantity: 1 }] });
    expect(no.code).toBe(422);
    expect((no.body as { code: string }).code).toBe('not_for_sale');
  });
  it('loads items with their parts, however deep, once each', async () => {
    const { mem } = world();
    mem.seed(UID, 'menu', 'hamper', { name: 'Hamper', sellingPrice: 2000, recipe: [], parts: [{ itemId: 'cake', quantity: 2 }, { itemId: 'base', quantity: 1 }] });
    const ids = await mem.db.run(UID, tx => itemsWithParts(tx, ['hamper'])).then(items => items.map(i => i.id).sort());
    expect(ids).toEqual(['base', 'cake', 'hamper']);
  });
});
