import { describe, it, expect, vi } from 'vitest';
import { createBillHandler, createPublicBillHandler } from '../billRoutes';
import { escapeHtml, renderBillHtml } from '../billHtml';
import { buildBill, generateBillToken } from '../../src/utils/billing';

const bill = buildBill({
  orders: [{ id: 'abc123xyz', menuItemId: 'cake', quantity: 2, date: '2026-03-10', customerName: '<script>alert(1)</script>' } as any],
  menu: [{ id: 'cake', name: 'Cake & "Co"', sellingPrice: 250 } as any],
  settings: { name: 'Asha <b>Bakes</b>', address: '14 MG Road', phone: '+91 98450 00199', logo: '', upiId: 'asha@okhdfcbank', gstApplicable: true, gstRate: 5, gstPricingMode: 'exclusive' },
  currency: { code: 'INR', symbol: '₹' },
});

function mockRes() {
  const res: any = { statusCode: 200, headers: {}, body: undefined };
  res.set = (h: Record<string, string>) => { Object.assign(res.headers, h); return res; };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.type = () => res;
  res.send = (b: any) => { res.body = b; return res; };
  res.json = (b: any) => { res.body = b; return res; };
  return res;
}

describe('public bill route', () => {
  it('serves the bill for a valid token', async () => {
    const token = generateBillToken();
    const getBill = vi.fn().mockResolvedValue(bill);
    const res = mockRes();
    await createPublicBillHandler(getBill)({ params: { token } } as any, res);
    expect(getBill).toHaveBeenCalledWith(token);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('₹525.00'); // 500 + 5% GST
    expect(res.headers['X-Robots-Tag']).toContain('noindex');
    expect(res.headers['Cache-Control']).toContain('no-store');
  });

  it('answers 404 for a wrong or unknown token, without touching the database for a malformed one', async () => {
    const getBill = vi.fn().mockResolvedValue(null);
    const handler = createPublicBillHandler(getBill);

    const unknown = mockRes();
    await handler({ params: { token: generateBillToken() } } as any, unknown);
    expect(unknown.statusCode).toBe(404);

    for (const bad of ['guess', '12345', '../etc/passwd', 'A'.repeat(32), '']) {
      const res = mockRes();
      await handler({ params: { token: bad } } as any, res);
      expect(res.statusCode).toBe(404);
    }
    expect(getBill).toHaveBeenCalledTimes(1); // only the well-formed token reached the store
  });

  it('gives the same 404 page whether or not an order exists, so nothing is revealed', async () => {
    const handler = createPublicBillHandler(vi.fn().mockResolvedValue(null));
    const a = mockRes(); const b = mockRes();
    await handler({ params: { token: 'not-a-token' } } as any, a);
    await handler({ params: { token: generateBillToken() } } as any, b);
    expect(a.body).toBe(b.body);
  });

  it('does not leak error details when the store fails', async () => {
    const res = mockRes();
    await createPublicBillHandler(vi.fn().mockRejectedValue(new Error('secret db detail')))({ params: { token: generateBillToken() } } as any, res);
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret');
  });
});

describe('bill page HTML', () => {
  it('escapes business, customer and item text', () => {
    const html = renderBillHtml(bill);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Asha &lt;b&gt;Bakes&lt;/b&gt;');
    expect(html).toContain('Cake &amp; &quot;Co&quot;');
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
  it('shows the GST line, the total and a UPI pay link, but no customer phone', () => {
    const html = renderBillHtml(bill);
    expect(html).toContain('GST (5%)');
    expect(html).toContain('₹525.00');
    expect(html).toContain('href="upi://pay?pa=asha%40okhdfcbank');
    expect(html).not.toContain('98450 10101');
    expect(html).toContain('noindex');
  });
  it('has no UPI link when the bill has no UPI ID', () => {
    expect(renderBillHtml({ ...bill, upiId: undefined })).not.toContain('upi://');
  });
});

describe('create bill route', () => {
  const run = async (body: any, createBill: any) => {
    const res = mockRes();
    await createBillHandler(createBill)({ uid: 'u1', body } as any, res);
    return res;
  };
  it('creates the bill for the signed-in user and returns the token', async () => {
    const createBill = vi.fn().mockResolvedValue({ token: 't', bill });
    const res = await run({ orderId: 'o1' }, createBill);
    expect(createBill).toHaveBeenCalledWith('u1', 'o1');
    expect(res.body).toEqual({ token: 't', bill });
  });
  it('rejects a missing or path-like order id, and 404s an order that is not theirs', async () => {
    const createBill = vi.fn().mockResolvedValue(null);
    expect((await run({}, createBill)).statusCode).toBe(400);
    expect((await run({ orderId: 'a/b' }, createBill)).statusCode).toBe(400);
    expect(createBill).not.toHaveBeenCalled();
    expect((await run({ orderId: 'nope' }, createBill)).statusCode).toBe(404);
  });
});
