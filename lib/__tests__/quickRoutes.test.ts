import { describe, it, expect } from 'vitest';
import {
  createAccessGate, createQuickOrderHandler, createQuickRestockHandler, createQuickProductionHandler, createQuickSpeechPhrasesHandler,
  readOrderBody, readRestockBody, readProductionBody,
} from '../quickRoutes';
import { parseIdempotencyKey } from '../quickDb';
import { memoryQuickDb } from './memoryQuickDb';

const NOW = Date.parse('2026-10-06T04:30:00Z'); // 10:00 in India
const KEY = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
const UID = 'u1';

const res = () => {
  const r: any = { code: 200, headers: {} };
  r.status = (c: number) => { r.code = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  r.setHeader = (k: string, v: string) => { r.headers[k] = v; };
  return r;
};

function world() {
  let clock = NOW;
  const mem = memoryQuickDb(() => clock);
  mem.seed(UID, 'settings', 'bakery', { name: 'Anita', timezone: 'Asia/Kolkata', paymentFeeRates: { upi: 0.5 } });
  mem.seed(UID, 'materials', 'flour', { name: 'Flour', unit: 'g', initialStock: 5000, costPerUnit: 0.05, category: 'Raw Materials' });
  mem.seed(UID, 'materials', 'butter', { name: 'Butter', unit: 'g', initialStock: 1000, costPerUnit: 0.5, category: 'Raw Materials' });
  mem.seed(UID, 'materials', 'maida', { name: 'Maida', unit: 'kg', initialStock: 10, costPerUnit: 80, category: 'Raw Materials' });
  mem.seed(UID, 'menu', 'cake', { name: 'Chocolate Truffle Cake', sellingPrice: 900, finishedGoodsStock: 5, recipe: [{ materialId: 'flour', amount: 400, unit: 'g' }, { materialId: 'butter', amount: 100, unit: 'g' }] });
  mem.seed(UID, 'menu', 'croissant', { name: 'Butter Croissant', sellingPrice: 120, finishedGoodsStock: 0, shelfLifeDays: 2, recipe: [{ materialId: 'flour', amount: 100, unit: 'g' }, { materialId: 'butter', amount: 50, unit: 'g' }] });
  mem.seed(UID, 'menu', 'sourdough', { name: 'Sourdough', sellingPrice: 200, finishedGoodsStock: 3, recipe: [{ materialId: 'flour', amount: 50, unit: 'g' }] });
  let n = 0;
  const deps = { db: mem.db, now: () => clock, newId: () => `id${++n}` };
  return { mem, deps, advance: (ms: number) => { clock += ms; } };
}

const call = async (handler: (req: any, res: any) => Promise<any>, body: unknown, over: { key?: string | null; uid?: string } = {}) => {
  const r = res();
  const headers: Record<string, string> = {};
  if (over.key !== null) headers['idempotency-key'] = over.key ?? KEY;
  await handler({ uid: over.uid ?? UID, headers, body }, r);
  return r;
};

describe('Idempotency-Key header', () => {
  it('accepts a UUID or similar and nothing else', () => {
    expect(parseIdempotencyKey(KEY)).toBe(KEY);
    expect(parseIdempotencyKey('short')).toBeNull();
    expect(parseIdempotencyKey('has spaces in it, definitely not ok')).toBeNull();
    expect(parseIdempotencyKey(undefined)).toBeNull();
    expect(parseIdempotencyKey(['a'.repeat(20)])).toBeNull();
  });
});

describe('every save endpoint', () => {
  const cases: [string, (d: any) => any, unknown][] = [
    ['orders', createQuickOrderHandler, { common: {}, lineItems: [{ menuItemId: 'cake', quantity: 1 }] }],
    ['restocks', createQuickRestockHandler, { lines: [{ materialId: 'maida', quantity: 1, total: 80 }] }],
    ['production-runs', createQuickProductionHandler, { rows: [{ recipeId: 'croissant', quantityProduced: 2 }] }],
  ];
  for (const [name, make, body] of cases) {
    it(`${name}: refuses a request with no Idempotency-Key, or a malformed one, and saves nothing`, async () => {
      const { mem, deps } = world();
      for (const key of [null, 'nope']) {
        const r = await call(make(deps), body, { key });
        expect(r.code).toBe(400);
        expect(r.body.code).toBe('idempotency_key_required');
      }
      expect(mem.stats.transactions).toBe(0);
    });

    it(`${name}: refuses a malformed body with a 400, and saves nothing`, async () => {
      const { mem, deps } = world();
      const r = await call(make(deps), { nonsense: true });
      expect(r.code).toBe(400);
      expect(r.body.code).toBe('bad_request');
      expect(mem.stats.writes).toBe(0);
    });
  }
});

describe('POST /mobile/orders', () => {
  const order = (over: any = {}) => ({ common: {}, lineItems: [{ menuItemId: 'cake', quantity: 2 }], ...over });

  it('says what is still owed: nothing for an order paid in full, the whole of it when paying later', async () => {
    const { deps } = world();
    const later = await call(createQuickOrderHandler(deps), order({ common: { customerName: 'Priya', paymentStatus: 'unpaid' } }), { key: 'b1b2c3d4-e5f6-4789-a012-3456789abcde' });
    expect(later.body).toMatchObject({ total: 1800, balanceDue: 1800 });
    const paid = await call(createQuickOrderHandler(deps), order({ common: { paymentStatus: 'paid', paymentMethod: 'cash' }, lineItems: [{ menuItemId: 'sourdough', quantity: 1 }] }), { key: 'c1b2c3d4-e5f6-4789-a012-3456789abcde' });
    expect(paid.body).toMatchObject({ balanceDue: 0 });
  });

  it('adds an order from stock: the order, stamped, and the stock taken, in one save', async () => {
    const { mem, deps } = world();
    const r = await call(createQuickOrderHandler(deps), order({ common: { customerName: 'Priya', paymentMethod: 'upi' } }));
    expect(r.code).toBe(201);
    expect(r.body).toMatchObject({ orderIds: ['id1'], preorder: false, total: 1800, advance: 0, balanceDue: 0, orderGroupId: null });
    const saved = mem.read(UID, 'orders', 'id1')!;
    expect(saved).toMatchObject({
      menuItemId: 'cake', quantity: 2, customerName: 'Priya', unitPriceAtSale: 900, itemNameAtSale: 'Chocolate Truffle Cake',
      bookedOn: '2026-10-06', date: '2026-10-06', paymentMethod: 'upi', paymentFeeRate: 0.5,
    });
    expect(saved.unitIngredientCostAtSale).toBeCloseTo(70); // 400 g flour at 0.05 + 100 g butter at 0.5
    expect(mem.read(UID, 'menu', 'cake')!.finishedGoodsStock).toBe(3);
  });

  it('checks the cap against the live stock, not what the phone saw: another order took it a moment ago', async () => {
    const { mem, deps } = world();
    await call(createQuickOrderHandler(deps), order({ lineItems: [{ menuItemId: 'cake', quantity: 4 }] }), { key: 'k'.repeat(20) });
    const r = await call(createQuickOrderHandler(deps), order({ lineItems: [{ menuItemId: 'cake', quantity: 2 }] }), { key: 'z'.repeat(20) });
    expect(r.code).toBe(409);
    expect(r.body).toMatchObject({ code: 'insufficient_stock', error: 'Only 1 unit(s) of "Chocolate Truffle Cake" in stock, but this order needs 2. Log another production run to cover the rest.' });
    expect(mem.all(UID, 'orders')).toHaveLength(1);
    expect(mem.read(UID, 'menu', 'cake')!.finishedGoodsStock).toBe(1);
  });

  it('a pre-order due Saturday with an advance: no stock taken, the balance worked out', async () => {
    const { mem, deps } = world();
    const r = await call(createQuickOrderHandler(deps), order({
      common: { preorder: true, date: '2026-10-10', dueSlot: 'evening', customerName: 'Priya Sharma', advance: { amount: 500, method: 'upi' } },
    }));
    expect(r.code).toBe(201);
    expect(r.body).toMatchObject({ preorder: true, total: 1800, advance: 500, balanceDue: 1300 });
    expect(mem.read(UID, 'orders', 'id1')).toMatchObject({ preorder: true, stockClaimed: false, dueSlot: 'evening', paymentStatus: 'unpaid', advance: { amount: 500, method: 'upi', feeRate: 0.5, date: '2026-10-06' } });
    expect(mem.read(UID, 'menu', 'cake')!.finishedGoodsStock).toBe(5);
  });

  it('uses the business time zone for today: 11:00 pm UTC is already tomorrow in India', async () => {
    const { mem, deps } = world();
    const late = { ...deps, now: () => Date.parse('2026-10-06T20:00:00Z') }; // 01:30 on the 7th in India
    await call(createQuickOrderHandler(late), order());
    expect(mem.read(UID, 'orders', 'id1')).toMatchObject({ date: '2026-10-07', bookedOn: '2026-10-07' });
  });

  it('gives several items one group id and takes each item\'s stock', async () => {
    const { mem, deps } = world();
    const r = await call(createQuickOrderHandler(deps), order({ lineItems: [{ menuItemId: 'cake', quantity: 1 }, { menuItemId: 'sourdough', quantity: 2 }] }));
    expect(r.body.orderGroupId).toBe('id1');
    expect(r.body.orderIds).toEqual(['id2', 'id3']);
    expect(mem.read(UID, 'menu', 'sourdough')!.finishedGoodsStock).toBe(1);
  });

  it('refuses an item that is not on the menu, with nothing saved', async () => {
    const { mem, deps } = world();
    const r = await call(createQuickOrderHandler(deps), order({ lineItems: [{ menuItemId: 'custom-cake', quantity: 1 }] }));
    expect(r.code).toBe(422);
    expect(r.body.code).toBe('unknown_item');
    expect(mem.stats.writes).toBe(0);
  });

  it('only ever touches the signed-in owner\'s own documents', async () => {
    const { mem, deps } = world();
    const r = await call(createQuickOrderHandler(deps), order(), { uid: 'someone-else' });
    expect(r.code).toBe(422); // they have no menu
    expect(mem.read(UID, 'menu', 'cake')!.finishedGoodsStock).toBe(5);
  });

  describe('a repeated request (the phone retried)', () => {
    it('gets the first answer back and writes nothing more: one order, stock taken once', async () => {
      const { mem, deps } = world();
      const first = await call(createQuickOrderHandler(deps), order());
      const writesAfterFirst = mem.stats.writes;
      const again = await call(createQuickOrderHandler(deps), order());
      expect(again.code).toBe(201);
      expect(again.body).toEqual(first.body);
      expect(again.headers['Idempotent-Replayed']).toBe('true');
      expect(first.headers['Idempotent-Replayed']).toBeUndefined();
      expect(mem.stats.writes).toBe(writesAfterFirst);
      expect(mem.all(UID, 'orders')).toHaveLength(1);
      expect(mem.read(UID, 'menu', 'cake')!.finishedGoodsStock).toBe(3);
    });

    it('is not fooled by a different body under the same key: it still answers with the first save', async () => {
      const { mem, deps } = world();
      await call(createQuickOrderHandler(deps), order());
      await call(createQuickOrderHandler(deps), order({ lineItems: [{ menuItemId: 'sourdough', quantity: 3 }] }));
      expect(mem.all(UID, 'orders')).toHaveLength(1);
    });

    it('does not remember a failure: after the owner puts it right, the same key saves', async () => {
      const { mem, deps } = world();
      const refused = await call(createQuickOrderHandler(deps), order({ lineItems: [{ menuItemId: 'cake', quantity: 9 }] }));
      expect(refused.code).toBe(409);
      const ok = await call(createQuickOrderHandler(deps), order({ lineItems: [{ menuItemId: 'cake', quantity: 1 }] }));
      expect(ok.code).toBe(201);
      expect(mem.all(UID, 'orders')).toHaveLength(1);
    });

    it('the same key on another endpoint is a separate save', async () => {
      const { mem, deps } = world();
      await call(createQuickOrderHandler(deps), order());
      const r = await call(createQuickRestockHandler(deps), { lines: [{ materialId: 'maida', quantity: 5, total: 450 }] });
      expect(r.code).toBe(201);
      expect(mem.read(UID, 'materials', 'maida')!.initialStock).toBe(15);
    });

    it('is forgotten after a day: the same key a day later is a new save', async () => {
      const { mem, deps, advance } = world();
      await call(createQuickOrderHandler(deps), order());
      advance(25 * 3600 * 1000);
      await call(createQuickOrderHandler(deps), order());
      expect(mem.all(UID, 'orders')).toHaveLength(2);
    });
  });

  it('answers 500 with nothing saved when the data layer fails', async () => {
    const { mem, deps } = world();
    const broken = { ...deps, db: { run: async () => { throw new Error('firestore down'); } } };
    const r = await call(createQuickOrderHandler(broken as any), order());
    expect(r.code).toBe(500);
    expect(r.body.code).toBe('save_failed');
    expect(mem.stats.writes).toBe(0);
  });
});

describe('POST /mobile/restocks', () => {
  it('adds the stock, moves the cost to the moving average, and records the price history together', async () => {
    const { mem, deps } = world();
    const r = await call(createQuickRestockHandler(deps), { lines: [{ materialId: 'maida', quantity: 5, total: 450 }] });
    expect(r.code).toBe(201);
    expect(r.body.lines[0]).toMatchObject({ materialId: 'maida', newStock: 15, previousCostPerUnit: 80 });
    expect(r.body.lines[0].newCostPerUnit).toBeCloseTo(83.333333, 6);
    expect(mem.read(UID, 'materials', 'maida')).toMatchObject({ initialStock: 15, name: 'Maida' }); // merged, nothing else lost
    const log = mem.all(UID, 'priceLog');
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ materialId: 'maida', unitCost: 90, quantity: 5, source: 'restock' });
  });

  it('converts a quantity said in grams for a material kept in kilos', async () => {
    const { mem, deps } = world();
    await call(createQuickRestockHandler(deps), { lines: [{ materialId: 'maida', quantity: 500, unit: 'g', total: 45 }] });
    expect(mem.read(UID, 'materials', 'maida')!.initialStock).toBe(10.5);
  });

  it('a material bought on two lines: the second starts from the first\'s result', async () => {
    const { mem, deps } = world();
    await call(createQuickRestockHandler(deps), { lines: [{ materialId: 'maida', quantity: 2, total: 200 }, { materialId: 'maida', quantity: 3, total: 300 }] });
    expect(mem.read(UID, 'materials', 'maida')!.initialStock).toBe(15);
    expect(mem.all(UID, 'priceLog')).toHaveLength(2);
  });

  it('flags a material that is not in the owner\'s list rather than creating it, and saves none of the lines', async () => {
    const { mem, deps } = world();
    const r = await call(createQuickRestockHandler(deps), { lines: [{ materialId: 'maida', quantity: 1, total: 80 }, { materialId: 'cardamom', quantity: 1, total: 100 }] });
    expect(r.code).toBe(422);
    expect(r.body).toMatchObject({ code: 'unknown_material', materialId: 'cardamom', error: "That item isn't in your materials. Add it in the web app first." });
    expect(mem.read(UID, 'materials', 'cardamom')).toBeNull();
    expect(mem.read(UID, 'materials', 'maida')!.initialStock).toBe(10);
  });

  it('refuses a unit that cannot be converted to the material\'s own', async () => {
    const { deps } = world();
    const r = await call(createQuickRestockHandler(deps), { lines: [{ materialId: 'maida', quantity: 1, unit: 'ml', total: 80 }] });
    expect(r.code).toBe(422);
    expect(r.body.code).toBe('unit_mismatch');
  });
});

