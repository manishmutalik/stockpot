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
import type { BakerySettings, FixedCost, MenuItem, Order, RawMaterial, RecipeExperiment, WastageLog } from '../types';
import { convertAmount } from './conversions';
import { splitSaleForGst } from './gstCalculations';
import { attributeDeliveryFieldByGroup, clusterOrdersByGroup } from './orderClustering';
import { resolveUnitCosts, resolveUnitPrice } from './orderPricing';
import { advanceOf, countsAsSale, isOpenPreorder } from './preorders';

export { resolveItemName, resolveUnitCosts, resolveUnitPrice, stampFor } from './orderPricing';

type GstSettings = Pick<BakerySettings, 'gstApplicable' | 'gstRate' | 'gstPricingMode'>;

const sumValues = (map: Map<string, number>) => Array.from(map.values()).reduce((a, b) => a + b, 0);

/** An order is waiting for payment when it was saved as pay-later and not yet marked paid. */
export const isUnpaidOrder = (order: Pick<Order, 'paymentStatus'>) => order.paymentStatus === 'unpaid';

export interface SaleAmounts {
  /** Sum of unit price x quantity, as billed (GST-inclusive in inclusive pricing). */
  itemsGross: number;
  /** Delivery charged to the customer, once per order, as billed. */
  deliveryGross: number;
  /** Discount, once per order, never more than the items and delivery it comes off. */
  discount: number;
  /** What GST is worked out on: items plus delivery minus discount. */
  sale: number;
  gstAmount: number;
  /** What the customer pays: the sale, plus GST on top in exclusive pricing. */
  customerPays: number;
  /** Multiplies a billed amount to get its pre-GST base: 1/(1+rate) in inclusive pricing, else 1. */
  baseScale: number;
  /** True if any item was priced at today's menu price because the order predates stamping. */
  estimated: boolean;
}

/**
 * The money side of one order or multi-item order (pass all its items): what
 * is billed, the discount, the GST and what the customer pays. The bill and
 * the profit figures both use this, so they can never disagree about the
 * amount the customer paid (which is also what a payment fee is charged on).
 */
export function saleAmounts(members: Order[], menu: MenuItem[], settings: GstSettings): SaleAmounts {
  let itemsGross = 0;
  let estimated = false;
  for (const order of members) {
    const price = resolveUnitPrice(order, menu);
    itemsGross += price.value * (order.quantity || 0);
    estimated ||= price.estimated;
  }
  const deliveryGross = sumValues(attributeDeliveryFieldByGroup(members, 'deliveryCharge'));
  const billedBeforeDiscount = itemsGross + deliveryGross;
  const discount = Math.min(Math.max(sumValues(attributeDeliveryFieldByGroup(members, 'discount')), 0), billedBeforeDiscount);
  const sale = billedBeforeDiscount - discount;

  const rate = settings.gstApplicable ? settings.gstRate || 0 : 0;
  const mode = settings.gstPricingMode || 'exclusive';
  const split = rate > 0 ? splitSaleForGst(sale, rate, mode) : null;
  return {
    itemsGross, deliveryGross, discount, sale,
    gstAmount: split?.gstAmount ?? 0,
    customerPays: sale + (split && mode === 'exclusive' ? split.gstAmount : 0),
    baseScale: split && mode === 'inclusive' ? 1 / (1 + rate / 100) : 1,
    estimated,
  };
}

export interface OrderContribution {
  /** Item sales, pre-GST base, before any discount. */
  itemsRevenue: number;
  /** Delivery charged to the customer, pre-GST base, counted once per order. */
  deliveryCharged: number;
  /** Discount given, pre-GST base, counted once per order. */
  discount: number;
  /** GST on the sale. Owed to the government, never revenue. */
  gstOnSale: number;
  ingredients: number;
  packaging: number;
  /** Courier fee paid, counted once per order. */
  courierFee: number;
  /** Fee charged on the payment: the amount paid x the rate stamped when the method was recorded. Nothing until the order is paid. */
  paymentFee: number;
  /** Input GST contained in the ingredient and packaging costs (not a cost). */
  inputGst: number;
  /** What the customer pays for the order. */
  customerPays: number;
  /** Revenue after discount, minus ingredients, packaging, courier fee and payment fee. */
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
  const sale = saleAmounts(members, menu, settings);
  let ingredients = 0, packaging = 0, inputGst = 0;
  let estimated = sale.estimated;
  for (const order of members) {
    const qty = order.quantity || 0;
    const costs = resolveUnitCosts(order, menu, materials);
    ingredients += costs.ingredients * qty;
    packaging += costs.packaging * qty;
    inputGst += costs.inputGst * qty;
    estimated ||= costs.estimated;
  }
  const courierFee = sumValues(attributeDeliveryFieldByGroup(members, 'deliveryFee'));

