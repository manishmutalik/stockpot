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
import type { BakerySettings, MenuItem, Order, PriceLogEntry, RawMaterial, RecipeExperiment, WastageLog } from '../types';
import { formatFigure, type AiRegistry, type Figure, type FormatContext } from './aiFigures';
import { countByStatus, customersForTab, type CustomerProfile } from './customers';
import { EXPIRING_SOON_DAYS, getStockStatus } from './inventoryStatus';
import { addDays, daysBetween } from './localDate';
import { bookedAhead, financialsForRange, productProfits, type Financials } from './profit';
import { actualOrders, summarizeDue } from './preorders';
import { reorderSuggestions, type ReorderConfidence, type ReorderFlag } from './reorder';
import { itemsNeedingRepricing, materialPriceStats, repriceOptions, type BreakEven, type PricingScenario } from './pricing';

export const SNAPSHOT_LIMITS = { products: 30, customersPerList: 10, stockItems: 10, trendDays: 7, unsoldItems: 15, mentionedCustomers: 5, reorderSoon: 5, preorderItems: 5, repricing: 5, materialMoves: 6, scenarioItems: 8 } as const;

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
  { id: 'forfeited_advances', label: 'Advances kept from cancelled pre-orders', sign: 1, pick: f => f.forfeitedAdvances },
];

export interface SnapshotDriver {
  /** The id of the figure with this driver's effect on true profit (signed, in money). */
  figure: string;
  label: string;
  effect: 'raised' | 'lowered';
}

/** Pre-orders still to make or hand over on one day: how many orders, and the units of each item (all figures). */
export interface SnapshotPreorderDay {
  orders: string;
  items: { name: string; quantity: string }[];
}

/** A menu item whose margin has slipped since it was priced, or is under the owner's target (all figures and name ids). */
export interface SnapshotRepricing {
  name: string;
  reason: 'slipped' | 'below_target';
  marginThen: string;
  marginNow: string;
  /** The ingredient whose price rose the most since the item was priced, and by how much. Absent if no price rose. */
  driver?: { name: string; change: string };
  /** A price that would put the margin back to what it was (only when higher than today's). */
  suggestedPrice?: string;
}

/** An ingredient whose purchase price has moved, from the price log (only where there is a purchase old enough to compare with). */
export interface SnapshotMaterialMove {
  name: string;
  change: string;
  window: '30 days' | '90 days';
}

/** The result of a what-if the owner asked for, worked out on the device by `pricingScenario` (all figures). */
export interface SnapshotScenario {
  /** What was assumed: who, and by how much. The answer should say this back to the owner. */
  assumed: { products: 'all items' | 'some items'; changePercent?: string; newPrice?: string; salesChangePercent?: string; basedOnDays: string };
  /** The items with the biggest effect, then the rest as one figure. */
  items: { name: string; unitsSold: string; priceNow: string; priceNew: string; monthlyNow: string; monthlyAfter: string }[];
  othersChange?: string;
  noRecentSales: string[];
  monthlyNow: string;
  monthlyAfter: string;
  monthlyChange: string;
  breakEven: { type: BreakEven['type']; percent?: string };
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
  /** Menu items with no sales in the period (name ids): candidates when asked what to stop selling. */
  unsoldItems: string[];
  /** The last few days up to the period end, oldest first. */
  trend: { day: string; revenue: string; trueProfit: string }[];
  inventory: {
    cashTiedUp: string; lowStock: string[]; expiringSoon: string[];
    /** Materials likely to run out soon at the current rate of use (see utils/reorder), soonest first. */
    reorderSoon: { name: string; daysOfCover: string; runOutDate: string; suggestedQty: string; flag: ReorderFlag; confidence: ReorderConfidence }[];
  };
  customers: {
    total: string; due: string; lapsed: string; newCustomers: string;
    dueList: { label: string; daysSinceLastOrder: string; favourite?: string; contribution: string }[];
    lapsedList: { label: string; daysSinceLastOrder: string; favourite?: string; contribution: string }[];
    /** Customers the owner named in a question (matched to a label on the client): a few facts about each. */
    mentioned: { label: string; status: string; daysSinceLastOrder: string; orders: string; spent: string; contribution: string; favourite?: string }[];
  };
  /** Pricing: items whose margin has slipped, and ingredients whose price has moved. Optional: older snapshots lack it. */
  pricing?: { repricing: SnapshotRepricing[]; materialMoves: SnapshotMaterialMove[]; scenario?: SnapshotScenario };
  /** Pre-orders to prepare (open: not handed over or cancelled) and the customers' money held against them. */
  preorders: { dueToday: SnapshotPreorderDay | null; dueTomorrow: SnapshotPreorderDay | null; advancesHeld?: string };
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
  settings: Pick<BakerySettings, 'name' | 'gstApplicable' | 'gstRate' | 'gstPricingMode' | 'fixedCosts' | 'timezone' | 'defaultTargetMargin' | 'marginAlertPoints' | 'priceRounding'>;
  currency: { code: string; symbol: string };
  customers: CustomerProfile[];
  /** Today in the business's time zone, for the expiry check. */
  today: string;
  /** Labels of customers the owner asked about by name (the chat). Their details are added to the snapshot. */
  mentionedCustomers?: string[];
  /** Production runs, to work out which materials will run out soon. Without them none are listed. */
  productionRuns?: { recipeId: string; quantityProduced: number; date: string }[];
  /** Every ingredient purchase price recorded, for the price moves. Without it none are listed. */
  priceLog?: PriceLogEntry[];
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
    financialsForRange({ orders, menu, materials, experiments: input.experiments, wastageLogs: input.wastageLogs, settings, start: range.start, end: range.end, today: input.today });
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
  // A percentage is only meaningful against a positive starting point: 'up 205%' from a loss is not a thing to say.
  if (before.income > 0) percent('revenue_change_pct', 'Change in revenue', ((now.income - before.income) / before.income) * 100);
  if (before.trueProfit > 0) percent('true_profit_change_pct', 'Change in true profit', ((now.trueProfit - before.trueProfit) / before.trueProfit) * 100);
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
  const perProduct = productProfits(actualOrders(orders, input.today).filter(o => o.date >= period.start && o.date <= period.end), menu, materials, settings);
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

