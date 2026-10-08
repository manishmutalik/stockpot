import { describe, it, expect, vi } from 'vitest';
import { createQuickPaymentsDueHandler, createQuickStatementHandler } from '../quickRoutes';
import { memoryQuickDb } from './memoryQuickDb';

const NOW = Date.parse('2026-10-06T04:30:00Z'); // Tue 6 Oct in India
const UID = 'u1';

const res = () => {
  const r: any = { code: 200, headers: {} };
  r.status = (c: number) => { r.code = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  r.setHeader = (k: string, v: string) => { r.headers[k] = v; };
  return r;
};

function world(over: { publicUrl?: string; bills?: any; statements?: any } = {}) {
  const mem = memoryQuickDb(() => NOW);
  mem.seed(UID, 'settings', 'bakery', { name: 'Anita', timezone: 'Asia/Kolkata', upiId: 'anita@upi' });
  mem.seed(UID, 'menu', 'cake', { name: 'Chocolate Truffle Cake', sellingPrice: 900, finishedGoodsStock: 5, recipe: [] });
  mem.seed(UID, 'menu', 'sourdough', { name: 'Sourdough', sellingPrice: 200, finishedGoodsStock: 3, recipe: [] });
  const bills = over.bills ?? vi.fn().mockResolvedValue({ token: 'bill123' });
  const statements = over.statements ?? vi.fn().mockResolvedValue({ token: 'stmt456' });
  const deps = { db: mem.db, now: () => NOW, newId: () => 'x', bills, statements, publicUrl: over.publicUrl ?? 'https://stockpot.example.com/' };
  return { mem, deps, bills, statements };
}

const order = (over: Record<string, any>) => ({ menuItemId: 'cake', quantity: 1, date: '2026-10-01', unitPriceAtSale: 900, paymentStatus: 'unpaid', ...over });
const list = async (deps: any) => { const r = res(); await createQuickPaymentsDueHandler(deps)({ uid: UID } as any, r); return r; };
const statement = async (deps: any, body: unknown, uid = UID) => { const r = res(); await createQuickStatementHandler(deps)({ uid, body } as any, r); return r; };

describe('GET /mobile/payments-due', () => {
  it('lists who owes, largest first, with the orders behind it and how long they have waited', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'p1', order({ customerName: 'Priya', customerPhone: '98765 43210', date: '2026-09-24' }));
    mem.seed(UID, 'orders', 'p2', order({ customerName: 'Priya', customerPhone: '98765 43210', menuItemId: 'sourdough', quantity: 2, unitPriceAtSale: 200, date: '2026-10-03' }));
    mem.seed(UID, 'orders', 'r1', order({ customerName: 'Rohan', quantity: 3, date: '2026-10-05' }));
    mem.seed(UID, 'orders', 'paid', order({ customerName: 'Meera', paymentStatus: 'paid' }));
    const r = await list(deps);
    expect(r.code).toBe(200);
    expect(r.headers['Cache-Control']).toBe('private, no-store');
    expect(r.body.today).toBe('2026-10-06');
    expect(r.body.total).toBe(4000);
    expect(r.body.customers.map((c: any) => [c.name, c.dueTotal, c.orderCount, c.daysOutstanding])).toEqual([['Rohan', 2700, 1, 1], ['Priya', 1300, 2, 12]]);
    const priya = r.body.customers[1];
    expect(priya).toMatchObject({ phone: '98765 43210', oldestDate: '2026-09-24' });
    expect(priya.orders).toEqual([
      { orderId: 'p1', date: '2026-09-24', items: [{ name: 'Chocolate Truffle Cake', quantity: 1 }], due: 900 },
      { orderId: 'p2', date: '2026-10-03', items: [{ name: 'Sourdough', quantity: 2 }], due: 400 },
    ]);
  });

  it('counts a multi-item order once, and what is owed is net of the advance already received', async () => {
    const { mem, deps } = world();
    const g = { customerName: 'Anu', orderGroupId: 'g1', date: '2026-10-02' };
    mem.seed(UID, 'orders', 'a', order({ ...g, advance: { amount: 300, method: 'upi' } }));
    mem.seed(UID, 'orders', 'b', order({ ...g, menuItemId: 'sourdough', quantity: 2, unitPriceAtSale: 200 }));
    const r = await list(deps);
    expect(r.body.customers).toHaveLength(1);
    expect(r.body.customers[0]).toMatchObject({ orderCount: 1, dueTotal: 1000 });
    expect(r.body.customers[0].orders[0].items).toHaveLength(2);
  });

  it('leaves out a pre-order not due yet and a cancelled order, and says so when nothing is owed', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'later', order({ customerName: 'Late', preorder: true, date: '2026-10-20' }));
    mem.seed(UID, 'orders', 'gone', order({ customerName: 'Gone', cancelledOn: '2026-10-02' }));
    const r = await list(deps);
    expect(r.body).toMatchObject({ total: 0, customers: [] });
  });

  it('is 500 with a message when the data cannot be read', async () => {
    const { deps } = world();
    const r = await list({ ...deps, db: { run: async () => { throw new Error('down'); } } });
    expect(r.code).toBe(500);
    expect(r.body.code).toBe('read_failed');
  });
});

