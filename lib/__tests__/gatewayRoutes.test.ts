import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { createGatewayHandlers, readGatewayBody } from '../gatewayRoutes';
import { decryptSecret } from '../secretBox';
import type { GatewayRecord, GatewayStore } from '../gatewayStore';

const key = crypto.randomBytes(32);
const SECRET = 'rzp-secret-value-ABCD';

const res = () => {
  const r: any = { code: 200, headers: {} };
  r.status = (c: number) => { r.code = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  r.setHeader = (k: string, v: string) => { r.headers[k] = v; };
  return r;
};
const memoryStore = () => {
  const data = new Map<string, GatewayRecord>();
  const store: GatewayStore = { get: async uid => data.get(uid) ?? null, put: async (uid, r) => { data.set(uid, r); }, remove: async uid => { data.delete(uid); } };
  return { store, data };
};
const reply = (status: number, body: unknown) => vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
const setup = (over: { secretKey?: Buffer | null; fetch?: any } = {}) => {
  const m = memoryStore();
  const fetch = over.fetch ?? reply(200, { payment_links: [] });
  const h = createGatewayHandlers({ store: m.store, secretKey: over.secretKey === undefined ? key : over.secretKey, fetch, now: () => 1000 });
  const call = async (fn: 'get' | 'put' | 'test' | 'remove', body?: unknown, uid = 'u1') => { const r = res(); await h[fn]({ uid, body } as any, r); return r; };
  return { ...m, fetch, call };
};
const rzp = { provider: 'razorpay', keyId: 'rzp_test_AbC123', keySecret: SECRET };

describe('reading the settings form', () => {
  it('accepts a Razorpay pair, a Cashfree pair with its service, and an https link', () => {
    expect(readGatewayBody(rzp)).toEqual({ ok: true, value: { provider: 'razorpay', keyId: 'rzp_test_AbC123', secret: SECRET } });
    expect(readGatewayBody({ provider: 'cashfree', keyId: 'CF12345', keySecret: 'cfsk_ma_test_abcdef', environment: 'sandbox' })).toMatchObject({ ok: true, value: { provider: 'cashfree', environment: 'sandbox' } });
    expect(readGatewayBody({ provider: 'link', link: ' https://rzp.io/l/anita ' })).toEqual({ ok: true, value: { provider: 'link', link: 'https://rzp.io/l/anita' } });
  });

  it('refuses what cannot be right, in words, without echoing it back', () => {
    for (const body of [null, [], {}, { provider: 'paypal' }, { provider: 'razorpay' }, { ...rzp, keyId: 'short' }, { ...rzp, keyId: 'abcdef123456' }, { ...rzp, keySecret: 'has space inside' }, { ...rzp, keySecret: 'x' },
      { provider: 'cashfree', keyId: 'CF12345', keySecret: 'cfsk_ma_test_abcdef' }, { provider: 'cashfree', keyId: 'CF12345', keySecret: 'cfsk_ma_test_abcdef', environment: 'moon' },
      { provider: 'link', link: 'http://insecure.example/pay' }, { provider: 'link', link: 'javascript:alert(1)' }, { provider: 'link', link: 'not a url' }, { provider: 'link', link: 'https://x.example/' + 'a'.repeat(600) }]) {
      const r = readGatewayBody(body);
      expect(r.ok, JSON.stringify(body)?.slice(0, 80)).toBe(false);
      if (r.ok === false) expect(r.error).not.toContain(SECRET);
    }
  });
});

describe('saving the keys', () => {
  it('checks them with the gateway first, then keeps the secret encrypted and tells back only the last four characters', async () => {
    const t = setup();
    const r = await t.call('put', rzp);
    expect(r.code).toBe(200);
    expect(t.fetch).toHaveBeenCalledTimes(1); // the check
    expect(r.body).toEqual({ serverReady: true, configured: true, provider: 'razorpay', keyId: 'rzp_test_AbC123', secretLast4: 'ABCD', test: true, updatedAt: 1000 });
    expect(JSON.stringify(r.body)).not.toContain(SECRET);
    const kept = t.data.get('u1')!;
    expect(JSON.stringify(kept)).not.toContain(SECRET);
    expect(decryptSecret(kept.secretEnc, key, 'u1')).toBe(SECRET);
    expect(decryptSecret(kept.secretEnc, key, 'someone-else')).toBeNull();
  });

  it('keeps nothing when the gateway does not accept the keys, and says why without the secret', async () => {
    const t = setup({ fetch: reply(401, { error: { description: `bad ${SECRET}` } }) });
    const r = await t.call('put', rzp);
    expect(r.code).toBe(400);
    expect(r.body.code).toBe('gateway_rejected');
    expect(r.body.error).toMatch(/did not accept those keys/);
    expect(JSON.stringify(r.body)).not.toContain(SECRET);
    expect(t.data.size).toBe(0);
  });

  it('refuses to keep keys, and says what is missing, when the server has no encryption key; a pasted link needs none', async () => {
    const t = setup({ secretKey: null });
    const r = await t.call('put', rzp);
    expect(r.code).toBe(503);
    expect(r.body.code).toBe('server_not_ready');
    expect(t.fetch).not.toHaveBeenCalled();
    expect(t.data.size).toBe(0);
    const link = await t.call('put', { provider: 'link', link: 'https://rzp.io/l/anita' });
    expect(link.code).toBe(200);
    expect(link.body).toMatchObject({ configured: true, provider: 'link', link: 'https://rzp.io/l/anita', serverReady: false });
    expect((await t.call('get')).body.serverReady).toBe(false);
  });

  it('replaces what was there, per owner', async () => {
    const t = setup();
    await t.call('put', rzp, 'u1');
    await t.call('put', { provider: 'link', link: 'https://rzp.io/l/anita' }, 'u1');
    await t.call('put', rzp, 'u2');
    expect(t.data.get('u1')!.provider).toBe('link');
    expect(t.data.get('u1')!.secretEnc).toBeUndefined();
    expect(t.data.get('u2')!.provider).toBe('razorpay');
  });
});

describe('reading, testing and removing', () => {
  it('reads back nothing before it is set up, and the masked status after', async () => {
    const t = setup();
    expect((await t.call('get')).body).toEqual({ serverReady: true, configured: false });
    await t.call('put', rzp);
    const r = await t.call('get');
    expect(r.headers['Cache-Control']).toBe('private, no-store');
    expect(r.body).toMatchObject({ configured: true, provider: 'razorpay', secretLast4: 'ABCD' });
    expect(JSON.stringify(r.body)).not.toMatch(/secretEnc|rzp-secret/);
  });

  it('tests the kept keys with the gateway, and says when they can no longer be read', async () => {
    const t = setup();
    expect((await t.call('test')).code).toBe(404);
    await t.call('put', rzp);
    const ok = await t.call('test');
    expect(ok.body).toEqual({ ok: true, test: true });
    t.data.get('u1')!.secretEnc = 'v1.garbage.garbage.garbage';
    const broken = await t.call('test');
    expect(broken.code).toBe(409);
    expect(broken.body.code).toBe('keys_unreadable');
  });

  it('removes the gateway', async () => {
    const t = setup();
    await t.call('put', rzp);
    const r = await t.call('remove');
    expect(r.body).toEqual({ serverReady: true, configured: false });
    expect(t.data.size).toBe(0);
  });

  it('answers 500 with a plain message when the store fails', async () => {
    const h = createGatewayHandlers({ store: { get: async () => { throw new Error('down'); }, put: async () => {}, remove: async () => {} }, secretKey: key, fetch: reply(200, {}), now: () => 1 });
    const r = res();
    await h.get({ uid: 'u1' } as any, r);
    expect(r.code).toBe(500);
    expect(r.body.code).toBe('gateway_failed');
  });
});
