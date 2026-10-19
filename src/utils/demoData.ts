import { convertAmount } from './conversions';
import { stampFor, type OrderStamp } from './orderPricing';
import { costView } from './itemParts';
import type { OrderTaken, PaymentMethod, PriceLogEntry, WastageLog } from '../types';
import { pricingStamp } from './pricing';

/**
 * Sample data for the demo sandbox.
 *
 * Every figure that depends on another one is *derived* here rather than typed
 * in, so the demo obeys the same rules as a real bakery in the app:
 *
 *  - a production run's cost = quantity produced x the recipe's material cost;
 *  - producing a batch deducts its ingredients from raw-material stock, so a
 *    material's current stock = what was bought - what the runs used;
 *  - finished-goods stock = units produced (after waste) - units ordered, and
 *    the batches' remaining units are what is left after the orders take from
 *    the oldest batches first, so they add up to that stock;
 *  - orders older than today are fulfilled, today's are still pending.
 *
 * `today` is passed in (YYYY-MM-DD) so the data is reproducible and testable.
 */

export interface DemoMaterial {
  id: string; name: string; unit: string; initialStock: number; costPerUnit: number;
  category: string; threshold: number; dateAdded: string;
}
export interface DemoMenuItem {
  id: string; name: string; sellingPrice: number; emoji: string; finishedGoodsStock: number;
  recipe: { materialId: string; amount: number; unit: string }[];
  /** Other items it is made from (utils/itemParts): the cream cake is built on the sponge base. */
  parts?: { itemId: string; quantity: number }[];
  /** Made only to go into other items: the sponge base. */
  notForSale?: boolean;
  /** How many one batch makes (utils/batches): the sponge base, 4.5 from one mix. */
  batchMakes?: number;
  /** Made when ordered (utils/madeToOrder): the cream cake, assembled on a base for each order. */
  madeToOrder?: boolean;
  /** Counted by weight or volume (utils/itemUnits): a gravy kept by the kg. Its recipe is then for 1 kg. */
  countedIn?: 'kg' | 'l';
  /** A target margin of its own (utils/pricing), so a price alert can say it is under target. */
  targetMargin?: number;
}
export interface DemoOrder {
  id: string; menuItemId: string; quantity: number; date: string;
  customerName: string; customerPhone: string; fulfilled: boolean;
  /** Sent by a courier: what the customer paid for delivery, and what the courier cost. */
  deliveryMethod?: 'third_party'; deliveryCharge?: number; deliveryFee?: number;
}
/** A demo order carries its price and cost stamp, like every order made in the app. */
export type DemoOrderWithStamp = DemoOrder & OrderStamp & { paymentMethod: PaymentMethod; paymentFeeRate: number; discount?: number; taken?: OrderTaken };
export interface DemoRun {
  id: string; recipeId: string; quantityProduced: number; quantityYield?: number; remainingQuantity: number;
  date: string; expiryDate: string; purpose: string; costTotal: number; createdAt: number;
  /** For a run of an item made from others: the parts it took from stock, and what they were worth (inside costTotal). */
  partsUsed?: { itemId: string; quantity: number }[]; partsCost?: number;
  /** Logged in batches: how many. */
  batches?: number;
}

/** A material as bought: its opening stock (`bought`), its price now, and its alert level. */
export interface KitchenPurchase {
  id: string; name: string; unit: string; bought: number; costPerUnit: number; category: string; threshold: number;
}
/** One order: the item, how many, how many days ago, who; and, when it differs from the default, how it was paid. */
export interface KitchenOrderRow {
  item: string; quantity: number; daysAgo: number; customer: string; phone: string;
  method?: PaymentMethod; discount?: number;
  delivery?: { charge: number; fee: number };
}
/** One production run: recipe, produced, sellable (if it differed), days ago, shelf life in days, batches. */
export type KitchenRunRow = [id: string, recipeId: string, produced: number, sellable: number | undefined, daysAgo: number, shelfLife: number, batches?: number];

