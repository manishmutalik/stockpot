/**
 * quickApiTypes.ts
 *
 * The shapes the phone app's endpoints (`/api/mobile/*`) answer with. A plain file of types with no imports, so the server
 * (src/utils/quickViews.ts builds them) and the Expo app (mobile/, which imports it as types only) share one definition
 * and cannot drift apart.
 */

export interface Currency { code: string; symbol: string }

export type StatusKind = 'orders_due' | 'payments_pending' | 'running_low' | 'use_by_soon' | 'profit';

export interface StatusLine {
  kind: StatusKind;
  /** coral: needs doing now; amber: needs a look; green: good news. */
  tone: 'coral' | 'amber' | 'green';
  label: string;
}

/** Open pre-orders falling due, as a count of orders and the units of each item. */
export interface DueSummary {
  /** Orders (a multi-item order counts once). */
  orderCount: number;
  /** What has to be made or handed over: units per item, most first. */
  items: { menuItemId: string; name: string; quantity: number }[];
}

/** GET /api/mobile/today */
export interface TodayView {
  date: string;
  businessName: string;
  currency: Currency;
  /** Up to five, most urgent first. Empty means "All clear". */
  statusLines: StatusLine[];
  dueToday: DueSummary | null;
  dueTomorrow: DueSummary | null;
  /** Open pre-orders whose due date has passed. */
  overdue: DueSummary | null;
  pendingPayments: { customers: number; orders: number; total: number };
  lowStock: { id: string; name: string; remaining: number; unit: string; threshold: number }[];
  useBySoon: { kind: 'material' | 'batch'; id: string; name: string; date: string; daysLeft: number }[];
  /** Today's takings and what the business really made on them. */
  today: { revenue: number; trueProfit: number; orderCount: number };
}

export interface UpcomingOrder {
  /** The order's first item id; hand over and confirmation use it. */
  orderId: string;
  orderIds: string[];
  customerName: string | null;
  customerPhone: string | null;
  /** YYYY-MM-DD */
  date: string;
  dueSlot: string | null;
  notes: string | null;
  items: { menuItemId: string; name: string; quantity: number }[];
  total: number;
  advance: { amount: number; method: string } | null;
  /** What is still to pay: the total less the advance. */
  balanceDue: number;
  /** Items of which there is not enough finished stock to hand the order over today. */
  stockShort: { name: string; short: number }[];
}

/** GET /api/mobile/upcoming */
export interface UpcomingView {
  today: string;
  currency: Currency;
  /** Open pre-orders whose due date has passed, oldest first. */
  overdue: UpcomingOrder[];
  /** Open pre-orders due today or later, soonest first. */
  upcoming: UpcomingOrder[];
}
