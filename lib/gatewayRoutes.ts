/**
 * gatewayRoutes.ts
 *
 * The owner's "Online payments" settings, for the web app: which gateway their customers pay through, and the keys to make links
 * with. Signed in, and CSRF-checked in server.ts. The keys are checked with the gateway before they are kept, and kept encrypted;
 * what comes back is which gateway it is and the last four characters of the secret, never the secret.
 */
import type { Response } from 'express';
import type { AuthedRequest } from './auth';
import { decryptSecret, encryptSecret } from './secretBox';
import { getGateway, isGatewayId, type FetchLike, type GatewayCredentials } from './gateways';
import type { GatewayRecord, GatewayStore } from './gatewayStore';
import type { GatewayStatus } from '../src/utils/onlinePayments';
import type { PaymentSetupView } from '../src/utils/quickApiTypes';

export interface GatewayRouteDeps {
  store: GatewayStore;
  /** From PAYMENT_SECRETS_KEY. Null: keys cannot be kept, and the settings say so. */
  secretKey: Buffer | null;
  fetch: FetchLike;
  now: () => number;
}

export type { GatewayStatus } from '../src/utils/onlinePayments';
export const statusOf = (record: GatewayRecord | null, serverReady: boolean): GatewayStatus => record
  ? { serverReady, configured: true, provider: record.provider, keyId: record.keyId, secretLast4: record.secretLast4, environment: record.environment, test: record.test, link: record.link, updatedAt: record.updatedAt }
  : { serverReady, configured: false };

/** What the phone's Settings say about card payments: the gateway's name and whether its keys are test keys, or a pasted link. */
export function onlinePaymentsOf(record: GatewayRecord | null): PaymentSetupView['online'] {
  if (!record) return null;
  if (record.provider === 'link') return record.link ? { kind: 'link' } : null;
  if (!isGatewayId(record.provider)) return null;
  return { kind: 'gateway', label: getGateway(record.provider).label, test: record.test === true || record.environment === 'sandbox' };
}

const NOT_READY = { error: 'Online payments are not set up on this server yet. Ask whoever runs Stockpot to add the encryption key (PAYMENT_SECRETS_KEY).', code: 'server_not_ready' };

type Read<T> = { ok: true; value: T } | { ok: false; error: string };
const bad = (error: string): { ok: false; error: string } => ({ ok: false, error });

const KEY_ID = /^[A-Za-z0-9_.:-]{6,100}$/;
const SECRET = /^[\x21-\x7E]{8,200}$/; // visible characters only, no spaces

type Body =
  | { provider: 'razorpay' | 'cashfree'; keyId: string; secret: string; environment?: 'sandbox' | 'production' }
  | { provider: 'link'; link: string };

export function readGatewayBody(body: unknown): Read<Body> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('Choose a gateway and enter its details.');
  const b = body as Record<string, unknown>;
  if (b.provider === 'link') {
    const link = typeof b.link === 'string' ? b.link.trim() : '';
    let url: URL | null = null;
    try { url = new URL(link); } catch { /* not an address */ }
    if (!url || url.protocol !== 'https:' || link.length > 500) return bad('Paste the payment link as a full address starting with https://');
    return { ok: true, value: { provider: 'link', link: url.toString() } };
  }
  if (!isGatewayId(b.provider)) return bad('Choose Razorpay, Cashfree or a payment link.');
  const keyId = typeof b.keyId === 'string' ? b.keyId.trim() : '';
  const secret = typeof b.keySecret === 'string' ? b.keySecret.trim() : '';
  if (!KEY_ID.test(keyId)) return bad(b.provider === 'razorpay' ? 'Enter your Razorpay Key ID (it starts with rzp_).' : 'Enter your Cashfree App ID.');
  if (!SECRET.test(secret)) return bad(b.provider === 'razorpay' ? 'Enter your Razorpay Key Secret.' : 'Enter your Cashfree Secret Key.');
  if (b.provider === 'razorpay' && !/^rzp_(test|live)_/.test(keyId)) return bad('A Razorpay Key ID starts with rzp_test_ or rzp_live_.');
  let environment: 'sandbox' | 'production' | undefined;
  if (b.provider === 'cashfree') {
    if (b.environment !== 'sandbox' && b.environment !== 'production') return bad('Say whether these Cashfree keys are for the test (sandbox) or live service.');
    environment = b.environment;
  }
  return { ok: true, value: { provider: b.provider, keyId, secret, ...(environment && { environment }) } };
}

