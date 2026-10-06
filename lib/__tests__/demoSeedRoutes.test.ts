// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// A tiny Firestore: documents in a map, one transaction.
const store = new Map<string, any>();
const refOf = (path: string) => ({ path, collection: (name: string) => ({ doc: (id: string) => refOf(`${path}/${name}/${id}`) }) });
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (c: string) => ({ doc: (id: string) => refOf(`${c}/${id}`) }),
    runTransaction: async (fn: (t: any) => Promise<any>) => {
      const pending: Array<() => void> = [];
      const out = await fn({
        get: async (r: any) => ({ exists: store.has(r.path) }),
        set: (r: any, data: any) => { pending.push(() => store.set(r.path, data)); },
      });
      pending.forEach(f => f());
      return out;
    },
  }),
}));

import { createDemoSeedHandler, seedDemoKitchen } from '../demoSeedRoutes';

const res = () => { const r: any = { code: 200 }; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };
const NOW = Date.parse('2026-10-06T04:30:00Z');
const demo = { uid: 'demo1', email: 'demo_1759_42@bettereat.com' };

describe('POST /mobile/demo/seed', () => {
  it('fills a demo account, working out today in India', async () => {
    const seed = vi.fn().mockResolvedValue(true);
    const r = res();
    await createDemoSeedHandler({ seed, now: () => NOW })(demo as any, r);
    expect(r.body).toEqual({ seeded: true });
    expect(seed).toHaveBeenCalledWith('demo1', '2026-10-06');
  });

  it('refuses a real account, so a real kitchen can never be touched', async () => {
    for (const email of ['asha@example.com', undefined, 'demo@bettereat.com']) {
      const seed = vi.fn();
      const r = res();
      await createDemoSeedHandler({ seed, now: () => NOW })({ uid: 'u1', email } as any, r);
      expect(r.code, String(email)).toBe(403);
      expect(r.body.code).toBe('not_demo');
      expect(seed).not.toHaveBeenCalled();
    }
  });

  it('says it could not when the write fails', async () => {
    const r = res();
    await createDemoSeedHandler({ seed: vi.fn().mockRejectedValue(new Error('boom')), now: () => NOW })(demo as any, r);
    expect(r.code).toBe(500);
    expect(r.body.code).toBe('seed_failed');
  });
});

describe('seedDemoKitchen', () => {
  it('writes the sample kitchen under the account once, and not again', async () => {
    store.clear();
    expect(await seedDemoKitchen('demo1', '2026-10-06')).toBe(true);
    const paths = [...store.keys()];
    expect(paths).toContain('users/demo1/settings/bakery');
    expect(paths.some(p => p.startsWith('users/demo1/materials/'))).toBe(true);
    expect(paths.some(p => p.startsWith('users/demo1/menu/'))).toBe(true);
    expect(paths.some(p => p.startsWith('users/demo1/orders/'))).toBe(true);
    expect(paths.some(p => p.startsWith('users/demo1/productionRuns/'))).toBe(true);
    expect(paths.every(p => p.startsWith('users/demo1/'))).toBe(true);
    expect(paths.length).toBeLessThanOrEqual(500);

    const before = JSON.stringify([...store]);
    expect(await seedDemoKitchen('demo1', '2026-10-07')).toBe(false);
    expect(JSON.stringify([...store])).toBe(before);
  });

  it('leaves a kitchen that already has settings alone', async () => {
    store.clear();
    store.set('users/real1/settings/bakery', { name: 'Anita' });
    expect(await seedDemoKitchen('real1', '2026-10-06')).toBe(false);
    expect([...store.keys()]).toEqual(['users/real1/settings/bakery']);
  });
});