  // Items on the menu with no sales in the period.
  const soldIds = new Set(perProduct.keys());
  const unsoldItems = menu.filter(m => !soldIds.has(m.id)).slice(0, SNAPSHOT_LIMITS.unsoldItems).map(m => nameId('item', m.id, m.name));

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
  // Materials that will run out before the low-stock alert would warn, from recent production and discards.
  const reorderSoon = reorderSuggestions({
    materials, menu, productionRuns: input.productionRuns ?? [], wastageLogs: input.wastageLogs, today: input.today,
  }).suggestions.slice(0, SNAPSHOT_LIMITS.reorderSoon).map(r => ({
    name: nameId('mat', r.materialId, r.name),
    daysOfCover: days(`r_${r.materialId}_cover`, `Days of ${r.name} left at the current rate of use`, Math.floor(r.daysOfCover)),
    runOutDate: add(`r_${r.materialId}_runout`, { kind: 'date', value: r.runOutDate, label: `When ${r.name} runs out at the current rate of use` }),
    suggestedQty: add(`r_${r.materialId}_qty`, { kind: 'quantity', value: r.suggestedQty, unit: r.unit, label: `How much ${r.name} would cover the next week` }),
    flag: r.flag,
    confidence: r.confidence,
  }));
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
  const mentionedRow = (c: CustomerProfile) => {
    customerNames[c.label] = c.name;
    return {
      label: c.label,
      status: c.status,
      daysSinceLastOrder: days(`c_${c.label}_days`, `Days since ${c.label} last ordered`, c.daysSinceLastOrder),
      orders: count(`c_${c.label}_orders`, `Orders placed by ${c.label}`, c.orderCount),
      spent: money(`c_${c.label}_spent`, `What ${c.label} has spent in all`, c.totalSpent),
      contribution: money(`c_${c.label}_made`, `What the business made on ${c.label}`, c.totalContribution),
      ...(c.favouriteItems[0] && { favourite: nameId('fav', c.label, c.favouriteItems[0]) }),
    };
  };
  const customers = {
    total: count('customers_total', 'Customers who have ordered', input.customers.length),
    due: count('customers_due', 'Customers due for a reorder', counts.due),
    lapsed: count('customers_lapsed', 'Lapsed customers', counts.lapsed),
    newCustomers: count('customers_new', 'New customers', counts.new),
    dueList: customersForTab(input.customers, 'due').slice(0, SNAPSHOT_LIMITS.customersPerList).map(row),
    lapsedList: customersForTab(input.customers, 'lapsed').slice(0, SNAPSHOT_LIMITS.customersPerList).map(row),
    mentioned: (input.mentionedCustomers ?? []).slice(0, SNAPSHOT_LIMITS.mentionedCustomers).flatMap(label => {
      const c = input.customers.find(x => x.label === label);
      return c ? [mentionedRow(c)] : [];
    }),
  };

