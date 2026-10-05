import { describe, it, expect } from 'vitest';
import { actualOrders, advanceOf, countsAsSale, holdsStock, isActual, isBookedForLater, isOpenPreorder } from '../preorders';
import { bookedAhead, financialsForRange, orderContribution, productProfits } from '../profit';
import { billBalance, buildBill, buildBillMessage, buildBillUpiLink, buildPreorderConfirmation, describeDueSlot } from '../billing';
import { groupPendingPayments } from '../payments';
import { buildCustomerDirectory } from '../customers';
import { buildBusinessSnapshot } from '../aiSnapshot';
import { addDays, formatShortDate } from '../localDate';

const TODAY = '2026-10-04';
const day = (n: number) => addDays(TODAY, n);

const materials: any[] = [{ id: 'flour', unit: 'kg', costPerUnit: 40, category: 'Raw Materials' }];
const menu: any[] = [
  { id: 'cake', name: 'Chocolate Cake', sellingPrice: 100, recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }] },
  { id: 'cookie', name: 'Cookie', sellingPrice: 10, recipe: [] },
];
const GST_OFF = { gstApplicable: false };
const currency = { code: 'INR', symbol: '₹' };
const billSettings = { name: 'Asha Bakes', address: '1 MG Road', phone: '98450 00000', logo: '', gstApplicable: false, upiId: 'asha@upi' };

let n = 0;
/** An order as the app writes it: sells for 100, costs 20 a unit. */
const order = (over: Record<string, any> = {}): any => ({
  id: `o${String(++n).padStart(3, '0')}`, menuItemId: 'cake', quantity: 1, date: day(-1),
  unitPriceAtSale: 100, unitIngredientCostAtSale: 20, unitPackagingCostAtSale: 0, unitInputGstAtSale: 0, itemNameAtSale: 'Chocolate Cake',
  customerName: 'Priya Sharma', customerPhone: '+91 98450 10101', ...over,
});
const preorder = (over: Record<string, any> = {}) => order({ preorder: true, stockClaimed: false, bookedOn: day(-3), ...over });
const advance = (amount: number, over: Record<string, any> = {}) => ({ amount, method: 'upi' as const, feeRate: 2, date: day(-3), ...over });

const fin = (orders: any[], range = { start: day(-30), end: day(30) }, today: string | null = TODAY) =>
  financialsForRange({ orders, menu, materials, experiments: [], wastageLogs: [], settings: { ...GST_OFF, fixedCosts: [] }, ...range, today: today ?? undefined });

describe('holdsStock', () => {
  it('is true for every order made before pre-orders existed, and for one made from stock', () => {
    expect(holdsStock({})).toBe(true);
    expect(holdsStock({ preorder: false })).toBe(true);
    expect(holdsStock({ stockClaimed: true })).toBe(true);
  });

  it('is false for a pre-order until it is handed over, and true after', () => {
    expect(holdsStock({ preorder: true })).toBe(false);
    expect(holdsStock({ preorder: true, stockClaimed: false })).toBe(false);
    expect(holdsStock({ preorder: true, stockClaimed: true })).toBe(true);
  });

  it('is false once cancelled, whatever it held', () => {
    expect(holdsStock({ cancelledOn: day(0) })).toBe(false);
    expect(holdsStock({ preorder: true, stockClaimed: true, cancelledOn: day(0) })).toBe(false);
  });
});

describe('what counts', () => {
  it('a cancelled order is never a sale', () => {
    expect(countsAsSale({})).toBe(true);
    expect(countsAsSale({ cancelledOn: day(0) })).toBe(false);
  });

  it('an actual order is one due today or earlier and not cancelled', () => {
    expect(isActual({ date: day(-5) }, TODAY)).toBe(true);
    expect(isActual({ date: TODAY }, TODAY)).toBe(true);
    expect(isActual({ date: day(1) }, TODAY)).toBe(false);
    expect(isActual({ date: day(-5), cancelledOn: day(-4) }, TODAY)).toBe(false);
    expect(actualOrders([{ date: day(-1) }, { date: day(1) }, { date: day(-1), cancelledOn: day(0) }], TODAY)).toEqual([{ date: day(-1) }]);
  });

  it('booked for later is a sale due after today', () => {
    expect(isBookedForLater({ date: day(1) }, TODAY)).toBe(true);
    expect(isBookedForLater({ date: TODAY }, TODAY)).toBe(false);
    expect(isBookedForLater({ date: day(1), cancelledOn: day(0) }, TODAY)).toBe(false);
  });

  it('an open pre-order is not handed over or cancelled', () => {
    expect(isOpenPreorder({ preorder: true })).toBe(true);
    expect(isOpenPreorder({ preorder: true, fulfilled: true })).toBe(false);
    expect(isOpenPreorder({ preorder: true, cancelledOn: day(0) })).toBe(false);
    expect(isOpenPreorder({})).toBe(false);
  });

  it('the advance of an order is the one stored on any of its items', () => {
    expect(advanceOf([{}, { advance: advance(200) }])?.amount).toBe(200);
    expect(advanceOf([{}])).toBeUndefined();
    expect(advanceOf([{ advance: advance(0) }])).toBeUndefined();
  });
});

