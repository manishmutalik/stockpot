import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  readStateKey, normalizeShop, newNonce, createState, verifyState, verifyShopifyHmac, checkCallback, STATE_TTL_MS,
} from '../shopifyOAuth';

const KEY = readStateKey({ SESSION_ENC_KEY: 'test-key-for-unit-tests-only' })!;
const APP_SECRET = 'shpss_test_secret';
const NOW = Date.parse('2026-10-10T10:00:00Z');
const SHOP = 'my-store.myshopify.com';

const makeState = (over: Partial<{ uid: string; shop: string; nonce: string; now: number }> = {}) =>
  createState({ uid: 'victim-uid', shop: SHOP, nonce: 'n1', now: NOW, ...over }, KEY);

/** The query string Shopify would send back, with its hmac computed the documented way. */
function shopifyQuery(params: Record<string, string>, secret = APP_SECRET): URLSearchParams {
  const sorted = Object.keys(params).sort().map(k => [k, params[k]]);
  const hmac = crypto.createHmac('sha256', secret).update(new URLSearchParams(sorted).toString()).digest('hex');
  return new URLSearchParams({ ...params, hmac });
}

/** Re-sign a state's payload after editing it, with the attacker's own key. */
function forge(state: string, edit: (p: any) => void, key = crypto.randomBytes(32)): string {
  const payload = JSON.parse(Buffer.from(state.split('.')[0], 'base64url').toString('utf8'));
  edit(payload);
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', key).update(body).digest('base64url')}`;
}

describe('readStateKey', () => {
  it('needs SESSION_ENC_KEY and derives a key that is not the secret itself', () => {
    expect(readStateKey({})).toBeNull();
    expect(readStateKey({ SESSION_ENC_KEY: '  ' })).toBeNull();
    const key = readStateKey({ SESSION_ENC_KEY: 'abc' })!;
    expect(key).toHaveLength(32);
    expect(key.equals(crypto.createHash('sha256').update('abc').digest())).toBe(false);
  });
});

describe('normalizeShop', () => {
  it('accepts a store handle or its myshopify.com domain', () => {
    expect(normalizeShop('my-store')).toBe(SHOP);
    expect(normalizeShop(' My-Store.myshopify.com ')).toBe(SHOP);
  });

  it('refuses anything that is not a myshopify.com store', () => {
    for (const bad of ['', 'evil.com', 'my-store.myshopify.com.evil.com', 'a/b', 'my_store', '-x', 'x.myshopify.com/', undefined, ['x']]) {
      expect(normalizeShop(bad)).toBeNull();
    }
  });
});

describe('createState / verifyState', () => {
  it('round-trips a valid state for the browser that started it', () => {
    expect(verifyState(makeState(), KEY, { nonce: 'n1', now: NOW + 60_000 })).toEqual({ ok: true, uid: 'victim-uid', shop: SHOP });
  });

  it('makes a fresh random nonce each time', () => {
    expect(newNonce()).not.toBe(newNonce());
  });

  it('refuses a state whose uid was swapped, keeping the original signature', () => {
    const [, sig] = makeState({ uid: 'attacker' }).split('.');
    const [body] = forge(makeState({ uid: 'attacker' }), p => { p.uid = 'victim-uid'; }).split('.');
    expect(verifyState(`${body}.${sig}`, KEY, { nonce: 'n1', now: NOW })).toEqual({ ok: false, reason: 'signature' });
  });

  it('refuses a state signed with another key', () => {
    const forged = forge(makeState(), p => { p.uid = 'victim-uid'; });
    expect(verifyState(forged, KEY, { nonce: 'n1', now: NOW })).toEqual({ ok: false, reason: 'signature' });
  });

  it('refuses the old unsigned {uid, ts} form', () => {
    const old = Buffer.from(JSON.stringify({ uid: 'victim-uid', ts: NOW })).toString('base64url');
    expect(verifyState(old, KEY, { nonce: 'n1', now: NOW })).toEqual({ ok: false, reason: 'malformed' });
  });

  it('gives back the uid it was signed for, never another', () => {
    // A state legitimately made for the attacker's own session saves under the attacker's uid only.
    const result = verifyState(makeState({ uid: 'attacker' }), KEY, { nonce: 'n1', now: NOW });
    expect(result).toEqual({ ok: true, uid: 'attacker', shop: SHOP });
  });

  it('expires after ten minutes', () => {
    const state = makeState();
    expect(verifyState(state, KEY, { nonce: 'n1', now: NOW + STATE_TTL_MS - 1 }).ok).toBe(true);
    expect(verifyState(state, KEY, { nonce: 'n1', now: NOW + STATE_TTL_MS })).toEqual({ ok: false, reason: 'expired' });
  });

  it('refuses an expiry further out than it ever issues', () => {
    expect(verifyState(makeState({ now: NOW + 60 * 60 * 1000 }), KEY, { nonce: 'n1', now: NOW })).toEqual({ ok: false, reason: 'expired' });
  });

  it('refuses a state finished in a browser without the matching nonce cookie', () => {
    expect(verifyState(makeState(), KEY, { nonce: undefined, now: NOW })).toEqual({ ok: false, reason: 'browser' });
    expect(verifyState(makeState(), KEY, { nonce: 'other', now: NOW })).toEqual({ ok: false, reason: 'browser' });
  });

  it('refuses junk', () => {
    for (const junk of [undefined, '', 'a', 'a.b.c', '.x', 'x.', ['a.b']]) {
      expect(verifyState(junk, KEY, { nonce: 'n1', now: NOW }).ok).toBe(false);
    }
  });
});

