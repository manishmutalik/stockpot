import { describe, it, expect } from 'vitest';
import { buildInvoiceMessage, buildStatementMessage, type Bill } from '../billing';

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

  it('with a link to the bill online, is a short summary and the link on a line of its own', () => {
    const text = buildInvoiceMessage(bill({ advance: { amount: 500 }, balanceDue: 1500, upiId: 'anita@upi' }), { settled: false, link: 'https://x.test/bill/abc' });
    expect(text.split('\n')).toEqual([
      'Hi Priya Sharma, here\'s your invoice from Anita\'s Bakery (AB12CD34, 10 Oct 2026).',
      'Total: ₹2,000.00',
      'Advance received: ₹500.00',
      '*Balance due: ₹1,500.00*',
      '',
      'View the full bill and pay online:',
      'https://x.test/bill/abc',
    ]);
    expect(text).not.toMatch(/Chocolate|Sourdough|UPI/); // the items and the UPI button are on the page
  });

  it('without a link, keeps the whole invoice: the advance, the balance and the UPI ID to pay it to', () => {
    const text = buildInvoiceMessage(bill({ advance: { amount: 500 }, balanceDue: 1500, upiId: 'anita@upi' }), { settled: false });
    expect(text).toContain('• 2 × Chocolate Truffle Cake: ₹1,800.00');
    expect(text).toContain('Advance received: ₹500.00');
    expect(text).toContain('Balance due: ₹1,500.00');
    expect(text).toContain('Pay by UPI: anita@upi');
    expect(text).not.toMatch(/\*|View/);
  });

  it('with a link and nothing owed, says paid in full and offers only the bill, not payment', () => {
    const text = buildInvoiceMessage(bill({ advance: { amount: 500 } }), { settled: true, link: 'https://x.test/bill/abc' });
    expect(text.split('\n')).toEqual([
      'Hi Priya Sharma, here\'s your invoice from Anita\'s Bakery (AB12CD34, 10 Oct 2026).',
      'Total: ₹2,000.00',
      'Paid in full. Thank you!',
      '',
      'View the full bill:',
      'https://x.test/bill/abc',
    ]);
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

describe('buildStatementMessage', () => {
  const statement = (over: Partial<Bill> = {}) => bill({
    kind: 'statement', orderCount: 2, reference: 'ST-AB12CD', balanceDue: 1300, total: 1300,
    lines: [{ name: 'Cake', quantity: 1, unitPrice: 900, lineTotal: 900, date: '2026-10-01' }, { name: 'Sourdough', quantity: 2, unitPrice: 200, lineTotal: 400, date: '2026-10-03' }],
    ...over,
  });

  it('with a link, is a short summary of what is owed and the link on a line of its own', () => {
    expect(buildStatementMessage(statement(), { link: 'https://x.test/bill/stmt' }).split('\n')).toEqual([
      'Hi Priya Sharma, here\'s your statement from Anita\'s Bakery (2 orders, as on 10 Oct 2026).',
      'Total: ₹1,300.00',
      '*Balance due: ₹1,300.00*',
      '',
      'View the full statement and pay online:',
      'https://x.test/bill/stmt',
    ]);
  });

  it('without a link, lists each order with its day and where to pay', () => {
    const text = buildStatementMessage(statement({ upiId: 'anita@upi' }), {});
    expect(text).toContain('• Thu 1 Oct: 1 × Cake: ₹900.00');
    expect(text).toContain('• Sat 3 Oct: 2 × Sourdough: ₹400.00');
    expect(text).toContain('Balance due: ₹1,300.00');
    expect(text).toContain('Pay by UPI: anita@upi');
  });
});