describe('revenue and profit', () => {
  it('count an order on its due date, not the day it was booked', () => {
    const p = preorder({ date: day(2), bookedOn: day(-1) });
    expect(fin([p], { start: day(-1), end: day(-1) }, day(3)).income).toBe(0); // the booking day
    expect(fin([p], { start: day(2), end: day(2) }, day(3)).income).toBe(100); // the due day
  });

  it('leave out an order due after today, even inside the range, and count it once it is due', () => {
    const later = preorder({ date: day(3) });
    const month = { start: day(-10), end: day(20) };
    expect(fin([order(), later], month).income).toBe(100);
    expect(fin([order(), later], month).orderCount).toBe(1);
    expect(fin([order(), later], month, day(3)).income).toBe(200);
  });

  it('never count a cancelled order', () => {
    const cancelled = preorder({ date: day(-1), cancelledOn: day(-2) });
    const f = fin([order(), cancelled]);
    expect(f.income).toBe(100);
    expect(f.orderCount).toBe(1);
    expect(f.trueProfit).toBe(80);
  });

  it('count everything when no "today" is given: only cancelled orders are left out', () => {
    expect(fin([order(), preorder({ date: day(3) }), preorder({ cancelledOn: day(0) })], undefined, null).income).toBe(200);
  });

  it('keeps the same figures for orders that are not pre-orders', () => {
    const f = fin([order({ quantity: 3 })]);
    expect(f).toMatchObject({ income: 300, orderExpenses: 60, totalContribution: 240, trueProfit: 240, forfeitedAdvances: 0 });
  });

  it('a pre-order due today counts today', () => {
    expect(fin([preorder({ date: TODAY })], { start: TODAY, end: TODAY }).income).toBe(100);
  });
});

describe('payment fees on an advance', () => {
  it('charges the advance at its own rate and the balance at the order\'s rate', () => {
    // Customer pays 300: 100 advance at 2%, 200 balance at 1%.
    const first = preorder({ quantity: 3, date: TODAY, advance: advance(100, { feeRate: 2 }), paymentMethod: 'cash', paymentFeeRate: 1 });
    const c = orderContribution([first], menu, materials, GST_OFF);
    expect(c.paymentFee).toBeCloseTo(100 * 0.02 + 200 * 0.01, 9);
    expect(c.contribution).toBeCloseTo(300 - 60 - 4, 9);
  });

  it('charges only the advance while the balance is unpaid', () => {
    const unpaid = preorder({ quantity: 3, date: TODAY, advance: advance(100, { feeRate: 2 }), paymentStatus: 'unpaid', paymentMethod: 'cash', paymentFeeRate: 1 });
    expect(orderContribution([unpaid], menu, materials, GST_OFF).paymentFee).toBeCloseTo(2, 9);
  });

  it('charges no fee on a balance whose payment method was not recorded', () => {
    const o = preorder({ quantity: 3, date: TODAY, advance: advance(100, { feeRate: 2 }) });
    expect(orderContribution([o], menu, materials, GST_OFF).paymentFee).toBeCloseTo(2, 9);
  });

  it('an advance that covers the whole order leaves no balance to charge on', () => {
    const o = preorder({ quantity: 1, date: TODAY, advance: advance(100, { feeRate: 2 }), paymentMethod: 'cash', paymentFeeRate: 5 });
    expect(orderContribution([o], menu, materials, GST_OFF).paymentFee).toBeCloseTo(2, 9);
  });

  it('keeps each part at the rate it was received at, whatever Settings say now', () => {
    const o = preorder({ date: TODAY, advance: advance(50, { feeRate: 2 }) });
    // (A later settings change cannot reach it: the rate is on the advance itself.)
    expect(orderContribution([o], menu, materials, GST_OFF).paymentFee).toBeCloseTo(1, 9);
  });

  it('an advance on one item of a multi-item order counts once', () => {
    const a = preorder({ orderGroupId: 'g', date: TODAY, advance: advance(100, { feeRate: 2 }) });
    const b = preorder({ orderGroupId: 'g', menuItemId: 'cookie', itemNameAtSale: 'Cookie', unitPriceAtSale: 10, quantity: 5, date: TODAY });
    expect(orderContribution([a, b], menu, materials, GST_OFF).paymentFee).toBeCloseTo(2, 9);
  });

  it('is taken into the profit figures and the per-product split', () => {
    const o = preorder({ quantity: 2, date: TODAY, advance: advance(100, { feeRate: 2 }) });
    expect(fin([o]).paymentFees).toBeCloseTo(2, 9);
    const p = productProfits([o], menu, materials, GST_OFF).get('cake')!;
    expect(p.contribution).toBeCloseTo(200 - 40 - 2, 9);
  });
});

