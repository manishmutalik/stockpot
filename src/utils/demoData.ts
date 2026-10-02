import { convertAmount } from './conversions';
import { stampFor, type OrderStamp } from './orderPricing';
import type { PaymentMethod, PriceLogEntry } from '../types';

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
}
export interface DemoOrder {
  id: string; menuItemId: string; quantity: number; date: string;
  customerName: string; customerPhone: string; fulfilled: boolean;
}
/** A demo order carries its price and cost stamp, like every order made in the app. */
export type DemoOrderWithStamp = DemoOrder & OrderStamp & { paymentMethod: PaymentMethod; paymentFeeRate: number; discount?: number };
export interface DemoRun {
  id: string; recipeId: string; quantityProduced: number; quantityYield?: number; remainingQuantity: number;
  date: string; expiryDate: string; purpose: string; costTotal: number; createdAt: number;
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

export function buildDemoData(userId: string, today: string) {
  const at = (daysAgo: number) => dayOffset(today, daysAgo);

  // ── Materials: what was bought (opening stock), price, and alert level ─────
  // Current stock is worked out below from what the production runs used.
  // Prices are typical Indian retail/wholesale rates in rupees, per gram / ml / piece.
  const purchases = [
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
  ];


  // ── Menu: recipes are per single unit ──────────────────────────────────────
  const menuBase = [
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
  ];


  const recipeUnitCost = (menuId: string) => {
    const item = menuBase.find(m => m.id === menuId)!;
    return item.recipe.reduce((sum, req) => {
      const mat = purchases.find(m => m.id === req.materialId)!;
      return sum + convertAmount(req.amount, req.unit, mat.unit) * mat.costPerUnit;
    }, 0);
  };

  // ── Orders (one per customer) ──────────────────────────────────────────────
  const orderRows: [string, number, number, string, string][] = [
    // [menu item, quantity, days ago, customer, phone]
    ['menu_croissant', 8, 0, 'Priya Sharma', '+91 98450 10101'],
    ['menu_muffin', 12, 0, 'Rohan Mehta', '+91 98450 10102'],
    ['menu_bread', 4, 0, 'Sunita Iyer', '+91 98450 10103'],
    ['menu_croissant', 15, 1, 'Brew & Bite Café', '+91 98860 20201'],
    ['menu_muffin', 8, 1, 'Arjun Nair', '+91 98860 20202'],
    ['menu_bread', 6, 1, 'Kavita Reddy', '+91 98860 20203'],
    ['menu_croissant', 6, 2, 'Hotel Sai Residency', '+91 99001 30301'],
    ['menu_muffin', 10, 2, 'Tapri Corner Café', '+91 99001 30302'],
    ['menu_bread', 8, 3, 'Imran Qureshi', '+91 99720 40401'],
    ['menu_croissant', 12, 3, 'Neha Gupta', '+91 99720 40402'],
    ['menu_muffin', 14, 4, 'Vikram Singh', '+91 97420 50501'],
    ['menu_croissant', 5, 4, 'Infosys Road Office Party', '+91 97420 50502'],
    ['menu_bread', 10, 5, 'Daily Fresh Grocers', '+91 90350 60601'],
    ['menu_croissant', 10, 5, 'Hotel Udupi Grand', '+91 90350 60602'],
    ['menu_muffin', 15, 6, 'Greenfield School Fete', '+91 80410 70701'],
    ['menu_bread', 5, 6, 'Residents Welfare Association', '+91 80410 70702'],
  ];
  // Each order is stamped with what its item sold for and cost to make, as the app does when an
  // order is created, so the demo's figures are exact rather than "estimated".
  // Orders are paid in a mix of ways, each carrying the fee rate in force (see DEMO_FEE_RATES), and one
  // large café order was given a bulk discount, so the demo shows payment fees and discounts too.
  const methods: PaymentMethod[] = ['upi', 'cash', 'upi', 'card', 'upi', 'cash'];
  const orders: DemoOrderWithStamp[] = orderRows.map(([menuItemId, quantity, daysAgo, customerName, customerPhone], i) => {
    const paymentMethod = methods[i % methods.length];
    return {
      id: `ord_${i + 1}`, menuItemId, quantity, date: at(daysAgo), customerName, customerPhone,
      fulfilled: daysAgo > 0,
      ...stampFor(menuBase.find(m => m.id === menuItemId)!, purchases),
      paymentMethod, paymentFeeRate: DEMO_FEE_RATES[paymentMethod] ?? 0,
      ...(customerName === 'Brew & Bite Café' && { discount: 150 }),
    };
  });

  // ── Production runs: [id, recipe, produced, sellable (if some was lost), days ago, shelf life in days] ──
  const runRows: [string, string, number, number | undefined, number, number][] = [
    ['run_1', 'menu_croissant', 30, undefined, 6, 2],
    ['run_2', 'menu_muffin', 30, undefined, 6, 3],
    ['run_3', 'menu_bread', 15, undefined, 6, 2],
    ['run_4', 'menu_croissant', 20, undefined, 4, 2],
    ['run_5', 'menu_muffin', 20, 19, 4, 3], // one muffin lost at the bench
    ['run_6', 'menu_bread', 15, undefined, 4, 2],
    ['run_7', 'menu_croissant', 25, undefined, 1, 2],
    ['run_8', 'menu_muffin', 25, undefined, 2, 3],
    ['run_9', 'menu_bread', 15, undefined, 2, 2],
  ];

  // Units ordered per item are taken from the oldest batches first (FIFO).
  const orderedByItem = new Map<string, number>();
  for (const o of orders) orderedByItem.set(o.menuItemId, (orderedByItem.get(o.menuItemId) ?? 0) + o.quantity);

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
      remainingByRun.set(id, yieldUnits - taken);
    }
  }

  const productionRuns: DemoRun[] = runRows.map(([id, recipeId, produced, sellable, daysAgo, shelfLife]) => ({
    id, recipeId,
    quantityProduced: produced,
    ...(sellable !== undefined ? { quantityYield: sellable } : {}),
    remainingQuantity: remainingByRun.get(id)!,
    date: at(daysAgo),
    expiryDate: at(daysAgo - shelfLife),
    purpose: id === 'run_7' ? 'customer_order' : 'market_stock',
    // Snapshot of the material cost of everything produced, as the app records it.
    costTotal: round2(produced * recipeUnitCost(recipeId)),
    createdAt: Date.parse(today + 'T12:00:00Z') - daysAgo * DAY_MS,
  }));

  const menu: DemoMenuItem[] = menuBase.map(item => ({
    ...item,
    // What is on the shelf: the batches' unsold units.
    finishedGoodsStock: productionRuns.filter(r => r.recipeId === item.id).reduce((s, r) => s + r.remainingQuantity, 0),
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
  const materials: DemoMaterial[] = purchases.map(({ bought, ...m }) => ({
    ...m,
    initialStock: round4(bought - (usedByMaterial.get(m.id) ?? 0)),
    dateAdded: at(30),
  }));

  const experiments = [
    {
      id: 'exp_1',
      name: 'Atta Croissant Trial',
      date: at(2),
      materials: [
        { materialId: 'm_atta', amount: 200, unit: 'g' },
        { materialId: 'm_sugar', amount: 20, unit: 'g' },
        { materialId: 'm_butter', amount: 80, unit: 'g' },
      ],
      notes: 'Tried replacing maida with whole wheat atta. Layers did not separate well and the crumb was dense. Tastes good but the texture is off.',
    },
  ];


  const settings = {
    name: 'Stockpot Demo Kitchen',
    logo: '',
    primaryColor: '#10b981',
    address: '14, 80 Feet Road, Indiranagar, Bengaluru 560038',
    phone: '+91 98450 00199',
    email: `${userId}@demo.stockpot.app`,
    currency: { code: 'INR', symbol: '₹' },
    categories: ['Raw Materials', 'Packaging Materials'],
    paymentFeeRates: DEMO_FEE_RATES,
    // Typical monthly overheads for a small Bengaluru bakery, so the dashboard can show a True Profit.
    fixedCosts: [
      { id: 'fc_rent', name: 'Shop rent', monthlyAmount: 15000 },
      { id: 'fc_power', name: 'Gas & electricity', monthlyAmount: 4500 },
      { id: 'fc_helper', name: "Helper's salary", monthlyAmount: 12000 },
    ],
  };

  // ── Price log: what was paid for each material ────────────────────────────
  // Everything opened at its price 30 days ago. Butter, eggs, chocolate chips and yeast were topped up
  // later at a different price, so the history has something to show. The opening and the top-up are
  // worked out so that the blended average comes out at the material's current cost (what `purchases`
  // says), the same way a real restock would leave it.
  const topUps: Record<string, { share: number; openedAt: number; daysAgo: number }> = {
    m_butter: { share: 0.4, openedAt: 0.92, daysAgo: 12 },   // butter got dearer
    m_eggs: { share: 0.4, openedAt: 0.9, daysAgo: 9 },       // so did eggs
    m_chips: { share: 0.35, openedAt: 0.95, daysAgo: 16 },
    m_yeast: { share: 0.3, openedAt: 1.1, daysAgo: 7 },      // yeast got cheaper
  };
  const round6 = (n: number) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;
  const priceLog: PriceLogEntry[] = purchases.flatMap(m => {
    const opened = at(30);
    const entry = (n: number, date: string, unitCost: number, quantity: number, macAfter: number, source: PriceLogEntry['source']): PriceLogEntry => ({
      id: `pl_${m.id}_${n}`, materialId: m.id, date, unit: m.unit, unitCost: round6(unitCost), quantity: round6(quantity),
      macAfter: round6(macAfter), source, createdAt: Date.parse(`${date}T08:00:00Z`) + n,
    });
    const topUp = topUps[m.id];
    if (!topUp) return [entry(1, opened, m.costPerUnit, m.bought, m.costPerUnit, 'initial')];
    const firstQty = m.bought * (1 - topUp.share);
    const firstCost = m.costPerUnit * topUp.openedAt;
    const laterQty = m.bought * topUp.share;
    const laterCost = (m.costPerUnit * m.bought - firstQty * firstCost) / laterQty;
    return [
      entry(1, opened, firstCost, firstQty, firstCost, 'initial'),
      entry(2, at(topUp.daysAgo), laterCost, laterQty, m.costPerUnit, 'restock'),
    ];
  });

  return { settings, materials, menu, orders, productionRuns, experiments, priceLog };
}
