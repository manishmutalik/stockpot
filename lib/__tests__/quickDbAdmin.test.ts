import { describe, it, expect, vi, beforeEach } from 'vitest';

// A tiny Firestore: documents in a map, a transaction that records the order of its calls.
const store = new Map<string, any>();
const calls: string[] = [];
const ref = (path: string) => ({ path });
const snapOf = (path: string) => ({ exists: store.has(path), id: path.split('/').pop()!, data: () => store.get(path) });

const userCollection = (uidPath: string) => (name: string) => ({
  doc: (id: string) => ref(`${uidPath}/${name}/${id}`),
  where: (field: string, _op: string, value: unknown) => ({ q: { collection: `${uidPath}/${name}`, field, value } }),
});
const firestore = {
  collection: (c: string) => ({ doc: (uid: string) => ({ collection: userCollection(`${c}/${uid}`) }) }),
  runTransaction: async (fn: (t: any) => Promise<any>) => fn({
    get: async (target: any) => {
      if (target.q) {
        calls.push('query');
        const docs = [...store].filter(([p, d]) => p.startsWith(`${target.q.collection}/`) && d[target.q.field] === target.q.value).map(([p]) => snapOf(p));
        return { docs };
      }
      calls.push(`read ${target.path}`);
      return snapOf(target.path);
    },
    getAll: async (...refs: any[]) => { calls.push(`readAll ${refs.map(r => r.path).join(',')}`); return refs.map(r => snapOf(r.path)); },
    set: (target: any, data: any, opts?: any) => {
      calls.push(`write ${target.path}${opts?.merge ? ' (merge)' : ''}`);
      store.set(target.path, opts?.merge ? { ...(store.get(target.path) ?? {}), ...data } : data);
    },
  }),
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => firestore }));

import { createAdminQuickDb, withIdempotency, IDEMPOTENCY_TTL_MS } from '../quickDb';

const NOW = 1_760_000_000_000;
beforeEach(() => { store.clear(); calls.length = 0; });

describe('createAdminQuickDb', () => {
  it('reads from the owner\'s own documents, with the id folded in, and returns null for one that is missing', async () => {
    store.set('users/u1/menu/cake', { name: 'Cake' });
    const db = createAdminQuickDb(() => NOW);
    await db.run('u1', async tx => {
      expect(await tx.get('menu', 'cake')).toEqual({ name: 'Cake', id: 'cake' });
      expect(await tx.get('menu', 'nope')).toBeNull();
      const many = await tx.getMany('menu', ['cake', 'cake', 'nope']);
      expect([...many.keys()]).toEqual(['cake']);
    });
    expect(calls.filter(c => c.startsWith('readAll'))).toEqual(['readAll users/u1/menu/cake,users/u1/menu/nope']); // asked once per id
  });

  it('never reads another owner\'s documents', async () => {
    store.set('users/u2/menu/cake', { name: 'Theirs' });
    const db = createAdminQuickDb(() => NOW);
    await db.run('u1', async tx => { expect(await tx.get('menu', 'cake')).toBeNull(); });
  });

  it('holds writes back until all the reads are done, then applies them with merge where planned', async () => {
    store.set('users/u1/menu/cake', { name: 'Cake', finishedGoodsStock: 5 });
    const db = createAdminQuickDb(() => NOW);
    await db.run('u1', async tx => {
      await tx.get('menu', 'cake');
      tx.apply([{ collection: 'menu', id: 'cake', data: { finishedGoodsStock: 3 }, merge: true }]);
      await tx.getMany('materials', ['flour']); // a read AFTER apply: Firestore would refuse a write that came before it
      tx.apply([{ collection: 'orders', id: 'o1', data: { id: 'o1' }, merge: false }]);
    });
    const firstWrite = calls.findIndex(c => c.startsWith('write'));
    const lastRead = calls.map((c, i) => (c.startsWith('read') ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    expect(lastRead).toBeLessThan(firstWrite);
    expect(calls.filter(c => c.startsWith('write'))).toEqual(['write users/u1/menu/cake (merge)', 'write users/u1/orders/o1']);
    expect(store.get('users/u1/menu/cake')).toEqual({ name: 'Cake', finishedGoodsStock: 3 });
  });

  it('writes nothing when the work throws', async () => {
    const db = createAdminQuickDb(() => NOW);
    await expect(db.run('u1', async tx => { tx.apply([{ collection: 'orders', id: 'o1', data: {}, merge: false }]); throw new Error('boom'); })).rejects.toThrow('boom');
    expect(store.size).toBe(0);
  });

  it('finds documents by a field', async () => {
    store.set('users/u1/orders/a', { paymentStatus: 'unpaid' });
    store.set('users/u1/orders/b', { paymentStatus: 'paid' });
    const db = createAdminQuickDb(() => NOW);
    await db.run('u1', async tx => { expect((await tx.where('orders', 'paymentStatus', 'unpaid')).map(d => d.id)).toEqual(['a']); });
  });
});

describe('idempotency on the real layer', () => {
  const input = { uid: 'u1', scope: 'orders', key: 'k'.repeat(20) };

  it('stores a success with an expiry a day out, and answers a repeat from it without running the work again', async () => {
    const db = createAdminQuickDb(() => NOW);
    const work = vi.fn(async (tx: any) => { tx.apply([{ collection: 'orders', id: 'o1', data: { id: 'o1' }, merge: false }]); return { status: 201, body: { orderIds: ['o1'] } }; });
    const first = await withIdempotency(db, { ...input, now: () => NOW }, work);
    expect(first).toMatchObject({ status: 201, replayed: false });
    const saved = store.get(`users/u1/idempotency/orders_${'k'.repeat(20)}`);
    expect(saved).toMatchObject({ status: 201, createdAt: NOW, expiresAt: NOW + IDEMPOTENCY_TTL_MS });
    expect(JSON.parse(saved.body)).toEqual({ orderIds: ['o1'] });

    const again = await withIdempotency(db, { ...input, now: () => NOW }, work);
    expect(again).toMatchObject({ status: 201, body: { orderIds: ['o1'] }, replayed: true });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('does not store a failure', async () => {
    const db = createAdminQuickDb(() => NOW);
    await withIdempotency(db, { ...input, now: () => NOW }, async () => ({ status: 409, body: { error: 'no' } }));
    expect(store.size).toBe(0);
  });

  it('ignores an expired record and saves again', async () => {
    store.set(`users/u1/idempotency/orders_${'k'.repeat(20)}`, { status: 201, body: '{}', createdAt: 1, expiresAt: NOW - 1 });
    const db = createAdminQuickDb(() => NOW);
    const out = await withIdempotency(db, { ...input, now: () => NOW }, async () => ({ status: 201, body: { fresh: true } }));
    expect(out).toMatchObject({ replayed: false, body: { fresh: true } });
  });
});
