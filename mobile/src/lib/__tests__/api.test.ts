import { describe, it, expect, vi } from 'vitest';
import { ApiError, createApi, describeApiError } from '../api';

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const make = (fetchImpl: any, token: string | null = 'tok-123', extra: Record<string, unknown> = {}) =>
  createApi({ baseUrl: 'https://stockpot.example.com/', getToken: async () => token, fetchImpl, ...extra });

describe('createApi', () => {
  it('sends the owner\'s token as a Bearer header to the server\'s address, and returns the answer', async () => {
    const f = vi.fn().mockResolvedValue(reply(200, { date: '2026-10-06' }));
    const out = await make(f).get<{ date: string }>('/api/mobile/today');
    expect(out).toEqual({ date: '2026-10-06' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://stockpot.example.com/api/mobile/today');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok-123');
    expect(init.body).toBeUndefined();
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('posts JSON with the idempotency key for a save', async () => {
    const f = vi.fn().mockResolvedValue(reply(201, { ok: true }));
    await make(f).post('/api/mobile/orders', { lineItems: [] }, { idempotencyKey: 'a1b2c3d4-e5f6-4789-a012-3456789abcde' });
    const init = f.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['Idempotency-Key']).toBe('a1b2c3d4-e5f6-4789-a012-3456789abcde');
    expect(JSON.parse(init.body)).toEqual({ lineItems: [] });
  });

  it('puts and deletes with a JSON body', async () => {
    const f = vi.fn().mockResolvedValue(reply(200, { ok: true }));
    await make(f).put('/api/mobile/notification-settings', { lowStock: false });
    await make(f).delete('/api/mobile/push-token', { token: 'T' });
    expect(f.mock.calls[0][1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ lowStock: false }) });
    expect(f.mock.calls[1][1]).toMatchObject({ method: 'DELETE', body: JSON.stringify({ token: 'T' }) });
  });

  it('does not ask the server anything when nobody is signed in', async () => {
    const f = vi.fn();
    await expect(make(f, null).get('/api/mobile/today')).rejects.toMatchObject({ status: 401, code: 'not_signed_in' });
    expect(f).not.toHaveBeenCalled();
  });

  it('turns a refusal into an ApiError with the server\'s code and message', async () => {
    const f = vi.fn().mockResolvedValue(reply(402, { error: 'A plan is needed to use Stockpot Quick.', code: 'subscription_required' }));
    const err = await make(f).get('/api/mobile/today').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 402, code: 'subscription_required', message: 'A plan is needed to use Stockpot Quick.' });
  });

  it('copes with an answer that is not JSON', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error('not json'); } });
    await expect(make(f).get('/x')).rejects.toMatchObject({ status: 502, code: 'error' });
  });

  it('says it is offline when the server cannot be reached, and when it takes too long', async () => {
    await expect(make(vi.fn().mockRejectedValue(new TypeError('Network request failed'))).get('/x')).rejects.toMatchObject({ status: 0, code: 'offline' });
    const slow = vi.fn().mockImplementation((_u: string, init: any) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
    await expect(make(slow, 'tok', { timeoutMs: 10 }).get('/x')).rejects.toMatchObject({ status: 0, code: 'timeout' });
  });
});

describe('describeApiError', () => {
  it('says what the owner can do about each kind of failure', () => {
    expect(describeApiError(new ApiError(0, 'offline', 'No connection.'))).toMatch(/No connection/);
    expect(describeApiError(new ApiError(401, 'x', 'x'))).toMatch(/sign in again/);
    expect(describeApiError(new ApiError(402, 'subscription_required', 'x'))).toMatch(/plan/);
    expect(describeApiError(new ApiError(403, 'demo_account', 'x'))).toMatch(/demo kitchen/);
    expect(describeApiError(new ApiError(500, 'x', 'x'))).toMatch(/try again/);
    expect(describeApiError(new ApiError(422, 'x', 'Add a menu first.'))).toBe('Add a menu first.');
    expect(describeApiError(new Error('boom'))).toMatch(/Something went wrong/);
  });
});
