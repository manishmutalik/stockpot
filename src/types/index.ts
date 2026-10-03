import type React from 'react';
import { ProductionRun } from '../components/ProductionRunModal';
// ─── Type Definitions ─────────────────────────────────────────────────────────

/**
 * A raw ingredient or packaging material tracked in inventory.
 *
 * `initialStock` represents the current on-hand quantity (updated on restock
 * and decremented by `deductIngredients`).
 * `threshold` is a percentage (0–100) of initialStock below which a low-stock
 * alert is triggered.
 */
export interface InventoryBatch {
  id: string;
  originalQuantity: number;
  remainingQuantity: number;
  expiryDate: string; // YYYY-MM-DD
  costPerUnit: number;
  dateAdded: string;
}

/** Why a price was recorded in the price log. 'goods_receipt' is reserved for Purchase Management. */
export type PriceLogSource = 'initial' | 'restock' | 'manual_edit' | 'goods_receipt';

/**
 * One price paid for a material (`users/{uid}/priceLog/{id}`). Append-only: the
 * app only ever adds entries, never edits or deletes them (deleting a material
 * leaves its history behind). Nothing here feeds a calculation; it is a record
 * that Price & Margin Intelligence can read later, and it only accumulates from
 * the day logging started.
 */
export interface PriceLogEntry {
  id: string;
  materialId: string;
  date: string; // YYYY-MM-DD
  /** Price paid per `unit`, excluding input GST. */
  unitCost: number;
  /** The unit `unitCost` and `quantity` are in. A material can later change unit; the entry keeps the one it was recorded in. */
  unit: string;
  /** How much was bought, in `unit`, when known. */
  quantity?: number;
  /** The material's moving-average cost per `unit` once this entry was applied. */
  macAfter?: number;
  source: PriceLogSource;
  /** When the entry was written (ms), to order entries made on the same day. */
  createdAt: number;
}

export interface RawMaterial {
  id: string;
  name: string;
  unit: string;
  initialStock: number; // Sum of all batch remaining quantities
  batches?: InventoryBatch[];
  costPerUnit: number;
  category: string;
  threshold?: number;
  dateAdded: string;
  expiryDate?: string; // YYYY-MM-DD — expiry of the current/latest stock batch
  gstRate?: number; // Input GST %, applied to this material's own cost/unit — drives the "GST Paid" figure in getFinancialsForRange, not the restock modal's display-only fallback.
  /** Estimated nutrition per 100g/ml of this material, however it's actually
   * purchased/stocked (see `unit`). Used to roll up per-serving nutrition for
   * any menu item using this material. Optional — a material with no
   * nutrition data simply contributes nothing to a recipe's rollup (see
   * `hasIncompleteData` in the rollup result). */
  nutrition?: {
    calories: number;
    protein: number; // grams
    carbs: number;   // grams
    fat: number;     // grams
  };
  /** Where `nutrition` came from — shown in the UI so the business owner
   * knows whether a value was looked up or hand-entered. Doesn't affect
   * calculations. */
  nutritionSource?: 'usda' | 'openfoodfacts' | 'manual';
  /** Standardized allergen tags this material carries. Use the fixed
   * ALLERGEN_TAGS list (nutritionCalculations.ts) — not free text — so
   * recipe-level rollup can reliably check tag membership across
   * ingredients rather than parsing inconsistent strings. */
  allergens?: string[];
}

export interface WastageLog {
  id: string;
  type: 'material' | 'recipe';
  itemId: string;
  quantity: number;
  cost: number;
  date: string;
  reason: string;
}

/**
 * A single ingredient line in a recipe — how much of a `RawMaterial` is
 * needed per unit produced, expressed in the recipe's chosen unit.
 */
export interface IngredientRequirement {
  materialId: string;
  amount: number;
  unit: string;
}

/**
 * A sellable product defined by its recipe and selling price.
 *
 * `finishedGoodsStock` tracks pre-baked units available for immediate sale,
 * populated by production runs and decremented on order fulfilment.
 *
 * Moving to a stricter meaning as part of the production-run/order
 * redesign: this becomes the authoritative count of *unreserved* stock —
 * every production run still adds to it, but an order will claim
 * (decrement) its quantity at order-creation time rather than at a later
 * fulfilment step, and an order can only be created for quantities this
 * number currently covers. `fulfilled` (see Order below) stops being tied
 * to this deduction once that lands.
 */
