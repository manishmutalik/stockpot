import { describe, it, expect } from 'vitest';
import { createQuickTodayHandler, createQuickUpcomingHandler } from '../quickRoutes';
import { buildToday, buildUpcoming } from '../../src/utils/quickViews';
import { memoryQuickDb } from './memoryQuickDb';

const NOW = Date.parse('2026-10-06T04:30:00Z'); // 10:00 on Tue 6 Oct in India
const UID = 'u1';

const res = () => {
  const r: any = { code: 200, headers: {} };
  r.status = (c: number) => { r.code = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  r.setHeader = (k: string, v: string) => { r.headers[k] = v; };
  return r;
};

function world() {
  const mem = memoryQuickDb(() => NOW);
  mem.seed(UID, 'settings', 'bakery', { name: "Anita's Bakehouse", timezone: 'Asia/Kolkata', paymentFeeRates: { upi: 0 } });
  mem.seed(UID, 'materials', 'flour', { name: 'Flour', unit: 'g', initialStock: 5000, costPerUnit: 0.05, threshold: 500, category: 'Raw Materials' });
  mem.seed(UID, 'materials', 'butter', { name: 'Butter', unit: 'g', initialStock: 150, costPerUnit: 0.5, threshold: 200, category: 'Raw Materials' }); // below its alert level
  mem.seed(UID, 'materials', 'cream', { name: 'Fresh Cream', unit: 'ml', initialStock: 900, costPerUnit: 0.2, threshold: 100, expiryDate: '2026-10-07', category: 'Raw Materials' });
  mem.seed(UID, 'menu', 'cake', { name: 'Chocolate Truffle Cake', sellingPrice: 900, finishedGoodsStock: 5, recipe: [] });
  mem.seed(UID, 'menu', 'muffin', { name: 'Muffin', sellingPrice: 60, finishedGoodsStock: 1, recipe: [] });
  const deps = { db: mem.db, now: () => NOW, newId: () => 'x' };
  return { mem, deps };
}

const order = (id: string, over: Record<string, any> = {}) => ({
  id, menuItemId: 'cake', quantity: 1, date: '2026-10-01', unitPriceAtSale: 900, unitIngredientCostAtSale: 70, unitPackagingCostAtSale: 0, unitInputGstAtSale: 0, itemNameAtSale: 'Chocolate Truffle Cake', ...over,
});
const get = async (handler: any) => { const r = res(); await handler({ uid: UID }, r); return r; };

describe('GET /mobile/today', () => {
  it('an empty kitchen is all clear', async () => {
    const mem = memoryQuickDb(() => NOW);
    mem.seed(UID, 'settings', 'bakery', { name: 'Anita', timezone: 'Asia/Kolkata' });
    const r = await get(createQuickTodayHandler({ db: mem.db, now: () => NOW, newId: () => 'x' }));
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({ date: '2026-10-06', businessName: 'Anita', statusLines: [], dueToday: null, pendingPayments: { customers: 0, total: 0 }, today: { revenue: 0, trueProfit: 0 } });
    expect(r.headers['Cache-Control']).toBe('private, no-store');
  });

  it('shows what needs attention, most urgent first, with the money already formatted', async () => {
    const { mem, deps } = world();
    // As on the web, a pre-order that falls due today counts as today's sale and as owed, even before it is handed over.
    mem.seed(UID, 'orders', 'sale1', order('sale1', { date: '2026-10-06', customerName: 'Walk-in' }));                        // sold today: ₹900, costs ₹70
    mem.seed(UID, 'orders', 'due1', order('due1', { preorder: true, date: '2026-10-06', quantity: 2, customerName: 'Priya', paymentStatus: 'unpaid' })); // due today: ₹1,800, costs ₹140
    mem.seed(UID, 'orders', 'late1', order('late1', { preorder: true, date: '2026-10-05', customerName: 'Rohan', paymentStatus: 'unpaid' }));  // due yesterday
    mem.seed(UID, 'orders', 'tmrw1', order('tmrw1', { preorder: true, date: '2026-10-07', menuItemId: 'muffin', quantity: 12, unitPriceAtSale: 60 }));
    mem.seed(UID, 'orders', 'owed1', order('owed1', { date: '2026-10-02', customerName: 'Kavya', paymentStatus: 'unpaid' }));
    const r = await get(createQuickTodayHandler(deps));

    expect(r.body.statusLines.map((l: any) => `${l.kind}|${l.tone}|${l.label}`)).toEqual([
      'orders_due|coral|2 orders due today or overdue',
      'payments_pending|amber|3 payments pending · ₹3,600.00',
      'running_low|amber|Butter running low',
      'use_by_soon|amber|Fresh Cream use by tomorrow',
      "profit|green|Today's profit ₹2,490.00",
    ]);
    expect(r.body.dueToday).toEqual({ orderCount: 1, items: [{ menuItemId: 'cake', name: 'Chocolate Truffle Cake', quantity: 2 }] });
    expect(r.body.dueTomorrow).toEqual({ orderCount: 1, items: [{ menuItemId: 'muffin', name: 'Muffin', quantity: 12 }] });
    expect(r.body.overdue).toMatchObject({ orderCount: 1 });
    expect(r.body.today).toEqual({ revenue: 2700, trueProfit: 2490, orderCount: 2 }); // 900 + 1,800 less 70 + 140 of ingredients
    expect(r.body.pendingPayments).toEqual({ customers: 3, orders: 3, total: 3600 }); // Priya 1,800, Rohan 900, Kavya 900
    expect(r.body.lowStock).toEqual([{ id: 'butter', name: 'Butter', remaining: 150, unit: 'g', threshold: 200 }]);
    expect(r.body.useBySoon).toEqual([{ kind: 'material', id: 'cream', name: 'Fresh Cream', date: '2026-10-07', daysLeft: 1 }]);
  });

  it('pending payments leave out a pre-order that is not due yet, and a cancelled order is not a sale', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'later', order('later', { preorder: true, date: '2026-10-20', paymentStatus: 'unpaid' }));
    mem.seed(UID, 'orders', 'gone', order('gone', { date: '2026-10-06', cancelledOn: '2026-10-06' }));
    const r = await get(createQuickTodayHandler(deps));
    expect(r.body.pendingPayments).toEqual({ customers: 0, orders: 0, total: 0 });
    expect(r.body.today.orderCount).toBe(0);
  });

  it('a finished batch near its use-by date is listed, one with nothing left is not, and one long past is left out', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'productionRuns', 'r1', { id: 'r1', recipeId: 'cake', quantityProduced: 4, remainingQuantity: 3, date: '2026-10-04', expiryDate: '2026-10-06', costTotal: 0, createdAt: 1 });
    mem.seed(UID, 'productionRuns', 'r2', { id: 'r2', recipeId: 'cake', quantityProduced: 4, remainingQuantity: 0, date: '2026-10-04', expiryDate: '2026-10-06', costTotal: 0, createdAt: 1 });
    mem.seed(UID, 'productionRuns', 'r3', { id: 'r3', recipeId: 'cake', quantityProduced: 4, remainingQuantity: 4, date: '2026-08-01', expiryDate: '2026-08-03', costTotal: 0, createdAt: 1 });
    const r = await get(createQuickTodayHandler(deps));
    expect(r.body.useBySoon.filter((u: any) => u.kind === 'batch')).toEqual([{ kind: 'batch', id: 'r1', name: 'Chocolate Truffle Cake', date: '2026-10-06', daysLeft: 0 }]);
  });

  it('stock is what the Inventory screen shows: recorded stock less what experiments will draw', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'materials', 'butter', { name: 'Butter', unit: 'g', initialStock: 400, costPerUnit: 0.5, threshold: 200, category: 'Raw Materials' }); // fine on its own
    mem.seed(UID, 'experiments', 'e1', { id: 'e1', date: '2026-10-05', name: 'Test', materials: [{ materialId: 'butter', amount: 250, unit: 'g' }] });
    const r = await get(createQuickTodayHandler(deps));
    expect(r.body.lowStock.map((m: any) => `${m.id}:${m.remaining}`)).toEqual(['butter:150']);
  });

  it('keeps to five lines, and uses the business time zone for "today"', async () => {
    const { deps } = world();
    const late = { ...deps, now: () => Date.parse('2026-10-06T20:00:00Z') }; // already the 7th in India
    const r = await get(createQuickTodayHandler(late));
    expect(r.body.date).toBe('2026-10-07');
    expect(r.body.statusLines.length).toBeLessThanOrEqual(5);
  });

  it('only ever reads the signed-in owner\'s documents', async () => {
    const { mem, deps } = world();
    mem.seed('someone-else', 'orders', 'theirs', order('theirs', { date: '2026-10-06' }));
    const r = await get(createQuickTodayHandler(deps));
    expect(r.body.today.orderCount).toBe(0);
  });

  it('answers 500 when the data layer fails', async () => {
    const { deps } = world();
    const r = await get(createQuickTodayHandler({ ...deps, db: { run: async () => { throw new Error('down'); } } as any }));
    expect(r.code).toBe(500);
    expect(r.body.code).toBe('read_failed');
  });
});

