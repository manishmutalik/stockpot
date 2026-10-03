import { describe, it, expect, vi, beforeEach } from 'vitest';

// A tiny in-memory Firestore: just the calls aiUsage makes, including transactions.
const store = new Map<string, any>();
const ref = (path: string): any => ({
  path,
  get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
  collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
});
const fakeDb: any = {
  collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
  runTransaction: async (fn: (tx: any) => Promise<any>) => {
    const writes: (() => void)[] = [];
    const tx = {
      get: async (r: any) => r.get(),
      set: (r: any, data: any, opts?: any) => writes.push(() => store.set(r.path, opts?.merge ? { ...store.get(r.path), ...data } : data)),
    };
    const result = await fn(tx);
    writes.forEach(w => w());
    return result;
  },
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => fakeDb }));

import { globalDay, peekAiUsage, reserveAiUse, usageDayFor } from '../aiUsage';

const base = { uid: 'u1', feature: 'chat' as const, perUserLimit: 3, globalLimit: 5, userDay: '2026-06-30', globalDayKey: '2026-06-30' };
beforeEach(() => store.clear());

describe('reserveAiUse', () => {
  it('counts each use for the user and for everyone, until the user\'s limit', async () => {
    expect(await reserveAiUse(base)).toEqual({ ok: true, used: 1, limit: 3 });
    expect(await reserveAiUse(base)).toEqual({ ok: true, used: 2, limit: 3 });
    expect(await reserveAiUse(base)).toEqual({ ok: true, used: 3, limit: 3 });
    expect(await reserveAiUse(base)).toEqual({ ok: false, reason: 'user_limit', used: 3, limit: 3 });
    expect(store.get('users/u1/aiUsage/2026-06-30')).toEqual({ chat: 3 });
    expect(store.get('aiUsageGlobal/2026-06-30')).toEqual({ total: 3 });
  });

  it('does not count a refused request', async () => {
    for (let i = 0; i < 5; i++) await reserveAiUse(base);
    expect(store.get('aiUsageGlobal/2026-06-30')).toEqual({ total: 3 });
  });

  it('counts features separately for a user but together for everyone', async () => {
    await reserveAiUse(base);
    await reserveAiUse({ ...base, feature: 'briefing' });
    await reserveAiUse({ ...base, feature: 'parse' });
    expect(store.get('users/u1/aiUsage/2026-06-30')).toEqual({ chat: 1, briefing: 1, parse: 1 });
    expect(store.get('aiUsageGlobal/2026-06-30')).toEqual({ total: 3 });
  });

  it('stops everyone at the global ceiling, even a user who has used nothing', async () => {
    for (const uid of ['a', 'b', 'c', 'd', 'e']) await reserveAiUse({ ...base, uid });
    expect(await reserveAiUse({ ...base, uid: 'fresh' })).toEqual({ ok: false, reason: 'global_limit', used: 5, limit: 5 });
    expect(store.has('users/fresh/aiUsage/2026-06-30')).toBe(false);
  });

  it('starts again on a new day', async () => {
    for (let i = 0; i < 3; i++) await reserveAiUse(base);
    expect(await reserveAiUse({ ...base, userDay: '2026-07-01', globalDayKey: '2026-07-01' })).toEqual({ ok: true, used: 1, limit: 3 });
  });

  it('keeps users apart', async () => {
    for (let i = 0; i < 3; i++) await reserveAiUse(base);
    expect(await reserveAiUse({ ...base, uid: 'u2' })).toMatchObject({ ok: true, used: 1 });
  });

  it('a limit of 0 allows nothing', async () => {
    expect(await reserveAiUse({ ...base, perUserLimit: 0 })).toMatchObject({ ok: false, reason: 'user_limit' });
  });

  it('is atomic: the check and the count happen in one transaction', async () => {
    const spy = vi.spyOn(fakeDb, 'runTransaction');
    await reserveAiUse(base);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('peekAiUsage', () => {
  it('reports what has been used without using any', async () => {
    await reserveAiUse(base); await reserveAiUse(base); await reserveAiUse({ ...base, feature: 'briefing' });
    const before = JSON.stringify([...store.entries()]);
    expect(await peekAiUsage('u1', '2026-06-30', '2026-06-30')).toEqual({ byFeature: { chat: 2, briefing: 1, parse: 0 }, global: 3 });
    expect(JSON.stringify([...store.entries()])).toBe(before);
  });

  it('is all zero for a user with no use', async () => {
    expect(await peekAiUsage('nobody', '2026-06-30', '2026-06-30')).toEqual({ byFeature: { chat: 0, briefing: 0, parse: 0 }, global: 0 });
  });
});

describe('the day an allowance runs on', () => {
  const lateEvening = new Date('2026-03-10T20:30:00Z'); // 02:00 on the 11th in India

  it('is the user\'s business date, so an Indian shop\'s day rolls over at its own midnight', async () => {
    store.set('users/u1/settings/bakery', { timezone: 'Asia/Kolkata' });
    expect(await usageDayFor('u1', lateEvening)).toBe('2026-03-11');
    store.set('users/u1/settings/bakery', { timezone: 'UTC' });
    expect(await usageDayFor('u1', lateEvening)).toBe('2026-03-10');
  });

  it('defaults to India with no setting, or an invalid one', async () => {
    expect(await usageDayFor('nobody', lateEvening)).toBe('2026-03-11');
    store.set('users/u1/settings/bakery', { timezone: 'Mars/Olympus' });
    expect(await usageDayFor('u1', lateEvening)).toBe('2026-03-11');
  });

  it('the global day is UTC', () => {
    expect(globalDay(lateEvening)).toBe('2026-03-10');
  });
});