export interface MenuItem {
  id: string;
  name: string;
  recipe: IngredientRequirement[];
  sellingPrice: number;
  servings?: number;
  finishedGoodsStock?: number;
  shelfLifeDays?: number;
  emoji?: string;
  /** A short line shown under the item's name on the shared menu PDF, e.g.
   * "Rich dark chocolate, 6 inch". Optional: items without one show just a
   * name and price. */
  description?: string;
  /** Groups the item into a section on the shared menu PDF (Cakes, Cookies,
   * ...). Optional: ungrouped items fall under a single "Menu" heading. */
  category?: string;
}

/**
 * A sales order for a single menu item on a specific date.
 * Exported so that sibling components (e.g. ProductionRunModal) can import it.
 */
export interface Order {
  id: string;
  menuItemId: string;
  quantity: number;
  date: string; // YYYY-MM-DD
  customerName?: string;
  customerPhone?: string;
  /** Set to true once fulfillOrder() has successfully deducted inventory for
   * this order, so it can't be fulfilled a second time (which would deduct
   * inventory twice for the same order).
   *
   * Changing role as part of the production-run/order redesign: once stock
   * is reserved at order-creation time instead of here, this becomes a
   * plain completion/status flag ("has this order actually been handed
   * over") with no inventory math attached — an order can be created,
   * edited, and deleted correctly regardless of whether it's fulfilled. */
  fulfilled?: boolean;
  /** Set when this order was auto-created from a Production Log entry logged
   * with purpose 'customer_order' — links back to that ProductionRun's id,
   * so deleting the production run also removes its linked order instead of
   * leaving an orphaned, already-fulfilled order behind.
   *
   * This auto-link is being retired: new production runs stop creating
   * orders (customer identification now always originates from the Orders
   * tab, which already captures name/phone). Field stays populated on
   * pre-existing linked orders. */
  productionRunId?: string;
  /** Delivery address, free text. Optional — most orders may be pickup. */
  deliveryAddress?: string;
  /** How the order gets to the customer. 'third_party' is the only method
   * that involves a deliveryFee (a cost paid to a courier); 'self_delivery'
   * means the business handles delivery itself with no separate line-item
   * cost tracked here. */
  deliveryMethod?: 'pickup' | 'self_delivery' | 'third_party';
  /** What the customer is charged for delivery — counted as revenue. */
  deliveryCharge?: number;
  /** What's paid to a third-party courier (Uber, Porter, etc.) — counted as
   * an expense. Only meaningful when deliveryMethod is 'third_party'. */
  deliveryFee?: number;
  /** Groups several single-item Order documents into one logical order the
   * customer thinks of as a single purchase (e.g. "2 cakes and 3 cookies").
   * Undefined/absent means this order isn't part of a multi-item group —
   * fully backward compatible with every existing order.
   *
   * Each grouped Order is still a complete, independent document — its own
   * fulfilled status, its own refund status, etc. Group membership is for
   * UI presentation and bulk actions, not a change to what an individual
   * Order document means. */
  orderGroupId?: string;
  /** Random, unguessable token generated the first time a bill is produced
   * for this order (shared by every item of a multi-item order). It builds
   * the public, read-only bill link (/bill/<billToken>) without exposing any
   * other order data or opening up Firestore rules. Absent until the first
   * "Generate Bill"; once set it is reused so QR codes and links already
   * shared with a customer keep working. Written by the server only. */
  billToken?: string;
  /** Whether the customer has paid for this order. Absent means paid: every
   * order made before payments were tracked, and every order saved as "Paid
   * now", carries no value. Only "Pay later" orders are stored as 'unpaid',
   * and those are what the Orders tab lists under pending payments. Applies
   * to the whole multi-item order (its items are marked together). */
  paymentStatus?: 'paid' | 'unpaid';
  /** Same idea as `billToken`, for the consolidated bill (statement) that
   * covers a customer's pending orders. Created once, reused, written by the
   * server only. */
  statementToken?: string;
  /** What this order was worth when it was created, written once and never
   * rewritten, so a later price or cost change can't alter history (see
   * utils/orderPricing). Absent on orders made before stamping existed: those
   * fall back to today's values and are reported as estimated. */
  /** Price of one unit when the order was created. */
  unitPriceAtSale?: number;
  /** Ingredient cost of one unit when the order was created, excluding input GST. */
  unitIngredientCostAtSale?: number;
  /** Packaging cost of one unit when the order was created, excluding input GST. */
  unitPackagingCostAtSale?: number;
  /** Input GST contained in those costs, for the "GST paid" figure. */
  unitInputGstAtSale?: number;
  /** The item's name when the order was created. */
  itemNameAtSale?: string;
  /** Amount knocked off the whole order, in the business's currency (not a
   * percentage). Shared by a multi-item order exactly like `deliveryCharge`:
   * entered once, counted once per order. It lowers the sale amount, so GST is
   * worked out on what the customer actually pays. */
  discount?: number;
  /** How the customer paid. Only meaningful once the order is paid; it decides
   * the payment fee. Absent means not recorded, so no fee. */
  paymentMethod?: PaymentMethod;
  /** The fee rate (% of the amount paid) in force when the payment method was
   * recorded, so changing the rates in Settings later never changes past
   * profit. */
  paymentFeeRate?: number;
}

