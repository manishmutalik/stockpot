/**
 * customers.ts
 *
 * Customer profiles, worked out from orders on the fly. There is no customer
 * collection: a customer is whoever the orders say they are (see
 * payments.customerKey, the same identity Pending Payments uses: the phone
 * number if there is one, otherwise the name). Pure and dependency-free, so it
 * is tested without React or Firebase and can also feed the AI snapshot.
 *
 * Money comes from profit.ts (what each order made, pre-GST), so this screen
 * agrees with the Orders tab and the dashboard.
 *
 * How a customer's status is decided (see `customerStatus`):
 *  - Counted by distinct order dates, a multi-item order counting once.
 *  - One order: `new` if it was in the last 30 days, else `lapsed`.
 *  - Two orders: no rhythm can be told yet, so `active` within 30 days of the
 *    last order, else `lapsed`.
 *  - Three or more order dates: their usual gap is the median days between
 *    orders (M). `active` until M days have passed since the last order, `due`
 *    from M up to twice M, `lapsed` from twice M on. The thresholds have floors
 *    so a customer who orders almost daily is not "due" after a single quiet
 *    day: due from at least 2 days, lapsed from at least 14.
 */
import type { BakerySettings, MenuItem, Order, RawMaterial } from '../types';
import { buildWhatsAppUrl } from './billing';
import { daysBetween } from './localDate';
import { clusterOrdersByGroup } from './orderClustering';
import { resolveItemName } from './orderPricing';
import { customerKey } from './payments';
import { orderContribution } from './profit';

export type CustomerStatus = 'new' | 'active' | 'due' | 'lapsed';

export const CUSTOMER_RULES = {
  /** A first order this recent makes a customer `new`; with no rhythm yet, this is also how long they stay `active`. */
  recentDays: 30,
  /** Order dates needed before a rhythm (median gap) is trusted. */
  minOrderDatesForRhythm: 3,
  /** Never call someone due sooner than this, however short their usual gap. */
  dueFloorDays: 2,
  /** Never call someone lapsed sooner than this, however short their usual gap. */
  lapsedFloorDays: 14,
} as const;

export interface CustomerProfile {
  /** Identity, the same as Pending Payments uses. Never sent to the AI; see `label`. */
  key: string;
  /** A short, stable pseudonym such as "C-4F2A", the only identity that goes into AI prompts. */
  label: string;
  /** The most recent name used. */
  name: string;
  phone?: string;
  /** False when the customer is known only by name (so they cannot be messaged and may be a duplicate). */
  hasPhone: boolean;
  firstOrder: string;
  lastOrder: string;
  /** Orders placed; a multi-item order counts once. */
  orderCount: number;
  /** Items, delivery and discount, pre-GST: what they paid before tax. */
  totalSpent: number;
  /** What the business made on their orders (see profit.orderContribution). */
  totalContribution: number;
  /** Whole days from the last order to today. */
  daysSinceLastOrder: number;
  /** The usual gap between orders, null until there are three order dates. */
  medianDaysBetweenOrders: number | null;
  /** The three items they buy most (by quantity), by the names the orders were made under. */
  favouriteItems: string[];
  status: CustomerStatus;
  /** True if some of their orders are valued at today's prices because they predate price stamping. */
  estimated: boolean;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Days between consecutive distinct order dates, and the median of them (null without a rhythm). */
export function orderRhythm(orderDates: string[]): { medianDays: number | null } {
  const dates = Array.from(new Set(orderDates)).sort();
  if (dates.length < CUSTOMER_RULES.minOrderDatesForRhythm) return { medianDays: null };
  const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d));
  return { medianDays: median(gaps) };
}

/** The status rule described at the top of this file. */
export function customerStatus(input: { orderCount: number; daysSinceLastOrder: number; medianDays: number | null }): CustomerStatus {
  const { orderCount, daysSinceLastOrder: days, medianDays: m } = input;
  if (m === null) {
    if (days > CUSTOMER_RULES.recentDays) return 'lapsed';
    return orderCount <= 1 ? 'new' : 'active';
  }
  const lapsedAfter = Math.max(2 * m, CUSTOMER_RULES.lapsedFloorDays);
  const dueAfter = Math.min(Math.max(m, CUSTOMER_RULES.dueFloorDays), lapsedAfter);
  if (days >= lapsedAfter) return 'lapsed';
  if (days >= dueAfter) return 'due';
  return 'active';
}

/** FNV-1a, 32 bit: a small, stable hash, nothing more. Used only to make a pseudonym, not for security. */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Short pseudonyms for a set of customer keys: "C-" and the first four
 * characters of a hash of the key, lengthened only for keys that would
 * otherwise collide. A label depends on the key alone (not on order dates or
 * on who else is a customer), so it stays the same when orders are added or
 * back-dated, and means the same person across chat turns and days. It is a
 * pseudonym, not a secret: four characters of a hash cannot be turned back into
 * a phone number, and the app keeps the label-to-customer map on the client.
 */
export function customerLabels(keys: string[]): Map<string, string> {
  const unique = Array.from(new Set(keys)).sort();
  const full = new Map(unique.map(k => [k, hash32(k).toString(36).toUpperCase().padStart(7, '0')]));
  const labels = new Map<string, string>();
  for (const key of unique) {
    let length = 4;
    const mine = full.get(key)!;
    while (length < 7 && unique.some(other => other !== key && full.get(other)!.slice(0, length) === mine.slice(0, length))) length++;
    labels.set(key, `C-${mine.slice(0, length)}`);
  }
  // Keys whose whole hash is the same (vanishingly rare) are told apart in key order.
  const seen = new Map<string, number>();
  for (const key of unique) {
    const label = labels.get(key)!;
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    if (n > 1) labels.set(key, `${label}-${n}`);
  }
  return labels;
}

