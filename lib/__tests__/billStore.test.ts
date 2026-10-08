import { describe, it, expect, vi, beforeEach } from 'vitest';

// A tiny in-memory Firestore: just the calls billStore makes.
const store = new Map<string, any>();
const ref = (path: string) => ({
  path,
  id: path.split('/').pop()!,
  get: async () => ({ exists: store.has(path), id: path.split('/').pop()!, data: () => store.get(path) }),
  collection: (name: string) => collectionAt(`${path}/${name}`),
});
function collectionAt(path: string): any {
  return {
    doc: (id: string) => ref(`${path}/${id}`),
    where: (field: string, _op: string, value: any) => ({
      get: async () => ({
        docs: [...store.entries()]
          .filter(([k, v]) => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/') && v[field] === value)
          .map(([k, v]) => ({ id: k.split('/').pop()!, data: () => v })),
      }),
    }),
  };
}
// Firestore's Admin SDK refuses a document with `undefined` anywhere in it (unless ignoreUndefinedProperties is on, which it is not here).
function refuseUndefined(value: any, path = ''): void {
  if (value === undefined) throw new Error(`Cannot use "undefined" as a Firestore value (found in field "${path}")`);
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) refuseUndefined(v, path ? `${path}.${k}` : k);
}
const fakeDb = {
  collection: (name: string) => collectionAt(name),
  getAll: async (...refs: any[]) => Promise.all(refs.map(r => r.get())),
  batch: () => {
    const ops: (() => void)[] = [];
    return {
      set: (r: any, data: any, opts?: any) => { refuseUndefined(data); ops.push(() => store.set(r.path, opts?.merge ? { ...store.get(r.path), ...data } : data)); },
      update: (r: any, data: any) => ops.push(() => store.set(r.path, { ...store.get(r.path), ...data })),
      commit: async () => { ops.forEach(op => op()); },
    };
  },
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => fakeDb }));

import { createOrRefreshBill, createOrRefreshStatement, getPublicBill } from '../billStore';

const U = 'users/u1';
beforeEach(() => {
  store.clear();
  store.set(`${U}/settings/bakery`, { name: 'Asha Bakes', address: '14 MG Road', phone: '+91 98450 00199', upiId: 'asha@okhdfcbank', currency: { code: 'INR', symbol: '₹' } });
  store.set(`${U}/menu/cake`, { name: 'Cake', sellingPrice: 500 });
  store.set(`${U}/menu/cookie`, { name: 'Cookie', sellingPrice: 20 });
  store.set(`${U}/orders/single`, { menuItemId: 'cake', quantity: 1, date: '2026-03-10', customerName: 'Priya', customerPhone: '+91 98450 10101' });
  store.set(`${U}/orders/g1`, { menuItemId: 'cake', quantity: 1, date: '2026-03-10', orderGroupId: 'grp', deliveryCharge: 40 });
  store.set(`${U}/orders/g2`, { menuItemId: 'cookie', quantity: 5, date: '2026-03-10', orderGroupId: 'grp' });
  store.set('users/other/orders/theirs', { menuItemId: 'cake', quantity: 1, date: '2026-03-10' });
});