  // The payment fee is charged on what the customer paid, at the rate stamped when the method was recorded.
  // An advance is a payment of its own: its fee uses the rate copied when it was received. The balance, the
  // rest of what the customer pays, is charged once the order is paid (an unpaid order has paid no balance yet).
  const advance = advanceOf(members);
  const advanceAmount = advance ? Math.min(advance.amount, sale.customerPays) : 0;
  const advanceFee = advance ? advanceAmount * ((advance.feeRate || 0) / 100) : 0;
  const payer = [...members].sort((a, b) => a.id.localeCompare(b.id)).find(o => o.paymentMethod);
  const paid = !members.some(isUnpaidOrder);
  const balanceFee = payer && paid ? (sale.customerPays - advanceAmount) * ((payer.paymentFeeRate || 0) / 100) : 0;
  const paymentFee = advanceFee + balanceFee;

  const itemsRevenue = sale.itemsGross * sale.baseScale;
  const deliveryCharged = sale.deliveryGross * sale.baseScale;
  const discount = sale.discount * sale.baseScale;
  return {
    itemsRevenue, deliveryCharged, discount,
    gstOnSale: sale.gstAmount,
    ingredients, packaging, courierFee, paymentFee, inputGst,
    customerPays: sale.customerPays,
    contribution: itemsRevenue + deliveryCharged - discount - ingredients - packaging - courierFee - paymentFee,
    estimated,
  };
}

export interface ProductProfit {
  menuItemId: string;
  /** Units sold. */
  unitsSold: number;
  /** Orders (a multi-item order counts once) that include this product. */
  orderCount: number;
  /** Item sales after this product's share of any discount, pre-GST base. Delivery charged is not in it. */
  revenue: number;
  /** What the product made: its revenue, plus its share of delivery charged, minus its own ingredients and packaging and its share of courier and payment fees. */
  contribution: number;
  /** Item sales before any discount, pre-GST base: what the units were billed at. */
  grossRevenue: number;
  /** This product's share of the payment fees on its orders. */
  paymentFees: number;
  /** Ingredients and packaging of the units sold, at the costs stamped on each order. */
  costOfGoods: number;
  /** contribution / unitsSold. */
  avgContributionPerUnit: number;
  /** True if any order of it used today's price or cost because it predates stamping. */
  estimated: boolean;
}

/**
 * What each product made over a set of orders (the caller filters by date).
 * A product's own sales, ingredients and packaging are exact. The charges an
 * order shares between its items (delivery charged, discount, courier fee,
 * payment fee) are split in proportion to each item's sales in that order, so
 * the products' contributions always add up to the orders' contributions.
 */
export function productProfits(
  orders: Order[],
  menu: MenuItem[],
  materials: RawMaterial[],
  settings: GstSettings
): Map<string, ProductProfit> {
  const result = new Map<string, ProductProfit>();
  for (const cluster of clusterOrdersByGroup(orders.filter(countsAsSale))) {
    const members = cluster.type === 'single' ? [cluster.order] : cluster.orders;
    const whole = orderContribution(members, menu, materials, settings);
    const sale = saleAmounts(members, menu, settings);
    // Each item's weight is its sales; with nothing priced, its units.
    const weightOf = (o: Order) => (sale.itemsGross > 0 ? resolveUnitPrice(o, menu).value * (o.quantity || 0) : o.quantity || 0);
    const totalWeight = members.reduce((sum, o) => sum + weightOf(o), 0);
    const shared = whole.deliveryCharged - whole.discount - whole.courierFee - whole.paymentFee;

    const lines = new Map<string, Order[]>();
    for (const o of members) lines.set(o.menuItemId, [...(lines.get(o.menuItemId) ?? []), o]);

    for (const [menuItemId, items] of lines) {
      const share = totalWeight > 0 ? items.reduce((sum, o) => sum + weightOf(o), 0) / totalWeight : 0;
      let gross = 0, ingredients = 0, packaging = 0, units = 0, estimated = false;
      for (const o of items) {
        const qty = o.quantity || 0;
        const price = resolveUnitPrice(o, menu);
        const costs = resolveUnitCosts(o, menu, materials);
        gross += price.value * qty * sale.baseScale;
        ingredients += costs.ingredients * qty;
        packaging += costs.packaging * qty;
        units += qty;
        estimated ||= price.estimated || costs.estimated;
      }
      const entry = result.get(menuItemId) ?? { menuItemId, unitsSold: 0, orderCount: 0, revenue: 0, grossRevenue: 0, paymentFees: 0, costOfGoods: 0, contribution: 0, avgContributionPerUnit: 0, estimated: false };
      entry.unitsSold += units;
      entry.orderCount += 1;
      entry.revenue += gross - whole.discount * share;
      entry.grossRevenue += gross;
      entry.paymentFees += whole.paymentFee * share;
      entry.costOfGoods += ingredients + packaging;
      entry.contribution += gross + shared * share - ingredients - packaging;
      entry.estimated ||= estimated;
      result.set(menuItemId, entry);
    }
  }
  for (const entry of result.values()) entry.avgContributionPerUnit = entry.unitsSold > 0 ? entry.contribution / entry.unitsSold : 0;
  return result;
}

