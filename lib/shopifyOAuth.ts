/**
 * shopifyOAuth.ts
 *
 * The checks that make the Shopify OAuth callback trustworthy. The callback is hit by Shopify's redirect, so it carries no
 * Authorization header and sits outside requireAuth; everything it knows about the user comes from the `state` we made.
 *
 *  - `state` is signed: base64url JSON {uid, shop, nonce, exp} plus an HMAC-SHA256 of it, keyed from SESSION_ENC_KEY. It
 *    expires after STATE_TTL_MS, and names the one shop it was made for.
 *  - The nonce in `state` is also set as an httpOnly cookie on the browser that started the flow, and the callback must
 *    present it, so a `state` cannot be completed in someone else's browser.
 *  - Shopify's own `hmac` query parameter is checked with the app secret (sorted query without `hmac`, HMAC-SHA256,
 *    constant-time compare), so the shop and code really came from Shopify.
 *
 * Pure functions with the key, secret and clock passed in; server.ts only wires them to the routes.
 */
import crypto from 'node:crypto';

/** How long a started connection stays valid. */
export const STATE_TTL_MS = 10 * 60 * 1000;
/** The httpOnly cookie that ties a `state` to the browser that asked for it. */
export const NONCE_COOKIE = 'shopify_oauth_nonce';

/**
 * The signing key for `state`, derived from SESSION_ENC_KEY (with a label, so it is never the same key that encrypts the
 * stored credentials). Null when SESSION_ENC_KEY is not set.
 */
export function readStateKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const secret = env.SESSION_ENC_KEY?.trim();
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update('stockpot:shopify-oauth-state:v1').digest();
}

/** "my-store" or "my-store.myshopify.com" (any case) to "my-store.myshopify.com"; null for anything else. */
export function normalizeShop(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim().toLowerCase();
  const shop = raw.includes('.') ? raw : `${raw}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ? shop : null;
}

export function newNonce(): string {
  return crypto.randomBytes(16).toString('base64url');
}

interface StatePayload {
  uid: string;
  shop: string;
  nonce: string;
  exp: number;
}

const sign = (data: string, key: Buffer) => crypto.createHmac('sha256', key).update(data).digest();

/** A signed `state` for this user, shop and browser nonce, valid for STATE_TTL_MS from `now`. */
export function createState(p: { uid: string; shop: string; nonce: string; now: number }, key: Buffer): string {
  const payload: StatePayload = { uid: p.uid, shop: p.shop, nonce: p.nonce, exp: p.now + STATE_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body, key).toString('base64url')}`;
}

export type StateCheck =
  | { ok: true; uid: string; shop: string }
  | { ok: false; reason: 'malformed' | 'signature' | 'expired' | 'browser' };

/** Checks the signature, the expiry and that `nonce` (from the cookie) is the one the state was made with. */
export function verifyState(state: unknown, key: Buffer, check: { nonce: unknown; now: number }): StateCheck {
  if (typeof state !== 'string') return { ok: false, reason: 'malformed' };
  const parts = state.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [body, sig] = parts;

  const expected = sign(body, key);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { ok: false, reason: 'signature' };

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const { uid, shop, nonce, exp } = payload ?? ({} as StatePayload);
  if (typeof uid !== 'string' || !uid || typeof shop !== 'string' || typeof nonce !== 'string' || !nonce || typeof exp !== 'number') {
    return { ok: false, reason: 'malformed' };
  }
  // Also refuse an expiry further out than we ever issue, so a clock or key mix-up cannot make a long-lived state.
  if (check.now >= exp || exp - check.now > STATE_TTL_MS) return { ok: false, reason: 'expired' };
  if (typeof check.nonce !== 'string' || !safeEqualStrings(check.nonce, nonce)) return { ok: false, reason: 'browser' };
  return { ok: true, uid, shop };
}

/**
 * Shopify's `hmac` on a redirect to us: HMAC-SHA256, keyed with the app's client secret, over the other query parameters
 * sorted by name and joined as a query string (the form Shopify's own libraries use). `signature`, the older form, is left
 * out too.
 */
export function verifyShopifyHmac(query: URLSearchParams, appSecret: string): boolean {
  const hmac = query.get('hmac');
  if (!hmac || !/^[0-9a-f]{64}$/i.test(hmac) || query.getAll('hmac').length !== 1) return false;
  const rest = [...query.entries()].filter(([k]) => k !== 'hmac' && k !== 'signature');
  rest.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const message = new URLSearchParams(rest).toString();
  const expected = crypto.createHmac('sha256', appSecret).update(message).digest();
  return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), expected);
}

export type CallbackCheck =
  | { ok: true; uid: string; shop: string; code: string }
  | { ok: false; status: number; message: string };

/**
 * Every check the callback makes before exchanging the code, in order: required parameters, Shopify's hmac, a valid
 * myshopify.com shop, our signed state (signature, expiry, browser), and that the shop is the one the state was made for.
 */
export function checkCallback(
  query: URLSearchParams,
  deps: { stateKey: Buffer; appSecret: string; cookieNonce: unknown; now: number },
): CallbackCheck {
  const code = query.get('code');
  const state = query.get('state');
  if (!query.get('shop') || !code || !state) return { ok: false, status: 400, message: 'Missing shop, code, or state' };
  if (!verifyShopifyHmac(query, deps.appSecret)) return { ok: false, status: 403, message: 'Invalid Shopify signature' };
  const shop = normalizeShop(query.get('shop'));
  if (!shop) return { ok: false, status: 400, message: 'Invalid shop' };

  const checked = verifyState(state, deps.stateKey, { nonce: deps.cookieNonce, now: deps.now });
  if (checked.ok === false) {
    const message = {
      malformed: 'Invalid state parameter',
      signature: 'Invalid state parameter',
      expired: 'This Shopify connection link has expired. Start again from Settings.',
      browser: 'Finish connecting Shopify in the same browser you started from. Start again from Settings.',
    }[checked.reason];
    return { ok: false, status: checked.reason === 'expired' || checked.reason === 'browser' ? 400 : 403, message };
  }
  if (checked.shop !== shop) return { ok: false, status: 403, message: 'Shop does not match the one you started with' };
  return { ok: true, uid: checked.uid, shop, code };
}

function safeEqualStrings(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
