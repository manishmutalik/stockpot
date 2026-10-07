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

// ─── Saying what happened: POST /api/mobile/parse ───────────────────────────

export type QuickKind = 'order' | 'restock' | 'production' | 'payment';
export type PaymentMethodId = 'upi' | 'cash' | 'card' | 'other';

/** One thing to ask the owner. `choice` is answered with one of `options`' values, `date` with YYYY-MM-DD, `amount` with a number. */
export interface Question {
  id: string;
  type: 'choice' | 'date' | 'amount';
  prompt: string;
  options?: { value: string; label: string }[];
}

export interface Answer { questionId: string; value: string }

/** The body of POST /api/mobile/orders. */
export interface OrderDraft {
  common: {
    date: string;
    customerName?: string;
    customerPhone?: string;
    deliveryAddress?: string;
    paymentStatus?: 'paid' | 'unpaid';
    paymentMethod?: PaymentMethodId;
    discount?: number;
    /** Booked ahead of time: `date` is then the due date. */
    preorder?: boolean;
    dueSlot?: string;
    notes?: string;
    /** Money received now against a pre-order. */
    advance?: { amount: number; method: PaymentMethodId };
  };
  lineItems: { menuItemId: string; quantity: number; unitPrice?: number }[];
}

/** The body of POST /api/mobile/restocks. */
export interface RestockDraft {
  lines: { materialId: string; quantity: number; unit: string; total: number }[];
}

/** The body of POST /api/mobile/production-runs. */
export interface ProductionDraft {
  date?: string;
  rows: { recipeId: string; quantityProduced: number; quantityYield?: number; notes?: string }[];
}

/** The body of POST /api/mobile/payments, with whatever is not settled yet left out. */
export interface PaymentDraft { customerKey?: string; amount?: number; method?: PaymentMethodId }

/** Money labels are already formatted in the business's currency. */
export interface OrderPreview {
  lines: { menuItemId: string; name: string; quantity: number; unitPrice: number; lineTotal: number; stockAfter: number | null }[];
  /** What the customer pays, with GST and discount. */
  total: number;
  advance: number | null;
  balanceDue: number;
  label: { total: string; balanceDue: string; advance: string | null };
}

export interface RestockPreviewLine {
  materialId: string;
  name: string;
  quantity: number;
  unit: string;
  total: number;
  /** Stock after, in the material's own unit. */
  newStock: number;
  stockUnit: string;
  /** Cost per `costUnit` (kg for grams, l for ml, else the unit itself) before and after: the moving average. */
  costUnit: string;
  previousCost: number;
  newCost: number;
  /** Percent change in cost per unit; null when there was no cost before. */
  costChangePct: number | null;
  /** Menu items whose cost this changes, and by how much each unit now costs to make. */
  recipesAffected: { menuItemId: string; name: string; costChange: number }[];
  label: { total: string; previousCost: string; newCost: string };
}

export interface RestockPreview {
  lines: RestockPreviewLine[];
  total: number;
  label: { total: string };
}

export interface ProductionPreview {
  date: string;
  rows: { recipeId: string; name: string; quantityProduced: number; quantityYield: number; costTotal: number; costPerUnit: number; stockAfter: number }[];
  /** Ingredients this would take below nothing, as the web would let it. The app asks "Produce anyway?". */
  shortages: { materialId: string; name: string; unit: string; short: number }[];
  total: number;
  label: { total: string };
}

export interface PaymentPreview {
  customerKey: string;
  customerName: string;
  /** What they owed before this payment. */
  owed: number;
  amount: number;
  ordersCovered: number;
  /** Still owed after this payment. */
  remainingDue: number;
  /** The payment settles everything they owe. */
  clearsAll: boolean;
  label: { owed: string; amount: string; remainingDue: string };
}

interface ParseCommon {
  questions: Question[];
  /** Things the owner should know about how the draft was made. */
  notes: string[];
  /** The business's currency, for showing the amounts the save will answer with. */
  currency?: Currency;
  /** The model's checked reading: send it back with the answers so answering costs nothing and cannot change what was said. */
  reading?: unknown;
  /** Readings left today, when this call used one. */
  remaining?: number;
  /** Set when there is no draft: `unverified`, `no_items`, `nothing_pending`, `no_materials`... */
  code?: string;
  error?: string;
}

/** POST /api/mobile/parse: a draft with its figures and what is still open; an empty `questions` means ready to confirm. */
export type ParseResponse =
  | (ParseCommon & { kind: null; draft: null })
  | (ParseCommon & { kind: 'order'; draft: OrderDraft | null; preview?: OrderPreview | null })
  | (ParseCommon & { kind: 'restock'; draft: RestockDraft | null; preview?: RestockPreview | null })
  | (ParseCommon & { kind: 'production'; draft: ProductionDraft | null; preview?: ProductionPreview | null })
  | (ParseCommon & { kind: 'payment'; draft: PaymentDraft | null; preview?: PaymentPreview | null });

// ─── What the save endpoints answer ─────────────────────────────────────────

/** POST /api/mobile/orders (201) */
export interface OrderSaved {
  orderIds: string[];
  orderGroupId: string | null;
  preorder: boolean;
  total: number;
  advance: number;
  /** What the customer still owes: nothing for an order paid in full. */
  balanceDue: number;
}

/** POST /api/mobile/restocks (201) */
export interface RestockSaved {
  lines: { materialId: string; name: string; unit: string; newStock: number; previousCostPerUnit: number; newCostPerUnit: number }[];
}

/** POST /api/mobile/production-runs (201) */
export interface ProductionSaved {
  runIds: string[];
  sessionId: string | null;
  shortages: { materialId: string; name: string; unit: string; short: number }[];
}

/** POST /api/mobile/payments (200) */
export interface PaymentSaved {
  customerName: string;
  amount: number;
  method: PaymentMethodId;
  orderIds: string[];
  remainingDue: number;
}

