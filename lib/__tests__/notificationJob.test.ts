// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { giveBack, runNotificationJob, STATE_DOC, NOTIFICATIONS_DOC } from '../notificationJob';
import { emptyNotificationState } from '../../src/utils/quickNotificationJob';
import { memoryQuickDb } from './memoryQuickDb';
import type { PushMessage, PushResult } from '../expoPush';

const UID = 'u1';
const MORNING = Date.parse('2026-10-06T02:35:00Z'); // 08:05 in India
const TOKEN_1 = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaa]';
const TOKEN_2 = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbb]';

function world(opts: { clock?: number; phones?: boolean } = {}) {
  let clock = opts.clock ?? MORNING;
  const mem = memoryQuickDb(() => clock);
  mem.seed(UID, 'settings', 'bakery', { name: 'Anita Bakes', timezone: 'Asia/Kolkata' });
  if (opts.phones !== false) {
    mem.seed(UID, 'devices', 'd1', { token: TOKEN_1, platform: 'android' });
    mem.seed(UID, 'devices', 'd2', { token: TOKEN_2, platform: 'ios' });
  }
  mem.seed(UID, 'menu', 'cake', { name: 'Chocolate Cake', sellingPrice: 900, finishedGoodsStock: 5, recipe: [] });
  mem.seed(UID, 'materials', 'butter', { name: 'Butter', unit: 'g', initialStock: 200, costPerUnit: 0.5, threshold: 500 });
  mem.seed(UID, 'orders', 'o1', { menuItemId: 'cake', quantity: 2, date: '2026-10-06', preorder: true, stockClaimed: false, unitPriceAtSale: 900, customerName: 'Priya' });
  mem.seed(UID, 'orders', 'o2', { menuItemId: 'cake', quantity: 1, date: '2026-10-01', unitPriceAtSale: 900, customerName: 'Ravi', paymentStatus: 'unpaid', fulfilled: true });
  const sent: PushMessage[] = [];
  let answer: (m: PushMessage[]) => PushResult[] = m => m.map(() => ({ ok: true }));
  const send = vi.fn(async (m: PushMessage[]) => { sent.push(...m); return answer(m); });
  const deps = { db: mem.db, now: () => clock, listUsers: async () => [UID], send };
  return { mem, deps, sent, send, setClock: (t: number) => { clock = t; }, answer: (f: typeof answer) => { answer = f; } };
}

describe('the morning run', () => {
  it('sends the morning summary and the running-low notice to every phone, once', async () => {
    const { deps, sent, mem } = world();
    const summary = await runNotificationJob(deps);
    expect(summary).toEqual({ users: 1, notifications: 2, delivered: 2, released: 0, errors: 0 });
    expect(sent).toHaveLength(4);
    const morning = sent.filter(m => m.data?.type === 'morning');
    expect(morning.map(m => m.to).sort()).toEqual([TOKEN_1, TOKEN_2]);
    expect(morning[0].title).toBe('Today at Anita Bakes');
    expect(morning[0].body).toContain('1 order due today');
    expect(morning[0].body).toContain('payment pending');
    expect(morning[0].body).toContain('Butter running low');
    const low = sent.find(m => m.data?.type === 'lowStock')!;
    expect(low).toMatchObject({ title: 'Butter is running low', body: '200 g left' });
    expect(mem.read(UID, 'mobileSettings', STATE_DOC)).toMatchObject({ sent: { morning: '2026-10-06', lowStock: '2026-10-06' }, lowNotified: { butter: true } });
  });

  it('sends nothing more when it runs again, even straight away (an overlapping run finds it claimed)', async () => {
    const { deps, sent } = world();
    await runNotificationJob(deps);
    sent.length = 0;
    const again = await runNotificationJob(deps);
    expect(again.notifications).toBe(0);
    expect(sent).toEqual([]);
  });

  it('does not wake anyone outside the windows', async () => {
    const afternoon = world({ clock: Date.parse('2026-10-06T09:50:00Z') }); // 15:20
    expect((await runNotificationJob(afternoon.deps)).notifications).toBe(0);
    const night = world({ clock: Date.parse('2026-10-05T20:30:00Z') }); // 02:00
    expect((await runNotificationJob(night.deps)).notifications).toBe(0);
    expect(afternoon.send).not.toHaveBeenCalled();
    expect(night.send).not.toHaveBeenCalled();
  });

  it('respects the owner\'s switches', async () => {
    const { deps, sent, mem } = world();
    mem.seed(UID, 'mobileSettings', NOTIFICATIONS_DOC, { morningSummary: { enabled: false, time: '08:00' }, lowStock: false, useBy: false, dueTomorrow: { enabled: false, time: '19:00' } });
    expect((await runNotificationJob(deps)).notifications).toBe(0);
    expect(sent).toEqual([]);
  });

  it('uses the owner\'s time zone for the day and the time', async () => {
    // 08:05 in India is 04:35 in Dubai; the owner there has not reached their summary time yet.
    const { deps, mem, sent } = world();
    mem.seed(UID, 'settings', 'bakery', { name: 'Anita Bakes', timezone: 'Asia/Dubai' });
    expect((await runNotificationJob(deps)).notifications).toBe(0);
    expect(sent).toEqual([]);
  });

  it('skips an owner with no phone, and one whose plan has lapsed, without reading their business data', async () => {
    const none = world({ phones: false });
    expect((await runNotificationJob(none.deps)).notifications).toBe(0);
    const lapsed = world();
    const isEntitled = vi.fn().mockResolvedValue(false);
    expect((await runNotificationJob({ ...lapsed.deps, isEntitled })).notifications).toBe(0);
    expect(isEntitled).toHaveBeenCalledWith(UID);
    expect(lapsed.send).not.toHaveBeenCalled();
    expect(lapsed.mem.read(UID, 'mobileSettings', STATE_DOC)).toBeNull();
  });

  it('only checks the plan when something is about to be sent', async () => {
    const quiet = world({ clock: Date.parse('2026-10-06T09:50:00Z') });
    const isEntitled = vi.fn().mockResolvedValue(true);
    await runNotificationJob({ ...quiet.deps, isEntitled });
    expect(isEntitled).not.toHaveBeenCalled();
  });
});

