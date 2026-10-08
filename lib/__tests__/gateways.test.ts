import { describe, it, expect, vi } from 'vitest';
import { cashfree } from '../gateways/cashfree';
import { razorpay } from '../gateways/razorpay';
import { GatewayError } from '../gateways/types';

const reply = (status: number, body: unknown) => vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
const SECRET = 'super-secret-value-123';
const rzp = { keyId: 'rzp_test_AbC123', secret: SECRET };
const cf = { keyId: 'CF_APP_ID', secret: SECRET, environment: 'sandbox' as const };
const link = { amount: 1300.5, description: 'Anita Bakes · bill AB12CD34', reference: 'tok-abc-1', customer: { name: 'Priya', phone: '+91 98765 43210' }, returnUrl: 'https://www.stockpot.in/bill/tok/return', expiresAt: 1_800_000_000 };

describe('Razorpay', () => {
  it('makes a payment link for the amount in paise, with no messages from Razorpay and a return address', async () => {
    const f = reply(200, { id: 'plink_1', short_url: 'https://rzp.io/i/abc', status: 'created' });
    await expect(razorpay.createLink(rzp, link, f)).resolves.toEqual({ id: 'plink_1', url: 'https://rzp.io/i/abc' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.razorpay.com/v1/payment_links');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from(`rzp_test_AbC123:${SECRET}`).toString('base64')}`);
    expect(JSON.parse(init.body)).toMatchObject({
      amount: 130050, currency: 'INR', accept_partial: false, reference_id: 'tok-abc-1',
      customer: { name: 'Priya', contact: '+91 98765 43210' }, notify: { sms: false, email: false }, reminder_enable: false,
      callback_url: 'https://www.stockpot.in/bill/tok/return', callback_method: 'get', expire_by: 1_800_000_000,
    });
  });

  it('turns a rupee amount into whole paise without drifting', async () => {
    for (const [rupees, paise] of [[1 + 0.1 + 0.2, 130], [1299.99, 129999], [525, 52500], [1234.56, 123456], [4.35, 435]]) {
      const f = reply(200, { id: 'p', short_url: 'https://rzp.io/i/x' });
      await razorpay.createLink(rzp, { ...link, amount: rupees }, f);
      expect(JSON.parse(f.mock.calls[0][1].body).amount).toBe(paise);
    }
  });

  it('refuses under a rupee before asking Razorpay', async () => {
    const f = reply(200, {});
    await expect(razorpay.createLink(rzp, { ...link, amount: 0.5 }, f)).rejects.toThrow(/at least ₹1/);
    expect(f).not.toHaveBeenCalled();
  });

  it('reads whether a link was paid, and how much, in rupees', async () => {
    const paid = reply(200, { status: 'paid', amount_paid: 130050, payments: [{ payment_id: 'pay_9', status: 'captured' }] });
    await expect(razorpay.getLink(rzp, 'plink_1', paid)).resolves.toEqual({ status: 'paid', amountPaid: 1300.5, paymentId: 'pay_9' });
    expect(paid.mock.calls[0][0]).toBe('https://api.razorpay.com/v1/payment_links/plink_1');
    for (const [raw, want] of [['created', 'unpaid'], ['partially_paid', 'partial'], ['expired', 'expired'], ['cancelled', 'cancelled'], ['something_new', 'unpaid']] as const) {
      await expect(razorpay.getLink(rzp, 'p', reply(200, { status: raw, amount_paid: 0 }))).resolves.toMatchObject({ status: want, amountPaid: 0 });
    }
  });

  it('checks the keys with a harmless read, and says plainly what is wrong without echoing a key', async () => {
    const good = reply(200, { payment_links: [] });
    await expect(razorpay.check(rzp, good)).resolves.toEqual({ ok: true, test: true });
    expect(good.mock.calls[0][0]).toBe('https://api.razorpay.com/v1/payment_links?count=1');
    await expect(razorpay.check({ keyId: 'rzp_live_x', secret: SECRET }, reply(200, {}))).resolves.toMatchObject({ ok: true, test: false });

    const bad = await razorpay.check(rzp, reply(401, { error: { description: `Authentication failed for ${SECRET}` } }));
    expect(bad).toMatchObject({ ok: false, message: expect.stringContaining('did not accept those keys') });
    expect(JSON.stringify(bad)).not.toContain(SECRET);

    const off = await razorpay.check(rzp, reply(400, { error: { description: 'Payment Links is not enabled for this account' } }));
    expect(off.message).toMatch(/Payment Links are not turned on/);
  });

  it('turns a network failure into words, and a refusal into the gateway\'s own description', async () => {
    await expect(razorpay.createLink(rzp, link, vi.fn().mockRejectedValue(new Error(`socket hang up ${SECRET}`)))).rejects.toThrow('Razorpay could not be reached');
    const err = await razorpay.createLink(rzp, link, reply(400, { error: { description: 'The amount must be at least INR 1.00' } })).catch(e => e);
    expect(err).toBeInstanceOf(GatewayError);
    expect(err.message).toBe('Razorpay said: The amount must be at least INR 1.00');
    await expect(razorpay.createLink(rzp, link, reply(200, { nonsense: true }))).rejects.toThrow(/did not understand/);
    await expect(razorpay.createLink(rzp, link, reply(200, { id: 'p', short_url: 'http://insecure.example/x' }))).rejects.toThrow(/did not understand/);
  });
});

describe('Cashfree', () => {
  it('makes a link in rupees on the right service, with the customer\'s ten digits and no messages from Cashfree', async () => {
    const f = reply(200, { cf_link_id: 1, link_id: 'sp_tok_abc_1', link_url: 'https://payments-test.cashfree.com/links/xyz', link_status: 'ACTIVE' });
    await expect(cashfree.createLink(cf, { ...link, reference: 'sp_tok_abc_1' }, f)).resolves.toEqual({ id: 'sp_tok_abc_1', url: 'https://payments-test.cashfree.com/links/xyz' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://sandbox.cashfree.com/pg/links');
    expect(init.headers).toMatchObject({ 'x-client-id': 'CF_APP_ID', 'x-client-secret': SECRET, 'x-api-version': '2023-08-01' });
    expect(JSON.parse(init.body)).toMatchObject({
      link_id: 'sp_tok_abc_1', link_amount: 1300.5, link_currency: 'INR', link_partial_payments: false,
      customer_details: { customer_phone: '9876543210', customer_name: 'Priya' },
      link_notify: { send_sms: false, send_email: false }, link_meta: { return_url: 'https://www.stockpot.in/bill/tok/return' },
    });
    expect(JSON.parse(init.body).link_expiry_time).toBe(new Date(1_800_000_000 * 1000).toISOString());
  });

  it('uses the live service unless told it is the test one, and keeps the link id to what Cashfree allows', async () => {
    const f = reply(200, { link_url: 'https://payments.cashfree.com/links/x' });
    const made = await cashfree.createLink({ ...cf, environment: 'production' }, { ...link, reference: 'a b/c?d'.padEnd(80, 'z') }, f);
    expect(f.mock.calls[0][0]).toBe('https://api.cashfree.com/pg/links');
    expect(JSON.parse(f.mock.calls[0][1].body).link_id).toMatch(/^[A-Za-z0-9_-]{1,50}$/);
    expect(made.id).toMatch(/^[A-Za-z0-9_-]{1,50}$/);
  });

  it('says so when there is no phone number to give Cashfree, or under a rupee, without asking it', async () => {
    const f = reply(200, {});
    await expect(cashfree.createLink(cf, { ...link, customer: { name: 'Priya' } }, f)).rejects.toThrow(/needs a phone number/);
    await expect(cashfree.createLink(cf, { ...link, amount: 0.5 }, f)).rejects.toThrow(/at least ₹1/);
    expect(f).not.toHaveBeenCalled();
    // The business's own number stands in when the customer gave none.
    const g = reply(200, { link_url: 'https://payments.cashfree.com/links/x' });
    await cashfree.createLink(cf, { ...link, customer: { name: 'Priya' }, businessPhone: '+91 98450 00199' }, g);
    expect(JSON.parse(g.mock.calls[0][1].body).customer_details.customer_phone).toBe('9845000199');
  });

  it('will not send a customer to an address that is not https', async () => {
    await expect(cashfree.createLink(cf, link, reply(200, { link_url: 'http://insecure.example/x' }))).rejects.toThrow(/did not understand/);
  });

  it('reads whether a link was paid, and how much', async () => {
    const f = reply(200, { link_status: 'PAID', link_amount_paid: 1300.5 });
    await expect(cashfree.getLink(cf, 'sp_1', f)).resolves.toEqual({ status: 'paid', amountPaid: 1300.5 });
    expect(f.mock.calls[0][0]).toBe('https://sandbox.cashfree.com/pg/links/sp_1');
    for (const [raw, want] of [['ACTIVE', 'unpaid'], ['PARTIALLY_PAID', 'partial'], ['EXPIRED', 'expired'], ['CANCELLED', 'cancelled'], ['NEW', 'unpaid']] as const) {
      await expect(cashfree.getLink(cf, 'x', reply(200, { link_status: raw }))).resolves.toMatchObject({ status: want, amountPaid: 0 });
    }
  });

  it('checks the keys by asking for a link that cannot exist: not found means the keys work, refused means they do not', async () => {
    await expect(cashfree.check(cf, reply(404, { message: 'link not found' }))).resolves.toEqual({ ok: true, test: true });
    await expect(cashfree.check({ ...cf, environment: 'production' }, reply(404, {}))).resolves.toEqual({ ok: true, test: false });
    const bad = await cashfree.check(cf, reply(401, { message: `invalid secret ${SECRET}` }));
    expect(bad).toMatchObject({ ok: false, message: expect.stringContaining('did not accept those keys') });
    expect(JSON.stringify(bad)).not.toContain(SECRET);
    expect((await cashfree.check(cf, reply(500, {}))).ok).toBe(false);
    expect((await cashfree.check(cf, vi.fn().mockRejectedValue(new Error('down')))).message).toContain('could not be reached');
  });
});
