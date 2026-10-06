// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createExpoPushSender, EXPO_PUSH_URL, type PushMessage } from '../expoPush';

const msg = (n: number): PushMessage => ({ to: `ExponentPushToken[token${n}xxxxxxxx]`, title: 'T', body: 'B', data: { screen: 'today' } });
const reply = (data: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => ({ data }) }) as any;

describe('createExpoPushSender', () => {
  it('posts the messages to Expo with sound and high priority, and reports each ticket', async () => {
    const f = vi.fn().mockResolvedValue(reply([{ status: 'ok', id: 'a' }, { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }]));
    const results = await createExpoPushSender({ fetchImpl: f })([msg(1), msg(2)]);
    expect(results).toEqual([{ ok: true }, { ok: false, error: 'DeviceNotRegistered', invalidToken: true }]);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(EXPO_PUSH_URL);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual([
      { to: msg(1).to, title: 'T', body: 'B', data: { screen: 'today' }, sound: 'default', priority: 'high' },
      { to: msg(2).to, title: 'T', body: 'B', data: { screen: 'today' }, sound: 'default', priority: 'high' },
    ]);
  });

  it('sends the access token when there is one', async () => {
    const f = vi.fn().mockResolvedValue(reply([{ status: 'ok' }]));
    await createExpoPushSender({ fetchImpl: f, accessToken: 'secret-token' })([msg(1)]);
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer secret-token');
  });

  it('sends at most 100 messages at a time', async () => {
    const f = vi.fn().mockImplementation(async (_u, init) => reply(JSON.parse(init.body).map(() => ({ status: 'ok' }))));
    const results = await createExpoPushSender({ fetchImpl: f })(Array.from({ length: 230 }, (_, i) => msg(i)));
    expect(f).toHaveBeenCalledTimes(3);
    expect(results).toHaveLength(230);
    expect(results.every(r => r.ok)).toBe(true);
  });

  it('says every message failed, not dead, when Expo errors, answers badly or cannot be reached', async () => {
    const down = await createExpoPushSender({ fetchImpl: vi.fn().mockResolvedValue(reply(null, 503)) })([msg(1), msg(2)]);
    expect(down).toEqual([{ ok: false, error: 'expo_503' }, { ok: false, error: 'expo_503' }]);
    const short = await createExpoPushSender({ fetchImpl: vi.fn().mockResolvedValue(reply([{ status: 'ok' }])) })([msg(1), msg(2)]);
    expect(short.every(r => !r.ok && !r.invalidToken)).toBe(true);
    const offline = await createExpoPushSender({ fetchImpl: vi.fn().mockRejectedValue(new Error('ENOTFOUND')) })([msg(1)]);
    expect(offline).toEqual([{ ok: false, error: 'network:ENOTFOUND' }]);
  });

  it('treats another rejection as a failure of that message only', async () => {
    const r = await createExpoPushSender({ fetchImpl: vi.fn().mockResolvedValue(reply([{ status: 'error', details: { error: 'MessageRateExceeded' } }, { status: 'ok' }])) })([msg(1), msg(2)]);
    expect(r).toEqual([{ ok: false, error: 'MessageRateExceeded' }, { ok: true }]);
  });
});
