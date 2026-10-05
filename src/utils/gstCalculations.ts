/**
 * gstCalculations.ts
 *
 * Pure GST (Goods & Services Tax) math, kept dependency-free so it can be
 * unit tested without mocking Firebase/App.tsx's module graph (see
 * conversions.ts for the same reasoning).
 */

export type GstPricingMode = 'inclusive' | 'exclusive';

/**
 * Splits a sale amount into its pre-tax base and the GST portion.
 *
 * - 'inclusive': `saleAmount` is the all-in price the customer paid; GST is
 *   backed out of it (baseAmount = saleAmount / (1 + rate)).
 * - 'exclusive': `saleAmount` is the pre-tax price; GST is added on top of it
 *   (gstAmount = saleAmount * rate), so the customer pays base + GST.
 */
export function splitSaleForGst(
  saleAmount: number,
  gstRate: number,
  pricingMode: GstPricingMode
): { baseAmount: number; gstAmount: number } {
  if (!gstRate) {
    return { baseAmount: saleAmount, gstAmount: 0 };
  }

  if (pricingMode === 'inclusive') {
    const baseAmount = saleAmount / (1 + gstRate / 100);
    return { baseAmount, gstAmount: saleAmount - baseAmount };
  }

  return { baseAmount: saleAmount, gstAmount: saleAmount * (gstRate / 100) };
}

/** One material's consumption for a period, as much as GST math needs. */
export interface MaterialGstUsage {
  usedAmount: number;
  costPerUnit: number;
  gstRate?: number;
}

/**
 * Sums the input GST paid on a set of consumed materials, using each
 * material's own `gstRate` (materials without one contribute zero).
 */
export function calculateMaterialGstPaid(usages: MaterialGstUsage[]): number {
  return usages.reduce((total, { usedAmount, costPerUnit, gstRate }) => {
    return total + usedAmount * (costPerUnit || 0) * ((gstRate || 0) / 100);
  }, 0);
}

/**
 * The pre-GST price of a menu price: what the business actually earns per unit. In inclusive pricing the menu
 * price has GST inside it and is backed out; in exclusive pricing (or with no GST) the menu price is already
 * the base. Margins are always worked out on this, like revenue everywhere else.
 */
export function basePriceOf(
  menuPrice: number,
  settings: { gstApplicable?: boolean; gstRate?: number; gstPricingMode?: GstPricingMode }
): number {
  const rate = settings.gstApplicable ? settings.gstRate || 0 : 0;
  if (rate <= 0) return menuPrice;
  return splitSaleForGst(menuPrice, rate, settings.gstPricingMode || 'exclusive').baseAmount;
}