/** The gateway's keys for an owner, decrypted for one call. Null when there are none or they cannot be read. */
export function credentialsOf(record: GatewayRecord, key: Buffer, uid: string): GatewayCredentials | null {
  if (record.provider === 'link' || !record.keyId) return null;
  const secret = decryptSecret(record.secretEnc, key, uid);
  return secret ? { keyId: record.keyId, secret, ...(record.environment && { environment: record.environment }) } : null;
}

export function createGatewayHandlers(deps: GatewayRouteDeps) {
  const ready = deps.secretKey !== null;
  const fail = (res: Response, err: any, what: string) => {
    console.error(`Gateway settings ${what} failed:`, err?.message);
    return res.status(500).json({ error: 'Could not do that. Please try again.', code: 'gateway_failed' });
  };

  return {
    /** GET: which gateway is set up, if any. */
    get: async (req: AuthedRequest, res: Response) => {
      try {
        res.setHeader('Cache-Control', 'private, no-store');
        return res.json(statusOf(await deps.store.get(req.uid!), ready));
      } catch (err) { return fail(res, err, 'read'); }
    },

    /** PUT: check the keys with the gateway, then keep them. */
    put: async (req: AuthedRequest, res: Response) => {
      const read = readGatewayBody(req.body);
      if (read.ok === false) return res.status(400).json({ error: read.error, code: 'bad_request' });
      const body = read.value;
      try {
        let record: GatewayRecord;
        if (body.provider === 'link') {
          record = { provider: 'link', link: body.link, updatedAt: deps.now() };
        } else {
          if (!deps.secretKey) return res.status(503).json(NOT_READY);
          const creds: GatewayCredentials = { keyId: body.keyId, secret: body.secret, ...(body.environment && { environment: body.environment }) };
          const checked = await getGateway(body.provider).check(creds, deps.fetch);
          if (!checked.ok) return res.status(400).json({ error: checked.message ?? 'Those keys were not accepted.', code: 'gateway_rejected' });
          record = {
            provider: body.provider, keyId: body.keyId, secretEnc: encryptSecret(body.secret, deps.secretKey, req.uid!),
            secretLast4: body.secret.slice(-4), ...(body.environment && { environment: body.environment }),
            test: !!checked.test, updatedAt: deps.now(),
          };
        }
        await deps.store.put(req.uid!, record);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.json(statusOf(record, ready));
      } catch (err) { return fail(res, err, 'save'); }
    },

    /** POST: check the keys already kept still work. */
    test: async (req: AuthedRequest, res: Response) => {
      try {
        const record = await deps.store.get(req.uid!);
        if (!record) return res.status(404).json({ error: 'Nothing is set up yet.', code: 'not_configured' });
        if (record.provider === 'link') return res.json({ ok: true, message: 'A payment link needs no check.' });
        if (!deps.secretKey) return res.status(503).json(NOT_READY);
        const creds = credentialsOf(record, deps.secretKey, req.uid!);
        if (!creds) return res.status(409).json({ ok: false, error: 'The saved keys can no longer be read. Enter them again.', code: 'keys_unreadable' });
        const checked = await getGateway(record.provider).check(creds, deps.fetch);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.json({ ok: checked.ok, ...(checked.message && { message: checked.message }), test: !!checked.test });
      } catch (err) { return fail(res, err, 'test'); }
    },

    /** DELETE: forget the gateway. Bills already sent stop offering card payment. */
    remove: async (req: AuthedRequest, res: Response) => {
      try {
        await deps.store.remove(req.uid!);
        return res.json(statusOf(null, ready));
      } catch (err) { return fail(res, err, 'remove'); }
    },
  };
}