describe('POST /mobile/production-runs', () => {
  it('"24 croissants and 2 sourdough": flour from both taken off once, finished stock added, the cost kept on each run', async () => {
    const { mem, deps } = world();
    const r = await call(createQuickProductionHandler(deps), { rows: [{ recipeId: 'croissant', quantityProduced: 24 }, { recipeId: 'sourdough', quantityProduced: 2 }] });
    expect(r.code).toBe(201);
    expect(r.body.runIds).toHaveLength(2);
    expect(r.body.sessionId).toBeTruthy();
    expect(mem.read(UID, 'materials', 'flour')!.initialStock).toBe(5000 - 2400 - 100);
    expect(mem.read(UID, 'materials', 'butter')!.initialStock).toBe(1000 - 1200); // goes below nothing, as on the web
    expect(mem.read(UID, 'menu', 'croissant')!.finishedGoodsStock).toBe(24);
    expect(mem.read(UID, 'menu', 'sourdough')!.finishedGoodsStock).toBe(5);
    const runs = mem.all(UID, 'productionRuns');
    expect(runs).toHaveLength(2);
    const croissantRun = runs.find(x => x.recipeId === 'croissant')!;
    expect(croissantRun).toMatchObject({ quantityProduced: 24, quantityYield: 24, remainingQuantity: 24, date: '2026-10-06', expiryDate: '2026-10-08' });
    expect(croissantRun.costTotal).toBeCloseTo(24 * (100 * 0.05 + 50 * 0.5)); // 720
  });

  it('warns about an ingredient that would run short, still saving, as the web does', async () => {
    const { deps } = world();
    const r = await call(createQuickProductionHandler(deps), { rows: [{ recipeId: 'croissant', quantityProduced: 24 }] });
    expect(r.body.shortages).toEqual([{ materialId: 'butter', name: 'Butter', unit: 'g', short: 200 }]);
    const fine = await call(createQuickProductionHandler(deps), { rows: [{ recipeId: 'sourdough', quantityProduced: 1 }] }, { key: 'x'.repeat(20) });
    expect(fine.body.shortages).toEqual([]); // only the ingredients a run uses are reported
  });

  it('adds the yield, not the quantity made, when some was lost', async () => {
    const { mem, deps } = world();
    await call(createQuickProductionHandler(deps), { rows: [{ recipeId: 'sourdough', quantityProduced: 4, quantityYield: 3 }] });
    expect(mem.read(UID, 'menu', 'sourdough')!.finishedGoodsStock).toBe(6);
    expect(mem.all(UID, 'productionRuns')[0]).toMatchObject({ quantityProduced: 4, quantityYield: 3, remainingQuantity: 3 });
  });

  it('a single item gets no session id; a past date is kept', async () => {
    const { mem, deps } = world();
    const r = await call(createQuickProductionHandler(deps), { date: '2026-10-04', rows: [{ recipeId: 'sourdough', quantityProduced: 1 }] });
    expect(r.body.sessionId).toBeNull();
    expect(mem.all(UID, 'productionRuns')[0].date).toBe('2026-10-04');
  });

  it('saves nothing at all when one item is not on the menu', async () => {
    const { mem, deps } = world();
    const r = await call(createQuickProductionHandler(deps), { rows: [{ recipeId: 'sourdough', quantityProduced: 1 }, { recipeId: 'nope', quantityProduced: 1 }] });
    expect(r.code).toBe(422);
    expect(r.body.code).toBe('unknown_recipe');
    expect(mem.stats.writes).toBe(0);
    expect(mem.read(UID, 'materials', 'flour')!.initialStock).toBe(5000);
  });
});