/**
 * A sample kitchen: what it bought, its menu (recipes per unit), its orders and production runs, and the rest. Everything
 * that follows from these (costs, stock, stamps, the price history) is worked out by `buildKitchenData`, so any kitchen
 * described here adds up the way a real one in the app does.
 */
export interface KitchenCatalogue {
  name: string; address: string; phone: string;
  purchases: KitchenPurchase[];
  menu: Omit<DemoMenuItem, 'finishedGoodsStock'>[];
  orders: KitchenOrderRow[];
  runs: KitchenRunRow[];
  /** Runs made for a particular order rather than for the shelf. */
  customerOrderRuns?: string[];
  /** Materials topped up later at another price: the share bought then, the opening price as a share of today's, and when. */
  topUps: Record<string, { share: number; openedAt: number; daysAgo: number }>;
  experiments: { id: string; name: string; daysAgo: number; materials: { materialId: string; amount: number; unit: string }[]; notes?: string }[];
  fixedCosts: { id: string; name: string; monthlyAmount: number }[];
  /** Materials thrown away: the material, how much (in its unit), days ago, why. Taken from stock. */
  wastage?: { materialId: string; quantity: number; daysAgo: number; reason: string }[];
  /** When the items were priced, at the opening prices (utils/pricing stamp), so price rises since then show as alerts. */
  pricedDaysAgo?: number;
}

/** Fee % the demo business pays per payment method. */
export const DEMO_FEE_RATES: Partial<Record<PaymentMethod, number>> = { upi: 0, card: 2 };

const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (n: number) => parseFloat(n.toFixed(2));
const round4 = (n: number) => parseFloat(n.toFixed(4));

const dayOffset = (today: string, daysAgo: number) => {
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().split('T')[0];
};


