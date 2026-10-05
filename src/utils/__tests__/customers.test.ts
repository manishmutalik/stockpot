import { describe, it, expect } from 'vitest';
import {
  buildCustomerProfiles, buildNudgeMessage, buildNudgeUrl, countByStatus, customerLabels, customersForTab, customerStatus, orderRhythm,
  type CustomerProfile,
} from '../customers';
import { addDays } from '../localDate';

const TODAY = '2026-06-30';
const daysAgo = (n: number) => addDays(TODAY, -n);

const materials: any[] = [{ id: 'flour', unit: 'kg', costPerUnit: 40, category: 'Raw Materials' }];
const menu: any[] = [
  { id: 'cake', name: 'Chocolate Cake', sellingPrice: 100, recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }] }, // costs 20 a cake
  { id: 'cookie', name: 'Cookie', sellingPrice: 10, recipe: [] },
];
const NO_GST = { gstApplicable: false };

/** An order, stamped as the app writes it: sells for 100 and costs 20, or as given. */
let n = 0;
const order = (over: Record<string, any> = {}): any => ({
  id: `o${String(++n).padStart(3, '0')}`, menuItemId: 'cake', quantity: 1, date: daysAgo(1),
  unitPriceAtSale: 100, unitIngredientCostAtSale: 20, unitPackagingCostAtSale: 0, unitInputGstAtSale: 0, itemNameAtSale: 'Chocolate Cake',
  customerName: 'Priya Sharma', customerPhone: '+91 98450 10101', ...over,
});
/** Orders for one customer on the given days ago. */
const ordersOn = (days: number[], over: Record<string, any> = {}) => days.map(d => order({ date: daysAgo(d), ...over }));
const profiles = (orders: any[]) => buildCustomerProfiles({ orders, menu, materials, settings: NO_GST, today: TODAY });
const one = (orders: any[]) => profiles(orders)[0];

describe('identity', () => {
  it('merges the same phone number typed differently into one customer', () => {
    const list = profiles([order({ customerPhone: '+91 98450 10101' }), order({ customerPhone: '9845010101' }), order({ customerPhone: '098450-10101' })]);
    expect(list).toHaveLength(1);
    expect(list[0].orderCount).toBe(3);
  });

  it('keeps two phone numbers apart', () => {
    expect(profiles([order({ customerPhone: '9845010101' }), order({ customerPhone: '9845010102' })])).toHaveLength(2);
  });

  it('knows a customer without a phone by name, ignoring case and spacing, and marks them as having no phone', () => {
    const list = profiles([order({ customerPhone: undefined, customerName: 'Rohan  Mehta' }), order({ customerPhone: '', customerName: 'rohan mehta' })]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ hasPhone: false, orderCount: 2 });
    expect(list[0].phone).toBeUndefined();
  });

  it('leaves out orders with no name and no phone', () => {
    expect(profiles([order({ customerName: undefined, customerPhone: undefined }), order({ customerName: '  ', customerPhone: '' })])).toEqual([]);
  });

  it('uses the most recent name and phone for display', () => {
    const p = one([order({ date: daysAgo(10), customerName: 'Priya' }), order({ date: daysAgo(2), customerName: 'Priya Sharma' })]);
    expect(p.name).toBe('Priya Sharma');
    expect(p.hasPhone).toBe(true);
  });

  it('counts a multi-item order once', () => {
    const p = one([
      order({ orderGroupId: 'g', date: daysAgo(3) }),
      order({ orderGroupId: 'g', date: daysAgo(3), menuItemId: 'cookie', unitPriceAtSale: 10, unitIngredientCostAtSale: 0, itemNameAtSale: 'Cookie', quantity: 5 }),
      order({ date: daysAgo(10) }),
    ]);
    expect(p.orderCount).toBe(2);
    expect(p.firstOrder).toBe(daysAgo(10));
    expect(p.lastOrder).toBe(daysAgo(3));
  });
});