describe('request reading', () => {
  it('refuses an advance of nothing, an unknown method, text that is too long, and absurd quantities', () => {
    const base = { lineItems: [{ menuItemId: 'cake', quantity: 1 }] };
    expect(readOrderBody({ ...base, common: { advance: { amount: 0, method: 'upi' } } }).ok).toBe(false);
    expect(readOrderBody({ ...base, common: { paymentMethod: 'bitcoin' } }).ok).toBe(false);
    expect(readOrderBody({ ...base, common: { notes: 'x'.repeat(501) } }).ok).toBe(false);
    expect(readOrderBody({ lineItems: [{ menuItemId: 'cake', quantity: -1 }], common: {} }).ok).toBe(false);
    expect(readOrderBody({ lineItems: [{ menuItemId: '../etc', quantity: 1 }], common: {} }).ok).toBe(false);
    expect(readOrderBody({ ...base, common: { date: '06/10/2026' } }).ok).toBe(false);
    expect(readRestockBody({ lines: [{ materialId: 'maida', quantity: 1, total: 0 }] }).ok).toBe(false);
    expect(readProductionBody({ rows: [{ recipeId: 'cake', quantityProduced: 2, quantityYield: 3 }] }).ok).toBe(false);
  });
  it('trims text and leaves out what was not sent', () => {
    const r = readOrderBody({ lineItems: [{ menuItemId: 'cake', quantity: 1 }], common: { customerName: '  Priya  ', notes: '' } });
    expect(r).toEqual({ ok: true, value: { lineItems: [{ menuItemId: 'cake', quantity: 1 }], common: { customerName: 'Priya' } } });
  });
});