describe('advances kept from a cancelled pre-order', () => {
  const cancelled = (outcome: 'kept' | 'refunded', over: Record<string, any> = {}) =>
    preorder({ date: day(2), cancelledOn: day(-1), advance: advance(200, { feeRate: 1 }), advanceOutcome: outcome, ...over });

  it('is income on the day it was cancelled, with its fee, and in true profit', () => {
    const f = fin([cancelled('kept')], { start: day(-1), end: day(-1) });
    expect(f.forfeitedAdvances).toBe(200);
    expect(f.paymentFees).toBeCloseTo(2, 9);
    expect(f.trueProfit).toBeCloseTo(198, 9);
    expect(f.profit).toBe(200);
    expect(f.income).toBe(0);
    expect(f.orderCount).toBe(0);
  });

  it('is not income on the due date or any other day', () => {
    expect(fin([cancelled('kept')], { start: day(2), end: day(2) }, day(3)).forfeitedAdvances).toBe(0);
    expect(fin([cancelled('kept')], { start: day(-10), end: day(-2) }).forfeitedAdvances).toBe(0);
  });

  it('counts nothing when the advance was refunded, or when no outcome was recorded', () => {
    expect(fin([cancelled('refunded')], { start: day(-1), end: day(-1) })).toMatchObject({ forfeitedAdvances: 0, trueProfit: 0, paymentFees: 0 });
    expect(fin([cancelled('kept', { advanceOutcome: undefined })], { start: day(-1), end: day(-1) }).forfeitedAdvances).toBe(0);
  });

  it('counts it once for a multi-item order, because only one item holds the advance', () => {
    const a = cancelled('kept', { orderGroupId: 'g' });
    const b = preorder({ orderGroupId: 'g', menuItemId: 'cookie', date: day(2), cancelledOn: day(-1) });
    expect(fin([a, b], { start: day(-1), end: day(-1) }).forfeitedAdvances).toBe(200);
  });
});

describe('booked for later', () => {
  const book = (orders: any[]) => bookedAhead({ orders, menu, materials, settings: GST_OFF, today: TODAY });

  it('adds up what orders due after today will be worth, once per multi-item order', () => {
    const a = preorder({ quantity: 2, date: day(1), orderGroupId: 'g' });
    const b = preorder({ menuItemId: 'cookie', itemNameAtSale: 'Cookie', unitPriceAtSale: 10, quantity: 5, date: day(1), orderGroupId: 'g' });
    const solo = preorder({ date: day(5) });
    expect(book([a, b, solo, order()])).toMatchObject({ orderCount: 2, revenue: 350 });
  });

  it('leaves out cancelled orders and orders due today or earlier', () => {
    expect(book([preorder({ date: day(2), cancelledOn: day(0) }), preorder({ date: TODAY }), order()]).orderCount).toBe(0);
  });

  it('holds the advances of open pre-orders, whatever their date, and not those handed over or cancelled', () => {
    const r = book([
      preorder({ date: day(3), advance: advance(200) }),
      preorder({ date: TODAY, advance: advance(100) }),
      preorder({ date: day(-1), advance: advance(50) }), // overdue but still not handed over
      preorder({ date: day(2), advance: advance(500), fulfilled: true }),
      preorder({ date: day(2), advance: advance(700), cancelledOn: day(0), advanceOutcome: 'refunded' }),
    ]);
    expect(r.advancesHeld).toBe(350);
  });

  it('counts the advance once for a multi-item order', () => {
    const a = preorder({ date: day(3), orderGroupId: 'g', advance: advance(200) });
    const b = preorder({ date: day(3), orderGroupId: 'g' });
    expect(book([a, b]).advancesHeld).toBe(200);
  });
});