describe('what a customer is worth', () => {
  it('totals what they paid before tax and what the business made on them', () => {
    const p = one([order({ quantity: 2 }), order({ quantity: 1, discount: 30 })]);
    expect(p.totalSpent).toBe(200 + (100 - 30));
    expect(p.totalContribution).toBe(200 - 40 + (70 - 20));
  });

  it('counts a shared delivery charge and discount once per multi-item order', () => {
    const p = one([
      order({ orderGroupId: 'g', deliveryCharge: 40, deliveryFee: 25, discount: 10 }),
      order({ orderGroupId: 'g' }),
    ]);
    expect(p.totalSpent).toBe(200 + 40 - 10);
    expect(p.totalContribution).toBe(200 + 40 - 10 - 40 - 25);
  });

  it('is on the pre-GST base, like the rest of the app', () => {
    const p = buildCustomerProfiles({
      orders: [order({ unitPriceAtSale: 118 })], menu, materials, today: TODAY,
      settings: { gstApplicable: true, gstRate: 18, gstPricingMode: 'inclusive' },
    })[0];
    expect(p.totalSpent).toBeCloseTo(100, 6);
  });

  it('flags a customer whose orders are valued at today\'s prices', () => {
    expect(one([order()]).estimated).toBe(false);
    expect(one([order({ unitPriceAtSale: undefined, unitIngredientCostAtSale: undefined, unitPackagingCostAtSale: undefined })]).estimated).toBe(true);
  });

  it('lists their three favourite items by quantity, under the names the orders were made with', () => {
    const cookie = (q: number) => order({ menuItemId: 'cookie', itemNameAtSale: 'Cookie', quantity: q, unitPriceAtSale: 10 });
    const bun = order({ menuItemId: 'bun', itemNameAtSale: 'Bun', quantity: 3 });
    const tart = order({ menuItemId: 'tart', itemNameAtSale: 'Tart', quantity: 1 });
    const p = one([cookie(5), cookie(4), order({ quantity: 6 }), bun, tart]);
    expect(p.favouriteItems).toEqual(['Cookie', 'Chocolate Cake', 'Bun']);
  });
});

describe('orderRhythm', () => {
  it('has no rhythm before three order dates', () => {
    expect(orderRhythm([daysAgo(10)]).medianDays).toBeNull();
    expect(orderRhythm([daysAgo(10), daysAgo(3)]).medianDays).toBeNull();
  });

  it('is the median gap between order dates', () => {
    expect(orderRhythm([daysAgo(21), daysAgo(14), daysAgo(7)]).medianDays).toBe(7);
    expect(orderRhythm([daysAgo(30), daysAgo(20), daysAgo(18), daysAgo(8)]).medianDays).toBe(10); // gaps 10, 2, 10
    expect(orderRhythm([daysAgo(20), daysAgo(18), daysAgo(8), daysAgo(0)]).medianDays).toBe(8); // gaps 2, 10, 8
  });

  it('averages the two middle gaps when there is an even number', () => {
    expect(orderRhythm([daysAgo(30), daysAgo(26), daysAgo(18), daysAgo(8), daysAgo(0)]).medianDays).toBe(8); // gaps 4, 8, 10, 8
  });

  it('counts several orders on one day as one date', () => {
    expect(orderRhythm([daysAgo(14), daysAgo(14), daysAgo(7), daysAgo(0)]).medianDays).toBe(7);
    expect(orderRhythm([daysAgo(7), daysAgo(7), daysAgo(0)]).medianDays).toBeNull();
  });
});

