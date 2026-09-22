import { describe, it, expect } from 'vitest';
import { splitSaleForGst, calculateMaterialGstPaid } from '../gstCalculations';

describe('splitSaleForGst', () => {
  it('returns zero GST when the rate is zero', () => {
    expect(splitSaleForGst(100, 0, 'exclusive')).toEqual({ baseAmount: 100, gstAmount: 0 });
    expect(splitSaleForGst(100, 0, 'inclusive')).toEqual({ baseAmount: 100, gstAmount: 0 });
  });

  it('adds GST on top for exclusive pricing', () => {
    const { baseAmount, gstAmount } = splitSaleForGst(100, 18, 'exclusive');
    expect(baseAmount).toBe(100);
    expect(gstAmount).toBeCloseTo(18, 6);
  });

  it('backs GST out of the total for inclusive pricing', () => {
    const { baseAmount, gstAmount } = splitSaleForGst(118, 18, 'inclusive');
    expect(baseAmount).toBeCloseTo(100, 6);
    expect(gstAmount).toBeCloseTo(18, 6);
  });

  it('keeps base + gst equal to the original sale amount for inclusive pricing', () => {
    const { baseAmount, gstAmount } = splitSaleForGst(250, 5, 'inclusive');
    expect(baseAmount + gstAmount).toBeCloseTo(250, 6);
  });
});

describe('calculateMaterialGstPaid', () => {
  it('returns zero for an empty list', () => {
    expect(calculateMaterialGstPaid([])).toBe(0);
  });

  it('returns zero for materials with no gstRate set', () => {
    expect(calculateMaterialGstPaid([{ usedAmount: 10, costPerUnit: 5 }])).toBe(0);
  });

  it('computes GST paid for a single material', () => {
    // 10 units * ₹5/unit = ₹50 spent, 12% GST on that = ₹6
    expect(calculateMaterialGstPaid([{ usedAmount: 10, costPerUnit: 5, gstRate: 12 }])).toBeCloseTo(6, 6);
  });

  it('sums GST paid across multiple materials with different rates', () => {
    const total = calculateMaterialGstPaid([
      { usedAmount: 10, costPerUnit: 5, gstRate: 12 }, // ₹6
      { usedAmount: 2, costPerUnit: 100, gstRate: 5 }, // ₹10
      { usedAmount: 3, costPerUnit: 20, gstRate: 0 },  // ₹0
    ]);
    expect(total).toBeCloseTo(16, 6);
  });
});
