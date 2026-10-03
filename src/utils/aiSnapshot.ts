/**
 * aiSnapshot.ts
 *
 * The one compact picture of the business that every AI feature sends. Built on
 * the client from the same pure functions the screens use (profit.ts,
 * customers.ts), so a number in an AI answer is a number the screens already
 * show; the server never recomputes anything.
 *
 * Two rules shape it (docs/AI_CFO_DESIGN.md):
 *  - Financial truth. Every number is a *figure* in a registry, with an id. The
 *    model is shown each figure's label and formatted text so it can see what
 *    happened, but it must refer to figures by id (see aiFigures.ts); it never
 *    writes a number, and it does no arithmetic: changes, percentages and the
 *    ordering of drivers are all computed here.
 *  - No personal data. Customers are labels only (C-4F2A): no names, no phone
 *    numbers. Product and material names are in `names` and referred to by id.
 *
 * The registry (with raw values) stays on the client for rendering; only
 * `promptSnapshot` is sent.
 */
import type { BakerySettings, MenuItem, Order, RawMaterial, RecipeExperiment, WastageLog } from '../types';
import { formatFigure, type AiRegistry, type Figure, type FormatContext } from './aiFigures';
import { countByStatus, customersForTab, type CustomerProfile } from './customers';
import { EXPIRING_SOON_DAYS, getStockStatus } from './inventoryStatus';
import { addDays, daysBetween } from './localDate';
import { financialsForRange, productProfits, type Financials } from './profit';

export const SNAPSHOT_LIMITS = { products: 30, customersPerList: 10, stockItems: 10, trendDays: 7 } as const;

export type ComparisonMode = 'same_weekday_last_week' | 'previous_period';

/** The period to compare with: a week earlier for a single day, otherwise the same number of days just before. */
export function comparisonPeriod(period: { start: string; end: string }, mode?: ComparisonMode): { start: string; end: string; label: string } {
  const length = daysBetween(period.start, period.end) + 1;
  const effective = mode ?? (length === 1 ? 'same_weekday_last_week' : 'previous_period');
  if (effective === 'same_weekday_last_week') {
    return { start: addDays(period.start, -7), end: addDays(period.end, -7), label: length === 1 ? 'the same day last week' : 'the same period a week earlier' };
  }
  return { start: addDays(period.start, -length), end: addDays(period.start, -1), label: 'the period just before' };
}

/** Pairs of what a business's true profit is made of, and which way each pushes it. */
const DRIVERS: { id: string; label: string; sign: 1 | -1; pick: (f: Financials) => number }[] = [
  { id: 'sales', label: 'Sales before discounts', sign: 1, pick: f => f.income + f.discounts },
  { id: 'discounts', label: 'Discounts given', sign: -1, pick: f => f.discounts },
  { id: 'ingredients', label: 'Ingredient costs', sign: -1, pick: f => f.orderExpenses - f.packagingExpenses },
  { id: 'packaging', label: 'Packaging costs', sign: -1, pick: f => f.packagingExpenses },
  { id: 'courier', label: 'Courier fees', sign: -1, pick: f => f.deliveryExpenses },
  { id: 'payment_fees', label: 'Payment fees', sign: -1, pick: f => f.paymentFees },
  { id: 'wastage', label: 'Wastage', sign: -1, pick: f => f.wastageExpenses },
  { id: 'fixed_costs', label: 'Fixed costs', sign: -1, pick: f => f.fixedCosts },
];

export interface SnapshotDriver {
  /** The id of the figure with this driver's effect on true profit (signed, in money). */
  figure: string;
  label: string;
  effect: 'raised' | 'lowered';
}

export interface AiSnapshot {
  business: { name: string; currency: string; gstApplicable: boolean; timezone: string };
  period: { start: string; end: string };
  comparison: { start: string; end: string; label: string };
  /** Every number the model may refer to: label and text only. Values stay on the client. */
  figures: Record<string, { label: string; text: string }>;
  /** Names by id (products, materials). */
  names: Record<string, string>;
  /** The largest movers in true profit first. Their effects add up to the change in true profit. */
  drivers: SnapshotDriver[];
  products: { name: string; units: string; revenue: string; contribution: string; perUnit: string }[];
  /** The last few days up to the period end, oldest first. */
  trend: { day: string; revenue: string; trueProfit: string }[];
  inventory: { cashTiedUp: string; lowStock: string[]; expiringSoon: string[] };
  customers: {
    total: string; due: string; lapsed: string; newCustomers: string;
    dueList: { label: string; daysSinceLastOrder: string; favourite?: string; contribution: string }[];
    lapsedList: { label: string; daysSinceLastOrder: string; favourite?: string; contribution: string }[];
  };
  notes: string[];
}