/** The demo sandbox: a home bakery in Bengaluru, with a week of trading. */
export const BAKERY: KitchenCatalogue = {
  name: 'Stockpot Demo Kitchen',
  address: '14, 80 Feet Road, Indiranagar, Bengaluru 560038',
  phone: '+91 98450 00199',
  // Materials: what was bought (opening stock), price, and alert level. Current stock is worked out from what the
  // production runs used. Prices are typical Indian retail/wholesale rates in rupees, per gram / ml / piece.
  purchases: [
    { id: 'm_flour', name: 'Maida (All-Purpose Flour)', unit: 'g', bought: 60000, costPerUnit: 0.045, category: 'Raw Materials', threshold: 10000 }, // ₹45/kg
    { id: 'm_atta', name: 'Whole Wheat Atta', unit: 'g', bought: 40000, costPerUnit: 0.048, category: 'Raw Materials', threshold: 5000 }, // ₹48/kg
    { id: 'm_sugar', name: 'Sugar', unit: 'g', bought: 25000, costPerUnit: 0.048, category: 'Raw Materials', threshold: 5000 }, // ₹48/kg
    { id: 'm_butter', name: 'Unsalted Butter', unit: 'g', bought: 12000, costPerUnit: 0.57, category: 'Raw Materials', threshold: 2000 }, // ₹570/kg
    { id: 'm_eggs', name: 'Eggs', unit: 'pcs', bought: 150, costPerUnit: 7, category: 'Raw Materials', threshold: 30 }, // ₹7 each
    { id: 'm_milk', name: 'Full Cream Milk', unit: 'ml', bought: 20000, costPerUnit: 0.068, category: 'Raw Materials', threshold: 4000 }, // ₹68/litre
    // Deliberately runs low so the demo shows a Low Stock alert.
    { id: 'm_yeast', name: 'Instant Dry Yeast', unit: 'g', bought: 900, costPerUnit: 0.7, category: 'Raw Materials', threshold: 300 }, // ₹700/kg
    { id: 'm_chips', name: 'Chocolate Chips', unit: 'g', bought: 8000, costPerUnit: 0.6, category: 'Raw Materials', threshold: 1500 }, // ₹600/kg
    { id: 'm_box', name: 'Bakery Box', unit: 'pcs', bought: 300, costPerUnit: 12, category: 'Packaging Materials', threshold: 50 }, // ₹12 each
    // For the cream cakes, built on a sponge base made ahead.
    { id: 'm_gel', name: 'Cake Gel Premix', unit: 'g', bought: 5000, costPerUnit: 0.3, category: 'Raw Materials', threshold: 1000 }, // ₹300/kg
    { id: 'm_oil', name: 'Refined Oil', unit: 'ml', bought: 2000, costPerUnit: 0.15, category: 'Raw Materials', threshold: 400 }, // ₹150/litre
    { id: 'm_cream', name: 'Whipping Cream', unit: 'g', bought: 4000, costPerUnit: 0.4, category: 'Raw Materials', threshold: 1000 }, // ₹400/kg
    { id: 'm_pineapple', name: 'Pineapple (tinned)', unit: 'g', bought: 3000, costPerUnit: 0.12, category: 'Raw Materials', threshold: 500 }, // ₹120/kg
  ],
  // Menu: recipes are per single unit.
  menu: [
    {
      id: 'menu_croissant', name: 'Butter Croissant', sellingPrice: 150, emoji: '🥐',
      recipe: [
        { materialId: 'm_flour', amount: 150, unit: 'g' },
        { materialId: 'm_sugar', amount: 15, unit: 'g' },
        { materialId: 'm_butter', amount: 75, unit: 'g' },
        { materialId: 'm_milk', amount: 50, unit: 'ml' },
        { materialId: 'm_yeast', amount: 5, unit: 'g' },
      ],
    },
    {
      id: 'menu_muffin', name: 'Chocolate Muffin', sellingPrice: 120, emoji: '🧁',
      recipe: [
        { materialId: 'm_flour', amount: 120, unit: 'g' },
        { materialId: 'm_sugar', amount: 60, unit: 'g' },
        { materialId: 'm_butter', amount: 30, unit: 'g' },
        { materialId: 'm_eggs', amount: 1, unit: 'pcs' },
        { materialId: 'm_milk', amount: 60, unit: 'ml' },
        { materialId: 'm_chips', amount: 25, unit: 'g' },
      ],
    },
    {
      id: 'menu_bread', name: 'Whole Wheat Atta Loaf', sellingPrice: 90, emoji: '🍞',
      recipe: [
        { materialId: 'm_atta', amount: 400, unit: 'g' },
        { materialId: 'm_flour', amount: 100, unit: 'g' },
        { materialId: 'm_sugar', amount: 15, unit: 'g' },
        { materialId: 'm_yeast', amount: 6, unit: 'g' },
      ],
    },
    // A base made ahead (a batch makes 4.5: four for 1 kg cakes, one for a half-kg), not sold on its own.
    {
      id: 'menu_base', name: 'Vanilla Sponge Base', sellingPrice: 0, emoji: '🍰', notForSale: true, batchMakes: 4.5,
      recipe: [
        { materialId: 'm_gel', amount: 220, unit: 'g' },
        { materialId: 'm_oil', amount: 40, unit: 'ml' },
      ],
    },
    // A cream cake built on one base, assembled when it is ordered.
    {
      id: 'menu_pinecake', name: 'Pineapple Cream Cake 1 kg', sellingPrice: 950, emoji: '🎂', madeToOrder: true,
      recipe: [
        { materialId: 'm_cream', amount: 150, unit: 'g' },
        { materialId: 'm_pineapple', amount: 100, unit: 'g' },
      ],
      parts: [{ itemId: 'menu_base', quantity: 1 }],
    },
  ],
  // Hotel Sai Residency orders every other day (6, 4 and 2 days ago), so the Customers panel shows one that is due.
  // One large café order was given a bulk discount, so the demo shows discounts too.
  orders: [
    { item: 'menu_croissant', quantity: 8, daysAgo: 0, customer: 'Priya Sharma', phone: '+91 98450 10101' },
    { item: 'menu_muffin', quantity: 12, daysAgo: 0, customer: 'Rohan Mehta', phone: '+91 98450 10102' },
    { item: 'menu_bread', quantity: 4, daysAgo: 0, customer: 'Sunita Iyer', phone: '+91 98450 10103' },
    { item: 'menu_croissant', quantity: 15, daysAgo: 1, customer: 'Brew & Bite Café', phone: '+91 98860 20201', discount: 150 },
    { item: 'menu_muffin', quantity: 8, daysAgo: 1, customer: 'Arjun Nair', phone: '+91 98860 20202' },
    { item: 'menu_bread', quantity: 6, daysAgo: 1, customer: 'Kavita Reddy', phone: '+91 98860 20203' },
    { item: 'menu_croissant', quantity: 6, daysAgo: 2, customer: 'Hotel Sai Residency', phone: '+91 99001 30301' },
    { item: 'menu_muffin', quantity: 10, daysAgo: 2, customer: 'Tapri Corner Café', phone: '+91 99001 30302' },
    { item: 'menu_bread', quantity: 8, daysAgo: 3, customer: 'Imran Qureshi', phone: '+91 99720 40401' },
    { item: 'menu_croissant', quantity: 12, daysAgo: 3, customer: 'Neha Gupta', phone: '+91 99720 40402' },
    { item: 'menu_muffin', quantity: 14, daysAgo: 4, customer: 'Vikram Singh', phone: '+91 97420 50501' },
    { item: 'menu_croissant', quantity: 5, daysAgo: 4, customer: 'Hotel Sai Residency', phone: '+91 99001 30301' },
    { item: 'menu_bread', quantity: 10, daysAgo: 5, customer: 'Daily Fresh Grocers', phone: '+91 90350 60601' },
    { item: 'menu_croissant', quantity: 10, daysAgo: 5, customer: 'Hotel Udupi Grand', phone: '+91 90350 60602' },
    { item: 'menu_muffin', quantity: 15, daysAgo: 6, customer: 'Greenfield School Fete', phone: '+91 80410 70701' },
    { item: 'menu_bread', quantity: 5, daysAgo: 6, customer: 'Hotel Sai Residency', phone: '+91 99001 30301' },
    // Made when ordered: the cream and pineapple came out of materials, and the bases off the base shelf.
    { item: 'menu_pinecake', quantity: 2, daysAgo: 1, customer: 'Ananya Rao', phone: '+91 98450 10104' },
  ],
  runs: [
    ['run_1', 'menu_croissant', 30, undefined, 6, 2],
    ['run_2', 'menu_muffin', 30, undefined, 6, 3],
    ['run_3', 'menu_bread', 15, undefined, 6, 2],
    ['run_4', 'menu_croissant', 20, undefined, 4, 2],
    ['run_5', 'menu_muffin', 20, 19, 4, 3], // one muffin lost at the bench
    ['run_6', 'menu_bread', 15, undefined, 4, 2],
    ['run_7', 'menu_croissant', 25, undefined, 1, 2],
    ['run_8', 'menu_muffin', 25, undefined, 2, 3],
    ['run_9', 'menu_bread', 15, undefined, 2, 2],
    ['run_10', 'menu_base', 9, 8, 2, 4, 2], // two batches of sponge base, one short of the 9 planned
  ],
  customerOrderRuns: ['run_7'],
  // Butter, eggs, chocolate chips and yeast were topped up later at a different price.
  topUps: {
    m_butter: { share: 0.4, openedAt: 0.92, daysAgo: 12 },   // butter got dearer
    m_eggs: { share: 0.4, openedAt: 0.9, daysAgo: 9 },       // so did eggs
    m_chips: { share: 0.35, openedAt: 0.95, daysAgo: 16 },
    m_yeast: { share: 0.3, openedAt: 1.1, daysAgo: 7 },      // yeast got cheaper
  },
  experiments: [
    {
      id: 'exp_1',
      name: 'Atta Croissant Trial',
      daysAgo: 2,
      materials: [
        { materialId: 'm_atta', amount: 200, unit: 'g' },
        { materialId: 'm_sugar', amount: 20, unit: 'g' },
        { materialId: 'm_butter', amount: 80, unit: 'g' },
      ],
      notes: 'Tried replacing maida with whole wheat atta. Layers did not separate well and the crumb was dense. Tastes good but the texture is off.',
    },
  ],
  // Typical monthly overheads for a home bakery, sized so that the week of orders covers them: the demo shows a business
  // that makes money, as most visitors' will.
  fixedCosts: [
    { id: 'fc_power', name: 'Gas & electricity', monthlyAmount: 2500 },
    { id: 'fc_helper', name: 'Part-time helper', monthlyAmount: 6000 },
    { id: 'fc_phone', name: 'Phone & internet', monthlyAmount: 800 },
  ],
};

