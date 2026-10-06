import { describe, it, expect } from 'vitest';
import {
  createQuickPushTokenHandler, createQuickNotificationSettingsGetHandler, createQuickNotificationSettingsPutHandler,
} from '../quickRoutes';
import { DEFAULT_NOTIFICATION_SETTINGS, readNotificationSettings, withNotificationDefaults, EXPO_PUSH_TOKEN } from '../../src/utils/quickNotifications';
import { memoryQuickDb } from './memoryQuickDb';

const NOW = 1_760_000_000_000;
const UID = 'u1';
const TOKEN = 'ExponentPushToken[abcdefghij0123456789xx]';
const res = () => { const r: any = { code: 200 }; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };
const world = () => { const mem = memoryQuickDb(() => NOW); return { mem, deps: { db: mem.db, now: () => NOW, newId: () => 'x' } }; };
const call = async (h: any, body?: unknown, uid = UID) => { const r = res(); await h({ uid, body, headers: {} }, r); return r; };

describe('POST /mobile/push-token', () => {
  it('remembers the phone, in a collection only the server reads, and saving it again changes nothing but the time', async () => {
    const { mem, deps } = world();
    const h = createQuickPushTokenHandler(deps);
    expect((await call(h, { token: TOKEN, platform: 'android' })).body).toEqual({ saved: true });
    await call(h, { token: TOKEN, platform: 'android' });
    expect(mem.all(UID, 'devices')).toHaveLength(1);
    expect(mem.all(UID, 'devices')[0]).toMatchObject({ token: TOKEN, platform: 'android', updatedAt: NOW });
  });

  it('keeps each of an owner\'s phones, and never mixes owners', async () => {
    const { mem, deps } = world();
    const h = createQuickPushTokenHandler(deps);
    await call(h, { token: TOKEN, platform: 'ios' });
    await call(h, { token: 'ExpoPushToken[zzzzzzzzzz9999999999yy]', platform: 'android' });
    await call(h, { token: TOKEN, platform: 'ios' }, 'someone-else');
    expect(mem.all(UID, 'devices')).toHaveLength(2);
    expect(mem.all('someone-else', 'devices')).toHaveLength(1);
  });

  it('refuses a token that is not an Expo push token, and an unknown platform', async () => {
    const { mem, deps } = world();
    const h = createQuickPushTokenHandler(deps);
    expect((await call(h, { token: 'not-a-token', platform: 'ios' })).code).toBe(400);
    expect((await call(h, { token: '../../etc/passwd', platform: 'ios' })).code).toBe(400);
    expect((await call(h, { token: TOKEN, platform: 'windows' })).code).toBe(400);
    expect((await call(h, undefined)).code).toBe(400);
    expect(mem.stats.writes).toBe(0);
    expect(EXPO_PUSH_TOKEN.test(TOKEN)).toBe(true);
  });
});

describe('notification settings', () => {
  const all = { morningSummary: { enabled: true, time: '07:30' }, lowStock: false, useBy: true, dueTomorrow: { enabled: true, time: '20:00' } };

  it('gives the defaults before the owner has chosen anything', async () => {
    const { deps } = world();
    expect((await call(createQuickNotificationSettingsGetHandler(deps))).body).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });

  it('saves a choice and gives it back, per owner', async () => {
    const { deps } = world();
    const saved = await call(createQuickNotificationSettingsPutHandler(deps), all);
    expect(saved.code).toBe(200);
    expect(saved.body).toEqual(all);
    expect((await call(createQuickNotificationSettingsGetHandler(deps))).body).toEqual(all);
    expect((await call(createQuickNotificationSettingsGetHandler(deps), undefined, 'someone-else')).body).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });

  it('refuses a half-sent update, a bad time, and anything that is not on or off, saving nothing', async () => {
    const { mem, deps } = world();
    const put = createQuickNotificationSettingsPutHandler(deps);
    expect((await call(put, { lowStock: false })).code).toBe(400);
    expect((await call(put, { ...all, morningSummary: { enabled: true, time: '25:00' } })).code).toBe(400);
    expect((await call(put, { ...all, useBy: 'yes' })).code).toBe(400);
    expect((await call(put, null)).code).toBe(400);
    expect(mem.stats.writes).toBe(0);
  });

  it('fills in defaults for anything stored that is missing or damaged', () => {
    expect(withNotificationDefaults({ lowStock: false, morningSummary: { time: 'late' } })).toEqual({ ...DEFAULT_NOTIFICATION_SETTINGS, lowStock: false });
    expect(withNotificationDefaults(null)).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    expect(readNotificationSettings(all)).toEqual({ ok: true, value: all });
  });
});
