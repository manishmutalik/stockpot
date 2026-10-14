import { describe, it, expect } from 'vitest';
import { createQuickHandOverHandler, createQuickOrderHandler, createQuickProductionHandler, createQuickUpcomingHandler } from '../quickRoutes';
import { memoryQuickDb } from './memoryQuickDb';

const NOW = Date.parse('2026-10-06T04:30:00Z'); // 10:00 on 6 Oct in India
const UID = 'u1';
const KEY = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

/** What the tests read from an answer. */
interface Answer { shortages?: unknown; upcoming: { stockShort: unknown[] }[]; handedOver?: boolean; code?: string }
interface Res { code: number; headers: Record<string, string>; body: Answer; status: (c: number) => Res; json: (b: Answer) => Res; setHeader: (k: string, v: string) => void }
const res = (): Res => {
  const r = { code: 200, headers: {} } as Res;
  r.status = (c: number) => { r.code = c; return r; };
  r.json = (b: Answer) => { r.body = b; return r; };
  r.setHeader = (k: string, v: string) => { r.headers[k] = v; };
  return r;
};

/** A cream cake made when ordered, on a sponge base made ahead (2 on the shelf). */
function world() {
  const mem = memoryQuickDb(() => NOW);
  mem.seed(UID, 'settings', 'bakery', { name: 'Anita', timezone: 'Asia/Kolkata' });
  mem.seed(UID, 'materials', 'cream', { name: 'Whipping cream', unit: 'ml', initialStock: 1000, costPerUnit: 0.4, category: 'Raw Materials' });
  mem.seed(UID, 'materials', 'gel', { name: 'Cake gel', unit: 'g', initialStock: 5000, costPerUnit: 0.3, category: 'Raw Materials' });
  mem.seed(UID, 'menu', 'base', { name: 'Sponge base', sellingPrice: 0, notForSale: true, finishedGoodsStock: 2, recipe: [{ materialId: 'gel', amount: 220, unit: 'g' }] });
  mem.seed(UID, 'menu', 'cake', { name: 'Pineapple cake', sellingPrice: 900, madeToOrder: true, recipe: [{ materialId: 'cream', amount: 150, unit: 'ml' }], parts: [{ itemId: 'base', quantity: 1 }] });
  let n = 0;
  return { mem, deps: { db: mem.db, now: () => NOW, newId: () => `id${++n}` } };
}

/** A route handler, given a request with only what these routes read, and the response above. */
type Handler = (req: never, res: never) => Promise<unknown>;
const call = async (handler: Handler, body: unknown, params: Record<string, string> = {}) => {
  const r = res();
  await handler({ uid: UID, headers: { 'idempotency-key': KEY }, body, params } as never, r as never);
  return r;
};

describe('made to order, from the phone', () => {
  it('an order takes the cream and the base, keeps what it took, and is never short of finished stock', async () => {
    const { mem, deps } = world();
    const r = await call(createQuickOrderHandler(deps), { common: {}, lineItems: [{ menuItemId: 'cake', quantity: 3 }] });
    expect(r.code).toBe(201);
    expect(mem.read(UID, 'materials', 'cream')!.initialStock).toBe(550);
    expect(mem.read(UID, 'menu', 'base')!.finishedGoodsStock).toBe(-1);
    expect(mem.read(UID, 'orders', 'id1')!.taken).toEqual({ materials: [{ materialId: 'cream', amount: 450 }], parts: [{ itemId: 'base', quantity: 3 }], cost: 180 });
    // Saved anyway, and the answer says what went short.
    expect(r.body.shortages).toEqual([{ materialId: 'base', name: 'Sponge base', unit: 'pcs', short: 1 }]);
  });

  it('a pre-order takes them when it is handed over, and Upcoming never says it is short of cakes', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'p1', { id: 'p1', menuItemId: 'cake', quantity: 1, date: '2026-10-06', preorder: true, stockClaimed: false, unitPriceAtSale: 900, itemNameAtSale: 'Pineapple cake', customerName: 'Priya' });
    const upcoming = await call(createQuickUpcomingHandler(deps), undefined);
    expect(upcoming.body.upcoming[0].stockShort).toEqual([]);

    const r = await call(createQuickHandOverHandler(deps), {}, { id: 'p1' });
    expect(r.body.handedOver).toBe(true);
    expect(mem.read(UID, 'orders', 'p1')).toMatchObject({ fulfilled: true, stockClaimed: true, taken: { parts: [{ itemId: 'base', quantity: 1 }] } });
    expect(mem.read(UID, 'materials', 'cream')!.initialStock).toBe(850);
    expect(mem.read(UID, 'menu', 'base')!.finishedGoodsStock).toBe(1);
    expect(r.body.shortages).toBeUndefined();
  });

  it('is not logged as production', async () => {
    const { mem, deps } = world();
    const r = await call(createQuickProductionHandler(deps), { rows: [{ recipeId: 'cake', quantityProduced: 2 }] });
    expect(r.code).toBe(422);
    expect(r.body.code).toBe('made_to_order');
    expect(mem.all(UID, 'productionRuns')).toHaveLength(0);
  });
});