describe('when pushes fail', () => {
  it('gives the claim back if no phone accepted it, so the next run tries again', async () => {
    const { deps, sent, answer, mem } = world();
    answer(m => m.map(() => ({ ok: false, error: 'expo_503' })));
    const first = await runNotificationJob(deps);
    expect(first).toMatchObject({ notifications: 2, delivered: 0, released: 2 });
    expect(mem.read(UID, 'mobileSettings', STATE_DOC)).toMatchObject({ sent: {}, lowNotified: {} });

    answer(m => m.map(() => ({ ok: true })));
    sent.length = 0;
    const second = await runNotificationJob(deps);
    expect(second).toMatchObject({ notifications: 2, delivered: 2, released: 0 });
    expect(sent).toHaveLength(4);
  });

  it('counts a notification as sent if even one phone took it', async () => {
    const { deps, answer, mem } = world();
    answer(m => m.map(x => (x.to === TOKEN_1 ? { ok: true } : { ok: false, error: 'expo_503' })));
    const r = await runNotificationJob(deps);
    expect(r).toMatchObject({ delivered: 2, released: 0 });
    expect(mem.read(UID, 'mobileSettings', STATE_DOC)).toMatchObject({ sent: { morning: '2026-10-06' } });
  });

  it('switches off a phone Expo says is gone, and stops sending to it', async () => {
    const { deps, answer, mem, sent } = world();
    answer(m => m.map(x => (x.to === TOKEN_2 ? { ok: false, error: 'DeviceNotRegistered', invalidToken: true } : { ok: true })));
    const r = await runNotificationJob(deps);
    expect(r.delivered).toBe(2);
    expect(mem.read(UID, 'devices', 'd2')).toMatchObject({ disabled: true });
    expect(mem.read(UID, 'devices', 'd1')).not.toHaveProperty('disabled');

    // Tomorrow's run reaches only the working phone.
    sent.length = 0;
    deps.now = () => MORNING + 24 * 3600 * 1000;
    await runNotificationJob(deps);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every(m => m.to === TOKEN_1)).toBe(true);
  });

  it('keeps the claim when every phone is dead (nothing could be delivered, and retrying would not help)', async () => {
    const { deps, answer, mem } = world();
    answer(m => m.map(() => ({ ok: false, error: 'DeviceNotRegistered', invalidToken: true })));
    const r = await runNotificationJob(deps);
    expect(r.released).toBe(0);
    expect(mem.read(UID, 'mobileSettings', STATE_DOC)).toMatchObject({ sent: { morning: '2026-10-06' } });
  });

  it('carries on with the other owners when one fails', async () => {
    const { deps, mem, sent } = world();
    const realRun = mem.db.run.bind(mem.db);
    const db = { run: (uid: string, fn: any) => (uid === 'broken' ? Promise.reject(new Error('boom')) : realRun(uid, fn)) } as any;
    const r = await runNotificationJob({ ...deps, db, listUsers: async () => ['broken', UID] });
    expect(r).toMatchObject({ users: 2, errors: 1, notifications: 2 });
    expect(sent.length).toBeGreaterThan(0);
  });
});

describe('the next day', () => {
  it('sends a new morning summary but does not repeat the running-low notice for a material still low', async () => {
    const { deps, sent, setClock } = world();
    await runNotificationJob(deps);
    sent.length = 0;
    setClock(MORNING + 24 * 3600 * 1000);
    const r = await runNotificationJob(deps);
    expect(r.notifications).toBe(1);
    expect(sent.every(m => m.data?.type === 'morning')).toBe(true);
  });
});

describe('giveBack', () => {
  it('restores only the kinds that failed', () => {
    const previous = { ...emptyNotificationState(), sent: { morning: '2026-10-05' as string }, lowNotified: {} };
    const current = { sent: { morning: '2026-10-06', lowStock: '2026-10-06' }, lowNotified: { butter: true as const }, useByNotified: {} };
    const next = giveBack(current, previous, new Set(['lowStock' as const]));
    expect(next.sent).toEqual({ morning: '2026-10-06' });
    expect(next.lowNotified).toEqual({});
    const morningOnly = giveBack(current, previous, new Set(['morning' as const]));
    expect(morningOnly.sent).toEqual({ morning: '2026-10-05', lowStock: '2026-10-06' });
    expect(morningOnly.lowNotified).toEqual({ butter: true });
  });
});