describe('customerStatus', () => {
  const status = (orderCount: number, days: number, medianDays: number | null) => customerStatus({ orderCount, daysSinceLastOrder: days, medianDays });

  it('a first order is new for 30 days, then lapsed', () => {
    expect(status(1, 0, null)).toBe('new');
    expect(status(1, 30, null)).toBe('new');
    expect(status(1, 31, null)).toBe('lapsed');
  });

  it('two orders have no rhythm yet: active for 30 days, then lapsed', () => {
    expect(status(2, 5, null)).toBe('active');
    expect(status(2, 30, null)).toBe('active');
    expect(status(2, 31, null)).toBe('lapsed');
  });

  it('a weekly customer is active, due from a week, lapsed from two', () => {
    expect(status(5, 6, 7)).toBe('active');
    expect(status(5, 7, 7)).toBe('due');
    expect(status(5, 13, 7)).toBe('due');
    expect(status(5, 14, 7)).toBe('lapsed');
  });

  it('a customer who orders every 40 days is not called lapsed at 30 days', () => {
    expect(status(5, 31, 40)).toBe('active');
    expect(status(5, 40, 40)).toBe('due');
    expect(status(5, 79, 40)).toBe('due');
    expect(status(5, 80, 40)).toBe('lapsed');
  });

  it('floors stop a near-daily customer flipping to due or lapsed on a quiet day', () => {
    expect(status(20, 1, 1)).toBe('active');
    expect(status(20, 2, 1)).toBe('due');
    expect(status(20, 13, 1)).toBe('due');
    expect(status(20, 14, 1)).toBe('lapsed');
    expect(status(20, 3, 0)).toBe('due'); // several orders on consecutive visits, median gap 0
  });

  it('is never due for longer than it is lapsed', () => {
    for (const m of [0, 1, 2, 3, 7, 14, 30]) {
      const seen = Array.from({ length: 200 }, (_, d) => status(5, d, m));
      expect(seen.indexOf('lapsed')).toBeGreaterThan(-1);
      expect(seen.lastIndexOf('active')).toBeLessThan(seen.indexOf('lapsed'));
      expect(seen.includes('due') ? seen.indexOf('due') : Infinity).toBeLessThanOrEqual(seen.indexOf('lapsed'));
    }
  });
});

describe('buildCustomerProfiles status', () => {
  it('puts a customer who orders weekly and has not for 10 days under due', () => {
    const p = one(ordersOn([38, 31, 24, 17, 10]));
    expect(p).toMatchObject({ orderCount: 5, medianDaysBetweenOrders: 7, daysSinceLastOrder: 10, status: 'due' });
  });

  it('measures days from the business date given', () => {
    const base = ordersOn([38, 31, 24, 17, 10]);
    const at = (today: string) => buildCustomerProfiles({ orders: base, menu, materials, settings: NO_GST, today })[0];
    expect(at(TODAY).status).toBe('due');
    expect(at(addDays(TODAY, -4)).status).toBe('active'); // only 6 days after the last order
    expect(at(addDays(TODAY, 5)).status).toBe('lapsed'); // 15 days
  });

  it('does not count an order due in the future: it has not happened yet', () => {
    expect(profiles([order({ date: addDays(TODAY, 3) })])).toEqual([]);
    // ...and does not make a lapsed customer look active.
    const lapsed = one([order({ date: daysAgo(90) }), order({ date: addDays(TODAY, 3), preorder: true })]);
    expect(lapsed.status).toBe('lapsed');
    expect(lapsed.orderCount).toBe(1);
    expect(lapsed.daysSinceLastOrder).toBe(90);
  });

  it('does not count a cancelled order', () => {
    expect(profiles([order({ date: daysAgo(2), cancelledOn: daysAgo(1) })])).toEqual([]);
    const p = one([order({ date: daysAgo(40) }), order({ date: daysAgo(2), cancelledOn: daysAgo(1) })]);
    expect(p).toMatchObject({ orderCount: 1, daysSinceLastOrder: 40 });
  });

  it('counts a pre-order once it is due', () => {
    expect(one([order({ date: TODAY, preorder: true })])).toMatchObject({ orderCount: 1, status: 'new' });
  });

  it('a first order today makes a new customer', () => {
    expect(one([order({ date: TODAY })])).toMatchObject({ status: 'new', daysSinceLastOrder: 0 });
  });
});

