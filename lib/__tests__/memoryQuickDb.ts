/**
 * An in-memory stand-in for the Firestore transaction layer (lib/quickDb.ts), for testing the phone app's endpoints.
 * Like the real one it reads a consistent view, holds writes back until the work has finished, and applies them
 * together, or not at all if the work throws.
 */
import { IDEMPOTENCY_TTL_MS, type QuickCollection, type QuickDb, type QuickDoc, type QuickTx, type StoredResult } from '../quickDb';

export function memoryQuickDb(now: () => number = () => Date.now()) {
  const docs = new Map<string, Record<string, any>>();
  const key = (uid: string, collection: string, id: string) => `${uid}/${collection}/${id}`;
  const stats = { transactions: 0, writes: 0 };

  const db: QuickDb = {
    async run(uid, fn) {
      stats.transactions++;
      const pending: Array<() => void> = [];
      const withId = (id: string, d: Record<string, any>): QuickDoc => ({ ...d, id });
      const tx: QuickTx = {
        async get(collection, id) {
          const d = docs.get(key(uid, collection, id));
          return d ? withId(id, d) : null;
        },
        async getMany(collection, ids) {
          const out = new Map<string, QuickDoc>();
          for (const id of new Set(ids)) { const d = docs.get(key(uid, collection, id)); if (d) out.set(id, withId(id, d)); }
          return out;
        },
        async where(collection, field, value) {
          const prefix = `${uid}/${collection}/`;
          return [...docs].filter(([k, d]) => k.startsWith(prefix) && d[field] === value).map(([k, d]) => withId(k.slice(prefix.length), d));
        },
        apply(writes) {
          for (const w of writes) pending.push(() => {
            const k = key(uid, w.collection, w.id);
            docs.set(k, w.merge ? { ...(docs.get(k) ?? {}), ...structuredClone(w.data) } : structuredClone(w.data));
            stats.writes++;
          });
        },
        async getResult(scopedKey) {
          const d = docs.get(key(uid, 'idempotency', scopedKey));
          if (!d || d.expiresAt < now()) return null;
          return { status: d.status, body: JSON.parse(d.body) } as StoredResult;
        },
        putResult(scopedKey, result) {
          pending.push(() => { docs.set(key(uid, 'idempotency', scopedKey), { status: result.status, body: JSON.stringify(result.body), expiresAt: now() + IDEMPOTENCY_TTL_MS }); });
        },
      };
      const out = await fn(tx);
      pending.forEach(f => f());
      return out;
    },
  };

  return {
    db, stats,
    seed(uid: string, collection: QuickCollection, id: string, doc: Record<string, any>) { docs.set(key(uid, collection, id), structuredClone(doc)); },
    read(uid: string, collection: QuickCollection | 'idempotency', id: string) { return docs.get(key(uid, collection, id)) ?? null; },
    all(uid: string, collection: QuickCollection | 'idempotency'): Array<Record<string, any> & { id: string }> {
      const prefix = `${uid}/${collection}/`;
      return [...docs].filter(([k]) => k.startsWith(prefix)).map(([k, d]) => ({ ...d, id: k.slice(prefix.length) }));
    },
  };
}