describe('bills with an advance', () => {
  const bill = (orders: any[], statement = false) => buildBill({ orders, menu, settings: billSettings, currency, statement, today: TODAY });

  it('shows the advance and the balance, and the QR asks for the balance, not the total', () => {
    // A 1,200 order with 500 paid in advance owes 700.
    const b = bill([preorder({ unitPriceAtSale: 1200, advance: advance(500) })]);
    expect(b.total).toBe(1200);
    expect(b.advance).toEqual({ amount: 500, date: day(-3) });
    expect(b.balanceDue).toBe(700);
    const link = buildBillUpiLink(b)!;
    expect(link).toContain('am=700.00');
    expect(link).not.toContain('am=1200.00');
  });

  it('has no advance, and a balance equal to the total, when none was paid', () => {
    const b = bill([order({ quantity: 3 })]);
    expect(b.advance).toBeUndefined();
    expect(b.balanceDue).toBe(300);
    expect(buildBillUpiLink(b)).toContain('am=300.00');
  });

  it('has no payment link when the advance covers everything', () => {
    const b = bill([preorder({ advance: advance(100) })]);
    expect(b.balanceDue).toBe(0);
    expect(buildBillUpiLink(b)).toBeNull();
  });

  it('never lets an advance be more than the total', () => {
    const b = bill([preorder({ advance: advance(500) })]);
    expect(b.advance?.amount).toBe(100);
    expect(b.balanceDue).toBe(0);
  });

  it('adds the advances of every order on a statement, and leaves out the date', () => {
    const b = bill([preorder({ date: day(-2), advance: advance(30) }), preorder({ date: day(-1), advance: advance(20), unitPriceAtSale: 100 })], true);
    expect(b.total).toBe(200);
    expect(b.advance).toEqual({ amount: 50 });
    expect(b.balanceDue).toBe(150);
  });

  it('counts the advance of a multi-item order once', () => {
    const a = preorder({ orderGroupId: 'g', advance: advance(40) });
    const c = preorder({ orderGroupId: 'g', menuItemId: 'cookie', itemNameAtSale: 'Cookie', unitPriceAtSale: 10, quantity: 5 });
    expect(bill([a, c]).advance?.amount).toBe(40);
  });

  it('falls back to the total for a bill saved before advances existed', () => {
    const old = { total: 250, business: { name: 'x' }, reference: 'R', upiId: 'a@b' } as any;
    expect(billBalance(old)).toBe(250);
    expect(buildBillUpiLink(old)).toContain('am=250.00');
  });

  it('says the advance and the balance in the WhatsApp message', () => {
    const b = bill([preorder({ unitPriceAtSale: 1200, advance: advance(500), customerName: 'Priya' })]);
    expect(buildBillMessage(b)).toBe('Hi Priya, here\'s your bill from Asha Bakes — ₹1,200.00. Advance received: ₹500.00. Balance due: ₹700.00.');
    expect(buildBillMessage(bill([order({ customerName: 'Priya' })]))).toBe('Hi Priya, here\'s your bill from Asha Bakes — ₹100.00.');
  });

  it('asks a statement for the balance', () => {
    const b = bill([preorder({ date: day(-1), advance: advance(30) })], true);
    expect(buildBillMessage(b)).toContain('₹70.00 due');
  });
});

describe('pending payments', () => {
  const pending = (orders: any[], today: string | null = TODAY) => groupPendingPayments({ orders, menu, settings: billSettings, currency, today: today ?? undefined });
  const unpaid = (over: Record<string, any> = {}) => preorder({ paymentStatus: 'unpaid', date: day(-1), ...over });

  it('owes the total less the advance', () => {
    const [c] = pending([unpaid({ unitPriceAtSale: 1200, advance: advance(500) })]);
    expect(c.dueTotal).toBe(700);
  });

  it('does not list a pre-order due later, or a cancelled one', () => {
    expect(pending([unpaid({ date: day(3) }), unpaid({ cancelledOn: day(0) })])).toEqual([]);
  });

  it('lists a pre-order once it is due', () => {
    expect(pending([unpaid({ date: TODAY })])).toHaveLength(1);
  });

  it('lists a future order when no "today" is given (old behaviour)', () => {
    expect(pending([unpaid({ date: day(3) })], null)).toHaveLength(1);
  });

  it('a customer who prepaid in full owes nothing', () => {
    expect(pending([unpaid({ advance: advance(100) })])[0].dueTotal).toBe(0);
  });
});

