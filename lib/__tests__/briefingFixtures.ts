// Shared fixtures for the briefing tests: a real snapshot built from the app's own code.
import { buildBusinessSnapshot } from '../../src/utils/aiSnapshot';
import { buildCustomerProfiles } from '../../src/utils/customers';
import { addDays } from '../../src/utils/localDate';

export const TODAY = '2026-06-30';
export const YESTERDAY = addDays(TODAY, -1);

const materials: any[] = [
  { id: 'flour', name: 'Flour', unit: 'kg', costPerUnit: 40, category: 'Raw Materials', initialStock: 10, remaining: 10, threshold: 2 },
  { id: 'butter', name: 'Butter', unit: 'kg', costPerUnit: 500, category: 'Raw Materials', initialStock: 0.5, remaining: 0.5, threshold: 2 },
];
const menu: any[] = [{ id: 'cake', name: 'Chocolate Cake', sellingPrice: 100, recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }] }];

let n = 0;
const order = (date: string, over: Record<string, any> = {}): any => ({
  id: `o${String(++n).padStart(4, '0')}`, menuItemId: 'cake', quantity: 1, date,
  unitPriceAtSale: 100, unitIngredientCostAtSale: 20, unitPackagingCostAtSale: 0, unitInputGstAtSale: 0, itemNameAtSale: 'Chocolate Cake',
  customerName: 'Priya Sharma', customerPhone: '+91 98450 10101', ...over,
});

/** A snapshot of "yesterday" for a business that sold 3 cakes yesterday and 4 a week before. */
export function sampleSnapshot(period = { start: YESTERDAY, end: YESTERDAY }) {
  const orders = [order(YESTERDAY, { quantity: 3 }), order(addDays(YESTERDAY, -7), { quantity: 4 })];
  const settings: any = { name: 'Asha Bakes', gstApplicable: false, timezone: 'Asia/Kolkata' };
  const customers = buildCustomerProfiles({ orders, menu, materials, settings, today: TODAY });
  return buildBusinessSnapshot({
    period, orders, menu, materials, experiments: [], wastageLogs: [], settings,
    currency: { code: 'INR', symbol: '₹' }, customers, today: TODAY,
  });
}
