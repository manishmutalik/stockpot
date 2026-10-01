import { describe, it, expect } from 'vitest';
import { customerKey, groupPendingPayments, isUnpaid } from '../payments';

const menu: any[] = [
  { id: 'cake', name: 'Cake', sellingPrice: 500 },
  { id: 'cookie', name: 'Cookie', sellingPrice: 20 },
];
const o = (id: string, over: Record<string, any> = {}): any => ({ id, menuItemId: 'cake', quantity: 1, date: '2026-03-10', ...over });
const settings = { name: 'Asha Bakes', address: '', phone: '', logo: '' };
const INR = { code: 'INR', symbol: '₹' };
const group = (orders: any[], s: any = settings) => groupPendingPayments({ orders, menu, settings: s, currency: INR });

describe('isUnpaid', () => {
  it('is true only for orders saved as pay-later; no value means paid, so old orders owe nothing', () => {
    expect(isUnpaid(o('a', { paymentStatus: 'unpaid' }))).toBe(true);
    expect(isUnpaid(o('b', { paymentStatus: 'paid' }))).toBe(false);
    expect(isUnpaid(o('c'))).toBe(false);
  });
});

describe('customerKey', () => {
  it('matches the same phone typed differently', () => {
    const keys = ['+91 98450 10101', '098450-10101', '9845010101', '(98450) 10101'].map(p => customerKey(o('x', { customerPhone: p })));
    expect(new Set(keys).size).toBe(1);
  });
  it('prefers the phone over the name, so a different spelling of the name is still one customer', () => {
    expect(customerKey(o('a', { customerPhone: '9845010101', customerName: 'Priya' })))
      .toBe(customerKey(o('b', { customerPhone: '9845010101', customerName: 'Priya S.' })));
  });
  it('falls back to the name, ignoring case and extra spaces', () => {
    expect(customerKey(o('a', { customerName: ' Priya  Sharma ' }))).toBe(customerKey(o('b', { customerName: 'priya sharma' })));
  });
  it('does not merge unnamed orders, but keeps a multi-item order together', () => {
    expect(customerKey(o('a'))).not.toBe(customerKey(o('b')));
    expect(customerKey(o('a', { orderGroupId: 'g' }))).toBe(customerKey(o('b', { orderGroupId: 'g' })));
  });
  it('does not treat a short number as a phone', () => {
    expect(customerKey(o('a', { customerPhone: '555-0101', customerName: 'Sam' }))).toBe('name:sam');
  });
});

describe('groupPendingPayments', () => {
  it('lists each customer once with everything they owe, and ignores paid orders', () => {
    const result = group([
      o('a', { customerName: 'Priya', customerPhone: '9845010101', paymentStatus: 'unpaid', date: '2026-03-01' }),
      o('b', { customerName: 'Priya', customerPhone: '+91 98450 10101', paymentStatus: 'unpaid', date: '2026-03-05', quantity: 2 }),
      o('c', { customerName: 'Priya', customerPhone: '9845010101', date: '2026-03-06' }), // paid
      o('d', { customerName: 'Rohan', menuItemId: 'cookie', quantity: 5, paymentStatus: 'unpaid' }),
    ]);
    expect(result).toHaveLength(2);
    const priya = result.find(c => c.name === 'Priya')!;
    expect(priya.orders.map(x => x.id)).toEqual(['a', 'b']);
    expect(priya.orderCount).toBe(2);
    expect(priya.oldestDate).toBe('2026-03-01');
    expect(priya.dueTotal).toBe(1500); // 500 + 2 x 500
    expect(result.find(c => c.name === 'Rohan')!.dueTotal).toBe(100);
  });

  it('puts the biggest amount first', () => {
    const result = group([
      o('a', { customerName: 'Small', menuItemId: 'cookie', paymentStatus: 'unpaid' }),
      o('b', { customerName: 'Big', paymentStatus: 'unpaid' }),
    ]);
    expect(result.map(c => c.name)).toEqual(['Big', 'Small']);
  });

  it('counts a multi-item order once, and its shared delivery charge once', () => {
    const [c] = group([
      o('g1', { customerName: 'Aris', orderGroupId: 'g', paymentStatus: 'unpaid', deliveryMethod: 'self_delivery', deliveryCharge: 50 }),
      o('g2', { customerName: 'Aris', orderGroupId: 'g', paymentStatus: 'unpaid', menuItemId: 'cookie', quantity: 5 }),
    ]);
    expect(c.orderCount).toBe(1);
    expect(c.dueTotal).toBe(650); // 500 + 100 + 50 delivery, once
  });

  it('owes exactly what the consolidated bill adds up to, GST included', () => {
    const gst = { ...settings, gstApplicable: true, gstRate: 18, gstPricingMode: 'exclusive' as const };
    const [c] = group([o('a', { customerName: 'P', paymentStatus: 'unpaid' }), o('b', { customerName: 'P', paymentStatus: 'unpaid' })], gst);
    expect(c.dueTotal).toBe(1180); // 1000 + 18%
  });

  it("uses the customer's latest name and phone", () => {
    const [c] = group([
      o('a', { customerName: 'Priya', customerPhone: '9845010101', paymentStatus: 'unpaid', date: '2026-03-01' }),
      o('b', { customerName: 'Priya Sharma', customerPhone: '9845010101', paymentStatus: 'unpaid', date: '2026-03-09' }),
    ]);
    expect(c.name).toBe('Priya Sharma');
  });

  it('labels a customer with no name, and returns nothing when nothing is unpaid', () => {
    expect(group([o('a', { paymentStatus: 'unpaid' })])[0].name).toBe('Customer not named');
    expect(group([o('a'), o('b', { paymentStatus: 'paid' })])).toEqual([]);
  });
});
