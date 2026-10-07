import { describe, it, expect } from 'vitest';
import { daysBetween, formatDay, slotLabel } from '../dates';
import { countOrders, groupUpcoming, overdueLabel, paymentPill } from '../upcoming';
import { METHODS, handOverRequest, stockProblem, summarizeHandOver } from '../handOver';
import type { UpcomingOrder, UpcomingView } from '../../../../src/utils/quickApiTypes';

const order = (over: Partial<UpcomingOrder> = {}): UpcomingOrder => ({
  orderId: 'a', orderIds: ['a'], customerName: 'Priya Sharma', customerPhone: '98450 10101', date: '2026-10-10', dueSlot: 'evening', notes: null,
  items: [{ menuItemId: 'cake', name: 'Chocolate Truffle Cake', quantity: 2 }], total: 1800, advance: { amount: 500, method: 'upi' }, balanceDue: 1300,
  stockShort: [], confirmationMessage: 'Hi', whatsappUrl: null, ...over,
});
const view = (over: Partial<UpcomingView> = {}): UpcomingView => ({ today: '2026-10-07', currency: { code: 'INR', symbol: '₹' }, overdue: [], upcoming: [], ...over });

describe('dates', () => {
  it('writes a day the way the screens do', () => {
    expect(formatDay('2026-10-07')).toBe('Wed 7 Oct');
    expect(formatDay('2026-12-31')).toBe('Thu 31 Dec');
    expect(formatDay('2027-01-01')).toBe('Fri 1 Jan');
  });
  it('counts days across a month and a year, and backwards', () => {
    expect(daysBetween('2026-10-07', '2026-10-10')).toBe(3);
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(daysBetween('2026-10-07', '2026-10-05')).toBe(-2);
    expect(daysBetween('2026-10-07', '2026-10-07')).toBe(0);
  });
  it('capitalises a time of day and leaves a time alone', () => {
    expect(slotLabel('morning')).toBe('Morning');
    expect(slotLabel('10:30')).toBe('10:30');
    expect(slotLabel(null)).toBeNull();
    expect(slotLabel('')).toBeNull();
  });
});

describe('groupUpcoming', () => {
  it('puts overdue first, then each day soonest first, with today and tomorrow named', () => {
    const v = view({
      overdue: [order({ orderId: 'late', date: '2026-10-06' })],
      upcoming: [order({ orderId: 'c', date: '2026-10-10' }), order({ orderId: 'a', date: '2026-10-07' }), order({ orderId: 'd', date: '2026-10-10' }), order({ orderId: 'b', date: '2026-10-08' })],
    });
    const s = groupUpcoming(v);
    expect(s.map(x => x.title)).toEqual(['ATTENTION NEEDED', 'TODAY · WED 7 OCT', 'TOMORROW · THU 8 OCT', 'SAT 10 OCT']);
    expect(s.map(x => x.subtitle)).toEqual(['', '1 order', '1 order', 'In 3 days']);
    expect(s[3].orders.map(o => o.orderId)).toEqual(['c', 'd']);
    expect(s[0].kind).toBe('overdue');
    expect(s[3].kind).toBe('day');
  });
  it('counts several orders on a day, and has nothing when nothing is booked', () => {
    expect(groupUpcoming(view({ upcoming: [order({ date: '2026-10-07' }), order({ orderId: 'b', date: '2026-10-07' })] }))[0].subtitle).toBe('2 orders');
    expect(groupUpcoming(view())).toEqual([]);
    expect(countOrders(view({ overdue: [order()], upcoming: [order(), order()] }))).toBe(3);
  });
  it('says how late an overdue order is', () => {
    expect(overdueLabel('2026-10-06', '2026-10-07')).toBe('Due yesterday · Tue 6 Oct');
    expect(overdueLabel('2026-10-04', '2026-10-07')).toBe('Due 3 days ago · Sun 4 Oct');
  });
});

describe('paymentPill', () => {
  it('says whether the order is settled, part paid or unpaid', () => {
    expect(paymentPill({ balanceDue: 0, advance: { amount: 440, method: 'upi' } })).toEqual({ text: 'FULLY SETTLED', tone: 'green' });
    expect(paymentPill({ balanceDue: 450, advance: { amount: 300, method: 'cash' } })).toEqual({ text: 'PARTIAL', tone: 'amber' });
    expect(paymentPill({ balanceDue: 200, advance: null })).toEqual({ text: 'PENDING', tone: 'coral' });
  });
});

describe('handing over', () => {
  it('sends nothing but the order when the balance is not received now', () => {
    expect(handOverRequest(order(), { receiveBalance: false, method: 'upi' })).toEqual({ path: '/api/mobile/orders/a/hand-over', body: {} });
  });
  it('sends the method when the balance is received now, and not when there is none to receive', () => {
    expect(handOverRequest(order(), { receiveBalance: true, method: 'cash' }).body).toEqual({ balanceReceived: { method: 'cash' } });
    expect(handOverRequest(order({ balanceDue: 0 }), { receiveBalance: true, method: 'cash' }).body).toEqual({});
  });
  it('keeps an id safe in the path', () => {
    expect(handOverRequest(order({ orderId: 'a/b c' }), { receiveBalance: false, method: 'upi' }).path).toBe('/api/mobile/orders/a%2Fb%20c/hand-over');
  });
  it('offers the four ways of being paid', () => {
    expect(METHODS).toEqual(['upi', 'cash', 'card', 'other']);
  });
  it('says what is short of finished stock', () => {
    expect(stockProblem(order())).toBeNull();
    expect(stockProblem(order({ stockShort: [{ name: 'Muffin', short: 11 }, { name: 'Cake', short: 1 }] }))).toBe('Not enough finished stock: Muffin is short by 11, Cake is short by 1. Log a production run first.');
  });
  it('tells the owner what happened', () => {
    const inr = { code: 'INR', symbol: '₹' };
    expect(summarizeHandOver({ handedOver: true, orderIds: ['a'], balanceDue: 1300, balanceReceived: 1300, method: 'upi', shareMessage: 'x' }, inr))
      .toEqual({ title: 'Handed over', lines: ['Balance received: ₹1,300 by UPI'], canShare: true });
    expect(summarizeHandOver({ handedOver: true, orderIds: ['a'], balanceDue: 1300, balanceReceived: 0 }, inr).lines).toEqual(['Balance still due: ₹1,300']);
    expect(summarizeHandOver({ handedOver: true, orderIds: ['a'], balanceDue: 0, balanceReceived: 0 }, inr).lines).toEqual(['Paid in full']);
    expect(summarizeHandOver({ handedOver: false, reason: 'already_handed_over', orderIds: ['a'] }, inr)).toEqual({ title: 'Already handed over', lines: ['Nothing was changed.'], canShare: false });
  });
});