describe('createOrRefreshBill', () => {
  it('creates a token once, stores it on the order and a snapshot under bills/<token>', async () => {
    const first = await createOrRefreshBill('u1', 'single');
    expect(first!.token).toMatch(/^[a-f0-9]{32}$/);
    expect(store.get(`${U}/orders/single`).billToken).toBe(first!.token);
    expect(store.get(`bills/${first!.token}`).uid).toBe('u1');
    expect(first!.bill.total).toBe(500);
    expect(first!.bill.upiId).toBe('asha@okhdfcbank');
  });

  it('reuses the same token on every later call, so shared links and QR codes keep working', async () => {
    const first = await createOrRefreshBill('u1', 'single');
    const second = await createOrRefreshBill('u1', 'single');
    const third = await createOrRefreshBill('u1', 'single');
    expect(second!.token).toBe(first!.token);
    expect(third!.token).toBe(first!.token);
    expect([...store.keys()].filter(k => k.startsWith('bills/'))).toHaveLength(1);
  });

  it('refreshes the snapshot when the order has changed, still on the same token', async () => {
    const first = await createOrRefreshBill('u1', 'single');
    store.set(`${U}/orders/single`, { ...store.get(`${U}/orders/single`), quantity: 3 });
    const again = await createOrRefreshBill('u1', 'single');
    expect(again!.token).toBe(first!.token);
    expect(again!.bill.total).toBe(1500);
    expect((await getPublicBill(first!.token))!.total).toBe(1500);
  });

  it('puts a multi-item order on one bill with one token shared by every item', async () => {
    const result = await createOrRefreshBill('u1', 'g2'); // asking via either item gives the same bill
    expect(result!.bill.lines.map(l => l.name).sort()).toEqual(['Cake', 'Cookie']);
    expect(result!.bill.total).toBe(500 + 100 + 40);
    expect(store.get(`${U}/orders/g1`).billToken).toBe(result!.token);
    expect(store.get(`${U}/orders/g2`).billToken).toBe(result!.token);
    expect((await createOrRefreshBill('u1', 'g1'))!.token).toBe(result!.token);
  });

  it("never reads another user's order", async () => {
    expect(await createOrRefreshBill('u1', 'theirs')).toBeNull();
    expect(await createOrRefreshBill('u1', 'missing')).toBeNull();
  });

  it('leaves the customer phone and other orders out of the stored snapshot', async () => {
    const { token } = (await createOrRefreshBill('u1', 'single'))!;
    const stored = JSON.stringify(store.get(`bills/${token}`).bill);
    expect(stored).not.toContain('98450 10101');
    expect(stored).not.toContain('g1');
  });

  it('has no UPI ID on the bill when the business has none or bills in another currency', async () => {
    store.set(`${U}/settings/bakery`, { ...store.get(`${U}/settings/bakery`), upiId: '' });
    expect((await createOrRefreshBill('u1', 'single'))!.bill.upiId).toBeUndefined();
    store.set(`${U}/settings/bakery`, { ...store.get(`${U}/settings/bakery`), upiId: 'a@b', currency: { code: 'USD', symbol: '$' } });
    expect((await createOrRefreshBill('u1', 'single'))!.bill.upiId).toBeUndefined();
  });
});

describe('getPublicBill', () => {
  it('returns the stored bill for a known token and null for an unknown one', async () => {
    const { token, bill } = (await createOrRefreshBill('u1', 'single'))!;
    expect(await getPublicBill(token)).toEqual(bill);
    expect(await getPublicBill('f'.repeat(32))).toBeNull();
  });
});

describe('a bill with nothing optional filled in', () => {
  it('is stored without the missing fields, since Firestore refuses undefined (no logo, no UPI ID, no customer name)', async () => {
    store.set(`${U}/settings/bakery`, { name: 'Asha Bakes', address: '', phone: '', currency: { code: 'INR', symbol: '₹' } });
    store.set(`${U}/orders/walkin`, { menuItemId: 'cake', quantity: 1, date: '2026-03-10' });
    const single = await createOrRefreshBill('u1', 'walkin');
    expect(single).not.toBeNull();
    const stored = store.get(`bills/${single!.token}`).bill;
    expect('logo' in stored.business).toBe(false);
    expect('upiId' in stored).toBe(false);
    expect('customerName' in stored).toBe(false);
    expect(stored.total).toBe(500);
    expect(await createOrRefreshStatement('u1', ['walkin', 'single'])).not.toBeNull();
  });
});

