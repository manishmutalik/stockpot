import { describe, it, expect, vi } from 'vitest';
import { BILL_SENT_PATH, billLine, billState, markBillSent, markPaidRequest } from '../billSent';

const NOW = Date.parse('2026-10-12T09:45:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('markBillSent', () => {
  it('tells the server which orders the bill was for, with the idempotency key', async () => {
    const post = vi.fn().mockResolvedValue({ orderIds: ['a'], at: NOW });
    expect(await markBillSent({ post } as any, ['a', 'b'], 'key-1')).toEqual({ orderIds: ['a'], at: NOW });
    expect(post).toHaveBeenCalledWith(BILL_SENT_PATH, { orderIds: ['a', 'b'] }, { idempotencyKey: 'key-1' });
  });
  it('never throws (the bill has gone either way), and sends nothing for no orders', async () => {
    const post = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await markBillSent({ post } as any, ['a'], 'k')).toBeNull();
    expect(await markBillSent({ post } as any, [], 'k')).toBeNull();
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('billState and billLine', () => {
  it('says when the bill went, and two days on that it is still unpaid', () => {
    expect(billState(undefined, NOW)).toBe('not_sent');
    expect(billLine('not_sent', undefined, NOW)).toBeNull();
    const sent = NOW - 60 * 60 * 1000;
    expect(billState(sent, NOW)).toBe('sent');
    expect(billLine('sent', sent, NOW)).toMatch(/^Bill sent today, /);
    expect(billLine('sent', sent, NOW, 'Invoice')).toMatch(/^Invoice sent today, /);
    const old = NOW - 2 * DAY - 1000;
    expect(billState(old, NOW)).toBe('unpaid_after_bill');
    expect(billLine('unpaid_after_bill', old, NOW)).toMatch(/^Not paid since the bill on /);
  });
});

describe('markPaidRequest', () => {
  it('pays everything owed, by one method', () => {
    expect(markPaidRequest('phone:1', 1300, 'cash')).toEqual({ path: '/api/mobile/payments', body: { customerKey: 'phone:1', amount: 1300, method: 'cash' } });
  });
});