describe('customerLabels', () => {
  const keys = ['phone:9845010101', 'phone:9845010102', 'name:rohan mehta', 'name:asha'];

  it('gives each customer a short label of the form C-XXXX', () => {
    for (const label of customerLabels(keys).values()) expect(label).toMatch(/^C-[0-9A-Z]{4,7}(-\d+)?$/);
  });

  it('is the same for the same customer however many others there are, and in any order', () => {
    const a = customerLabels(keys);
    const b = customerLabels([...keys].reverse());
    const c = customerLabels([...keys, 'phone:9000000000', 'name:someone new']);
    for (const k of keys) { expect(b.get(k)).toBe(a.get(k)); expect(c.get(k)).toBe(a.get(k)); }
  });

  it('stays the same when orders are added or back-dated', () => {
    const before = one(ordersOn([10, 3]));
    const after = one([...ordersOn([10, 3]), ...ordersOn([400])]);
    expect(after.label).toBe(before.label);
  });

  it('is different for different customers, even in a big set', () => {
    const many = Array.from({ length: 3000 }, (_, i) => `phone:${String(9000000000 + i)}`);
    const labels = [...customerLabels(many).values()];
    expect(new Set(labels).size).toBe(many.length);
  });

  it('contains nothing of the phone number or the name', () => {
    const label = customerLabels(['phone:9845010101', 'name:priya sharma']).get('phone:9845010101')!;
    expect(label).not.toMatch(/9845|0101/);
    const p = one([order()]);
    expect(JSON.stringify({ label: p.label })).not.toMatch(/Priya|9845/);
  });
});

describe('customersForTab and countByStatus', () => {
  const customers = profiles([
    ...ordersOn([38, 31, 24, 17, 10], { customerName: 'Due Late', customerPhone: '9000000001' }),   // due, 10 days
    ...ordersOn([30, 23, 16, 9, 8], { customerName: 'Due Soon', customerPhone: '9000000002', quantity: 2 }), // median ~7, last 8 days: due
    ...ordersOn([200, 190, 180], { customerName: 'Gone Big', customerPhone: '9000000003', quantity: 5 }),  // lapsed, worth most
    ...ordersOn([250], { customerName: 'Gone Small', customerPhone: '9000000004' }),                       // lapsed
    ...ordersOn([2], { customerName: 'Fresh', customerPhone: '9000000005' }),                              // new
    ...ordersOn([20, 10, 0], { customerName: 'Steady', customerPhone: '9000000006' }),                     // active
  ]);

  it('counts customers by status', () => {
    expect(countByStatus(customers)).toEqual({ new: 1, active: 1, due: 2, lapsed: 2 });
  });

  it('lists the most overdue first on Due', () => {
    expect(customersForTab(customers, 'due').map(c => c.name)).toEqual(['Due Late', 'Due Soon']);
  });

  it('lists the customers most worth winning back first on Lapsed', () => {
    expect(customersForTab(customers, 'lapsed').map(c => c.name)).toEqual(['Gone Big', 'Gone Small']);
  });

  it('lists everyone, latest order first, on All', () => {
    const all = customersForTab(customers, 'all');
    expect(all).toHaveLength(6);
    expect(all[0].name).toBe('Steady');
    const dates = all.map(c => c.lastOrder);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

describe('the WhatsApp nudge', () => {
  const base = (over: Partial<CustomerProfile> = {}) => ({ name: 'Priya Sharma', phone: '+91 98450 10101', favouriteItems: ['Chocolate Cake'], status: 'due' as const, ...over });

  it('greets by first name and offers their favourite item', () => {
    expect(buildNudgeMessage(base(), 'Asha Bakes')).toBe('Hi Priya, shall I keep Chocolate Cake for you this week? - Asha Bakes');
  });

  it('works without a business name or a favourite', () => {
    expect(buildNudgeMessage(base({ favouriteItems: [] }))).toBe('Hi Priya, can I make something for you this week?');
    expect(buildNudgeMessage(base({ favouriteItems: [], status: 'lapsed' }))).toBe("Hi Priya, it's been a while! Can I make something for you this week?");
  });

  it('does not invent a name for an unnamed customer', () => {
    expect(buildNudgeMessage(base({ name: 'Customer not named' }))).toBe('Hi, shall I keep Chocolate Cake for you this week?');
  });

  it('links to the customer\'s WhatsApp with the message filled in', () => {
    const url = buildNudgeUrl(base(), 'Asha Bakes')!;
    expect(url.startsWith('https://wa.me/919845010101?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toBe('Hi Priya, shall I keep Chocolate Cake for you this week? - Asha Bakes');
  });

  it('has no link without a usable phone number', () => {
    expect(buildNudgeUrl(base({ phone: undefined }))).toBeNull();
    expect(buildNudgeUrl(base({ phone: '12' }))).toBeNull();
  });
});
