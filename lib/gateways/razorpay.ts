/**
 * Razorpay Payment Links, with the owner's own keys (not Stockpot's subscription account in lib/razorpay.ts). Written from
 * Razorpay's documented API without being able to reach their docs or test service from here, so the first real check is a
 * test-mode key pair: Settings > Online payments > Test connection, then a ₹1 bill.
 */
import { GatewayError, paiseToRupees, rupeesToPaise, type CreatedLink, type FetchLike, type Gateway, type GatewayCredentials, type KeyCheck, type LinkState, type NewLink } from './types';

const API = 'https://api.razorpay.com/v1';
const MIN_PAISE = 100;

const auth = (c: GatewayCredentials) => `Basic ${Buffer.from(`${c.keyId}:${c.secret}`).toString('base64')}`;
const isTest = (c: GatewayCredentials) => c.keyId.startsWith('rzp_test_');

async function call(c: GatewayCredentials, fetchFn: FetchLike, method: 'GET' | 'POST', path: string, body?: Record<string, unknown>) {
  let res;
  try {
    res = await fetchFn(`${API}${path}`, { method, headers: { Authorization: auth(c), 'Content-Type': 'application/json' }, ...(body && { body: JSON.stringify(body) }) });
  } catch {
    throw new GatewayError('Razorpay could not be reached. Please try again in a moment.');
  }
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

const refused = (status: number, data: any): GatewayError => {
  const said = String(data?.error?.description ?? '');
  if (status === 401) return new GatewayError('Razorpay did not accept those keys. Check the Key ID and Key Secret.', status);
  if (/not (been )?enabled|not activated|access/i.test(said)) return new GatewayError('Razorpay accepted the keys, but Payment Links are not turned on for this account. Turn them on in your Razorpay dashboard and try again.', status);
  return new GatewayError(said ? `Razorpay said: ${said}` : 'Razorpay could not do that right now. Please try again in a moment.', status);
};

export const razorpay: Gateway = {
  id: 'razorpay',
  label: 'Razorpay',

  async check(c, fetchFn): Promise<KeyCheck> {
    try {
      const { ok, status, data } = await call(c, fetchFn, 'GET', '/payment_links?count=1');
      if (ok) return { ok: true, test: isTest(c) };
      return { ok: false, message: refused(status, data).message };
    } catch (err) {
      return { ok: false, message: err instanceof GatewayError ? err.message : 'Razorpay could not be reached.' };
    }
  },

  async createLink(c, link: NewLink, fetchFn): Promise<CreatedLink> {
    const amount = rupeesToPaise(link.amount);
    if (amount < MIN_PAISE) throw new GatewayError('Razorpay needs at least ₹1 to make a payment link.');
    const { ok, status, data } = await call(c, fetchFn, 'POST', '/payment_links', {
      amount, currency: 'INR', accept_partial: false,
      reference_id: link.reference,
      description: link.description.slice(0, 2000),
      ...((link.customer.name || link.customer.phone) && { customer: { ...(link.customer.name && { name: link.customer.name }), ...(link.customer.phone && { contact: link.customer.phone }) } }),
      // Stockpot sends the message itself, on WhatsApp; Razorpay should not also text the customer.
      notify: { sms: false, email: false }, reminder_enable: false,
      callback_url: link.returnUrl, callback_method: 'get',
      expire_by: link.expiresAt,
    });
    if (!ok) throw refused(status, data);
    if (typeof data?.id !== 'string' || typeof data?.short_url !== 'string' || !data.short_url.startsWith('https://')) throw new GatewayError('Razorpay gave an answer Stockpot did not understand.', status);
    return { id: data.id, url: data.short_url };
  },

  async getLink(c, linkId, fetchFn): Promise<LinkState> {
    const { ok, status, data } = await call(c, fetchFn, 'GET', `/payment_links/${encodeURIComponent(linkId)}`);
    if (!ok) throw refused(status, data);
    const state: Record<string, LinkState['status']> = { paid: 'paid', created: 'unpaid', partially_paid: 'partial', expired: 'expired', cancelled: 'cancelled' };
    const payment = Array.isArray(data?.payments) ? data.payments.find((p: any) => p?.status === 'captured' || p?.status === 'paid') ?? data.payments[0] : undefined;
    return {
      status: state[String(data?.status)] ?? 'unpaid',
      amountPaid: paiseToRupees(Number(data?.amount_paid) || 0),
      ...(payment?.payment_id && { paymentId: String(payment.payment_id) }),
    };
  },
};