describe('createOrRefreshStatement', () => {
  beforeEach(() => {
    store.set(`${U}/orders/single`, { ...store.get(`${U}/orders/single`), paymentStatus: 'unpaid', customerName: 'Priya' });
  });

  it('puts the chosen orders on one bill, with a statement token on each', async () => {
    const result = await createOrRefreshStatement('u1', ['single', 'g1']);
    expect(result!.bill.kind).toBe('statement');
    // single (500) + the whole group g1+g2 (500 + 100 + 40 delivery), since a multi-item order is never split
    expect(result!.bill.lines).toHaveLength(3);
    expect(result!.bill.total).toBe(500 + 500 + 100 + 40);
    for (const id of ['single', 'g1', 'g2']) expect(store.get(`${U}/orders/${id}`).statementToken).toBe(result!.token);
    expect(store.get(`bills/${result!.token}`).uid).toBe('u1');
  });

  it('reuses the link when it is generated again, even after another order was added', async () => {
    const first = await createOrRefreshStatement('u1', ['single']);
    const again = await createOrRefreshStatement('u1', ['single']);
    expect(again!.token).toBe(first!.token);
    const grown = await createOrRefreshStatement('u1', ['single', 'g1']);
    expect(grown!.token).toBe(first!.token);
    expect((await getPublicBill(first!.token))!.total).toBe(500 + 500 + 100 + 40);
  });

  it('does not touch the single-order bill token', async () => {
    const single = await createOrRefreshBill('u1', 'single');
    const statement = await createOrRefreshStatement('u1', ['single']);
    expect(statement!.token).not.toBe(single!.token);
    expect(store.get(`${U}/orders/single`).billToken).toBe(single!.token);
    expect(store.get(`${U}/orders/single`).statementToken).toBe(statement!.token);
  });

  it("refuses when any order is missing or belongs to someone else", async () => {
    expect(await createOrRefreshStatement('u1', ['single', 'theirs'])).toBeNull();
    expect(await createOrRefreshStatement('u1', ['single', 'missing'])).toBeNull();
  });
});

describe('bills keep the price an order was made at', () => {
  it('prices from the stamp even after the menu price has changed, and survives a deleted item', async () => {
    store.set(`${U}/orders/stamped`, { menuItemId: 'cake', quantity: 2, date: '2026-03-10', unitPriceAtSale: 450, itemNameAtSale: 'Chocolate Truffle' });
    const first = await createOrRefreshBill('u1', 'stamped');
    expect(first!.bill.lines[0]).toMatchObject({ name: 'Chocolate Truffle', unitPrice: 450 });
    expect(first!.bill.total).toBe(900);

    store.set(`${U}/menu/cake`, { name: 'Cake', sellingPrice: 900 }); // the owner raises the price
    expect((await createOrRefreshBill('u1', 'stamped'))!.bill.total).toBe(900); // regenerating does not reprice it

    store.delete(`${U}/menu/cake`); // the owner deletes the item
    expect((await createOrRefreshBill('u1', 'stamped'))!.bill.total).toBe(900);
  });
});

describe('bills with a discount', () => {
  it('takes the discount off once for a multi-item order, and keeps it in the stored snapshot', async () => {
    store.set(`${U}/orders/g1`, { menuItemId: 'cake', quantity: 1, date: '2026-03-10', orderGroupId: 'grp', deliveryCharge: 40, discount: 60 });
    const result = await createOrRefreshBill('u1', 'g1');
    expect(result!.bill.discount).toBe(60);
    expect(result!.bill.total).toBe(500 + 100 + 40 - 60);
    expect(store.get(`bills/${result!.token}`).bill.discount).toBe(60);
  });

  it('takes each order\'s discount off a consolidated bill', async () => {
    store.set(`${U}/orders/single`, { menuItemId: 'cake', quantity: 1, date: '2026-03-10', customerName: 'Priya', discount: 50 });
    store.set(`${U}/orders/g1`, { menuItemId: 'cake', quantity: 1, date: '2026-03-10', orderGroupId: 'grp', discount: 10 });
    const result = await createOrRefreshStatement('u1', ['single', 'g1', 'g2']);
    expect(result!.bill.discount).toBe(60);
  });
});
