/**
 * quickDb.ts
 *
 * The data layer of the phone app's endpoints (`/api/mobile/*`): one owner's
 * business data read and written inside a single Firestore transaction, and
 * the idempotency record that stops a retried save from happening twice.
 *
 * The interface is small and plain so the endpoints can be tested against an
 * in-memory stand-in; `createAdminQuickDb` is the real one, on the Admin SDK.
 * Everything is scoped to `users/{uid}`, so an endpoint can only ever touch the
 * signed-in owner's own documents.
 */
import { getFirestore } from 'firebase-admin/firestore';
import type { PlanCollection, PlannedWrite } from '../src/utils/plans/types';

/** A stored document, with its id folded in as the web app reads them. */
export type QuickDoc = Record<string, any> & { id: string };

/** The collections an endpoint may read: everything it can write, plus the settings document. */
export type QuickCollection = PlanCollection | 'settings' | 'experiments' | 'wastageLogs' | 'devices' | 'mobileSettings';

/** Where an endpoint may write: the business collections, plus two the server alone uses (never matched by a Firestore rule). */
export type QuickWriteCollection = PlanCollection | 'devices' | 'mobileSettings';
export type QuickWrite = Omit<PlannedWrite, 'collection'> & { collection: QuickWriteCollection };

/** What an endpoint answered, kept so a repeated request gets the same answer. */
export interface StoredResult { status: number; body: unknown }

export interface QuickTx {
  get(collection: QuickCollection, id: string): Promise<QuickDoc | null>;
  /** The ones that exist, keyed by id. */
  getMany(collection: QuickCollection, ids: string[]): Promise<Map<string, QuickDoc>>;
  /** Every document in the collection whose `field` equals `value`. */
  where(collection: QuickCollection, field: string, value: unknown): Promise<QuickDoc[]>;
  /** Every document in the collection whose `field` is between `min` and `max`, inclusive (strings such as YYYY-MM-DD compare as text). */
  range(collection: QuickCollection, field: string, min: string, max: string): Promise<QuickDoc[]>;
  /** Every document in the collection. */
  all(collection: QuickCollection): Promise<QuickDoc[]>;
  /** Buffered, and applied together once the endpoint has finished reading. */
  apply(writes: QuickWrite[]): void;
  getResult(scopedKey: string): Promise<StoredResult | null>;
  putResult(scopedKey: string, result: StoredResult): void;
}

export interface QuickDb {
  run<T>(uid: string, fn: (tx: QuickTx) => Promise<T>): Promise<T>;
}

/** How long a saved answer is honoured. A phone retries within seconds; a day is generous. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** The `Idempotency-Key` header: a UUID or similar, 16 to 64 letters, digits, dashes and underscores. Null when missing or malformed. */
export function parseIdempotencyKey(header: unknown): string | null {
  return typeof header === 'string' && KEY_PATTERN.test(header) ? header : null;
}

/**
 * Runs `work` once per idempotency key. A repeat of a request that already succeeded gets the first answer back, with
 * nothing written again. Only a success is remembered: an answer that was an error can be tried again with the same key
 * once the owner has put it right. The check and the write share one transaction, so two retries racing each other cannot
 * both save.
 */
export async function withIdempotency(
  db: QuickDb,
  input: { uid: string; scope: string; key: string; now: () => number },
  work: (tx: QuickTx) => Promise<StoredResult>
): Promise<StoredResult & { replayed: boolean }> {
  const scopedKey = `${input.scope}_${input.key}`;
  return db.run(input.uid, async tx => {
    const earlier = await tx.getResult(scopedKey);
    if (earlier) return { ...earlier, replayed: true };
    const result = await work(tx);
    if (result.status >= 200 && result.status < 300) tx.putResult(scopedKey, result);
    return { ...result, replayed: false };
  });
}

/** The real thing: Firestore transactions through the Admin SDK. */
export function createAdminQuickDb(now: () => number = Date.now): QuickDb {
  return {
    async run(uid, fn) {
      const db = getFirestore();
      const user = db.collection('users').doc(uid);
      const ref = (collection: QuickCollection, id: string) => user.collection(collection).doc(id);

      return db.runTransaction(async t => {
        // Firestore wants every read before the first write, so writes are held back until the endpoint is done reading.
        const pending: Array<() => void> = [];
        const asDoc = (snap: FirebaseFirestore.DocumentSnapshot): QuickDoc => ({ ...snap.data(), id: snap.id }) as QuickDoc;
        const tx: QuickTx = {
          async get(collection, id) {
            const snap = await t.get(ref(collection, id));
            return snap.exists ? asDoc(snap) : null;
          },
          async getMany(collection, ids) {
            const unique = [...new Set(ids)];
            const out = new Map<string, QuickDoc>();
            if (unique.length === 0) return out;
            const snaps = await t.getAll(...unique.map(id => ref(collection, id)));
            for (const s of snaps) if (s.exists) out.set(s.id, asDoc(s));
            return out;
          },
          async where(collection, field, value) {
            const snap = await t.get(user.collection(collection).where(field, '==', value));
            return snap.docs.map(asDoc);
          },
          async range(collection, field, min, max) {
            const snap = await t.get(user.collection(collection).where(field, '>=', min).where(field, '<=', max));
            return snap.docs.map(asDoc);
          },
          async all(collection) {
            const snap = await t.get(user.collection(collection));
            return snap.docs.map(asDoc);
          },
          apply(writes) {
            for (const w of writes) {
              pending.push(() => { if (w.merge) t.set(ref(w.collection, w.id), w.data, { merge: true }); else t.set(ref(w.collection, w.id), w.data); });
            }
          },
          async getResult(scopedKey) {
            const snap = await t.get(user.collection('idempotency').doc(scopedKey));
            const data = snap.exists ? snap.data() : undefined;
            if (!data || typeof data.expiresAt !== 'number' || data.expiresAt < now()) return null;
            return { status: data.status, body: JSON.parse(data.body) };
          },
          putResult(scopedKey, result) {
            pending.push(() => t.set(user.collection('idempotency').doc(scopedKey), {
              status: result.status,
              body: JSON.stringify(result.body),
              createdAt: now(),
              expiresAt: now() + IDEMPOTENCY_TTL_MS,
            }));
          },
        };
        const out = await fn(tx);
        pending.forEach(f => f());
        return out;
      });
    },
  };
}