export type PaymentMethod = 'upi' | 'cash' | 'card' | 'other';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];

/** A recurring monthly cost that isn't tied to any order (rent, gas, salaries). */
export interface FixedCost {
  id: string;
  name: string;
  monthlyAmount: number;
  /** First day (YYYY-MM-DD) the cost applies. Absent means from the beginning. */
  startDate?: string;
  /** Last day (YYYY-MM-DD) the cost applies. Absent means still running. Set it
   * when a cost stops or changes, so past months keep what they really cost. */
  endDate?: string;
}

/**
 * Returns the default recipe unit for a given inventory unit.
 *
 * Weight-based materials (kg/g) default to 'g'; volume-based (l/ml) default
 * to 'ml'; all other units are passed through unchanged.
 *
 * @param inventoryUnit - The unit string stored on a `RawMaterial`.
 * @returns The recommended recipe-level unit string.
 */
export function getDefaultRecipeUnit(inventoryUnit: string | undefined): string {
  if (!inventoryUnit) return 'g';
  const u = inventoryUnit.toLowerCase();
  if (u === 'kg' || u === 'g') return 'g';
  if (u === 'l' || u === 'ml') return 'ml';
  return u;
}

/**
 * A lightweight ingredient descriptor used by the IngredientSelectorModal
 * to batch-add multiple ingredients to a recipe in one action.
 */
export interface QuickIngredient {
  materialId: string;
  amount: number;
  unit: string;
  name?: string;
}

/**
 * A recipe R&D session that consumes raw materials but produces no sellable goods.
 * Experiment costs are tracked separately from order expenses in financial reports.
 */
export interface RecipeExperiment {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  materials: IngredientRequirement[];
  notes?: string;
}

/**
 * User-configurable bakery profile settings persisted to Firestore at
 * `users/{userId}/settings/bakery`.
 */
export interface BakerySettings {
  name: string;
  logo: string;
  primaryColor: string;
  address: string;
  phone: string;
  email: string;
  gstApplicable?: boolean;
  gstRate?: number; // Output GST %, applied to sales — see gstPricingMode for how.
  gstPricingMode?: 'inclusive' | 'exclusive'; // Whether menu prices already include GST, or GST is added on top.
  /** The business's UPI ID (e.g. "business@okhdfcbank"), used to build the
   * upi://pay link in a bill's payment QR. Absent means bills simply have no
   * payment QR; it is optional and never required to use the app. */
  upiId?: string;
  /** IANA time zone the business is in (default Asia/Kolkata). "Today" for customer insights and briefings is the date there. */
  timezone?: string;
  /** Fee the business pays per payment method, as a % of the amount collected
   * (e.g. { card: 2, upi: 0 }). A missing method means 0%. */
  paymentFeeRates?: Partial<Record<PaymentMethod, number>>;
  /** Recurring monthly costs not tied to any order, prorated by day for the
   * period being looked at. */
  fixedCosts?: FixedCost[];
}

