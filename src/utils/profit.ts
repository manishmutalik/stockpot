/**
 * profit.ts
 *
 * The one place money is computed: what an order made, and what the business
 * made over a date range. The Orders tab, the dashboard, the Summary and
 * (later) the Menu view all read from here; no view works out revenue, cost or
 * profit on its own, so two screens can never disagree.
 *
 * Three rules shape every figure:
 *  1. Revenue is always the pre-GST base. GST collected is owed to the
 *     government, never income, in inclusive and exclusive pricing alike
 *     (inclusive: GST is backed out of the price; exclusive: it is added on
 *     top and never enters revenue). A business selling the same base amount
 *     reports the same profit in either mode.
 *  2. History is never rewritten. Each order's price and costs come from the
 *     stamp written when it was created (utils/orderPricing); only orders
 *     from before stamping fall back to today's values, and are flagged
 *     `estimated`.
 *  3. A shared charge is counted once per multi-item order: delivery charge
 *     and courier fee follow the same once-per-group rule as everywhere else.
 *
 * Pure: no React, Firebase or DOM, so it is unit tested on its own.
 */
import type { BakerySettings, MenuItem, Order, RawMaterial, RecipeExperiment, WastageLog } from '../types';
import { convertAmount } from './conversions';
import { splitSaleForGst } from './gstCalculations';
import { attributeDeliveryFieldByGroup, clusterOrdersByGroup } from './orderClustering';
import { resolveUnitCosts, resolveUnitPrice } from './orderPricing';

export { resolveItemName, resolveUnitCosts, resolveUnitPrice, stampFor } from './orderPricing';

type GstSettings = Pick<BakerySettings, 'gstApplicable' | 'gstRate' | 'gstPricingMode'>;

export interface OrderContribution {
  /** Item sales, pre-GST base. */
  itemsRevenue: number;
  /** Delivery charged to the customer, pre-GST base, counted once per order. */
  deliveryCharged: number;
  /** GST on the sale. Owed to the government, never revenue. */
  gstOnSale: number;
  ingredients: number;
  packaging: number;
  /** Courier fee paid, counted once per order. */
  courierFee: number;
  /** Input GST contained in the ingredient and packaging costs (not a cost). */
  inputGst: number;
  /** Revenue minus ingredients, packaging and courier fee. */
  contribution: number;
  /** True if any item used today's price or cost because the order predates stamping. */
  estimated: boolean;
}

/** What one order, or one multi-item order (pass all its items), made. */
export function orderContribution(
  members: Order[],
  menu: MenuItem[],
  materials: RawMaterial[],
  settings: GstSettings
): OrderContribution {
  let itemsGross = 0;
  let ingredients = 0;
  let packaging = 0;
  let inputGst = 0;
  let estimated = false;

  for (const order of members) {
    const qty = order.quantity || 0;
    const price = resolveUnitPrice(order, menu);
    const costs = resolveUnitCosts(order, menu, materials);
    itemsGross += price.value * qty;
    ingredients += costs.ingredients * qty;
    packaging += costs.packaging * qty;
    inputGst += costs.inputGst * qty;
    estimated ||= price.estimated || costs.estimated;
  }

  const sum = (map: Map<string, number>) => Array.from(map.values()).reduce((a, b) => a + b, 0);
  const chargeGross = sum(attributeDeliveryFieldByGroup(members, 'deliveryCharge'));
  const courierFee = sum(attributeDeliveryFieldByGroup(members, 'deliveryFee'));

  // The amount the customer is billed for, then GST split out of it exactly as the bill does.
  const sale = itemsGross + chargeGross;
  const rate = settings.gstApplicable ? settings.gstRate || 0 : 0;
  const mode = settings.gstPricingMode || 'exclusive';
  const split = rate > 0 ? splitSaleForGst(sale, rate, mode) : null;
  // Inclusive: the price contains GST, so revenue is the base, shared out pro rata. Exclusive: the price is already the base.
  const scale = split && mode === 'inclusive' && sale > 0 ? split.baseAmount / sale : 1;

  const itemsRevenue = itemsGross * scale;
  const deliveryCharged = chargeGross * scale;
  return {
    itemsRevenue, deliveryCharged,
    gstOnSale: split?.gstAmount ?? 0,
    ingredients, packaging, courierFee, inputGst,
    contribution: itemsRevenue + deliveryCharged - ingredients - packaging - courierFee,
    estimated,
  };
}