/** What one product made over a set of orders. Zeros if it has no orders in them. */
export function productProfit(
  menuItemId: string,
  orders: Order[],
  menu: MenuItem[],
  materials: RawMaterial[],
  settings: GstSettings
): ProductProfit {
  return productProfits(orders, menu, materials, settings).get(menuItemId)
    ?? { menuItemId, unitsSold: 0, orderCount: 0, revenue: 0, grossRevenue: 0, paymentFees: 0, costOfGoods: 0, contribution: 0, avgContributionPerUnit: 0, estimated: false };
}

const pad = (n: number) => String(n).padStart(2, '0');
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/**
 * Fixed costs falling in an inclusive date range: each cost's monthly amount
 * spread evenly over the days of every calendar month the range touches
 * (amount x days in range that month / days in that month), counting only
 * the days inside the cost's own start and end dates. A range inside one
 * month gets that fraction of the month; a range of whole months gets the
 * full amounts.
 */
export function fixedCostsForRange(costs: FixedCost[] | undefined, start: string, end: string): number {
  if (!costs?.length || start > end) return 0;
  const [startYear, startMonth] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);
  let total = 0;
  for (let y = startYear, m = startMonth; y < endYear || (y === endYear && m <= endMonth); m === 12 ? (y++, m = 1) : m++) {
    const dim = daysInMonth(y, m);
    const monthStart = `${y}-${pad(m)}-01`;
    const monthEnd = `${y}-${pad(m)}-${pad(dim)}`;
    for (const cost of costs) {
      const lo = [start, monthStart, cost.startDate || ''].reduce((a, b) => (a > b ? a : b));
      const hi = [end, monthEnd, cost.endDate || '9999-12-31'].reduce((a, b) => (a < b ? a : b));
      if (lo > hi) continue;
      total += (cost.monthlyAmount || 0) * ((dayNumber(hi) - dayNumber(lo) + 1) / dim);
    }
  }
  return total;
}

export interface Financials {
  /** Pre-GST sales after discounts: items plus delivery charged, minus discounts. */
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
  /** Income minus ingredients, packaging, courier fees and wastage. Payment fees and fixed costs come off in `trueProfit`. */
  profit: number;
  /** Discounts given in the range (already out of `income`). */
  discounts: number;
  /** Fees paid on payments received (including on advances that were kept). */
  paymentFees: number;
  /** Fixed monthly costs prorated to the range. */
  fixedCosts: number;
  /** Advances kept from pre-orders cancelled in the range: income on the day they were cancelled. */
  forfeitedAdvances: number;
  /** Sum of every order's contribution (income minus order costs, courier and payment fees). */
  totalContribution: number;
  /** Contribution minus wastage minus fixed costs: what the business really made. */
  trueProfit: number;
  orderCount: number;
  avgOrderContribution: number;
  /** The part of `income` still waiting to be paid (pay-later orders not yet marked paid). */
  unpaidIncome: number;
  /** True if any order in the range predates stamping, so some figures use today's values. */
  estimated: boolean;
}

/**
 * The business's figures for an inclusive date range. Keeps every key
 * `getFinancialsForRange` always returned, with the same meaning except that
 * income is the pre-GST base after discounts (so in GST-inclusive pricing,
 * income and profit are lower than they used to be by the GST collected).
 * Unpaid orders count as income, as they always have; `unpaidIncome` says how
 * much of it is still owed.
 */
