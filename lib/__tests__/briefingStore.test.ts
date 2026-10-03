import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, any>();
const ref = (path: string): any => ({
  path,
  get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
  set: async (data: any, opts?: any) => { store.set(path, opts?.merge ? { ...store.get(path), ...data } : data); },
  collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
});
const fakeDb: any = {
  collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
  runTransaction: async (fn: (tx: any) => Promise<any>) => {
    const writes: (() => void)[] = [];
    const tx = { get: async (r: any) => r.get(), set: (r: any, data: any, opts?: any) => writes.push(() => store.set(r.path, opts?.merge ? { ...store.get(r.path), ...data } : data)) };
    const result = await fn(tx);
    writes.forEach(w => w());
    return result;
  },
};
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => fakeDb }));

import { beginGeneration, clearGeneration, GENERATION_LOCK_MS, getBriefing, saveBriefing } from '../briefingStore';

const path = 'users/u1/briefings/2026-06-30';
const briefing = { date: '2026-06-30', source: 'ai' as const, content: { why: 'Words.', attention: [] }, createdAt: 1, refreshes: 0 };
beforeEach(() => store.clear());

describe('briefingStore', () => {
  it('has nothing for a day with no briefing', async () => {
    expect(await getBriefing('u1', '2026-06-30')).toEqual({});
  });

  it('keeps a briefing for the day and gives it back without the internal marker', async () => {
    await saveBriefing('u1', '2026-06-30', briefing);
    const got = await getBriefing('u1', '2026-06-30');
    expect(got.briefing).toEqual(briefing);
    expect(got.generatingSince).toBeUndefined();
    expect(store.get(path).generating).toBeNull();
  });

  it('drops undefined fields, which Firestore would refuse (a fallback has no content)', async () => {
    await saveBriefing('u1', '2026-06-30', { ...briefing, source: 'fallback', content: undefined });
    expect('content' in store.get(path)).toBe(false);
  });

  it('keeps users and days apart', async () => {
    await saveBriefing('u1', '2026-06-30', briefing);
    expect(await getBriefing('u2', '2026-06-30')).toEqual({});
    expect(await getBriefing('u1', '2026-07-01')).toEqual({});
  });

  describe('claiming the day', () => {
    it('lets one request claim it and turns the next away', async () => {
      expect(await beginGeneration('u1', '2026-06-30', 1000)).toBe(true);
      expect(await beginGeneration('u1', '2026-06-30', 2000)).toBe(false);
      expect((await getBriefing('u1', '2026-06-30')).generatingSince).toBe(1000);
    });

    it('treats an old claim as abandoned', async () => {
      await beginGeneration('u1', '2026-06-30', 1000);
      expect(await beginGeneration('u1', '2026-06-30', 1000 + GENERATION_LOCK_MS - 1)).toBe(false);
      expect(await beginGeneration('u1', '2026-06-30', 1000 + GENERATION_LOCK_MS)).toBe(true);
    });

    it('is released when the briefing is saved or the attempt is cleared', async () => {
      await beginGeneration('u1', '2026-06-30', 1000);
      await saveBriefing('u1', '2026-06-30', briefing);
      expect(await beginGeneration('u1', '2026-06-30', 1001)).toBe(true);
      await clearGeneration('u1', '2026-06-30');
      expect(await beginGeneration('u1', '2026-06-30', 1002)).toBe(true);
    });

    it('keeps an existing briefing when an attempt to refresh it is cleared', async () => {
      await saveBriefing('u1', '2026-06-30', briefing);
      await beginGeneration('u1', '2026-06-30', 1000);
      await clearGeneration('u1', '2026-06-30');
      expect((await getBriefing('u1', '2026-06-30')).briefing).toEqual(briefing);
    });

    it('is not a briefing by itself', async () => {
      await beginGeneration('u1', '2026-06-30', 1000);
      expect((await getBriefing('u1', '2026-06-30')).briefing).toBeUndefined();
    });
  });
});
