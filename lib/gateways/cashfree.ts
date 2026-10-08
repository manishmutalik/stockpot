/**
 * Cashfree Payment Links, with the owner's own App ID and Secret Key. Written from Cashfree's documented API (version
 * 2023-08-01) without being able to reach their docs or sandbox from here, so the first real check is sandbox keys: Settings >
 * Online payments > Test connection, then a ₹1 bill. Cashfree asks for a phone number on every link; when the order has none,
 * the business's own number is used, and with neither the link cannot be made.
 */
import { GatewayError, type CreatedLink, type FetchLike, type Gateway, type GatewayCredentials, type KeyCheck, type LinkState, type NewLink } from './types';

const VERSION = '2023-08-01';
const base = (c: GatewayCredentials) => (c.environment === 'sandbox' ? 'https://sandbox.cashfree.com/pg' : 'https://api.cashfree.com/pg');

async function call(c: GatewayCredentials, fetchFn: FetchLike, method: 'GET' | 'POST', path: string, body?: Record<string, unknown>) {
  let res;
  try {
    res = await fetchFn(`${base(c)}${path}`, {
      method,
      headers: { 'x-client-id': c.keyId, 'x-client-secret': c.secret, 'x-api-version': VERSION, 'Content-Type': 'application/json' },
      ...(body && { body: JSON.stringify(body) }),
    });
  } catch {
    throw new GatewayError('Cashfree could not be reached. Please try again in a moment.');
  }
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

const refused = (status: number, data: any): GatewayError => {
  const said = String(data?.message ?? '');
  if (status === 401 || status === 403) return new GatewayError('Cashfree did not accept those keys. Check the App ID and Secret Key, and whether they are for the test (sandbox) or live service.', status);
  return new GatewayError(said ? `Cashfree said: ${said}` : 'Cashfree could not do that right now. Please try again in a moment.', status);
};

/** Cashfree's digits only, with the country code dropped, which is what its links take. */
const tenDigits = (phone: string | undefined): string | null => {
  const d = (phone ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
};

export const cashfree: Gateway = {
  id: 'cashfree',
  label: 'Cashfree',

  async check(c, fetchFn): Promise<KeyCheck> {
    try {
      // There is no cheap "who am I" call, so ask for a link that cannot exist: good keys get "not found", bad keys are refused.
      const { status, data } = await call(c, fetchFn, 'GET', '/links/stockpot_connection_check');
      if (status === 404 || (status === 400 && /not.?found/i.test(JSON.stringify(data)))) return { ok: true, test: c.environment === 'sandbox' };
      if (status === 401 || status === 403) return { ok: false, message: refused(status, data).message };
      return { ok: false, message: refused(status, data).message };
    } catch (err) {
      return { ok: false, message: err instanceof GatewayError ? err.message : 'Cashfree could not be reached.' };
    }
  },

  async createLink(c, link: NewLink, fetchFn): Promise<CreatedLink> {
    if (link.amount < 1) throw new GatewayError('Cashfree needs at least ₹1 to make a payment link.');
    const phone = tenDigits(link.customer.phone) ?? tenDigits(link.businessPhone);
    if (!phone) throw new GatewayError('Cashfree needs a phone number for the customer, and this order has none. Add one to the order, or add your business phone number in Settings.');
    const linkId = link.reference.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 50);
    const { ok, status, data } = await call(c, fetchFn, 'POST', '/links', {
      link_id: linkId,
      link_amount: link.amount,
      link_currency: 'INR',
      link_purpose: link.description.slice(0, 500),
      customer_details: { customer_phone: phone, ...(link.customer.name && { customer_name: link.customer.name.slice(0, 100) }) },
      link_partial_payments: false,
      // Stockpot sends the message itself, on WhatsApp; Cashfree should not also text the customer.
      link_notify: { send_sms: false, send_email: false },
      link_auto_reminders: false,
      link_meta: { return_url: link.returnUrl },
      link_expiry_time: new Date(link.expiresAt * 1000).toISOString(),
    });
    if (!ok) throw refused(status, data);
    if (typeof data?.link_url !== 'string' || !data.link_url.startsWith('https://')) throw new GatewayError('Cashfree gave an answer Stockpot did not understand.', status);
    return { id: String(data.link_id ?? linkId), url: data.link_url };
  },

  async getLink(c, linkId, fetchFn): Promise<LinkState> {
    const { ok, status, data } = await call(c, fetchFn, 'GET', `/links/${encodeURIComponent(linkId)}`);
    if (!ok) throw refused(status, data);
    const state: Record<string, LinkState['status']> = { PAID: 'paid', ACTIVE: 'unpaid', PARTIALLY_PAID: 'partial', EXPIRED: 'expired', CANCELLED: 'cancelled' };
    return {
      status: state[String(data?.link_status)] ?? 'unpaid',
      amountPaid: Math.round((Number(data?.link_amount_paid) || 0) * 100) / 100,
    };
  },
};
