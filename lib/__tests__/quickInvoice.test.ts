import { describe, it, expect, vi } from 'vitest';
import { createQuickInvoiceHandler } from '../quickRoutes';
import { memoryQuickDb } from './memoryQuickDb';

const NOW = Date.parse('2026-10-06T04:30:00Z');
const UID = 'u1';

const res = () => {
  const r: any = { code: 200, headers: {} };
  r.status = (c: number) => { r.code = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  r.setHeader = (k: string, v: string) => { r.headers[k] = v; };
  return r;
};

function world(over: { bills?: any; publicUrl?: string } = {}) {
  const mem = memoryQuickDb(() => NOW);
  mem.seed(UID, 'settings', 'bakery', { name: 'Anita', timezone: 'Asia/Kolkata' });
  mem.seed(UID, 'menu', 'cake', { name: 'Chocolate Truffle Cake', sellingPrice: 900, finishedGoodsStock: 5, recipe: [] });
  mem.seed(UID, 'menu', 'sourdough', { name: 'Sourdough', sellingPrice: 200, finishedGoodsStock: 3, recipe: [] });
  const bills = over.bills ?? vi.fn().mockResolvedValue({ token: 'tok123' });
  const deps = { db: mem.db, now: () => NOW, newId: () => 'x', bills, publicUrl: over.publicUrl ?? 'https://stockpot.example.com/' };
  return { mem, deps, bills };
}

const invoice = async (deps: any, id: string, uid = UID) => {
  const r = res();
  await createQuickInvoiceHandler(deps)({ uid, params: { id } } as any, r);
  return r;
};

describe('POST /mobile/orders/:id/invoice', () => {
  it('sends the bill for an unpaid order with an advance: what is owed, the link, and WhatsApp to the customer', async () => {
    const { mem, deps, bills } = world();
    mem.seed(UID, 'orders', 'o1', {
      menuItemId: 'cake', quantity: 2, date: '2026-10-10', customerName: 'Priya Sharma', customerPhone: '98765 43210', unitPriceAtSale: 900,
      paymentStatus: 'unpaid', preorder: true, advance: { amount: 500, method: 'upi' },
    });
    const r = await invoice(deps, 'o1');
    expect(r.code).toBe(200);
    expect(r.headers['Cache-Control']).toBe('private, no-store');
    expect(r.body.orderIds).toEqual(['o1']);
    expect(r.body.balanceDue).toBe(1300);
    expect(r.body.billUrl).toBe('https://stockpot.example.com/bill/tok123');
    // With a link the message is a short summary and the link; the items, UPI button and card button are on the page.
    expect(r.body.shareMessage.split('\n')).toEqual([
      'Hi Priya Sharma, here\'s your invoice from Anita (O1, 10 Oct 2026).',
      'Total: ₹1,800.00',
      'Advance received: ₹500.00',
      '*Balance due: ₹1,300.00*',
      '',
      'View the full bill and pay online:',
      'https://stockpot.example.com/bill/tok123',
    ]);
    expect(r.body.shareMessage).not.toMatch(/Paid in full/);
    expect(r.body.whatsappUrl).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
    expect(bills).toHaveBeenCalledWith(UID, 'o1');
  });

  it('says paid in full when nothing is owed', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'o1', { menuItemId: 'sourdough', quantity: 2, date: '2026-10-06', customerName: 'Ravi', unitPriceAtSale: 200, paymentStatus: 'paid', paymentMethod: 'cash' });
    const r = await invoice(deps, 'o1');
    expect(r.code).toBe(200);
    expect(r.body.balanceDue).toBe(0);
    expect(r.body.shareMessage).toMatch(/Paid in full\. Thank you!/);
    expect(r.body.shareMessage).not.toMatch(/Balance due/);
    expect(r.body.whatsappUrl).toBeNull(); // no phone number: the app opens the share sheet instead
  });

  it('covers every item of a multi-item order, once, from any one of them', async () => {
    const { mem, deps } = world();
    const common = { date: '2026-10-06', customerName: 'Priya', orderGroupId: 'g1', paymentStatus: 'unpaid' };
    mem.seed(UID, 'orders', 'a', { ...common, menuItemId: 'cake', quantity: 1, unitPriceAtSale: 900 });
    mem.seed(UID, 'orders', 'b', { ...common, menuItemId: 'sourdough', quantity: 2, unitPriceAtSale: 200 });
    const r = await invoice(deps, 'b');
    expect(r.body.orderIds.sort()).toEqual(['a', 'b']);
    expect(r.body.balanceDue).toBe(1300);
    expect(r.body.shareMessage).toContain('*Balance due: ₹1,300.00*');
    // Without a link the whole invoice is in the message, every item of the order.
    const plain = await invoice({ ...deps, publicUrl: '' }, 'b');
    expect(plain.body.shareMessage).toContain('Chocolate Truffle Cake');
    expect(plain.body.shareMessage).toContain('Sourdough');
  });

  it('leaves out a cancelled item of the group, and refuses an order that is wholly cancelled', async () => {
    const { mem, deps } = world();
    const common = { date: '2026-10-06', orderGroupId: 'g1', paymentStatus: 'unpaid' };
    mem.seed(UID, 'orders', 'a', { ...common, menuItemId: 'cake', quantity: 1, unitPriceAtSale: 900 });
    mem.seed(UID, 'orders', 'b', { ...common, menuItemId: 'sourdough', quantity: 2, unitPriceAtSale: 200, cancelledOn: '2026-10-06' });
    const partly = await invoice(deps, 'a');
    expect(partly.body.orderIds).toEqual(['a']);
    expect(partly.body.balanceDue).toBe(900);
    const wholly = await invoice(deps, 'b');
    expect(wholly.code).toBe(200); // b alone was cancelled but its group still has a live order
    mem.seed(UID, 'orders', 'solo', { menuItemId: 'cake', quantity: 1, date: '2026-10-06', unitPriceAtSale: 900, paymentStatus: 'unpaid', cancelledOn: '2026-10-06' });
    const gone = await invoice(deps, 'solo');
    expect(gone.code).toBe(409);
    expect(gone.body.code).toBe('cancelled');
  });

  it('is 404 for an order that is not there or is someone else\'s, and 400 for a bad id', async () => {
    const { mem, deps } = world();
    mem.seed('other', 'orders', 'theirs', { menuItemId: 'cake', quantity: 1, date: '2026-10-06', unitPriceAtSale: 900, paymentStatus: 'unpaid' });
    expect((await invoice(deps, 'nope')).code).toBe(404);
    expect((await invoice(deps, 'theirs')).code).toBe(404);
    expect((await invoice(deps, 'bad id!')).code).toBe(400);
  });

  it('still sends the bill, without a link, when the public link cannot be made', async () => {
    for (const w of [world({ bills: vi.fn().mockResolvedValue(null) }), world({ bills: undefined as any, publicUrl: '' })]) {
      w.mem.seed(UID, 'orders', 'o1', { menuItemId: 'cake', quantity: 1, date: '2026-10-06', customerPhone: '9876543210', unitPriceAtSale: 900, paymentStatus: 'unpaid' });
      const deps = w.deps.publicUrl === '' ? { ...w.deps, bills: undefined } : w.deps;
      const r = await invoice(deps, 'o1');
      expect(r.code).toBe(200);
      expect(r.body.billUrl).toBeUndefined();
      expect(r.body.shareMessage).toContain('Chocolate Truffle Cake');
      expect(r.body.whatsappUrl).toMatch(/wa\.me/);
    }
  });

  it('changes nothing about the order, and says so when it fails', async () => {
    const { mem, deps } = world();
    mem.seed(UID, 'orders', 'o1', { menuItemId: 'cake', quantity: 1, date: '2026-10-06', unitPriceAtSale: 900, paymentStatus: 'unpaid' });
    const before = JSON.stringify(mem.read(UID, 'orders', 'o1'));
    await invoice(deps, 'o1');
    await invoice(deps, 'o1'); // safe to repeat
    expect(JSON.stringify(mem.read(UID, 'orders', 'o1'))).toBe(before);
    const broken = await invoice({ ...deps, db: { run: async () => { throw new Error('down'); } } }, 'o1');
    expect(broken.code).toBe(500);
    expect(broken.body.code).toBe('invoice_failed');
  });
});
