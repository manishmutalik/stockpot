import { describe, it, expect } from 'vitest';
import {
  buildBill, buildBillMessage, buildUpiLink, buildWhatsAppUrl, canPayByUpi, generateBillToken,
  isValidBillToken, normalizeWhatsAppNumber, ordersForBill, resolveBillToken
} from '../billing';

const menu: any[] = [
  { id: 'cake', name: 'Chocolate Cake', sellingPrice: 500 },
  { id: 'cookie', name: 'Atta Cookie', sellingPrice: 20 },
];
const order = (id: string, over: Record<string, any> = {}): any => ({ id, menuItemId: 'cake', quantity: 1, date: '2026-03-10', ...over });
const INR = { code: 'INR', symbol: '₹' };
const settings = { name: 'Asha & Sons', address: '14 MG Road', phone: '+91 98450 00199', logo: '' };

describe('buildBill', () => {
  it('itemises the order and adds up the total', () => {
    const bill = buildBill({ orders: [order('o1', { quantity: 2, customerName: 'Priya' })], menu, settings, currency: INR });
    expect(bill.lines).toEqual([{ name: 'Chocolate Cake', quantity: 2, unitPrice: 500, lineTotal: 1000 }]);
    expect(bill.itemsTotal).toBe(1000);
    expect(bill.total).toBe(1000);
    expect(bill.gst).toBeNull();
    expect(bill.customerName).toBe('Priya');
    expect(bill.reference).toBe('O1');
  });

  it('puts a multi-item order on one bill and counts its shared delivery charge once', () => {
    const orders = [
      order('g1', { orderGroupId: 'g', deliveryMethod: 'self_delivery', deliveryCharge: 50 }),
      order('g2', { orderGroupId: 'g', menuItemId: 'cookie', quantity: 5 }),
    ];
    const bill = buildBill({ orders, menu, settings, currency: INR });
    expect(bill.lines.map(l => l.name)).toEqual(['Chocolate Cake', 'Atta Cookie']);
    expect(bill.itemsTotal).toBe(600);
    expect(bill.deliveryCharge).toBe(50);
    expect(bill.total).toBe(650);
  });

  it('adds GST on top when prices are exclusive, using the same split as the dashboard', () => {
    const bill = buildBill({
      orders: [order('o1', { deliveryCharge: 100 })], menu, currency: INR,
      settings: { ...settings, gstApplicable: true, gstRate: 18, gstPricingMode: 'exclusive' },
    });
    // (500 + 100 delivery) x 18% = 108
    expect(bill.gst).toEqual({ rate: 18, mode: 'exclusive', amount: 108 });
    expect(bill.total).toBe(708);
  });

  it('backs GST out of the price when it is inclusive, leaving the total unchanged', () => {
    const bill = buildBill({
      orders: [order('o1')], menu, currency: INR,
      settings: { ...settings, gstApplicable: true, gstRate: 5, gstPricingMode: 'inclusive' },
    });
    expect(bill.gst).toEqual({ rate: 5, mode: 'inclusive', amount: 23.81 }); // 500 - 500/1.05
    expect(bill.total).toBe(500);
  });

  it('shows no GST line when GST is off or the rate is 0', () => {
    expect(buildBill({ orders: [order('o1')], menu, currency: INR, settings: { ...settings, gstApplicable: false, gstRate: 18 } }).gst).toBeNull();
    expect(buildBill({ orders: [order('o1')], menu, currency: INR, settings: { ...settings, gstApplicable: true, gstRate: 0 } }).gst).toBeNull();
  });

  it('carries the UPI ID only for an INR business that set one', () => {
    const withUpi = { ...settings, upiId: ' asha@okhdfcbank ' };
    expect(buildBill({ orders: [order('o1')], menu, currency: INR, settings: withUpi }).upiId).toBe('asha@okhdfcbank');
    expect(buildBill({ orders: [order('o1')], menu, currency: INR, settings }).upiId).toBeUndefined();
    expect(buildBill({ orders: [order('o1')], menu, currency: { code: 'USD', symbol: '$' }, settings: withUpi }).upiId).toBeUndefined();
    expect(canPayByUpi('   ', 'INR')).toBe(false);
  });

  it('drops a logo that is not a web URL or a small embedded image', () => {
    const logo = (l: string) => buildBill({ orders: [order('o1')], menu, currency: INR, settings: { ...settings, logo: l } }).business.logo;
    expect(logo('https://example.com/logo.png')).toBe('https://example.com/logo.png');
    expect(logo('javascript:alert(1)')).toBeUndefined();
    expect(logo('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(logo('data:text/html;base64,AAAA')).toBeUndefined();
  });
});

describe('ordersForBill', () => {
  it('returns the whole group for a grouped order, and just the order otherwise', () => {
    const all = [order('a', { orderGroupId: 'g' }), order('b', { orderGroupId: 'g' }), order('c')];
    expect(ordersForBill(all[0], all).map(o => o.id)).toEqual(['a', 'b']);
    expect(ordersForBill(all[2], all).map(o => o.id)).toEqual(['c']);
  });
});

describe('buildUpiLink', () => {
  it('encodes the business name, amount to two decimals and the reference', () => {
    const link = buildUpiLink({ upiId: 'asha@okhdfcbank', payeeName: 'Asha & Sons Bakery', amount: 708, reference: 'AB12CD34' });
    expect(link).toBe('upi://pay?pa=asha%40okhdfcbank&pn=Asha%20%26%20Sons%20Bakery&am=708.00&tn=AB12CD34&cu=INR');
    const params = new URL(link.replace('upi://', 'https://upi.invalid/')).searchParams;
    expect(params.get('pn')).toBe('Asha & Sons Bakery');
    expect(params.get('am')).toBe('708.00');
  });
  it('keeps fractional amounts exact', () => {
    expect(buildUpiLink({ upiId: 'a@b', payeeName: 'X', amount: 23.8095, reference: 'R' })).toContain('am=23.81&');
  });
});

describe('normalizeWhatsAppNumber', () => {
  it.each([
    ['+91 98450 10101', '919845010101'],
    ['098450-10101', '919845010101'],
    ['9845010101', '919845010101'],
    ['(98450) 10101', '919845010101'],
    ['0091 98450 10101', '919845010101'],
    ['919845010101', '919845010101'],
    ['+1 (555) 123-4567', '15551234567'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeWhatsAppNumber(raw)).toBe(expected);
  });
  it.each(['', '   ', undefined, '555-0101', 'call me', '12345'])('rejects %j', raw => {
    expect(normalizeWhatsAppNumber(raw as any)).toBeNull();
  });
});

describe('WhatsApp message and link', () => {
  const bill = buildBill({ orders: [order('o1', { customerName: 'Priya' })], menu, currency: INR, settings });
  it('writes a short message with the total and link', () => {
    expect(buildBillMessage(bill, 'https://stockpot.app/bill/abc')).toBe("Hi Priya, here's your bill from Asha & Sons — ₹500.00. View/pay: https://stockpot.app/bill/abc");
    expect(buildBillMessage(bill)).toBe("Hi Priya, here's your bill from Asha & Sons — ₹500.00.");
    expect(buildBillMessage({ ...bill, customerName: undefined })).toMatch(/^Here's your bill/);
  });
  it('builds an encoded wa.me link, or none without a usable phone', () => {
    expect(buildWhatsAppUrl('+91 98450 10101', 'Hi & bye')).toBe('https://wa.me/919845010101?text=Hi%20%26%20bye');
    expect(buildWhatsAppUrl(undefined, 'x')).toBeNull();
    expect(buildWhatsAppUrl('abc', 'x')).toBeNull();
  });
});

describe('bill token', () => {
  it('is 32 hex characters and different each time', () => {
    const a = generateBillToken();
    expect(isValidBillToken(a)).toBe(true);
    expect(generateBillToken()).not.toBe(a);
  });
  it('is generated once, then reused for the order and for its group', () => {
    const first = resolveBillToken([order('a'), order('b')]);
    expect(first.isNew).toBe(true);
    const stored = [order('a', { billToken: first.token }), order('b')];
    const again = resolveBillToken(stored);
    expect(again).toEqual({ token: first.token, isNew: false });
    expect(resolveBillToken(stored).token).toBe(first.token);
  });
  it('ignores a stored value that is not a valid token', () => {
    const r = resolveBillToken([order('a', { billToken: 'nope' })]);
    expect(r.isNew).toBe(true);
    expect(isValidBillToken(r.token)).toBe(true);
  });
  it.each([undefined, null, '', 'ABC', '../../etc', 'a'.repeat(31), 'g'.repeat(32)])('rejects %j', t => {
    expect(isValidBillToken(t)).toBe(false);
  });
});