describe('access gate', () => {
  const gate = (paywall: boolean, active: boolean) => createAccessGate({ paywall: () => paywall, hasActiveAccess: async () => active });
  const run = async (g: any) => { const r = res(); let nexted = false; await g({ uid: UID, email: 'a@x.com', emailVerified: true }, r, () => { nexted = true; }); return { r, nexted }; };

  it('lets an account through when the paywall does not apply to it, or it has a plan', async () => {
    expect((await run(gate(false, false))).nexted).toBe(true);
    expect((await run(gate(true, true))).nexted).toBe(true);
  });
  it('turns away an account behind the paywall with no plan', async () => {
    const { r, nexted } = await run(gate(true, false));
    expect(nexted).toBe(false);
    expect(r.code).toBe(402);
    expect(r.body.code).toBe('subscription_required');
  });
});

describe('speech phrases', () => {
  const get = async (deps: any, query: Record<string, string> = {}, uid = UID) => {
    const r = res();
    await createQuickSpeechPhrasesHandler(deps)({ uid, query } as any, r);
    return r;
  };

  it('gives the menu as it is spoken and as written, then the materials, and no customers by default', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'menu', 'pump', { name: 'Pumpkin Seed Bread (500g)', sellingPrice: 240, finishedGoodsStock: 1, recipe: [] });
    mem.seed(UID, 'orders', 'o1', { menuItemId: 'cake', quantity: 1, date: '2026-10-01', customerName: 'Priya Sharma', unitPriceAtSale: 900, paymentStatus: 'paid' });
    const r = await get(deps);
    expect(r.code).toBe(200);
    expect(r.headers['Cache-Control']).toBe('private, no-store');
    expect(r.body.phrases).toEqual(expect.arrayContaining(['Pumpkin Seed Bread', 'Pumpkin Seed Bread (500g)', 'Butter Croissant', 'Flour', 'Maida']));
    expect(r.body.phrases.indexOf('Butter Croissant')).toBeLessThan(r.body.phrases.indexOf('Flour'));
    expect(r.body.phrases).not.toContain('Priya Sharma');
    expect(r.body.phrases).not.toContain('Priya');
  });

  it('adds customers\' names only when asked, from recent orders', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'o1', { menuItemId: 'cake', quantity: 1, date: '2026-10-01', customerName: 'Priya Sharma', unitPriceAtSale: 900, paymentStatus: 'paid' });
    mem.seed(UID, 'orders', 'old', { menuItemId: 'cake', quantity: 1, date: '2024-01-01', customerName: 'Long Ago', unitPriceAtSale: 900, paymentStatus: 'paid' });
    const r = await get(deps, { customers: '1' });
    expect(r.body.phrases).toEqual(expect.arrayContaining(['Priya Sharma', 'Priya']));
    expect(r.body.phrases).not.toContain('Long Ago');
  });

  it('only ever reads the caller\'s own business', async () => {
    const { mem, deps } = world();
    mem.seed('other', 'menu', 'x', { name: 'Someone Else\'s Cake', sellingPrice: 1, finishedGoodsStock: 0, recipe: [] });
    expect((await get(deps)).body.phrases).not.toContain('Someone Else\'s Cake');
  });

  it('says so when it cannot read', async () => {
    const r = await get({ db: { run: async () => { throw new Error('down'); } }, now: () => NOW, newId: () => 'x' });
    expect(r.code).toBe(500);
    expect(r.body.code).toBe('read_failed');
  });
});