/**
 * Everyone who has ordered, with how they order. Orders with no name and no
 * phone cannot be attributed to anyone and are left out. `today` is the
 * business's own calendar date (see localDate.todayInZone).
 */
export function buildCustomerProfiles(input: {
  orders: Order[];
  menu: MenuItem[];
  materials: RawMaterial[];
  settings: Pick<BakerySettings, 'gstApplicable' | 'gstRate' | 'gstPricingMode'>;
  today: string;
}): CustomerProfile[] {
  const { orders, menu, materials, settings, today } = input;

  const byCustomer = new Map<string, Order[]>();
  for (const order of orders) {
    const key = customerKey(order);
    if (key.startsWith('anon:')) continue;
    byCustomer.set(key, [...(byCustomer.get(key) ?? []), order]);
  }
  const labels = customerLabels([...byCustomer.keys()]);

  const profiles: CustomerProfile[] = [];
  for (const [key, list] of byCustomer) {
    const newestFirst = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    let totalSpent = 0, totalContribution = 0, estimated = false;
    const orderDates: string[] = [];
    const quantityByItem = new Map<string, number>();

    for (const cluster of clusterOrdersByGroup(list)) {
      const members = cluster.type === 'single' ? [cluster.order] : cluster.orders;
      const made = orderContribution(members, menu, materials, settings);
      totalSpent += made.itemsRevenue + made.deliveryCharged - made.discount;
      totalContribution += made.contribution;
      estimated ||= made.estimated;
      orderDates.push(members.map(m => m.date).sort()[0]);
      for (const m of members) {
        const name = resolveItemName(m, menu);
        quantityByItem.set(name, (quantityByItem.get(name) ?? 0) + (m.quantity || 0));
      }
    }

    const dates = [...orderDates].sort();
    const lastOrder = dates[dates.length - 1];
    const daysSinceLastOrder = Math.max(daysBetween(lastOrder, today), 0);
    const { medianDays } = orderRhythm(orderDates);
    const orderCount = orderDates.length;
    const phone = newestFirst.find(o => o.customerPhone)?.customerPhone;

    profiles.push({
      key,
      label: labels.get(key)!,
      name: newestFirst.find(o => o.customerName)?.customerName?.trim() || 'Customer not named',
      ...(phone && { phone }),
      hasPhone: key.startsWith('phone:'),
      firstOrder: dates[0],
      lastOrder,
      orderCount,
      totalSpent,
      totalContribution,
      daysSinceLastOrder,
      medianDaysBetweenOrders: medianDays,
      favouriteItems: [...quantityByItem.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([name]) => name),
      status: customerStatus({ orderCount, daysSinceLastOrder, medianDays }),
      estimated,
    });
  }
  return profiles;
}

export type CustomerTab = 'due' | 'lapsed' | 'all';

/**
 * A tab's customers in the order that is useful on it: due first by how long
 * since they ordered (the most overdue first); lapsed by what they were worth
 * (the customers most worth winning back first); everyone by latest order.
 */
export function customersForTab(profiles: CustomerProfile[], tab: CustomerTab): CustomerProfile[] {
  const pool = tab === 'all' ? profiles : profiles.filter(p => p.status === tab);
  const byName = (a: CustomerProfile, b: CustomerProfile) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
  return [...pool].sort(
    tab === 'due' ? (a, b) => b.daysSinceLastOrder - a.daysSinceLastOrder || byName(a, b)
    : tab === 'lapsed' ? (a, b) => b.totalContribution - a.totalContribution || byName(a, b)
    : (a, b) => b.lastOrder.localeCompare(a.lastOrder) || byName(a, b)
  );
}

export const countByStatus = (profiles: CustomerProfile[]): Record<CustomerStatus, number> =>
  profiles.reduce((counts, p) => ({ ...counts, [p.status]: counts[p.status] + 1 }), { new: 0, active: 0, due: 0, lapsed: 0 } as Record<CustomerStatus, number>);

/** The first word of a name, for "Hi Priya". Empty for an unnamed customer. */
const firstName = (name: string) => (name === 'Customer not named' ? '' : name.trim().split(/\s+/)[0] || '');

/** The message pre-filled in WhatsApp to bring a customer back. Plain text; the owner reads it before sending. */
export function buildNudgeMessage(customer: Pick<CustomerProfile, 'name' | 'favouriteItems' | 'status'>, businessName?: string): string {
  const first = firstName(customer.name);
  const hi = first ? `Hi ${first},` : 'Hi,';
  const favourite = customer.favouriteItems[0];
  const ask = favourite
    ? `shall I keep ${favourite} for you this week?`
    : customer.status === 'lapsed'
      ? "it's been a while! Can I make something for you this week?"
      : 'can I make something for you this week?';
  return `${hi} ${ask}${businessName ? ` - ${businessName}` : ''}`;
}

/** A wa.me link with the nudge filled in, or null when the customer has no usable phone number. */
export function buildNudgeUrl(customer: Pick<CustomerProfile, 'name' | 'phone' | 'favouriteItems' | 'status'>, businessName?: string): string | null {
  return buildWhatsAppUrl(customer.phone, buildNudgeMessage(customer, businessName));
}
