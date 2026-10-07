/**
 * money.ts
 *
 * How the phone app shows an amount: the symbol, then the number grouped the way the currency is written (lakhs and crores
 * for rupees: 12,00,000), with the paise only when there are some (₹2,350, ₹2,350.50). Pure and import-free, so the server
 * builds the status lines and previews with it and the app formats the figures the server sends with the very same code.
 * (The web bill keeps its own two-decimal `formatMoney`, which a printed bill wants.)
 */
export function formatAmount(amount: number, currency: { code?: string; symbol: string }): string {
  const rounded = Math.round((Math.abs(amount) + Number.EPSILON) * 100) / 100;
  const [whole, paise] = rounded.toFixed(2).split('.');
  const grouped = currency.code === 'INR'
    ? whole.replace(/\B(?=(\d{2})*\d{3}(?!\d))/g, ',')
    : whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount < 0 && rounded > 0 ? '-' : ''}${currency.symbol}${grouped}${paise === '00' ? '' : `.${paise}`}`;
}
