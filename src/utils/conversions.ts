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
 *
 * Weight (g/kg) and volume (ml/l) are cross-convertible assuming 1g = 1ml —
 * i.e. a density of 1 g/ml, water's density. This is exact for water and a
 * reasonable approximation for many kitchen liquids, but not accurate for
 * anything meaningfully denser or lighter than water (oil, honey, syrup,
 * etc.) — costs/usage for those will be off by however much their real
 * density differs from 1. Chosen as a simple, no-setup default rather than
 * requiring a per-material density; a recipe or raw material that needs to
 * be exact about a specific liquid's density should keep both sides of
 * that ingredient in the same unit family instead.
 */
export const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  g:  { g: 1,    kg: 0.001, ml: 1,    l: 0.001 },
  kg: { g: 1000, kg: 1,     ml: 1000, l: 1 },
  ml: { ml: 1,   l: 0.001,  g: 1,     kg: 0.001 },
  l:  { ml: 1000, l: 1,     g: 1000,  kg: 1 },
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

/** Supported display currencies. The first entry (INR) is the default. */
export const CURRENCIES = [
  { code: 'INR', symbol: '₹' },
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
  { code: 'JPY', symbol: '¥' },
  { code: 'CAD', symbol: 'CA$' },
  { code: 'AUD', symbol: 'A$' },
];
