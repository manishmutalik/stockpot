import { describe, it, expect } from 'vitest';
import { summarizeSaved } from '../savedSummary';
import type { ParseResponse } from '../../../../src/utils/quickApiTypes';

const resp = { kind: 'order', draft: null, questions: [], notes: [], currency: { code: 'INR', symbol: '₹' } } as ParseResponse;

describe('summarizeSaved', () => {
  it('says the balance of an order that still owes, and paid in full when it does not', () => {
    expect(summarizeSaved('order', { orderIds: ['a'], orderGroupId: null, preorder: false, total: 1800, advance: 500, balanceDue: 1300 }, resp))
      .toEqual({ kind: 'order', title: 'Order saved', lines: ['₹1,800 · balance ₹1,300', 'Advance received: ₹500'], orderId: 'a' });
    expect(summarizeSaved('order', { orderIds: ['a'], orderGroupId: null, preorder: false, total: 400, advance: 0, balanceDue: 0 }, resp).lines).toEqual(['₹400 · paid in full']);
  });

  it('keeps the first order id of an order, for sending its invoice, and has none for the other kinds', () => {
    expect(summarizeSaved('order', { orderIds: ['x', 'y'], orderGroupId: 'g', preorder: false, total: 100, advance: 0, balanceDue: 100 }, resp).orderId).toBe('x');
    expect(summarizeSaved('order', { orderIds: [], orderGroupId: null, preorder: false, total: 0, advance: 0, balanceDue: 0 }, resp)).not.toHaveProperty('orderId');
    expect(summarizeSaved('production', { runIds: ['1'], sessionId: null, shortages: [] }, resp)).not.toHaveProperty('orderId');
  });

  it('calls a booked order a pre-order', () => {
    expect(summarizeSaved('order', { orderIds: ['a'], orderGroupId: null, preorder: true, total: 1800, advance: 0, balanceDue: 1800 }, resp).title).toBe('Pre-order booked');
  });

  it('lists the stock now held', () => {
    const s = summarizeSaved('restock', { lines: [{ materialId: 'b', name: 'Butter', unit: 'g', newStock: 6000, previousCostPerUnit: 0.5, newCostPerUnit: 0.4167 }] }, resp);
    expect(s).toEqual({ kind: 'restock', title: 'Stock recorded', lines: ['Butter: 6000 g in stock'] });
  });

  it('counts the runs and warns about a shortfall', () => {
    const s = summarizeSaved('production', { runIds: ['1', '2'], sessionId: 's', shortages: [{ materialId: 'f', name: 'Flour', unit: 'g', short: 3000 }] }, resp);
    expect(s.lines).toEqual(['2 runs logged']);
    expect(s.warning).toBe('Flour is short by 3000 g. Check your stock.');
    expect(summarizeSaved('production', { runIds: ['1'], sessionId: null, shortages: [] }, resp)).toEqual({ kind: 'production', title: 'Production logged', lines: ['1 run logged'] });
  });

  it('says what is left owing after a payment', () => {
    expect(summarizeSaved('payment', { customerName: 'Priya', amount: 900, method: 'upi', orderIds: ['a'], remainingDue: 200 }, resp).lines).toEqual(['Priya paid ₹900', 'Still owes ₹200']);
    expect(summarizeSaved('payment', { customerName: 'Priya', amount: 1100, method: 'upi', orderIds: ['a'], remainingDue: 0 }, resp).lines).toEqual(['Priya paid ₹1,100', 'Fully settled']);
  });

  it('uses rupees when the server did not say', () => {
    expect(summarizeSaved('payment', { customerName: 'A', amount: 1200000, method: 'cash', orderIds: [], remainingDue: 0 }, { ...resp, currency: undefined } as ParseResponse).lines[0]).toBe('A paid ₹12,00,000');
  });
});
