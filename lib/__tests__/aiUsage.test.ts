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

import { addRecipeUse, globalDay, peekAiUsage, reserveAiUse, reserveRecipeUse, usageDayFor } from '../aiUsage';

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
    expect(await peekAiUsage('u1', '2026-06-30', '2026-06-30')).toEqual({ byFeature: { chat: 2, briefing: 1, parse: 0, quick: 0, recipe: 0, promote: 0, cutout: 0, scene: 0 }, recipeMonth: 0, sceneMonth: 0, global: 3 });
    expect(JSON.stringify([...store.entries()])).toBe(before);
  });

  it('is all zero for a user with no use', async () => {
    expect(await peekAiUsage('nobody', '2026-06-30', '2026-06-30')).toEqual({ byFeature: { chat: 0, briefing: 0, parse: 0, quick: 0, recipe: 0, promote: 0, cutout: 0, scene: 0 }, recipeMonth: 0, sceneMonth: 0, global: 0 });
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

describe('recipe readings', () => {
  const recipe = { uid: 'u1', userDay: '2026-10-12', globalDayKey: '2026-10-12', dailyLimit: 15, monthlyLimit: 75, globalLimit: 100, globalWeight: 4 };

  it('reserves one recipe against the day and the month, and four calls against everyone', async () => {
    expect(await reserveRecipeUse(recipe)).toEqual({ ok: true, day: 1, month: 1 });
    expect(store.get('users/u1/aiUsage/2026-10-12')).toEqual({ recipe: 1 });
    expect(store.get('users/u1/aiUsage/2026-10')).toEqual({ recipe: 1 });
    expect(store.get('aiUsageGlobal/2026-10-12')).toEqual({ total: 4 });
  });

  it('counts the rest of a page afterwards, even past the limit, since the reading is paid for', async () => {
    store.set('users/u1/aiUsage/2026-10-12', { recipe: 13 });
    await reserveRecipeUse(recipe);
    expect(await addRecipeUse({ uid: 'u1', userDay: '2026-10-12', count: 3 })).toEqual({ day: 17, month: 4 });
    expect(await reserveRecipeUse(recipe)).toEqual({ ok: false, reason: 'user_limit' });
  });

  it('stops at the monthly limit, and at the global limit', async () => {
    store.set('users/u1/aiUsage/2026-10', { recipe: 75 });
    expect(await reserveRecipeUse(recipe)).toEqual({ ok: false, reason: 'month_limit' });
    store.clear();
    store.set('aiUsageGlobal/2026-10-12', { total: 97 });
    expect(await reserveRecipeUse(recipe)).toEqual({ ok: false, reason: 'global_limit' });
    expect(store.get('users/u1/aiUsage/2026-10-12')).toBeUndefined();
  });

  it('counts AI scenes the same way, in their own field', async () => {
    store.set('users/u1/aiUsage/2026-10', { recipe: 75, scene: 7 });
    expect(await reserveRecipeUse({ ...recipe, feature: 'scene', monthlyLimit: 8, globalWeight: 1 })).toEqual({ ok: true, day: 1, month: 8 });
    expect(store.get('users/u1/aiUsage/2026-10')).toEqual({ recipe: 75, scene: 8 });
    expect(await reserveRecipeUse({ ...recipe, feature: 'scene', monthlyLimit: 8, globalWeight: 1 })).toEqual({ ok: false, reason: 'month_limit' });
    expect((await peekAiUsage('u1', '2026-10-12', '2026-10-12')).sceneMonth).toBe(8);
  });

  it('shows the day and the month in the usage peek', async () => {
    store.set('users/u1/aiUsage/2026-10-12', { recipe: 2, chat: 1 });
    store.set('users/u1/aiUsage/2026-10', { recipe: 9 });
    const usage = await peekAiUsage('u1', '2026-10-12', '2026-10-12');
    expect(usage.byFeature.recipe).toBe(2);
    expect(usage.recipeMonth).toBe(9);
  });
});
