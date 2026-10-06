import { describe, it, expect } from 'vitest';
import { detectKind, readAnswers, customerDirectory, kindQuestion, asKind } from '../quickParse';

describe('detectKind', () => {
  it.each([
    ['Priya ordered 2 sourdough for tomorrow', 'order'],
    ['I bought 5 kg butter for 2000 rupees', 'restock'],
    ['baked 24 croissants this morning', 'production'],
    ['Priya paid 1300 by UPI', 'payment'],
  ])('%s is %s', (text, kind) => expect(detectKind(text)).toBe(kind));

  it('says nothing when the words fit none, or fit two kinds equally', () => {
    expect(detectKind('sourdough')).toBeNull();
    expect(detectKind('Priya ordered 2 sourdough and paid by UPI')).toBeNull();
  });

  it('is the same word-for-word whatever the case', () => {
    expect(detectKind('BOUGHT flour')).toBe('restock');
  });
});

describe('readAnswers', () => {
  it('accepts none, or a short list of strings', () => {
    expect(readAnswers(undefined)).toEqual([]);
    expect(readAnswers([{ questionId: 'date', value: ' 2026-10-09 ' }])).toEqual([{ questionId: 'date', value: '2026-10-09' }]);
  });
  it('refuses anything else', () => {
    expect(readAnswers('x')).toBeNull();
    expect(readAnswers([{ questionId: 1, value: 'a' }])).toBeNull();
    expect(readAnswers([null])).toBeNull();
    expect(readAnswers(Array(41).fill({ questionId: 'a', value: 'b' }))).toBeNull();
    expect(readAnswers([{ questionId: 'a', value: 'x'.repeat(81) }])).toBeNull();
  });
});

describe('kinds', () => {
  it('asks about all four, in a fixed order', () => {
    expect(kindQuestion().options!.map(o => o.value)).toEqual(['order', 'restock', 'production', 'payment']);
    expect(asKind('order')).toBe('order');
    expect(asKind('sale')).toBeNull();
    expect(asKind(3)).toBeNull();
  });
});

describe('customerDirectory', () => {
  const order = (over: Record<string, any>) => ({ id: 'x', menuItemId: 'cake', quantity: 1, date: '2026-09-01', ...over }) as any;
  it('lists each customer once, newest name and phone, with a stable label, and leaves out cancelled orders and unnamed ones', () => {
    const list = customerDirectory([
      order({ id: 'a', customerName: 'Meera', customerPhone: '9876543210', date: '2026-09-01' }),
      order({ id: 'b', customerName: 'Meera Nair', customerPhone: '9876543210', date: '2026-09-20' }),
      order({ id: 'c', customerName: 'Ravi' }),
      order({ id: 'd' }),
      order({ id: 'e', customerName: 'Gone', cancelledOn: '2026-09-02' }),
    ]);
    expect(list.map(c => c.name).sort()).toEqual(['Meera Nair', 'Ravi']);
    expect(list.find(c => c.name === 'Meera Nair')).toMatchObject({ phone: '9876543210', label: expect.stringMatching(/^C-/) });
    expect(customerDirectory([order({ id: 'b', customerName: 'Meera Nair', customerPhone: '9876543210' })])[0].label.startsWith('C-')).toBe(true);
  });
});