export interface Financials {
  /** Pre-GST sales: items plus delivery charged. */
  income: number;
  expenses: number;
  /** Ingredients and packaging for what was sold. */
  orderExpenses: number;
  /** The packaging part of orderExpenses. */
  packagingExpenses: number;
  experimentExpenses: number;
  /** Courier fees. */
  deliveryExpenses: number;
  wastageExpenses: number;
  gstCollected: number;
  gstPaid: number;
  profit: number;
  /** Sum of every order's contribution (income minus order costs and courier fees). */
  totalContribution: number;
  orderCount: number;
  avgOrderContribution: number;
  /** True if any order in the range predates stamping, so some figures use today's values. */
  estimated: boolean;
}

/**
 * The business's figures for an inclusive date range. Keeps every key
 * `getFinancialsForRange` always returned, with the same meaning except that
 * income is the pre-GST base (so in GST-inclusive pricing, income and profit
 * are lower than before by the GST collected).
 */
export function financialsForRange(input: {
  orders: Order[];
  menu: MenuItem[];
  materials: RawMaterial[];
  experiments: RecipeExperiment[];
  wastageLogs: WastageLog[];
  settings: GstSettings;
  start: string;
  end: string;
}): Financials {
  const { menu, materials, settings, start, end } = input;
  const rangeOrders = input.orders.filter(o => o.date >= start && o.date <= end);

  let income = 0, ingredients = 0, packaging = 0, courierFees = 0, gstCollected = 0, gstPaid = 0;
  let totalContribution = 0, orderCount = 0, estimated = false;
  for (const cluster of clusterOrdersByGroup(rangeOrders)) {
    const members = cluster.type === 'single' ? [cluster.order] : cluster.orders;
    const c = orderContribution(members, menu, materials, settings);
    income += c.itemsRevenue + c.deliveryCharged;
    ingredients += c.ingredients;
    packaging += c.packaging;
    courierFees += c.courierFee;
    gstCollected += c.gstOnSale;
    gstPaid += c.inputGst;
    totalContribution += c.contribution;
    orderCount += 1;
    estimated ||= c.estimated;
  }

  // R&D experiments draw on materials at today's cost (they have no sale to stamp) and stay out of profit.
  const experimentExpenses = input.experiments
    .filter(e => e.date >= start && e.date <= end)
    .reduce((total, exp) => total + exp.materials.reduce((sum, req) => {
      const mat = materials.find(m => m.id === req.materialId);
      return mat ? sum + convertAmount(req.amount, req.unit || 'g', mat.unit) * (mat.costPerUnit || 0) : sum;
    }, 0), 0);

  // Wastage is subtracted once, here. It is never split across orders.
  const wastageExpenses = input.wastageLogs
    .filter(w => w.date >= start && w.date <= end)
    .reduce((total, w) => total + (w.cost || 0), 0);

  const orderExpenses = ingredients + packaging;
  return {
    income,
    expenses: orderExpenses + experimentExpenses + courierFees + wastageExpenses,
    orderExpenses,
    packagingExpenses: packaging,
    experimentExpenses,
    deliveryExpenses: courierFees,
    wastageExpenses,
    gstCollected,
    gstPaid,
    profit: income - orderExpenses - courierFees - wastageExpenses,
    totalContribution,
    orderCount,
    avgOrderContribution: orderCount > 0 ? totalContribution / orderCount : 0,
    estimated,
  };
}