export interface BuiltSnapshot {
  /** What is sent to the model. */
  promptSnapshot: AiSnapshot;
  /** The values behind every figure and name: stays on the client, used to render the answer. */
  registry: AiRegistry;
  /** Customer label to name, kept on the client and used when showing an answer. */
  customerNames: Record<string, string>;
}

/** Builds the snapshot for a period, with the comparison period given or chosen by `comparisonPeriod`. */
export function buildBusinessSnapshot(input: {
  period: { start: string; end: string };
  comparison?: { start: string; end: string; label: string };
  orders: Order[];
  menu: MenuItem[];
  /** Materials with their live remaining stock (what the Inventory tab shows). */
  materials: (RawMaterial & { remaining: number })[];
  experiments: RecipeExperiment[];
  wastageLogs: WastageLog[];
  settings: Pick<BakerySettings, 'name' | 'gstApplicable' | 'gstRate' | 'gstPricingMode' | 'fixedCosts' | 'timezone'>;
  currency: { code: string; symbol: string };
  customers: CustomerProfile[];
  /** Today in the business's time zone, for the expiry check. */
  today: string;
}): BuiltSnapshot {
  const { period, orders, menu, materials, settings, currency } = input;
  const comparison = input.comparison ?? comparisonPeriod(period);
  const fx: FormatContext = { currencySymbol: currency.symbol };

  const figures: Record<string, Figure> = {};
  const names: Record<string, string> = {};
  const add = (id: string, figure: Figure) => { figures[id] = figure; return id; };
  const money = (id: string, label: string, value: number, signed = false) => add(id, { kind: 'money', value: round(value), label, signed });
  const count = (id: string, label: string, value: number) => add(id, { kind: 'count', value: Math.round(value), label });
  const days = (id: string, label: string, value: number) => add(id, { kind: 'days', value: Math.round(value), label });
  const percent = (id: string, label: string, value: number, signed = true) => add(id, { kind: 'percent', value: round(value, 1), label, signed });
  const nameId = (prefix: string, key: string, text: string) => { const id = `${prefix}_${key}`; names[id] = text; return id; };

  const financials = (range: { start: string; end: string }) =>
    financialsForRange({ orders, menu, materials, experiments: input.experiments, wastageLogs: input.wastageLogs, settings, start: range.start, end: range.end });
  const now = financials(period);
  const before = financials(comparison);

  // Headline figures, now and before, with the change worked out here so the model has no sums to do.
  money('revenue_now', 'Revenue in the period (before GST, after discounts)', now.income);
  money('revenue_before', `Revenue in ${comparison.label}`, before.income);
  money('true_profit_now', 'True profit in the period', now.trueProfit);
  money('true_profit_before', `True profit in ${comparison.label}`, before.trueProfit);
  money('true_profit_change', 'Change in true profit', now.trueProfit - before.trueProfit, true);
  count('orders_now', 'Orders in the period', now.orderCount);
  count('orders_before', `Orders in ${comparison.label}`, before.orderCount);
  money('wastage_now', 'Wastage in the period', now.wastageExpenses);
  if (before.income !== 0) percent('revenue_change_pct', 'Change in revenue', ((now.income - before.income) / Math.abs(before.income)) * 100);
  if (before.trueProfit !== 0) percent('true_profit_change_pct', 'Change in true profit', ((now.trueProfit - before.trueProfit) / Math.abs(before.trueProfit)) * 100);
  if (now.income !== 0) percent('true_profit_margin', 'True profit as a share of revenue', (now.trueProfit / now.income) * 100, false);
  if (now.unpaidIncome > 0) money('unpaid_now', 'Part of revenue not yet paid', now.unpaidIncome);

  // Drivers: each component's effect on true profit, largest first. They sum to the change in true profit.
  const drivers: SnapshotDriver[] = DRIVERS
    .map(d => ({ d, effect: d.sign * (d.pick(now) - d.pick(before)) }))
    .filter(x => Math.abs(x.effect) >= 0.005)
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect) || a.d.id.localeCompare(b.d.id))
    .map(({ d, effect }) => ({
      figure: money(`driver_${d.id}`, `${d.label}: effect on true profit`, effect, true),
      label: d.label,
      effect: effect > 0 ? 'raised' as const : 'lowered' as const,
    }));

  // Products: the biggest sellers, from the same per-product sums as the Menu screen.
  const perProduct = productProfits(orders.filter(o => o.date >= period.start && o.date <= period.end), menu, materials, settings);
  const products = [...perProduct.values()]
    .filter(p => menu.some(m => m.id === p.menuItemId))
    .sort((a, b) => b.revenue - a.revenue || a.menuItemId.localeCompare(b.menuItemId))
    .slice(0, SNAPSHOT_LIMITS.products)
    .map(p => {
      const item = menu.find(m => m.id === p.menuItemId)!;
      const key = p.menuItemId;
      return {
        name: nameId('item', key, item.name),
        units: count(`p_${key}_units`, `Units of ${item.name} sold`, p.unitsSold),
        revenue: money(`p_${key}_revenue`, `Revenue from ${item.name}`, p.revenue),
        contribution: money(`p_${key}_made`, `What ${item.name} made`, p.contribution),
        perUnit: money(`p_${key}_per_unit`, `What ${item.name} made per unit`, p.avgContributionPerUnit),
      };
    });

  // Trend: the last days up to the period end.
  const trend = Array.from({ length: SNAPSHOT_LIMITS.trendDays }, (_, i) => {
    const date = addDays(period.end, i - (SNAPSHOT_LIMITS.trendDays - 1));
    const day = financials({ start: date, end: date });
    const weekday = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
    return {
      day: weekday,
      revenue: money(`trend_${i}_revenue`, `Revenue on ${weekday}`, day.income),
      trueProfit: money(`trend_${i}_true_profit`, `True profit on ${weekday}`, day.trueProfit),
    };
  });

  // Inventory.
  const live = materials.filter(m => (m.threshold ?? 0) > 0 || m.expiryDate);
  const lowStock = live
    .filter(m => (m.threshold ?? 0) > 0 && getStockStatus(m.remaining, m.threshold ?? 0) === 'low')
    .slice(0, SNAPSHOT_LIMITS.stockItems).map(m => nameId('mat', m.id, m.name));
  const expiringSoon = live
    // Judged against the business's own date, with the same "expiring" window as the Inventory screen.
    .filter(m => !!m.expiryDate && daysBetween(input.today, m.expiryDate) <= EXPIRING_SOON_DAYS)
    .slice(0, SNAPSHOT_LIMITS.stockItems).map(m => nameId('mat', m.id, m.name));
  const cashTiedUp = money('cash_tied_up', 'Money tied up in stock on hand', materials.reduce((sum, m) => sum + Math.max(m.remaining, 0) * (m.costPerUnit || 0), 0));

  // Customers: labels and counts only. Their names stay on the client.
  const counts = countByStatus(input.customers);
  const customerNames: Record<string, string> = {};
  const row = (c: CustomerProfile) => {
    customerNames[c.label] = c.name;
    return {
      label: c.label,
      daysSinceLastOrder: days(`c_${c.label}_days`, `Days since ${c.label} last ordered`, c.daysSinceLastOrder),
      ...(c.favouriteItems[0] && { favourite: nameId('fav', c.label, c.favouriteItems[0]) }),
      contribution: money(`c_${c.label}_made`, `What the business made on ${c.label}`, c.totalContribution),
    };
  };
  const customers = {
    total: count('customers_total', 'Customers who have ordered', input.customers.length),
    due: count('customers_due', 'Customers due for a reorder', counts.due),
    lapsed: count('customers_lapsed', 'Lapsed customers', counts.lapsed),
    newCustomers: count('customers_new', 'New customers', counts.new),
    dueList: customersForTab(input.customers, 'due').slice(0, SNAPSHOT_LIMITS.customersPerList).map(row),
    lapsedList: customersForTab(input.customers, 'lapsed').slice(0, SNAPSHOT_LIMITS.customersPerList).map(row),
  };

  const notes: string[] = [];
  if (now.estimated || before.estimated) notes.push("Some orders are valued at today's prices because they were made before prices were recorded on each order.");
  notes.push('Price-change and repricing data are not available yet.');

  const promptFigures: AiSnapshot['figures'] = {};
  for (const [id, f] of Object.entries(figures)) promptFigures[id] = { label: f.label, text: formatFigure(f, fx) };

  return {
    promptSnapshot: {
      business: { name: settings.name, currency: currency.code, gstApplicable: !!settings.gstApplicable, timezone: settings.timezone ?? 'Asia/Kolkata' },
      period, comparison,
      figures: promptFigures, names, drivers, products, trend,
      inventory: { cashTiedUp, lowStock, expiringSoon },
      customers, notes,
    },
    registry: { figures, names },
    customerNames,
  };
}

/** Money to the paisa, percentages to one decimal: the precision a figure is stored at. */
function round(n: number, places = 2): number {
  const f = 10 ** places;
  return Math.round((n + Number.EPSILON) * f) / f;
}