/**
 * Minimal representation of the signed-in Firebase user surfaced to the UI.
 */
export interface AppUser {
  email: string;
  name: string;
}



export interface AppViewProps {
  materials: RawMaterial[];
  setMaterials: (m: RawMaterial[]) => void;
  categories: string[];
  setCategories: (c: string[]) => void;
  menu: MenuItem[];
  setMenu: (m: MenuItem[]) => void;
  orders: Order[];
  setOrders: (o: Order[]) => void;
  experiments: RecipeExperiment[];
  setExperiments: (e: RecipeExperiment[]) => void;
  productionRuns: ProductionRun[];
  setProductionRuns: (p: ProductionRun[]) => void;
  wastageLogs: WastageLog[];
  /** Every price recorded for any material (append-only), newest or oldest in no particular order; see utils/priceLog. */
  priceLog: PriceLogEntry[];
  /** True once the business's data (orders, menu, materials, settings and so on) has arrived from Firestore. */
  dataReady: boolean;
  setWastageLogs: (w: WastageLog[]) => void;
  
  isProductionRunModalOpen: boolean;
  setIsProductionRunModalOpen: (b: boolean) => void;
  productionFilterRecipe: string;
  setProductionFilterRecipe: (s: string) => void;
  productionFilterPurpose: string;
  setProductionFilterPurpose: (s: string) => void;
  
  activeTab: string;
  setActiveTab: (t: any) => void;
  activeSettingsTab: string;
  setActiveSettingsTab: (t: any) => void;
  
  currency: any;
  setCurrency: (c: any) => void;
  summaryRange: string;
  setSummaryRange: (s: string) => void;
  summaryDateStart: string;
  setSummaryDateStart: (s: string) => void;
  summaryDateEnd: string;
  setSummaryDateEnd: (s: string) => void;
  
  orderDate: string;
  setOrderDate: (s: string) => void;
  orderFilterStart: string;
  setOrderFilterStart: (s: string) => void;
  orderFilterEnd: string;
  setOrderFilterEnd: (s: string) => void;
  
  isAddOrderModalOpen: boolean;
  setIsAddOrderModalOpen: (b: boolean) => void;
  /** Opens the Add Order modal pre-filled with this menu item as the first
   * (only) line item — used by Market Stock's "Add to Order" action. */
  openAddOrderModalFor: (menuItemId: string) => void;
  addOrderGroup: (
    common: { date: string; customerName?: string; customerPhone?: string },
    lineItems: { menuItemId: string; quantity: number }[]
  ) => Promise<void>;

  summaryRefDate: string;
  setSummaryRefDate: (s: string) => void;
  expandedRecipeId: string | null;
  setExpandedRecipeId: (id: string | null) => void;
  inventorySortBy: string;
  setInventorySortBy: (s: string) => void;
  inventorySortOrder: string;
  setInventorySortOrder: (s: string) => void;
  isIngredientSelectorOpen: boolean;
  setIsIngredientSelectorOpen: (b: boolean) => void;
  activeRecipeItemId: string | null;
  setActiveRecipeItemId: (id: string | null) => void;
  
  settings: BakerySettings;
  setSettings: (s: BakerySettings) => void;
  
  user: any;
  
  isAlertDismissed: boolean;
  setIsAlertDismissed: (b: boolean) => void;
  isExpiredAlertDismissed: boolean;
  setIsExpiredAlertDismissed: (b: boolean) => void;

  inventoryUsage: any;
  summaryInventoryUsage: any;
  remainingInventory: any;
  sortedRemainingInventory: any;
  lowStockItems: any[];
  summaryFinancials: any;
  activeOrdersCount: number;
  averageOrderValue: number;
  financials: any;
  chartData: any[];