export function financialsForRange(input: {
  orders: Order[];
  menu: MenuItem[];
  materials: RawMaterial[];
  experiments: RecipeExperiment[];
  wastageLogs: WastageLog[];
  settings: GstSettings & Pick<BakerySettings, 'fixedCosts'>;
  start: string;
  end: string;
  /**
   * Today in the business's time zone. When given, nothing after it is counted: an order due later is booked
   * for later, not yet a sale (see utils/preorders). Cancelled orders are never counted.
   */
  today?: string;
}): Financials {
  const { menu, materials, settings, start, end } = input;
  const last = input.today && input.today < end ? input.today : end;
  const rangeOrders = input.orders.filter(o => countsAsSale(o) && o.date >= start && o.date <= last);

  let income = 0, ingredients = 0, packaging = 0, courierFees = 0, gstCollected = 0, gstPaid = 0;
  let discounts = 0, paymentFees = 0, unpaidIncome = 0;
  let totalContribution = 0, orderCount = 0, estimated = false;
  for (const cluster of clusterOrdersByGroup(rangeOrders)) {
    const members = cluster.type === 'single' ? [cluster.order] : cluster.orders;
    const c = orderContribution(members, menu, materials, settings);
    const net = c.itemsRevenue + c.deliveryCharged - c.discount;
    income += net;
    if (members.some(isUnpaidOrder)) unpaidIncome += net;
    discounts += c.discount;
    ingredients += c.ingredients;
    packaging += c.packaging;
    courierFees += c.courierFee;
    paymentFees += c.paymentFee;
    gstCollected += c.gstOnSale;
    gstPaid += c.inputGst;
    totalContribution += c.contribution;
    orderCount += 1;
    estimated ||= c.estimated;
  }

  // An advance kept from a pre-order that was cancelled is income on the day it was cancelled. It was paid by a
  // method, so its fee is real too.
  let forfeitedAdvances = 0, forfeitedFees = 0;
  for (const o of input.orders) {
    if (!o.cancelledOn || o.advanceOutcome !== 'kept' || !o.advance || !(o.advance.amount > 0)) continue;
    if (o.cancelledOn < start || o.cancelledOn > last) continue;
    forfeitedAdvances += o.advance.amount;
    forfeitedFees += o.advance.amount * ((o.advance.feeRate || 0) / 100);
  }
  paymentFees += forfeitedFees;

  // R&D experiments draw on materials at today's cost (they have no sale to stamp) and stay out of profit.
  const experimentExpenses = input.experiments
    .filter(e => e.date >= start && e.date <= last)
    .reduce((total, exp) => total + exp.materials.reduce((sum, req) => {
      const mat = materials.find(m => m.id === req.materialId);
      return mat ? sum + convertAmount(req.amount, req.unit || 'g', mat.unit) * (mat.costPerUnit || 0) : sum;
    }, 0), 0);

  // Wastage is subtracted once, here. It is never split across orders.
  const wastageExpenses = input.wastageLogs
    .filter(w => w.date >= start && w.date <= last)
    .reduce((total, w) => total + (w.cost || 0), 0);

  const fixedCosts = fixedCostsForRange(settings.fixedCosts, start, end);
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
    profit: income + forfeitedAdvances - orderExpenses - courierFees - wastageExpenses,
    discounts,
    paymentFees,
    fixedCosts,
    forfeitedAdvances,
    totalContribution,
    trueProfit: totalContribution + forfeitedAdvances - forfeitedFees - wastageExpenses - fixedCosts,
    orderCount,
    avgOrderContribution: orderCount > 0 ? totalContribution / orderCount : 0,
    unpaidIncome,
    estimated,
  };
}

export interface BookedAhead {
  /** Orders (a multi-item order counts once) due after today. */
  orderCount: number;
  /** What they will be worth when they are due: pre-GST, after discounts, the same measure as `income`. Not yet a sale. */
  revenue: number;
  /** Money received in advance on pre-orders not yet handed over or cancelled, due today or later: the customers' money held against future orders. */
  advancesHeld: number;
}

/**
 * What is booked for later, and the advances held against open pre-orders. These
 * are kept out of every actual figure until the orders fall due (see
 * utils/preorders), and shown on their own so they are not lost sight of.
 */
export function bookedAhead(input: {
  orders: Order[];
  menu: MenuItem[];
  materials: RawMaterial[];
  settings: GstSettings;
  /** Today in the business's time zone. */
  today: string;
}): BookedAhead {
  const { menu, materials, settings, today } = input;
  let orderCount = 0, revenue = 0, advancesHeld = 0;
  for (const cluster of clusterOrdersByGroup(input.orders.filter(countsAsSale))) {
    const members = cluster.type === 'single' ? [cluster.order] : cluster.orders;
    if (members.every(o => o.date > today)) {
      const c = orderContribution(members, menu, materials, settings);
      revenue += c.itemsRevenue + c.deliveryCharged - c.discount;
      orderCount += 1;
    }
    if (members.some(isOpenPreorder)) advancesHeld += advanceOf(members)?.amount ?? 0;
  }
  return { orderCount, revenue, advancesHeld };
}