export function buildDemoData(userId: string, today: string) {
  return buildKitchenData(BAKERY, userId, today);
}

/** Everything a sample kitchen holds, worked out from its catalogue; `email` is what its settings show (bills carry it). */
export function buildKitchenData(kitchen: KitchenCatalogue, userId: string, today: string, email = `${userId}@demo.stockpot.app`) {
  const at = (daysAgo: number) => dayOffset(today, daysAgo);
  const { purchases, menu: menuBase, runs: runRows } = kitchen;

  // What one of an item costs in materials, its parts' recipes included (the cream cake counts its base).
  const recipeUnitCost = (menuId: string): number => {
    const item = menuBase.find(m => m.id === menuId)!;
    return item.recipe.reduce((sum, req) => {
      const mat = purchases.find(m => m.id === req.materialId)!;
      return sum + convertAmount(req.amount, req.unit, mat.unit) * mat.costPerUnit;
    }, 0) + (item.parts ?? []).reduce((sum, p) => sum + p.quantity * recipeUnitCost(p.itemId), 0);
  };

  // What a made-to-order sale took (utils/madeToOrder): its own ingredients, in each material's unit, and its parts.
  const takenBy = (menuId: string, quantity: number): OrderTaken => {
    const item = menuBase.find(m => m.id === menuId)!;
    const materials = item.recipe.map(req => {
      const mat = purchases.find(m => m.id === req.materialId)!;
      return { materialId: mat.id, amount: round4(convertAmount(req.amount, req.unit, mat.unit) * quantity) };
    });
    return {
      materials,
      parts: (item.parts ?? []).map(p => ({ itemId: p.itemId, quantity: round4(p.quantity * quantity) })),
      cost: round2(materials.reduce((sum, m) => sum + m.amount * purchases.find(x => x.id === m.materialId)!.costPerUnit, 0)),
    };
  };

  // ── Orders (one per customer) ──────────────────────────────────────────────
  // Each order is stamped with what its item sold for and cost to make, as the app does when an
  // order is created, so the demo's figures are exact rather than "estimated".
  // Orders are paid in a mix of ways, each carrying the fee rate in force (see DEMO_FEE_RATES); a row may name its own.
  const methods: PaymentMethod[] = ['upi', 'cash', 'upi', 'card', 'upi', 'cash'];
  const FIRST_ORDER_DAYS_AGO = Math.max(...kitchen.orders.map(r => r.daysAgo));
  const orders: DemoOrderWithStamp[] = kitchen.orders.map((row, i) => {
    const paymentMethod = row.method ?? methods[i % methods.length];
    const item = menuBase.find(m => m.id === row.item)!;
    return {
      id: `ord_${i + 1}`, menuItemId: row.item, quantity: row.quantity, date: at(row.daysAgo), customerName: row.customer, customerPhone: row.phone,
      fulfilled: row.daysAgo > 0,
      ...stampFor(costView(item, menuBase), purchases),
      paymentMethod, paymentFeeRate: DEMO_FEE_RATES[paymentMethod] ?? 0,
      ...(row.discount && { discount: row.discount }),
      ...(item.madeToOrder && { taken: takenBy(row.item, row.quantity) }),
      ...(row.delivery && { deliveryMethod: 'third_party' as const, deliveryCharge: row.delivery.charge, deliveryFee: row.delivery.fee }),
    };
  });

  // Units ordered per item are taken from the oldest batches first (FIFO); so are the parts later runs used (bases).
  const orderedByItem = new Map<string, number>();
  // A made-to-order sale takes its parts (bases), not finished cakes.
  for (const o of orders) {
    if (o.taken) for (const p of o.taken.parts) orderedByItem.set(p.itemId, (orderedByItem.get(p.itemId) ?? 0) + p.quantity);
    else orderedByItem.set(o.menuItemId, (orderedByItem.get(o.menuItemId) ?? 0) + o.quantity);
  }
  const partsUsedBy = (recipeId: string, produced: number) => (menuBase.find(m => m.id === recipeId)!.parts ?? []).map(p => ({ itemId: p.itemId, quantity: p.quantity * produced }));
  for (const [, recipeId, produced] of runRows) {
    for (const p of partsUsedBy(recipeId, produced)) orderedByItem.set(p.itemId, (orderedByItem.get(p.itemId) ?? 0) + p.quantity);
  }

  const remainingByRun = new Map<string, number>();
  for (const item of menuBase) {
    let toTake = orderedByItem.get(item.id) ?? 0;
    const batches = runRows
      .filter(r => r[1] === item.id)
      .sort((a, b) => b[4] - a[4]); // oldest first = most days ago first
    for (const [id, , produced, sellable] of batches) {
      const yieldUnits = sellable ?? produced;
      const taken = Math.min(yieldUnits, toTake);
      toTake -= taken;
      remainingByRun.set(id, round4(yieldUnits - taken));
    }
  }

  const productionRuns: DemoRun[] = runRows.map(([id, recipeId, produced, sellable, daysAgo, shelfLife, batches]) => ({
    id, recipeId,
    ...(batches && { batches }),
    ...(partsUsedBy(recipeId, produced).length > 0 && {
      partsUsed: partsUsedBy(recipeId, produced),
      partsCost: round2(partsUsedBy(recipeId, produced).reduce((s, p) => s + p.quantity * recipeUnitCost(p.itemId), 0)),
    }),
    quantityProduced: produced,
    ...(sellable !== undefined ? { quantityYield: sellable } : {}),
    remainingQuantity: remainingByRun.get(id)!,
    date: at(daysAgo),
    expiryDate: at(daysAgo - shelfLife),
    purpose: kitchen.customerOrderRuns?.includes(id) ? 'customer_order' : 'market_stock',
    // Snapshot of the material cost of everything produced, as the app records it.
    costTotal: round2(produced * recipeUnitCost(recipeId)),
    createdAt: Date.parse(today + 'T12:00:00Z') - daysAgo * DAY_MS,
  }));

  // Ingredients each run used up (the app deducts for everything produced).
  const usedByMaterial = new Map<string, number>();
  for (const run of productionRuns) {
    const item = menuBase.find(m => m.id === run.recipeId)!;
    for (const req of item.recipe) {
      const mat = purchases.find(m => m.id === req.materialId)!;
      const used = convertAmount(req.amount, req.unit, mat.unit) * run.quantityProduced;
      usedByMaterial.set(mat.id, (usedByMaterial.get(mat.id) ?? 0) + used);
    }
  }
  // And what made-to-order sales took, and what was thrown away.
  for (const o of orders) for (const t of o.taken?.materials ?? []) usedByMaterial.set(t.materialId, (usedByMaterial.get(t.materialId) ?? 0) + t.amount);
  for (const w of kitchen.wastage ?? []) usedByMaterial.set(w.materialId, (usedByMaterial.get(w.materialId) ?? 0) + w.quantity);
  const materials: DemoMaterial[] = purchases.map(({ bought, ...m }) => ({
    ...m,
    initialStock: round4(bought - (usedByMaterial.get(m.id) ?? 0)),
    dateAdded: at(30),
  }));

  const experiments = kitchen.experiments.map(({ daysAgo, ...exp }) => ({ id: exp.id, name: exp.name, date: at(daysAgo), materials: exp.materials, ...(exp.notes && { notes: exp.notes }) }));

  const settings = {
    name: kitchen.name,
    logo: '',
    primaryColor: '#00797B',
    address: kitchen.address,
    phone: kitchen.phone,
    email,
    currency: { code: 'INR', symbol: '₹' },
    categories: ['Raw Materials', 'Packaging Materials'],
    paymentFeeRates: DEMO_FEE_RATES,
    // Monthly overheads, so the dashboard can show a True Profit. They start on the day of the first order, so months
    // before the sample's trading do not show overheads with no sales against them.
    fixedCosts: kitchen.fixedCosts.map(fc => ({ ...fc, startDate: at(FIRST_ORDER_DAYS_AGO) })),
  };

  // ── Price log: what was paid for each material ────────────────────────────
  // Everything opened at its price 30 days ago. Materials in `topUps` were topped up later at a different price, so the
  // history has something to show. The opening and the top-up are worked out so that the blended average comes out at
  // the material's current cost (what `purchases` says), the same way a real restock would leave it.
  const round6 = (n: number) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;
  const openingCost = (m: KitchenPurchase) => m.costPerUnit * (kitchen.topUps[m.id]?.openedAt ?? 1);
  const priceLog: PriceLogEntry[] = purchases.flatMap(m => {
    const opened = at(30);
    const entry = (n: number, date: string, unitCost: number, quantity: number, macAfter: number, source: PriceLogEntry['source']): PriceLogEntry => ({
      id: `pl_${m.id}_${n}`, materialId: m.id, date, unit: m.unit, unitCost: round6(unitCost), quantity: round6(quantity),
      macAfter: round6(macAfter), source, createdAt: Date.parse(`${date}T08:00:00Z`) + n,
    });
    const topUp = kitchen.topUps[m.id];
    if (!topUp) return [entry(1, opened, m.costPerUnit, m.bought, m.costPerUnit, 'initial')];
    const firstQty = m.bought * (1 - topUp.share);
    const firstCost = openingCost(m);
    const laterQty = m.bought * topUp.share;
    const laterCost = (m.costPerUnit * m.bought - firstQty * firstCost) / laterQty;
    return [
      entry(1, opened, firstCost, firstQty, firstCost, 'initial'),
      entry(2, at(topUp.daysAgo), laterCost, laterQty, m.costPerUnit, 'restock'),
    ];
  });

  // Priced when the materials cost what they opened at: an item whose ingredients got dearer since shows it (utils/pricing).
  const atOpening = purchases.map(m => ({ id: m.id, unit: m.unit, costPerUnit: round6(openingCost(m)) })) as never;
  const menu: DemoMenuItem[] = menuBase.map(item => ({
    ...item,
    // What is on the shelf: the batches' unsold units.
    finishedGoodsStock: round4(productionRuns.filter(r => r.recipeId === item.id).reduce((s, r) => s + r.remainingQuantity, 0)),
    ...(kitchen.pricedDaysAgo !== undefined && item.sellingPrice > 0 && pricingStamp(costView(item, menuBase), atOpening, at(kitchen.pricedDaysAgo))),
  }));

  const wastageLogs: WastageLog[] = (kitchen.wastage ?? []).map((w, i) => ({
    id: `waste_${i + 1}`, type: 'material', itemId: w.materialId, quantity: w.quantity,
    cost: round2(w.quantity * purchases.find(m => m.id === w.materialId)!.costPerUnit), date: at(w.daysAgo), reason: w.reason,
  }));

  return { settings, materials, menu, orders, productionRuns, experiments, priceLog, wastageLogs };
}
