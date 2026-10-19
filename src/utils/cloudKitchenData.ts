import type { KitchenCatalogue, KitchenOrderRow } from './demoData';
import { buildKitchenData } from './demoData';

/**
 * A sample cloud kitchen: thalis, biryani and paneer butter masala cooked to order, a makhani gravy made ahead and kept
 * by the kg, and the odd cake, with three weeks of trading. Built for the demo video (and for any account that should
 * look like a kitchen rather than a bakery): paneer was restocked 20% dearer six days ago, so Paneer Butter Masala shows
 * a price alert under its 65% target; kasuri methi runs low; and the last gravy batch with stock is past its date.
 */

// Days ago 20 → today: how many of each dish sold, in a weekly rhythm (index = days ago % 7).
const THALIS = [6, 8, 5, 9, 7, 4, 10];
const BIRYANIS = [5, 7, 4, 8, 6, 9, 6];
const PANEER = [3, 4, 2, 5, 3, 6, 4];

const CUSTOMERS: [string, string][] = [
  ['Meera Iyer', '+91 98450 11201'], ['Rahul Desai', '+91 98450 11202'], ['Fatima Sheikh', '+91 98860 11203'],
  ['Karthik Rao', '+91 98860 11204'], ['Ananya Bose', '+91 99001 11205'], ['Suresh Pillai', '+91 99001 11206'],
  ['Pooja Kulkarni', '+91 99720 11207'], ['Arvind Menon', '+91 99720 11208'], ['Divya Hegde', '+91 97420 11209'],
  ['Sameer Khan', '+91 97420 11210'], ['Lakshmi Narayan', '+91 90350 11211'], ['Neel Joshi', '+91 90350 11212'],
];
const TEAM_LUNCH: [string, string] = ['Brightpath Software (team lunch)', '+91 80410 11290'];

function orders(): KitchenOrderRow[] {
  const rows: KitchenOrderRow[] = [];
  let n = 0;
  const who = () => CUSTOMERS[(n * 5) % CUSTOMERS.length];
  for (let daysAgo = 20; daysAgo >= 0; daysAgo--) {
    const day = daysAgo % 7;
    const add = (item: string, quantity: number, customer: [string, string] = who()) => {
      // Every other order goes out with a courier: the customer pays ₹40 for it, the courier costs ₹55.
      rows.push({ item, quantity, daysAgo, customer: customer[0], phone: customer[1], ...(n % 2 === 1 && { delivery: { charge: 40, fee: 55 } }) });
      n++;
    };
    // Thalis come in two or three orders a day; Meera takes two every third day.
    const thalis = THALIS[day];
    if (daysAgo % 3 === 0) add('menu_thali', 2, CUSTOMERS[0]);
    add('menu_thali', Math.ceil(thalis / 2));
    add('menu_thali', Math.floor(thalis / 2));
    add('menu_biryani', Math.ceil(BIRYANIS[day] / 2));
    add('menu_biryani', Math.floor(BIRYANIS[day] / 2));
    add('menu_pbm', PANEER[day]);
    // A weekly team lunch, and a birthday cake every five days.
    if (day === 4) rows.push({ item: 'menu_thali', quantity: 15, daysAgo, customer: TEAM_LUNCH[0], phone: TEAM_LUNCH[1], method: 'upi', discount: 200 });
    if (daysAgo % 5 === 2) add('menu_cake', 1);
  }
  return rows;
}