describe('verifyShopifyHmac', () => {
  // The example from Shopify's OAuth docs.
  it('matches the worked example in Shopify\'s documentation', () => {
    const q = new URLSearchParams('code=0907a61c0c8d55e99db179b68161bc00&hmac=700e2dadb827fcc8609e9d5ce208b2e9cdaab9df07390d2cbca10d7c328fc4bf&shop=some-shop.myshopify.com&state=0.6784241404160823&timestamp=1337178173');
    expect(verifyShopifyHmac(q, 'hush')).toBe(true);
  });

  it('accepts parameters in any order and ignores the legacy signature parameter', () => {
    const q = shopifyQuery({ timestamp: '1', shop: SHOP, code: 'c', state: 's', host: 'YWRtaW4=' });
    q.append('signature', 'whatever');
    expect(verifyShopifyHmac(q, APP_SECRET)).toBe(true);
  });

  it('refuses a bad, missing or duplicated hmac, an edited parameter or another secret', () => {
    const good = shopifyQuery({ code: 'c', shop: SHOP, state: 's', timestamp: '1' });
    expect(verifyShopifyHmac(good, 'another-secret')).toBe(false);

    const edited = new URLSearchParams(good);
    edited.set('shop', 'attacker.myshopify.com');
    expect(verifyShopifyHmac(edited, APP_SECRET)).toBe(false);

    const missing = new URLSearchParams(good);
    missing.delete('hmac');
    expect(verifyShopifyHmac(missing, APP_SECRET)).toBe(false);

    const short = new URLSearchParams(good);
    short.set('hmac', 'abcd');
    expect(verifyShopifyHmac(short, APP_SECRET)).toBe(false);

    const twice = new URLSearchParams(good);
    twice.append('hmac', good.get('hmac')!);
    expect(verifyShopifyHmac(twice, APP_SECRET)).toBe(false);
  });
});

describe('checkCallback', () => {
  const deps = { stateKey: KEY, appSecret: APP_SECRET, cookieNonce: 'n1', now: NOW + 1000 };
  const query = (over: Record<string, string> = {}, secret = APP_SECRET) =>
    shopifyQuery({ code: 'the-code', shop: SHOP, state: makeState(), timestamp: '1', ...over }, secret);

  it('gives the uid, shop and code for a valid callback', () => {
    expect(checkCallback(query(), deps)).toEqual({ ok: true, uid: 'victim-uid', shop: SHOP, code: 'the-code' });
  });

  it('needs shop, code and state', () => {
    const q = query();
    q.delete('code');
    expect(checkCallback(q, deps)).toMatchObject({ ok: false, status: 400 });
  });

  it('refuses a callback without a valid Shopify hmac', () => {
    expect(checkCallback(query({}, 'not-the-app-secret'), deps)).toMatchObject({ ok: false, status: 403, message: 'Invalid Shopify signature' });
  });

  it('refuses a state forged for the victim\'s uid', () => {
    const forged = forge(makeState({ uid: 'attacker' }), p => { p.uid = 'victim-uid'; });
    expect(checkCallback(query({ state: forged }), deps)).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses an expired state', () => {
    expect(checkCallback(query(), { ...deps, now: NOW + STATE_TTL_MS + 1 })).toMatchObject({ ok: false, status: 400 });
  });

  it('refuses a state completed in another browser', () => {
    expect(checkCallback(query(), { ...deps, cookieNonce: undefined })).toMatchObject({ ok: false, status: 400 });
  });

  it('refuses a callback for a different shop than the state was made for', () => {
    const other = 'attacker.myshopify.com';
    expect(checkCallback(query({ shop: other }), deps)).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses a shop that is not a myshopify.com store', () => {
    expect(checkCallback(query({ shop: 'evil.example.com' }), deps)).toMatchObject({ ok: false, status: 400, message: 'Invalid shop' });
  });
});
