import { describe, it, expect } from 'vitest';
import { buildInvoiceMessage, type Bill } from '../billing';

const bill = (over: Partial<Bill> = {}): Bill => ({
  reference: 'AB12CD34', date: '2026-10-10', customerName: 'Priya Sharma',
  business: { name: 'Anita\'s Bakery', address: 'Pune', phone: '98 76 54 32 10' },
  lines: [
    { name: 'Chocolate Truffle Cake', quantity: 2, unitPrice: 900, lineTotal: 1800 },
    { name: 'Sourdough', quantity: 1, unitPrice: 200, lineTotal: 200 },
  ],
  itemsTotal: 2000, deliveryCharge: 0, discount: 0, gst: null, total: 2000, balanceDue: 2000, currency: { code: 'INR', symbol: '₹' },
  ...over,
});

describe('buildInvoiceMessage', () => {
  it('lists every item with what it came to, the total, and what is due', () => {
    const text = buildInvoiceMessage(bill(), { settled: false });
    expect(text.split('\n')).toEqual([
      'Hi Priya Sharma, here\'s your invoice from Anita\'s Bakery (AB12CD34, 10 Oct 2026):',
      '• 2 × Chocolate Truffle Cake: ₹1,800.00',
      '• 1 × Sourdough: ₹200.00',
      'Total: ₹2,000.00',
      'Balance due: ₹2,000.00',
    ]);
  });

  it('shows the advance and the balance left, the UPI ID to pay it to, and the link', () => {
    const text = buildInvoiceMessage(bill({ advance: { amount: 500 }, balanceDue: 1500, upiId: 'anita@upi' }), { settled: false, link: 'https://x.test/bill/abc' });
    expect(text).toContain('Advance received: ₹500.00');
    expect(text).toContain('Balance due: ₹1,500.00');
    expect(text).toContain('Pay by UPI: anita@upi');
    expect(text.split('\n').at(-1)).toBe('View or pay online: https://x.test/bill/abc');
  });

  it('says paid in full, with no balance, advance or UPI line, once nothing is owed', () => {
    const text = buildInvoiceMessage(bill({ advance: { amount: 500 }, upiId: 'anita@upi' }), { settled: true });
    expect(text).toContain('Total: ₹2,000.00');
    expect(text).toContain('Paid in full. Thank you!');
    expect(text).not.toMatch(/Balance due|Advance received|UPI/);
  });

  it('adds delivery, discount and GST only when there are some, and says when GST is already in the price', () => {
    const plain = buildInvoiceMessage(bill(), { settled: false });
    expect(plain).not.toMatch(/Delivery|Discount|GST/);
    const extra = buildInvoiceMessage(bill({ deliveryCharge: 50, discount: 100, gst: { rate: 5, mode: 'exclusive', amount: 95 }, total: 2045, balanceDue: 2045 }), { settled: false });
    expect(extra).toContain('Delivery: ₹50.00');
    expect(extra).toContain('Discount: −₹100.00');
    expect(extra).toContain('GST (5%): ₹95.00');
    expect(buildInvoiceMessage(bill({ gst: { rate: 5, mode: 'inclusive', amount: 95 } }), { settled: false })).toContain('Includes GST (5%): ₹95.00');
  });

  it('works without a customer name, and writes the date the same way everywhere', () => {
    expect(buildInvoiceMessage(bill({ customerName: undefined }), { settled: false }).split('\n')[0]).toBe('Here\'s your invoice from Anita\'s Bakery (AB12CD34, 10 Oct 2026):');
    expect(buildInvoiceMessage(bill({ date: '2026-01-05' }), { settled: false })).toContain('5 Jan 2026');
    expect(buildInvoiceMessage(bill({ date: 'garbled' }), { settled: false })).toContain('garbled');
  });
});