  // Pre-orders to prepare. Due today includes any overdue and not yet handed over.
  const dueDay = (tag: string, label: string, isDue: (date: string) => boolean): SnapshotPreorderDay | null => {
    const due = summarizeDue(input.orders, menu, isDue);
    if (!due) return null;
    return {
      orders: count(`pre_${tag}_orders`, `Pre-orders due ${label}`, due.orderCount),
      items: due.items.slice(0, SNAPSHOT_LIMITS.preorderItems).map(i => ({
        name: nameId('item', i.menuItemId, i.name),
        quantity: count(`pre_${tag}_${i.menuItemId}_qty`, `Units of ${i.name} due ${label} on pre-orders`, i.quantity),
      })),
    };
  };
  const tomorrow = addDays(input.today, 1);
  const held = bookedAhead({ orders: input.orders, menu, materials, settings, today: input.today }).advancesHeld;
  const preorders = {
    dueToday: dueDay('today', 'today or overdue', d => d <= input.today),
    dueTomorrow: dueDay('tomorrow', 'tomorrow', d => d === tomorrow),
    ...(held > 0 && { advancesHeld: money('advances_held', 'Money received in advance on pre-orders not yet handed over', held) }),
  };

  // Pricing: where the margin has slipped, and which ingredients got dearer. As of today, whatever period is asked about.
  const repricing: SnapshotRepricing[] = itemsNeedingRepricing(menu, materials, settings).slice(0, SNAPSHOT_LIMITS.repricing).map(({ item, drift }) => {
    const top = drift.drivers.find(d => d.costImpact > 0 && d.pctChange !== null);
    const restore = repriceOptions(item, drift, settings).restore;
    const key = item.id;
    return {
      name: nameId('item', key, item.name),
      reason: drift.alert === 'below_target' ? 'below_target' as const : 'slipped' as const,
      marginThen: percent(`rp_${key}_then`, `Margin on ${item.name} when its price was set`, drift.marginAtPricing, false),
      marginNow: percent(`rp_${key}_now`, `Margin on ${item.name} now`, drift.marginNow, false),
      ...(top && { driver: { name: nameId('mat', top.materialId, materials.find(m => m.id === top.materialId)?.name ?? 'An ingredient'), change: percent(`rp_${key}_driver`, `How much the price of ${materials.find(m => m.id === top.materialId)?.name ?? 'the ingredient'} has risen since ${item.name} was priced`, top.pctChange!) } }),
      ...(restore && { suggestedPrice: money(`rp_${key}_price`, `A price for ${item.name} that would restore its margin`, restore.price) }),
    };
  });
  const materialMoves: SnapshotMaterialMove[] = materials
    .flatMap(m => {
      const stats = materialPriceStats(m, input.priceLog ?? [], input.today);
      const change = stats.change30d ?? stats.change90d;
      if (change === null || Math.abs(change) < 2) return [];
      return [{ m, change, window: stats.change30d !== null ? '30 days' as const : '90 days' as const }];
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.m.id.localeCompare(b.m.id))
    .slice(0, SNAPSHOT_LIMITS.materialMoves)
    .map(({ m, change, window }) => ({
      name: nameId('mat', m.id, m.name),
      change: percent(`mm_${m.id}_change`, `Change in the price paid for ${m.name} over ${window}`, change),
      window,
    }));

  const notes: string[] = [];
  if (now.estimated || before.estimated) notes.push("Some orders are valued at today's prices because they were made before prices were recorded on each order.");

  const promptFigures: AiSnapshot['figures'] = {};
  for (const [id, f] of Object.entries(figures)) promptFigures[id] = { label: f.label, text: formatFigure(f, fx) };

  return {
    promptSnapshot: {
      business: { name: settings.name, currency: currency.code, gstApplicable: !!settings.gstApplicable, timezone: settings.timezone ?? 'Asia/Kolkata' },
      period, comparison,
      figures: promptFigures, names, drivers, products, unsoldItems, trend,
      inventory: { cashTiedUp, lowStock, expiringSoon, reorderSoon },
      pricing: { repricing, materialMoves },
      customers, preorders, notes,
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

/** The snapshot with a what-if result added: the section the model reads, and its figures (as text) and names, with their values kept for rendering. */
export function withScenario(built: BuiltSnapshot, extra: ReturnType<typeof buildScenarioSection>, currencySymbol: string): BuiltSnapshot {
  const fx: FormatContext = { currencySymbol };
  const figures: AiSnapshot['figures'] = { ...built.promptSnapshot.figures };
  for (const [id, f] of Object.entries(extra.figures)) figures[id] = { label: f.label, text: formatFigure(f, fx) };
  const pricing = built.promptSnapshot.pricing ?? { repricing: [], materialMoves: [] };
  return {
    promptSnapshot: { ...built.promptSnapshot, figures, names: { ...built.promptSnapshot.names, ...extra.names }, pricing: { ...pricing, scenario: extra.section } },
    registry: { figures: { ...built.registry.figures, ...extra.figures }, names: { ...built.registry.names, ...extra.names } },
    customerNames: built.customerNames,
  };
}

/**
 * A what-if result as figures and names, to add to a snapshot so the model can explain it. The numbers are the
 * ones `pricingScenario` worked out; nothing is estimated here. Returns what to merge in: the section, and the
 * figures and names it refers to (with their values, for rendering, and as text, for the prompt).
 */
export function buildScenarioSection(input: {
  scenario: PricingScenario;
  menu: Pick<MenuItem, 'id' | 'name' | 'sellingPrice'>[];
  /** What was asked, for the answer to say back. */
  assumed: { allItems: boolean; changePercent?: number; newPrice?: number; salesChangePercent?: number };
  currency: { symbol: string };
}): { section: SnapshotScenario; figures: Record<string, Figure>; names: Record<string, string> } {
  const { scenario, menu } = input;
  const figures: Record<string, Figure> = {};
  const names: Record<string, string> = {};
  const add = (id: string, f: Figure) => { figures[id] = f; return id; };
  const money = (id: string, label: string, value: number, signed = false) => add(id, { kind: 'money', value: round(value), label, signed });
  const pct = (id: string, label: string, value: number, signed = true) => add(id, { kind: 'percent', value: round(value, 1), label, signed });

  const rows = scenario.perItem.filter(i => !i.noRecentSales);
  const byEffect = [...rows].sort((a, b) => Math.abs(b.contributionAfter - b.contributionNow) - Math.abs(a.contributionAfter - a.contributionNow) || a.menuItemId.localeCompare(b.menuItemId));
  const shown = byEffect.slice(0, SNAPSHOT_LIMITS.scenarioItems);
  const items = shown.map(i => {
    const item = menu.find(m => m.id === i.menuItemId);
    const label = item?.name ?? 'An item';
    const key = i.menuItemId;
    names[`item_${key}`] = label;
    return {
      name: `item_${key}`,
      unitsSold: add(`scn_${key}_units`, { kind: 'count', value: i.unitsInPeriod, label: `Units of ${label} sold in the days looked at` }),
      priceNow: money(`scn_${key}_price_now`, `Current price of ${label}`, item?.sellingPrice ?? 0),
      priceNew: money(`scn_${key}_price_new`, `New price of ${label} in this what-if`, i.newPrice),
      monthlyNow: money(`scn_${key}_now`, `What ${label} makes in a month at today's price`, i.contributionNow),
      monthlyAfter: money(`scn_${key}_after`, `What ${label} would make in a month at the new price`, i.contributionAfter),
    };
  });
  const rest = byEffect.slice(SNAPSHOT_LIMITS.scenarioItems);
  const noRecentSales = scenario.perItem.filter(i => i.noRecentSales).slice(0, 8).map(i => {
    const label = menu.find(m => m.id === i.menuItemId)?.name ?? 'An item';
    names[`item_${i.menuItemId}`] = label;
    return `item_${i.menuItemId}`;
  });

  const a = input.assumed;
  const be = scenario.breakEven;
  const section: SnapshotScenario = {
    assumed: {
      products: a.allItems ? 'all items' : 'some items',
      ...(a.changePercent !== undefined && { changePercent: pct('scn_change_pct', 'The price change assumed', a.changePercent) }),
      ...(a.newPrice !== undefined && { newPrice: money('scn_new_price', 'The new price assumed', a.newPrice) }),
      ...(a.salesChangePercent !== undefined && { salesChangePercent: pct('scn_sales_change_pct', 'The change in sales assumed', a.salesChangePercent) }),
      basedOnDays: add('scn_days', { kind: 'days', value: scenario.daysUsed, label: 'Days of real sales the what-if is based on' }),
    },
    items,
    ...(rest.length > 0 && { othersChange: money('scn_others_change', `Change in monthly contribution from the ${rest.length} other items`, rest.reduce((s, i) => s + (i.contributionAfter - i.contributionNow), 0), true) }),
    noRecentSales,
    monthlyNow: money('scn_total_now', 'Monthly contribution at today\'s prices (what these items make after ingredients, packaging, discounts and payment fees)', scenario.monthlyContributionNow),
    monthlyAfter: money('scn_total_after', 'Monthly contribution at the new prices', scenario.monthlyContributionAfter),
    monthlyChange: money('scn_total_change', 'Change in monthly contribution, which is also the change in monthly profit because fixed costs do not move with price', scenario.monthlyContributionAfter - scenario.monthlyContributionNow, true),
    breakEven: {
      type: be.type,
      ...((be.type === 'can_lose' || be.type === 'must_gain') && { percent: pct('scn_break_even', be.type === 'can_lose' ? 'How far sales could fall before profit is no better than today' : 'How far sales would have to rise to make the same profit at the lower prices', be.pct, false) }),
    },
  };
  return { section, figures, names };
}