  handleRangeChange: (r: any, d?: any) => void;
  refreshData: () => void;
  addMaterial: (m: any) => void;
  addCategory: (c: string) => void;
  deleteCategory: (c: string) => void;
  updateMaterial: (id: string, f: string, v: any) => void;
  deleteMaterial: (id: string) => void;
  addMenuItem: () => void;
  updateMenuItem: (id: string, m: any) => void;
  updateMenuItemField: (id: string, f: string, v: any) => void;
  deleteMenuItem: (id: string) => void;
  clearFinishedGoodsStock: (id: string) => void;
  addExperiment: () => void;
  updateExperiment: (id: string, f: string, v: any) => void;
  deleteExperiment: (id: string) => void;
  addMaterialToExperiment: (id: string) => void;
  updateExperimentMaterial: (id: string, mId: string, f: string, v: any) => void;
  removeMaterialFromExperiment: (id: string, mId: string) => void;
  processVoiceCommand: (t: string) => void;
  startListening: () => void;
  copyMenuItem: (id: string) => void;
  addIngredientToRecipe: (id: string) => void;
  addQuickIngredientsToRecipe: (id: string, q: any[]) => void;
  updateRecipeIngredient: (id: string, i: number, f: string, v: any) => void;
  removeIngredientFromRecipe: (id: string, i: number) => void;
  logProductionRun: (r: any) => void;
  deleteProductionRun: (id: string) => void;
  deleteProductionRunSession: (sessionId: string) => void;
  handleDiscardBatch: (b: any) => void;
  updateOrder: (id: string, f: string, v: any) => void;
  fulfillOrder: (order: Order) => void;
  /** Marks orders paid or unpaid (every id given, in one write). */
  markOrdersPaid: (ids: string[], paid: boolean, method?: PaymentMethod) => void;
  /** Records how already-paid orders were paid. */
  setOrdersPaymentMethod: (ids: string[], method: PaymentMethod) => void;
  deleteOrder: (id: string) => void;
  resetOrders: () => void;
  saveSettings: () => void;
  updateSettingsField: (field: any, value: any) => void;
  handleRestock: (e: React.FormEvent) => void;
  restockMaterial: RawMaterial | null;
  setDiscardTarget: (t: { id: string; name: string; type: 'material' | 'recipe'; batchId?: string; maxQty: number; unit: string; costPerUnit: number; presetReason?: string } | null) => void;
  setRestockMaterial: (m: RawMaterial | null) => void;
  openNutritionEditor: (m: RawMaterial) => void;

  showSaveFeedback: boolean;
  saveDay: () => void;
  updateCurrency: (c: any) => void;
  handleLogout: () => void;

  billing: { status: string; currentPeriodEnd: number | null };
  openBillingPortal: () => void;
  isOpeningPortal: boolean;
  startCheckout: (email?: string) => void;
  isStartingCheckout: boolean;

  isListening: boolean;
  transcript: string;
  convertAmount: (a: number, f: string, t: string) => number;

  patchMaterial: any;
  setRestockExpiryDate: any;
  shopifyStatus: { connected: boolean; shop: string | null };
  shopifyConfig: { hasEnvCredentials: boolean };
  shopifyShopInput: string;
  setShopifyShopInput: (s: string) => void;
  isConnectingShopify: boolean;
  connectShopify: () => void;
  disconnectShopify: () => void;
  importShopifyOrders: any;
  isImportingShopify: any;
  odooStatus: { connected: boolean; url: string | null };
  odooUrlInput: string;
  setOdooUrlInput: (s: string) => void;
  odooDbInput: string;
  setOdooDbInput: (s: string) => void;
  odooUsernameInput: string;
  setOdooUsernameInput: (s: string) => void;
  odooPasswordInput: string;
  setOdooPasswordInput: (s: string) => void;
  isConnectingOdoo: boolean;
  connectOdoo: () => void;
  disconnectOdoo: () => void;
  importOdooOrders: any;
  isImportingOdoo: any;
  isRefreshing: boolean;
  lastSynced: Date;
  handleDownloadTemplate: () => void;
  handleImportCSV: (e: React.ChangeEvent<HTMLInputElement>, targetCategory: string) => void;
  setAddMaterialCategory: (c: string) => void;
  setShowAddMaterialModal: (b: boolean) => void;

}