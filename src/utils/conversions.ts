/**
 * conversions.ts
 *
 * Unit conversion utilities. Extracted out of App.tsx as part of the Phase 4
 * breakup so it has zero dependency on Firebase/App.tsx's module graph —
 * previously this lived in App.tsx, which meant importing it anywhere
 * (including in tests) triggered the full Firebase SDK initialization.
 */

/**
 * Nested lookup table for converting between supported measurement units.
 * Outer key: source unit; inner key: target unit; value: multiplication factor.
 * Units outside these families (e.g. custom strings) are passed through unchanged.
 */
export const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  g: { g: 1, kg: 0.001 },
  kg: { g: 1000, kg: 1 },
  ml: { ml: 1, l: 0.001 },
  l: { ml: 1000, l: 1 },
  pcs: { pcs: 1 }
};

/**
 * Converts a numeric amount from one measurement unit to another using
 * `UNIT_CONVERSIONS`. If the conversion factor is not found (unknown unit
 * pair), the original amount is returned unmodified.
 *
 * @param amount   - The quantity to convert.
 * @param fromUnit - The unit the amount is currently expressed in.
 * @param toUnit   - The target unit to convert into.
 * @returns The converted amount, or `amount` unchanged if conversion is unknown.
 */
export function convertAmount(amount: number, fromUnit: string, toUnit: string): number {
  if (!fromUnit || !toUnit || fromUnit === toUnit) return amount;
  const conversion = UNIT_CONVERSIONS[fromUnit]?.[toUnit];
  return conversion !== undefined ? amount * conversion : amount;
}

/** Supported display currencies. The first entry (USD) is the default. */
export const CURRENCIES = [
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
  { code: 'JPY', symbol: '¥' },
  { code: 'INR', symbol: '₹' },
  { code: 'CAD', symbol: 'CA$' },
  { code: 'AUD', symbol: 'A$' },
];
