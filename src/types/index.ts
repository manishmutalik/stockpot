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
  gstRate?: number;
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
   * inventory twice for the same order). */
  fulfilled?: boolean;
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
  modalOrderDate: string;
  setModalOrderDate: (s: string) => void;
  modalCustomerName: string;
  setModalCustomerName: (s: string) => void;
  modalCustomerPhone: string;
  setModalCustomerPhone: (s: string) => void;
  modalLineItems: any[];
  setModalLineItems: (l: any[]) => void;
  isSavingOrder: boolean;
  setIsSavingOrder: (b: boolean) => void;
  
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
  handleDiscardBatch: (b: any) => void;
  addOrder: (o: any) => void;
  updateOrder: (id: string, f: string, v: any) => void;
  fulfillOrder: (order: Order) => void;
  deleteOrder: (id: string) => void;
  resetOrders: () => void;
  saveSettings: () => void;
  updateSettingsField: (field: any, value: string) => void;
  handleRestock: (e: React.FormEvent) => void;
  restockMaterial: RawMaterial | null;
  setDiscardTarget: (t: { id: string; name: string; type: 'material' | 'recipe'; batchId?: string; maxQty: number; unit: string; costPerUnit: number } | null) => void;
  setRestockMaterial: (m: RawMaterial | null) => void;

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