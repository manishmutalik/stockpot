import { convertAmount } from './conversions';

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
export interface DemoRun {
  id: string; recipeId: string; quantityProduced: number; quantityYield?: number; remainingQuantity: number;
  date: string; expiryDate: string; purpose: string; costTotal: number; createdAt: number;
}

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
  const purchases = [
    { id: 'm_flour', name: 'All-Purpose Flour', unit: 'g', bought: 60000, costPerUnit: 0.002, category: 'Raw Materials', threshold: 10000 },
    { id: 'm_sugar', name: 'Granulated Sugar', unit: 'g', bought: 25000, costPerUnit: 0.0015, category: 'Raw Materials', threshold: 5000 },
    { id: 'm_butter', name: 'Unsalted Butter', unit: 'g', bought: 12000, costPerUnit: 0.012, category: 'Raw Materials', threshold: 2000 },
    { id: 'm_eggs', name: 'Large Eggs', unit: 'pcs', bought: 150, costPerUnit: 0.25, category: 'Raw Materials', threshold: 30 },
    { id: 'm_milk', name: 'Whole Milk', unit: 'ml', bought: 20000, costPerUnit: 0.0012, category: 'Raw Materials', threshold: 4000 },
    // Deliberately runs low so the demo shows a Low Stock alert.
    { id: 'm_yeast', name: 'Active Dry Yeast', unit: 'g', bought: 1000, costPerUnit: 0.05, category: 'Raw Materials', threshold: 300 },
    { id: 'm_chips', name: 'Chocolate Chips', unit: 'g', bought: 8000, costPerUnit: 0.008, category: 'Raw Materials', threshold: 1500 },
    { id: 'm_box', name: 'Packaging Box', unit: 'pcs', bought: 300, costPerUnit: 0.50, category: 'Packaging Materials', threshold: 50 },
  ];

  // ── Menu: recipes are per single unit ──────────────────────────────────────
  const menuBase = [
    {
      id: 'menu_croissant', name: 'Classic Croissant', sellingPrice: 4.50, emoji: '🥐',
      recipe: [
        { materialId: 'm_flour', amount: 150, unit: 'g' },
        { materialId: 'm_sugar', amount: 15, unit: 'g' },
        { materialId: 'm_butter', amount: 75, unit: 'g' },
        { materialId: 'm_milk', amount: 50, unit: 'ml' },
        { materialId: 'm_yeast', amount: 5, unit: 'g' },
      ],
    },
    {
      id: 'menu_muffin', name: 'Chocolate Muffin', sellingPrice: 3.75, emoji: '🧁',
      recipe: [
        { materialId: 'm_flour', amount: 120, unit: 'g' },
        { materialId: 'm_sugar', amount: 80, unit: 'g' },
        { materialId: 'm_butter', amount: 50, unit: 'g' },
        { materialId: 'm_eggs', amount: 1, unit: 'pcs' },
        { materialId: 'm_milk', amount: 60, unit: 'ml' },
        { materialId: 'm_chips', amount: 40, unit: 'g' },
      ],
    },
    {
      id: 'menu_sourdough', name: 'Sourdough Loaf', sellingPrice: 6.00, emoji: '🍞',
      recipe: [
        { materialId: 'm_flour', amount: 500, unit: 'g' },
        { materialId: 'm_yeast', amount: 10, unit: 'g' },
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
    ['menu_croissant', 8, 0, 'John Smith', '555-0101'],
    ['menu_muffin', 12, 0, 'Alice Green', '555-0102'],
    ['menu_sourdough', 4, 0, 'Robert Vance', '555-0103'],
    ['menu_croissant', 15, 1, 'Cafe Central', '555-0201'],
    ['menu_muffin', 8, 1, 'David Lee', '555-0202'],
    ['menu_sourdough', 6, 1, 'Emily Davis', '555-0203'],
    ['menu_croissant', 6, 2, 'Local Inn', '555-0301'],
    ['menu_muffin', 10, 2, 'Bake Fanatic', '555-0302'],
    ['menu_sourdough', 8, 3, 'George Miller', '555-0401'],
    ['menu_croissant', 12, 3, 'Sarah Connor', '555-0402'],
    ['menu_muffin', 14, 4, 'Kevin Hart', '555-0501'],
    ['menu_croissant', 5, 4, 'Office Gathering', '555-0502'],
    ['menu_sourdough', 10, 5, 'Daily Grind', '555-0601'],
    ['menu_croissant', 10, 5, 'Hotel Continental', '555-0602'],
    ['menu_muffin', 15, 6, 'School Event', '555-0701'],
    ['menu_sourdough', 5, 6, 'Community Center', '555-0702'],
  ];
  const orders: DemoOrder[] = orderRows.map(([menuItemId, quantity, daysAgo, customerName, customerPhone], i) => ({
    id: `ord_${i + 1}`, menuItemId, quantity, date: at(daysAgo), customerName, customerPhone,
    fulfilled: daysAgo > 0,
  }));

  // ── Production runs: [id, recipe, produced, sellable (if some was lost), days ago, shelf life in days] ──
  const runRows: [string, string, number, number | undefined, number, number][] = [
    ['run_1', 'menu_croissant', 30, undefined, 6, 2],
    ['run_2', 'menu_muffin', 30, undefined, 6, 3],
    ['run_3', 'menu_sourdough', 15, undefined, 6, 2],
    ['run_4', 'menu_croissant', 20, undefined, 4, 2],
    ['run_5', 'menu_muffin', 20, 19, 4, 3], // one muffin lost at the bench
    ['run_6', 'menu_sourdough', 15, undefined, 4, 2],
    ['run_7', 'menu_croissant', 25, undefined, 1, 2],
    ['run_8', 'menu_muffin', 25, undefined, 2, 3],
    ['run_9', 'menu_sourdough', 15, undefined, 2, 2],
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
      name: 'Gluten-Free Croissant Attempt',
      date: at(2),
      materials: [
        { materialId: 'm_flour', amount: 200, unit: 'g' },
        { materialId: 'm_sugar', amount: 20, unit: 'g' },
        { materialId: 'm_butter', amount: 80, unit: 'g' },
      ],
      notes: 'Tried replacing AP Flour with almond flour. Dough was too crumbly, did not rise well. Tastes good but texture is off.',
    },
  ];

  const settings = {
    name: 'Stockpot Demo Kitchen',
    logo: '',
    primaryColor: '#10b981',
    address: '123 Market Street, Foodville',
    phone: '555-0199',
    email: `${userId}@demo.stockpot.app`,
    currency: { code: 'INR', symbol: '₹' },
    categories: ['Raw Materials', 'Packaging Materials'],
  };

  return { settings, materials, menu, orders, productionRuns, experiments };
}
