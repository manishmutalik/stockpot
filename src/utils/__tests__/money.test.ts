import { describe, it, expect } from 'vitest';
import { formatAmount } from '../money';

const inr = { code: 'INR', symbol: '₹' };
const usd = { code: 'USD', symbol: '$' };

describe('formatAmount', () => {
  it('drops the paise when there are none and keeps them when there are', () => {
    expect(formatAmount(2350, inr)).toBe('₹2,350');
    expect(formatAmount(2350.5, inr)).toBe('₹2,350.50');
    expect(formatAmount(0, inr)).toBe('₹0');
    expect(formatAmount(0.07, inr)).toBe('₹0.07');
    expect(formatAmount(99.999, inr)).toBe('₹100');
  });

  it('groups rupees in lakhs and crores', () => {
    expect(formatAmount(999, inr)).toBe('₹999');
    expect(formatAmount(1000, inr)).toBe('₹1,000');
    expect(formatAmount(99999, inr)).toBe('₹99,999');
    expect(formatAmount(100000, inr)).toBe('₹1,00,000');
    expect(formatAmount(1200000, inr)).toBe('₹12,00,000');
    expect(formatAmount(123456789, inr)).toBe('₹12,34,56,789');
  });

  it('groups other currencies in thousands', () => {
    expect(formatAmount(1234567.8, usd)).toBe('$1,234,567.80');
    expect(formatAmount(1000, { symbol: '€' })).toBe('€1,000');
  });

  it('puts the minus before the symbol', () => {
    expect(formatAmount(-1300, inr)).toBe('-₹1,300');
    expect(formatAmount(-0.001, inr)).toBe('₹0');
  });
});