describe('GET /mobile/upcoming', () => {
  const pre = (id: string, over: Record<string, any> = {}) => order(id, { preorder: true, stockClaimed: false, customerName: 'Priya Sharma', customerPhone: '98450 10101', paymentStatus: 'unpaid', ...over });

  it('lists open pre-orders soonest first with customer, items, slot, notes, advance and balance; overdue ones apart', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'a', pre('a', { date: '2026-10-10', quantity: 2, dueSlot: 'evening', notes: 'Eggless', advance: { amount: 500, method: 'upi', feeRate: 0, date: '2026-10-02' } }));
    mem.seed(UID, 'orders', 'b', pre('b', { date: '2026-10-07', menuItemId: 'muffin', quantity: 12, unitPriceAtSale: 60, customerName: 'Rohan Mehta', customerPhone: undefined }));
    mem.seed(UID, 'orders', 'c', pre('c', { date: '2026-10-05', customerName: 'Arjun' }));
    const r = await get(createQuickUpcomingHandler(deps));
    expect(r.body.overdue.map((e: any) => e.orderId)).toEqual(['c']);
    expect(r.body.upcoming.map((e: any) => e.orderId)).toEqual(['b', 'a']);
    expect(r.body.upcoming[1]).toMatchObject({
      customerName: 'Priya Sharma', customerPhone: '98450 10101', date: '2026-10-10', dueSlot: 'evening', notes: 'Eggless',
      items: [{ menuItemId: 'cake', name: 'Chocolate Truffle Cake', quantity: 2 }], total: 1800, advance: { amount: 500, method: 'upi' }, balanceDue: 1300, stockShort: [],
    });
    expect(r.body.upcoming[0]).toMatchObject({ customerName: 'Rohan Mehta', customerPhone: null, total: 720, balanceDue: 720, dueSlot: null, notes: null });
  });

  it('says what is short of stock for handing the order over', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'a', pre('a', { date: '2026-10-07', menuItemId: 'muffin', quantity: 12, unitPriceAtSale: 60 })); // 1 muffin in stock
    const r = await get(createQuickUpcomingHandler(deps));
    expect(r.body.upcoming[0].stockShort).toEqual([{ name: 'Muffin', short: 11 }]);
  });

  it('a multi-item order is one entry; a handed-over or cancelled pre-order is not listed', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'a', pre('a', { date: '2026-10-08', orderGroupId: 'g' }));
    mem.seed(UID, 'orders', 'b', pre('b', { date: '2026-10-08', orderGroupId: 'g', menuItemId: 'muffin', quantity: 6, unitPriceAtSale: 60 }));
    mem.seed(UID, 'orders', 'done', pre('done', { date: '2026-10-08', fulfilled: true }));
    mem.seed(UID, 'orders', 'nope', pre('nope', { date: '2026-10-08', cancelledOn: '2026-10-05' }));
    mem.seed(UID, 'orders', 'plain', order('plain', { date: '2026-10-08' })); // not a pre-order
    const r = await get(createQuickUpcomingHandler(deps));
    expect(r.body.upcoming).toHaveLength(1);
    expect(r.body.upcoming[0].orderIds).toEqual(['a', 'b']);
    expect(r.body.upcoming[0].items.map((i: any) => i.name)).toEqual(['Chocolate Truffle Cake', 'Muffin']);
    expect(r.body.upcoming[0].total).toBe(900 + 360);
  });

  it('is empty when there is nothing booked', async () => {
    const { deps } = world();
    const r = await get(createQuickUpcomingHandler(deps));
    expect(r.body).toMatchObject({ today: '2026-10-06', overdue: [], upcoming: [] });
  });
});

describe('the builders on their own', () => {
  it('buildToday and buildUpcoming take plain data and need no database', () => {
    const today = buildToday({ today: '2026-10-06', settings: { name: 'X' }, currency: { code: 'INR', symbol: '₹' }, orders: [], menu: [], materials: [], experiments: [], wastageLogs: [], productionRuns: [] });
    expect(today.statusLines).toEqual([]);
    const up = buildUpcoming({ today: '2026-10-06', settings: {}, currency: { code: 'INR', symbol: '₹' }, orders: [], menu: [] });
    expect(up.upcoming).toEqual([]);
  });
});