export const CLOUD_KITCHEN: KitchenCatalogue = {
  name: 'Annapurna Cloud Kitchen',
  address: 'No. 7, 5th Cross, HSR Layout, Bengaluru 560102',
  phone: '+91 98450 00277',
  // Prices are typical Bengaluru wholesale rates in rupees, per gram / ml / piece.
  purchases: [
    { id: 'm_rice', name: 'Basmati Rice', unit: 'g', bought: 62000, costPerUnit: 0.11, category: 'Raw Materials', threshold: 8000 },
    { id: 'm_dal', name: 'Toor Dal', unit: 'g', bought: 17000, costPerUnit: 0.15, category: 'Raw Materials', threshold: 3000 },
    { id: 'm_veg', name: 'Mixed Vegetables', unit: 'g', bought: 38000, costPerUnit: 0.05, category: 'Raw Materials', threshold: 4000 },
    { id: 'm_atta', name: 'Whole Wheat Atta', unit: 'g', bought: 21000, costPerUnit: 0.048, category: 'Raw Materials', threshold: 3000 },
    { id: 'm_oil', name: 'Sunflower Oil', unit: 'ml', bought: 9000, costPerUnit: 0.14, category: 'Raw Materials', threshold: 1500 },
    { id: 'm_ghee', name: 'Ghee', unit: 'g', bought: 4000, costPerUnit: 0.62, category: 'Raw Materials', threshold: 500 },
    { id: 'm_spices', name: 'Masalas & Spices', unit: 'g', bought: 5000, costPerUnit: 0.5, category: 'Raw Materials', threshold: 600 },
    { id: 'm_curd', name: 'Curd', unit: 'g', bought: 29000, costPerUnit: 0.08, category: 'Raw Materials', threshold: 2000 },
    { id: 'm_onion', name: 'Onion', unit: 'g', bought: 30000, costPerUnit: 0.035, category: 'Raw Materials', threshold: 4000 },
    { id: 'm_tomato', name: 'Tomato', unit: 'g', bought: 33000, costPerUnit: 0.03, category: 'Raw Materials', threshold: 4000 },
    { id: 'm_chicken', name: 'Chicken (curry cut)', unit: 'g', bought: 36000, costPerUnit: 0.24, category: 'Raw Materials', threshold: 4000 },
    { id: 'm_gg', name: 'Ginger-Garlic Paste', unit: 'g', bought: 3500, costPerUnit: 0.16, category: 'Raw Materials', threshold: 400 },
    { id: 'm_paneer', name: 'Paneer', unit: 'g', bought: 15000, costPerUnit: 0.38, category: 'Raw Materials', threshold: 2000 },
    { id: 'm_butter', name: 'Butter', unit: 'g', bought: 2500, costPerUnit: 0.55, category: 'Raw Materials', threshold: 400 },
    { id: 'm_cream', name: 'Fresh Cream', unit: 'g', bought: 3000, costPerUnit: 0.22, category: 'Raw Materials', threshold: 400 },
    // Deliberately runs low, so the demo shows a Low Stock alert.
    { id: 'm_kasuri', name: 'Kasuri Methi', unit: 'g', bought: 200, costPerUnit: 0.9, category: 'Raw Materials', threshold: 100 },
    { id: 'm_cakemix', name: 'Eggless Chocolate Cake Premix', unit: 'g', bought: 3000, costPerUnit: 0.32, category: 'Raw Materials', threshold: 500 },
    { id: 'm_whip', name: 'Whipping Cream', unit: 'g', bought: 1500, costPerUnit: 0.4, category: 'Raw Materials', threshold: 300 },
    { id: 'm_box', name: 'Meal Box (3 compartments)', unit: 'pcs', bought: 600, costPerUnit: 9, category: 'Packaging Materials', threshold: 80 },
    { id: 'm_cakebox', name: 'Cake Box', unit: 'pcs', bought: 20, costPerUnit: 25, category: 'Packaging Materials', threshold: 3 },
  ],
  menu: [
    // Made ahead and kept by the kg: its recipe is for 1 kg.
    {
      id: 'menu_gravy', name: 'Makhani Gravy', sellingPrice: 0, emoji: '🍅', notForSale: true, countedIn: 'kg',
      recipe: [
        { materialId: 'm_tomato', amount: 700, unit: 'g' },
        { materialId: 'm_onion', amount: 200, unit: 'g' },
        { materialId: 'm_butter', amount: 60, unit: 'g' },
        { materialId: 'm_cream', amount: 80, unit: 'g' },
        { materialId: 'm_gg', amount: 30, unit: 'g' },
        { materialId: 'm_spices', amount: 25, unit: 'g' },
        { materialId: 'm_kasuri', amount: 5, unit: 'g' },
        { materialId: 'm_oil', amount: 30, unit: 'ml' },
      ],
    },
    {
      id: 'menu_thali', name: 'Veg Thali', sellingPrice: 180, emoji: '🍛', madeToOrder: true,
      recipe: [
        { materialId: 'm_rice', amount: 120, unit: 'g' },
        { materialId: 'm_dal', amount: 60, unit: 'g' },
        { materialId: 'm_veg', amount: 150, unit: 'g' },
        { materialId: 'm_atta', amount: 80, unit: 'g' },
        { materialId: 'm_oil', amount: 15, unit: 'ml' },
        { materialId: 'm_ghee', amount: 5, unit: 'g' },
        { materialId: 'm_spices', amount: 8, unit: 'g' },
        { materialId: 'm_curd', amount: 80, unit: 'g' },
        { materialId: 'm_onion', amount: 40, unit: 'g' },
        { materialId: 'm_tomato', amount: 40, unit: 'g' },
        { materialId: 'm_box', amount: 1, unit: 'pcs' },
      ],
    },
    {
      id: 'menu_biryani', name: 'Chicken Biryani', sellingPrice: 260, emoji: '🍗', madeToOrder: true,
      recipe: [
        { materialId: 'm_rice', amount: 180, unit: 'g' },
        { materialId: 'm_chicken', amount: 220, unit: 'g' },
        { materialId: 'm_onion', amount: 80, unit: 'g' },
        { materialId: 'm_curd', amount: 50, unit: 'g' },
        { materialId: 'm_ghee', amount: 15, unit: 'g' },
        { materialId: 'm_spices', amount: 12, unit: 'g' },
        { materialId: 'm_gg', amount: 15, unit: 'g' },
        { materialId: 'm_oil', amount: 10, unit: 'ml' },
        { materialId: 'm_box', amount: 1, unit: 'pcs' },
      ],
    },
    // A plate takes 200 g of the gravy kept on the shelf; its own target margin, so the paneer price rise shows.
    {
      id: 'menu_pbm', name: 'Paneer Butter Masala', sellingPrice: 240, emoji: '🧀', madeToOrder: true, targetMargin: 65,
      recipe: [
        { materialId: 'm_paneer', amount: 150, unit: 'g' },
        { materialId: 'm_oil', amount: 10, unit: 'ml' },
        { materialId: 'm_box', amount: 1, unit: 'pcs' },
      ],
      parts: [{ itemId: 'menu_gravy', quantity: 0.2 }],
    },
    {
      id: 'menu_cake', name: 'Eggless Chocolate Cake 1 kg', sellingPrice: 850, emoji: '🎂', madeToOrder: true,
      recipe: [
        { materialId: 'm_cakemix', amount: 450, unit: 'g' },
        { materialId: 'm_whip', amount: 200, unit: 'g' },
        { materialId: 'm_oil', amount: 60, unit: 'ml' },
        { materialId: 'm_cakebox', amount: 1, unit: 'pcs' },
      ],
    },
  ],
  orders: orders(),
  // Makhani gravy, 3 kg every few days (a little spilled once); the oldest batch still holding gravy is past its date.
  runs: [
    ['run_1', 'menu_gravy', 3, undefined, 21, 4],
    ['run_2', 'menu_gravy', 3, undefined, 18, 4],
    ['run_3', 'menu_gravy', 3, undefined, 15, 4],
    ['run_4', 'menu_gravy', 3, undefined, 12, 4],
    ['run_5', 'menu_gravy', 3, 2.8, 9, 4],
    ['run_6', 'menu_gravy', 3, undefined, 6, 4],
    ['run_7', 'menu_gravy', 3, undefined, 3, 4],
    ['run_8', 'menu_gravy', 3, undefined, 1, 4],
  ],
  topUps: {
    m_paneer: { share: 0.8, openedAt: 1 / 1.2, daysAgo: 6 },  // paneer is 20% dearer than when the menu was priced
    m_chicken: { share: 0.5, openedAt: 0.95, daysAgo: 11 },
    m_tomato: { share: 0.5, openedAt: 1.15, daysAgo: 10 },    // tomatoes got cheaper
  },
  pricedDaysAgo: 30,
  experiments: [
    {
      id: 'exp_1', name: 'Millet Khichdi Trial', daysAgo: 3,
      materials: [
        { materialId: 'm_dal', amount: 150, unit: 'g' },
        { materialId: 'm_veg', amount: 200, unit: 'g' },
        { materialId: 'm_ghee', amount: 20, unit: 'g' },
        { materialId: 'm_spices', amount: 10, unit: 'g' },
      ],
      notes: 'Foxtail millet instead of rice for a lighter tiffin. Good taste; needs 10 minutes more on the stove.',
    },
  ],
  wastage: [
    { materialId: 'm_tomato', quantity: 2000, daysAgo: 8, reason: 'Tomatoes went soft in the heat' },
    { materialId: 'm_curd', quantity: 1000, daysAgo: 4, reason: 'Curd turned sour' },
  ],
  // A small cloud kitchen's month: rent, gas and power, two helpers, phone and internet.
  fixedCosts: [
    { id: 'fc_rent', name: 'Kitchen rent', monthlyAmount: 18000 },
    { id: 'fc_power', name: 'Gas & electricity', monthlyAmount: 4500 },
    { id: 'fc_helpers', name: 'Two helpers', monthlyAmount: 16000 },
    { id: 'fc_phone', name: 'Phone & internet', monthlyAmount: 800 },
  ],
};

/** The cloud kitchen as an account holds it; `email` is what its settings (and bills) show. */
export const buildCloudKitchenData = (userId: string, today: string, email?: string) => buildKitchenData(CLOUD_KITCHEN, userId, today, email);