describe('POST /mobile/payments/statement', () => {
  it('sends one statement for a customer with several unpaid orders: dated lines, the total due, the link, and WhatsApp to them', async () => {
    const { mem, deps, bills, statements } = world();
    mem.seed(UID, 'orders', 'p1', order({ customerName: 'Priya', customerPhone: '9876543210', date: '2026-09-24' }));
    mem.seed(UID, 'orders', 'p2', order({ customerName: 'Priya', customerPhone: '98765 43210', menuItemId: 'sourdough', quantity: 2, unitPriceAtSale: 200, date: '2026-10-03' }));
    const r = await statement(deps, { customerKey: 'phone:9876543210' });
    expect(r.code).toBe(200);
    expect(r.headers['Cache-Control']).toBe('private, no-store');
    expect(r.body).toMatchObject({ customerName: 'Priya', balanceDue: 1300, billUrl: 'https://stockpot.example.com/bill/stmt456' });
    expect(r.body.orderIds.sort()).toEqual(['p1', 'p2']);
    expect(r.body.shareMessage).toContain('your statement from Anita (2 orders');
    expect(r.body.shareMessage).toContain('• Thu 24 Sep: 1 × Chocolate Truffle Cake: ₹900.00');
    expect(r.body.shareMessage).toContain('• Sat 3 Oct: 2 × Sourdough: ₹400.00');
    expect(r.body.shareMessage).toContain('Balance due: ₹1,300.00');
    expect(r.body.shareMessage).toContain('Pay by UPI: anita@upi');
    expect(r.body.shareMessage).toContain('View or pay online: https://stockpot.example.com/bill/stmt456');
    expect(r.body.whatsappUrl).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
    expect(statements).toHaveBeenCalledWith(UID, expect.arrayContaining(['p1', 'p2']));
    expect(bills).not.toHaveBeenCalled();
  });

  it('gives a customer with one unpaid order the same invoice as the order\'s Send invoice, with the order\'s own link', async () => {
    const { mem, deps, bills, statements } = world();
    mem.seed(UID, 'orders', 'o1', order({ customerName: 'Ravi', quantity: 2, date: '2026-10-04', advance: { amount: 500, method: 'cash' } }));
    const r = await statement(deps, { customerKey: 'name:ravi' });
    expect(r.code).toBe(200);
    expect(r.body.balanceDue).toBe(1300);
    expect(r.body.shareMessage).toContain('your invoice from Anita');
    expect(r.body.shareMessage).not.toMatch(/statement/);
    expect(r.body.shareMessage).toContain('Advance received: ₹500.00');
    expect(r.body.shareMessage).toContain('Balance due: ₹1,300.00');
    expect(r.body.billUrl).toBe('https://stockpot.example.com/bill/bill123');
    expect(r.body.whatsappUrl).toBeNull(); // no phone: the app opens the share sheet
    expect(bills).toHaveBeenCalledWith(UID, 'o1');
    expect(statements).not.toHaveBeenCalled();
  });

  it('is 404 for someone who owes nothing or whom this owner does not have, and 400 without a customer', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'paid', order({ customerName: 'Meera', paymentStatus: 'paid' }));
    mem.seed('other', 'orders', 'theirs', order({ customerName: 'Stranger' }));
    for (const key of ['name:meera', 'name:stranger', 'name:nobody']) {
      const r = await statement(deps, { customerKey: key });
      expect(r.code).toBe(404);
      expect(r.body.code).toBe('no_pending');
    }
    for (const body of [{}, { customerKey: '' }, { customerKey: 5 }, null]) expect((await statement(deps, body)).code).toBe(400);
  });

  it('still sends the message, without a link, when the public link cannot be made', async () => {
    const { mem, deps } = world({ statements: vi.fn().mockResolvedValue(null) });
    mem.seed(UID, 'orders', 'a', order({ customerName: 'Priya' }));
    mem.seed(UID, 'orders', 'b', order({ customerName: 'Priya', date: '2026-10-02' }));
    const r = await statement(deps, { customerKey: 'name:priya' });
    expect(r.code).toBe(200);
    expect(r.body.billUrl).toBeUndefined();
    expect(r.body.shareMessage).toContain('Balance due: ₹1,800.00');
    expect(r.body.shareMessage).not.toMatch(/View or pay online/);
  });

  it('changes no order, can be asked again, and says so when it fails', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'a', order({ customerName: 'Priya' }));
    mem.seed(UID, 'orders', 'b', order({ customerName: 'Priya', date: '2026-10-02' }));
    const before = JSON.stringify([mem.read(UID, 'orders', 'a'), mem.read(UID, 'orders', 'b')]);
    await statement(deps, { customerKey: 'name:priya' });
    await statement(deps, { customerKey: 'name:priya' });
    expect(JSON.stringify([mem.read(UID, 'orders', 'a'), mem.read(UID, 'orders', 'b')])).toBe(before);
    const broken = await statement({ ...deps, db: { run: async () => { throw new Error('down'); } } }, { customerKey: 'name:priya' });
    expect(broken.code).toBe(500);
    expect(broken.body.code).toBe('statement_failed');
  });
});