describe('customer suggestions', () => {
  it('do not include orders due later or cancelled', () => {
    const d = buildCustomerDirectory([order({ date: day(-5) }), preorder({ date: day(5) }), order({ date: day(-2), cancelledOn: day(-1) })], menu, TODAY);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ lastOrder: day(-5), orderCount: 1 });
  });

  it('leave out a customer who only has a pre-order due later', () => {
    expect(buildCustomerDirectory([preorder({ date: day(5) })], menu, TODAY)).toEqual([]);
  });

  it('still leave out cancelled orders when no "today" is given', () => {
    expect(buildCustomerDirectory([order({ cancelledOn: day(0) })], menu)).toEqual([]);
  });
});

describe('the AI snapshot', () => {
  const settings: any = { name: 'Asha Bakes', ...GST_OFF, timezone: 'Asia/Kolkata', fixedCosts: [] };
  const snap = (orders: any[], period = { start: day(-7), end: TODAY }) => buildBusinessSnapshot({
    period, orders, menu, materials: [], experiments: [], wastageLogs: [], settings, currency, customers: [], today: TODAY,
  });
  const value = (s: ReturnType<typeof snap>, id: string) => Number(s.registry.figures[id].value);

  it('leaves out an order due later and a cancelled one', () => {
    const s = snap([order(), preorder({ date: day(3) }), preorder({ date: day(-1), cancelledOn: day(-1) })]);
    expect(value(s, 'revenue_now')).toBe(100);
    expect(value(s, 'orders_now')).toBe(1);
    expect(value(s, 'p_cake_units')).toBe(1);
  });

  it('its drivers still add up to the change in true profit with a kept advance in the period', () => {
    const kept = preorder({ date: day(5), cancelledOn: day(-2), advance: advance(150, { feeRate: 2 }), advanceOutcome: 'kept' });
    const s = snap([order({ date: day(-10), quantity: 2 }), order({ quantity: 3 }), kept]);
    const total = s.promptSnapshot.drivers.reduce((sum, d) => sum + value(s, d.figure), 0);
    expect(total).toBeCloseTo(value(s, 'true_profit_change'), 2);
    expect(s.promptSnapshot.drivers.some(d => d.label.startsWith('Advances kept'))).toBe(true);
  });
});

describe('formatShortDate', () => {
  it('writes the weekday, day and month', () => {
    expect(formatShortDate('2026-10-06')).toBe('Tue 6 Oct');
    expect(formatShortDate('2026-01-01')).toBe('Thu 1 Jan');
    expect(formatShortDate('2028-02-29')).toBe('Tue 29 Feb');
  });
});

describe('the WhatsApp confirmation of a pre-order', () => {
  const base = { customerName: 'Priya', lines: [{ name: 'Sourdough', quantity: 2 }], date: '2026-10-06', currency: { symbol: '₹' }, total: 500 };

  it('says what, when, the advance and the balance', () => {
    expect(buildPreorderConfirmation({ ...base, dueSlot: 'morning', advance: 200 }))
      .toBe('Hi Priya, your order for 2 Sourdough on Tue 6 Oct (morning) is confirmed. Advance received: ₹200.00. Balance: ₹300.00.');
  });

  it('says the total when nothing was paid, and paid in full when the advance covers it', () => {
    expect(buildPreorderConfirmation(base)).toBe('Hi Priya, your order for 2 Sourdough on Tue 6 Oct is confirmed. Total: ₹500.00.');
    expect(buildPreorderConfirmation({ ...base, advance: 500 })).toContain('Paid in full: ₹500.00.');
    expect(buildPreorderConfirmation({ ...base, advance: 900 })).toContain('Paid in full: ₹500.00.');
  });

  it('lists several items, and works without a name or a slot', () => {
    const m = buildPreorderConfirmation({ ...base, customerName: undefined, lines: [{ name: 'Sourdough', quantity: 2 }, { name: 'Cookie', quantity: 6 }, { name: 'Cake', quantity: 1 }] });
    expect(m).toBe('Your order for 2 Sourdough, 6 Cookie and 1 Cake on Tue 6 Oct is confirmed. Total: ₹500.00.');
  });

  it('names a time as a time, and thanks the business when it is named', () => {
    expect(buildPreorderConfirmation({ ...base, dueSlot: '16:30', businessName: 'Asha Bakes' })).toContain('on Tue 6 Oct (at 16:30) is confirmed.');
    expect(buildPreorderConfirmation({ ...base, businessName: 'Asha Bakes' })).toMatch(/Thank you, Asha Bakes\.$/);
    expect(describeDueSlot('')).toBe('');
    expect(describeDueSlot(undefined)).toBe('');
    expect(describeDueSlot('evening')).toBe('evening');
  });
});
