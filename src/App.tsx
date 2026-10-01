// ─── Imports ──────────────────────────────────────────────────────────────────
// React core, UI icon library, Firebase auth/Firestore, animation, AI, charting
import * as React from 'react';
import { useState, useEffect, useMemo, Component } from 'react';
import { 
  Plus, 
  Trash2, 
  ChevronRight, 
  ChevronDown, 
  Package, 
  Utensils, 
  ClipboardList, 
  Calculator,
  Save,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Check,
  Info,
  Database,
  RefreshCw,
  Copy,
  DollarSign,
  Globe,
  Calendar,
  Filter,
  ArrowLeft,
  ArrowRight,
  Clock,
  Settings,
  Settings2,
  Layers,
  UserCog,
  Puzzle,
  User as UserIcon,
  LogOut,
  Image,
  Palette,
  Store,
  Mail,
  Phone,
  MapPin,
  UserCircle,
  TrendingUp,
  TrendingDown,
  Activity,
  ShoppingBag,
  BarChart3,
  Edit2,
  LogIn,
  FlaskConical,
  Sparkles,
  Factory,
  Download,
  Upload,
  X,
  Salad,
  Search,
  Loader2,
  Home,
  Gift,
  LayoutDashboard,
  BookOpen
} from 'lucide-react';
import Papa from 'papaparse';
import { apiFetch } from './utils/apiClient';
import { useIntegrations } from './hooks/useIntegrations';
import { useSettings } from './hooks/useSettings';
import { useInventoryActions } from './hooks/useInventoryActions';
import { useMenuActions } from './hooks/useMenuActions';
import { useOrderActions } from './hooks/useOrderActions';
import { useProductionActions } from './hooks/useProductionActions';
import { useExperimentActions } from './hooks/useExperimentActions';
import { useWastageActions } from './hooks/useWastageActions';
import { useFirestoreCollection } from './hooks/useFirestoreCollection';
import { useSettingsListener } from './hooks/useSettingsListener';
import { useBilling } from './hooks/useBilling';
// Views are lazy-loaded: each is its own chunk, fetched only when its tab is
// first opened, rather than all 8 being bundled into the initial page load.
// Only one view is ever rendered at a time (see the `activeTab === ...`
// checks below), which makes this a safe, low-risk split.
const InventoryView = React.lazy(() => import('./views/InventoryView').then(m => ({ default: m.InventoryView })));
const MenuView = React.lazy(() => import('./views/MenuView').then(m => ({ default: m.MenuView })));
const OrdersView = React.lazy(() => import('./views/OrdersView').then(m => ({ default: m.OrdersView })));
const ProductionView = React.lazy(() => import('./views/ProductionView').then(m => ({ default: m.ProductionView })));
const ExperimentsView = React.lazy(() => import('./views/ExperimentsView').then(m => ({ default: m.ExperimentsView })));
const SummaryView = React.lazy(() => import('./views/SummaryView').then(m => ({ default: m.SummaryView })));
const WastageView = React.lazy(() => import('./views/WastageView').then(m => ({ default: m.WastageView })));
const SettingsView = React.lazy(() => import('./views/SettingsView').then(m => ({ default: m.SettingsView })));

import { IngredientSelectorModal } from './components/IngredientSelectorModal';
import { ProductionRunModal, ProductionRun } from './components/ProductionRunModal';
import { AuthScreen, LoadingScreen, PaywallScreen } from './components/AuthScreens';
import { describeAuthError } from './utils/authErrors';
import { buildDemoData } from './utils/demoData';
import { AddMaterialModal } from './components/AddMaterialModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { DiscardModal } from './components/DiscardModal';
import { NutritionModal } from './components/NutritionModal';
import { RestockModal } from './components/RestockModal';
import { AddOrderModal } from './components/AddOrderModal';
import { motion, AnimatePresence } from 'motion/react';

import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  collection, 
  doc, 
  setDoc, 
  addDoc,
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit,
  writeBatch
} from './firebase';
import { OperationType, handleFirestoreError } from './utils/firestoreError';

// ─── Error Handling ───────────────────────────────────────────────────────────
// OperationType / handleFirestoreError now live in ./utils/firestoreError.ts
// so they can be shared with hooks extracted out of this file.

// ─── Error Boundary ───────────────────────────────────────────────────────────

/**
 * Top-level React error boundary that wraps `BakeryApp`.
 *
 * Catches any uncaught render-time errors (including re-thrown errors from
 * `handleFirestoreError`) and renders a friendly error card with a
 * "Reload Application" button instead of a blank screen.
 *
 * Error messages are expected to be JSON-serialised `FirestoreErrorInfo`
 * strings; if parsing fails, the raw message is displayed.
 */
class ErrorBoundary extends React.Component<any, any> {
  state: any;
  props: any;
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorInfo: '' };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  componentDidMount() {
    // A successful, error-free mount means we're not in a stale-chunk loop
    // right now — clear the guard so a *future* deploy's stale-chunk error
    // can also trigger one auto-reload, rather than the guard staying set
    // for the rest of this browser tab's session.
    sessionStorage.removeItem('stockpot_chunk_reload_attempted');
  }

  componentDidCatch(error: any) {
    // A "failed to fetch dynamically imported module" error means the
    // browser has an older page loaded (referencing old, content-hashed
    // chunk filenames) and a newer deploy has since replaced those files.
    // This isn't a real bug — reloading once fetches the current index.html
    // and current chunks and silently fixes it. Guarded with sessionStorage
    // so a *genuinely* broken deploy doesn't reload forever.
    const message = String(error?.message || '');
    const isStaleChunkError = /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
    if (isStaleChunkError && !sessionStorage.getItem('stockpot_chunk_reload_attempted')) {
      sessionStorage.setItem('stockpot_chunk_reload_attempted', '1');
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      let displayMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.errorInfo);
        if (parsed.error) displayMessage = `Database Error: ${parsed.error}`;
      } catch (e) {
        displayMessage = this.state.errorInfo;
      }

      return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-[10px] sm:rounded-[15px] shadow-xl border border-stone-200 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-rose-50 rounded-xl flex items-center justify-center text-rose-500 mx-auto mb-6">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-xl font-bold text-stone-800 mb-2">Application Error</h2>
            <p className="text-stone-600 mb-6">{displayMessage}</p>
            <button 
              onClick={() => { sessionStorage.removeItem('stockpot_chunk_reload_attempted'); window.location.reload(); }}
              className="w-full bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-primary/20"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Type Definitions ─────────────────────────────────────────────────────────

/**
 * Shared domain types (RawMaterial, MenuItem, Order, etc.) live in
 * src/types/index.ts and are imported here rather than duplicated locally —
 * this file previously had its own disconnected copies of all of these.
 */
import {
  InventoryBatch,
  RawMaterial,
  WastageLog,
  IngredientRequirement,
  MenuItem,
  Order,
  getDefaultRecipeUnit,
  QuickIngredient,
  RecipeExperiment,
  BakerySettings,
  AppUser,
} from './types';
export type { InventoryBatch, WastageLog, Order, QuickIngredient };
export { getDefaultRecipeUnit };

// ─── Seed / Initial Data ─────────────────────────────────────────────────────────
// Displayed before Firestore data loads (unauthenticated / first-run state).

// ─── Seed Wastage Logs (Demo / first-run placeholder) ───────────────────────
const INITIAL_WASTAGE_LOGS: WastageLog[] = [
  // Raw-material wastages (quantities in the material's native unit)
  // Butter: 0.5 kg × ₹500/kg = ₹250
  { id: 'wl1', type: 'material', itemId: '3', quantity: 0.5, cost: 250, date: '2026-06-10', reason: 'Butter exceeded use-by date — batch discarded' },
  // Flour: 0.8 kg × ₹45/kg = ₹36
  { id: 'wl2', type: 'material', itemId: '1', quantity: 0.8, cost: 36, date: '2026-06-13', reason: 'Flour contaminated with moisture — disposal required' },
  // Milk: 0.6 l × ₹60/l = ₹36
  { id: 'wl3', type: 'material', itemId: '5', quantity: 0.6, cost: 36, date: '2026-06-15', reason: 'Whole milk souring detected — full batch discarded' },
  // Eggs: 6 pcs × ₹8/pc = ₹48
  { id: 'wl4', type: 'material', itemId: '4', quantity: 6, cost: 48, date: '2026-06-17', reason: 'Cracked eggs during storage — unusable' },
  // Sugar: 0.3 kg × ₹42/kg = ₹12.60
  { id: 'wl5', type: 'material', itemId: '2', quantity: 0.3, cost: 12.60, date: '2026-06-19', reason: 'Sugar hardened into clumps due to humidity' },
  // Yeast: 50 g × ₹0.80/g = ₹40
  { id: 'wl6', type: 'material', itemId: '6', quantity: 50, cost: 40, date: '2026-06-21', reason: 'Yeast expired — failed activation test' },
  // Finished-goods wastages
  // Croissant material cost ≈ (0.25×45 + 0.025×42 + 0.125×500 + 0.05×60 + 7×0.80) = 11.25+1.05+62.50+3+5.60 = ₹83.40 → ×8 = ₹667
  { id: 'wl7', type: 'recipe', itemId: 'm1', quantity: 8, cost: 667, date: '2026-06-12', reason: 'Croissants unsold by end-of-day — past safe window' },
  // Muffin material cost ≈ (0.2×45 + 0.15×42 + 0.1×500 + 2×8 + 0.1×60) = 9+6.30+50+16+6 = ₹87.30 → ×12 = ₹1047.60
  { id: 'wl8', type: 'recipe', itemId: 'm2', quantity: 12, cost: 1047.60, date: '2026-06-16', reason: 'Muffin batch over-proofed — texture failure, not saleable' },
  // Croissant ×5 = ₹417
  { id: 'wl9', type: 'recipe', itemId: 'm1', quantity: 5, cost: 417, date: '2026-06-20', reason: 'Overnight croissants not sold — discarded at opening' },
];
export const INITIAL_MATERIALS: RawMaterial[] = [
  // Flour: 10 kg on hand, costs ₹45/kg, alert when below 2 kg
  { id: '1', name: 'All-Purpose Flour', unit: 'kg', initialStock: 10, costPerUnit: 45, category: 'Raw Materials', threshold: 2, dateAdded: '2026-01-01' },
  // Sugar: 5 kg, ₹42/kg, alert at 1 kg
  { id: '2', name: 'Granulated Sugar', unit: 'kg', initialStock: 5, costPerUnit: 42, category: 'Raw Materials', threshold: 1, dateAdded: '2026-01-02' },
  // Butter: 2 kg, ₹500/kg, alert at 0.5 kg
  { id: '3', name: 'Unsalted Butter', unit: 'kg', initialStock: 2, costPerUnit: 500, category: 'Raw Materials', threshold: 0.5, dateAdded: '2026-01-03' },
  // Eggs: 60 pcs, ₹8/pc, alert at 12
  { id: '4', name: 'Large Eggs', unit: 'pcs', initialStock: 60, costPerUnit: 8, category: 'Raw Materials', threshold: 12, dateAdded: '2026-01-04' },
  // Milk: 3 l, ₹60/l, alert at 0.5 l
  { id: '5', name: 'Whole Milk', unit: 'l', initialStock: 3, costPerUnit: 60, category: 'Raw Materials', threshold: 0.5, dateAdded: '2026-01-05' },
  // Yeast: 500 g, ₹0.80/g (₹800/kg), alert at 50 g
  { id: '6', name: 'Active Dry Yeast', unit: 'g', initialStock: 500, costPerUnit: 0.80, category: 'Raw Materials', threshold: 50, dateAdded: '2026-01-06' },
  // Packaging Box: 100 pcs, ₹12/pc, alert at 20
  { id: '7', name: 'Packaging Box', unit: 'pcs', initialStock: 100, costPerUnit: 12, category: 'Packaging Materials', threshold: 20, dateAdded: '2026-01-07' },
  // Greaseproof Paper: 200 pcs, ₹0.50/pc, alert at 50
  { id: '8', name: 'Greaseproof Paper', unit: 'pcs', initialStock: 200, costPerUnit: 0.50, category: 'Packaging Materials', threshold: 50, dateAdded: '2026-01-08' },
];

const INITIAL_MENU: MenuItem[] = [
  { 
    id: 'm1', 
    name: 'Classic Croissant', 
    sellingPrice: 4.50,
    recipe: [
      { materialId: '1', amount: 0.25, unit: 'kg' },  // 250g Flour
      { materialId: '2', amount: 0.025, unit: 'kg' }, // 25g Sugar
      { materialId: '3', amount: 0.125, unit: 'kg' }, // 125g Butter
      { materialId: '5', amount: 0.05, unit: 'l' },   // 50ml Milk
      { materialId: '6', amount: 7, unit: 'g' },      // 7g Yeast
    ] 
  },
  { 
    id: 'm2', 
    name: 'Chocolate Muffin', 
    sellingPrice: 3.75,
    recipe: [
      { materialId: '1', amount: 0.2, unit: 'kg' },   // 200g Flour
      { materialId: '2', amount: 0.15, unit: 'kg' },  // 150g Sugar
      { materialId: '3', amount: 0.1, unit: 'kg' },   // 100g Butter
      { materialId: '4', amount: 2, unit: 'pcs' },
      { materialId: '5', amount: 0.1, unit: 'l' },    // 100ml Milk
    ] 
  }
];

// ─── Unit Conversion Utilities ───────────────────────────────────────────────────
// Moved to ./utils/conversions.ts (dependency-free, easy to unit test).
// Imported here for this file's own use, and re-exported so existing
// `from '../App'` imports in view files keep working.
import { UNIT_CONVERSIONS, convertAmount, CURRENCIES } from './utils/conversions';
import { splitSaleForGst, calculateMaterialGstPaid } from './utils/gstCalculations';
import { attributeDeliveryFieldByGroup } from './utils/orderClustering';
import { getBatchesNeedingAttention } from './utils/stockAging';
import { getExperimentMaterialUsage } from './utils/experimentMaterialUsage';
import { ALLERGEN_TAGS } from './utils/nutritionCalculations';
export { UNIT_CONVERSIONS, convertAmount, CURRENCIES };

/** Supported display currencies. The first entry (INR) is the default. */
// CURRENCIES moved to ./utils/conversions.ts alongside UNIT_CONVERSIONS/convertAmount.

// ─── Root Component ─────────────────────────────────────────────────────────────

/**
 * Public default export.
 * Thin wrapper that provides `ErrorBoundary` protection around the entire
 * Stockpot application.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <BakeryApp />
    </ErrorBoundary>
  );
}

export type TabId = 'inventory' | 'menu' | 'orders' | 'experiments' | 'production' | 'summary' | 'settings' | 'wastage';

/**
 * Renders a styled sidebar tab navigation button; the active tab is a solid
 * teal pill.
 *
 * Hoisted to module scope (was previously defined inside BakeryApp's render
 * body, which created a new component function on every render — React then
 * treats each render's version as a different component type, causing
 * unnecessary remount/state-loss on every re-render of BakeryApp). All state
 * it needs is now passed in as props instead of captured via closure.
 */
function SidebarTabButton({ id, label, icon: Icon, activeTab, setActiveTab, hasLowStockAlert }: {
  id: TabId;
  label: string;
  icon: any;
  activeTab: TabId;
  setActiveTab: (id: TabId) => void;
  hasLowStockAlert: boolean;
}) {
  const isActive = activeTab === id;
  return (
    <button
      onClick={() => setActiveTab(id)}
      aria-current={isActive ? 'page' : undefined}
      className={`relative flex items-center gap-3 px-4 py-2.5 w-full rounded-lg text-sm transition-colors ${
        isActive
          ? 'bg-primary text-white font-semibold shadow-sm'
          : 'text-muted font-medium hover:bg-accent hover:text-ink'
      }`}
    >
      <Icon size={20} strokeWidth={isActive ? 2.25 : 2} />
      <span>{label}</span>
      {id === 'inventory' && hasLowStockAlert && (
        <span className={`absolute right-4 w-2 h-2 rounded-full ${isActive ? 'bg-white' : 'bg-coral'}`} />
      )}
    </button>
  );
}

/**
 * Renders a styled bottom-nav tab button (mobile layout).
 * Hoisted to module scope for the same reason as SidebarTabButton above.
 */
function BottomNavButton({ id, label, icon: Icon, activeTab, setActiveTab, hasLowStockAlert }: {
  id: TabId;
  label: string;
  icon: any;
  activeTab: TabId;
  setActiveTab: (id: TabId) => void;
  hasLowStockAlert: boolean;
}) {
  const isActive = activeTab === id;
  return (
    <button
      onClick={() => setActiveTab(id)}
      aria-current={isActive ? 'page' : undefined}
      className={`flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 px-0.5 py-1.5 transition-colors ${
        isActive ? 'text-primary' : 'text-muted hover:text-ink'
      }`}
    >
      <div className={`relative flex items-center justify-center w-10 h-7 rounded-full transition-colors ${isActive ? 'bg-accent' : ''}`}>
        <Icon size={20} strokeWidth={isActive ? 2.25 : 2} />
        {id === 'inventory' && hasLowStockAlert && (
          <span className="absolute top-0 right-1 w-2 h-2 bg-coral rounded-full border-2 border-white" />
        )}
      </div>
      <span className={`text-[10px] tracking-wide ${isActive ? 'font-bold' : 'font-medium'}`}>{label}</span>
    </button>
  );
}

// ─── TEMPORARY: Testing-Period Billing Bypass ──────────────────────────────────
// Set to `false` to re-enable the real paywall. While `true`, every signed-in
// user skips straight to the app regardless of subscription status — this is
// independent of (and doesn't depend on) the server-side BILLING_DISABLED env
// var, so it works even if that env var isn't propagating correctly.
// REMEMBER TO SET THIS BACK TO `false` BEFORE CHARGING REAL CUSTOMERS.
const SKIP_BILLING_GATE_FOR_TESTING = true;

// ─── BakeryApp — Main Application Component ────────────────────────────────────
// All application state, Firestore listeners, business logic, and JSX live here.
function BakeryApp() {
  // ── Core Data State ─────────────────────────────────────────────────────────
  // Initialised with seed data; overwritten by Firestore onSnapshot listeners
  // once the user authenticates.
  // materials/categories/menu/orders/experiments/productionRuns/wastageLogs
  // are now owned by useFirestoreCollection() hook calls further down (right
  // after isAuthReady/user are declared) — see the "Firestore Data Listeners"
  // section below.
  const [isProductionRunModalOpen, setIsProductionRunModalOpen] = useState(false);
  const [productionFilterRecipe, setProductionFilterRecipe] = useState('');
  const [productionFilterPurpose, setProductionFilterPurpose] = useState('');
  // ── UI / Navigation State ─────────────────────────────────────────────────────
  // Active tab is persisted to localStorage so the user returns to the same view.
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    return (localStorage.getItem('activeTab') as any) || 'inventory';
  });

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'bakery' | 'integrations' | 'customisation' | 'account' | 'categories'>('bakery');
  // ── Date & Filtering State ────────────────────────────────────────────────────
  // currency is now owned by useSettingsListener() further down.
  const [summaryRange, setSummaryRange] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
  const [summaryDateStart, setSummaryDateStart] = useState(new Date().toISOString().split('T')[0]);
  const [summaryDateEnd, setSummaryDateEnd] = useState(new Date().toISOString().split('T')[0]);
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  // Orders tab date-range filter (defaults to last 7 days)
  const [orderFilterStart, setOrderFilterStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0];
  });
  const [orderFilterEnd, setOrderFilterEnd] = useState(new Date().toISOString().split('T')[0]);
  // Add Order modal state — the modal itself (AddOrderModal) owns its form
  // fields, same as ProductionRunModal; App.tsx only needs to control visibility.
  const [isAddOrderModalOpen, setIsAddOrderModalOpen] = useState(false);
  // Set when the modal is opened from Market Stock's "Add to Order" action
  // (see openAddOrderModalFor below) so the modal starts pre-filled with
  // that specific item instead of the menu's first item. Cleared whenever
  // the modal closes so a later plain "Add Order" click starts blank again.
  const [addOrderPresetItemId, setAddOrderPresetItemId] = useState<string | null>(null);
  const openAddOrderModalFor = (menuItemId: string) => {
    setAddOrderPresetItemId(menuItemId);
    setIsAddOrderModalOpen(true);
  };
  const [summaryRefDate, setSummaryRefDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);
  const [inventorySortBy, setInventorySortBy] = useState<'name' | 'stock' | 'cost' | 'date'>('name');
  const [inventorySortOrder, setInventorySortOrder] = useState<'asc' | 'desc'>('asc');
  const [isIngredientSelectorOpen, setIsIngredientSelectorOpen] = useState(false);
  const [activeRecipeItemId, setActiveRecipeItemId] = useState<string | null>(null);
  // settings is now owned by useSettingsListener() further down.
  // ── Authentication State ─────────────────────────────────────────────────────
  const [user, setUser] = useState<AppUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // ── Firestore Data Listeners ──────────────────────────────────────────────────
  // Each of these subscribes to its own Firestore collection/document
  // independently (extracted from what was previously one big combined
  // `useEffect` — see docs/CHANGELOG.md). `setLastSynced` is passed as the
  // update callback for the five collections that drive the "Last Synced"
  // indicator; settings and wastageLogs don't need it, matching the original
  // behavior exactly.
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchLastSynced = () => setLastSynced(new Date());

  const [materials, setMaterials] = useFirestoreCollection<RawMaterial>(
    'materials', isAuthReady, user, (id, data) => ({ id, ...data } as RawMaterial), touchLastSynced, INITIAL_MATERIALS
  );
  const [menu, setMenu] = useFirestoreCollection<MenuItem>(
    'menu', isAuthReady, user, (id, data) => ({ id, ...data, recipe: data.recipe || [] } as MenuItem), touchLastSynced, INITIAL_MENU
  );
  const [orders, setOrders] = useFirestoreCollection<Order>(
    'orders', isAuthReady, user, (id, data) => ({ id, ...data } as Order), touchLastSynced
  );
  const [experiments, setExperiments] = useFirestoreCollection<RecipeExperiment>(
    'experiments', isAuthReady, user, (id, data) => ({ id, ...data, materials: data.materials || [] } as RecipeExperiment), touchLastSynced
  );
  const [productionRuns, setProductionRuns] = useFirestoreCollection<ProductionRun>(
    'productionRuns', isAuthReady, user, (id, data) => ({ id, ...data } as ProductionRun), touchLastSynced
  );
  const [wastageLogs, setWastageLogs] = useFirestoreCollection<WastageLog>(
    'wastageLogs', isAuthReady, user, (id, data) => ({ id, ...data } as WastageLog), undefined, INITIAL_WASTAGE_LOGS
  );
  const { settings, setSettings, categories, setCategories, currency, setCurrency } = useSettingsListener(isAuthReady, user);

  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'google'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  // ── Modal / Notification State ──────────────────────────────────────────────────
  const [modalConfig, setModalConfig] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm?: () => void;
    type: 'alert' | 'confirm';
  }>({ show: false, title: '', message: '', type: 'alert' });
  const [notifications, setNotifications] = useState<{ id: string, message: string, type: 'low-stock' }[]>([]);
  // Tracks the previous count of low-stock items to detect newly-triggered alerts.
  const prevLowStockCount = React.useRef(0);

  /**
   * Displays a non-interactive informational modal.
   * @param title   - Modal heading.
   * @param message - Body text to display.
   */
  const showAlert = (title: string, message: string) => {
    setModalConfig({ show: true, title, message, type: 'alert' });
  };

  // ── Integrations (Shopify / Odoo) ────────────────────────────────────────────
  // Extracted to src/hooks/useIntegrations.ts as part of the Phase 4 breakup —
  // see that file for the full implementation (status, connect/disconnect,
  // order import). Behavior is unchanged from the original inline version.
  const {
    shopifyStatus, shopifyConfig, shopifyShopInput, setShopifyShopInput,
    isConnectingShopify, connectShopify, disconnectShopify,
    isImportingShopify, importShopifyOrders,
    odooStatus, odooUrlInput, setOdooUrlInput, odooDbInput, setOdooDbInput,
    odooUsernameInput, setOdooUsernameInput, odooPasswordInput, setOdooPasswordInput,
    isConnectingOdoo, connectOdoo, disconnectOdoo,
    isImportingOdoo, importOdooOrders,
  } = useIntegrations(menu, orderDate, showAlert, isAuthReady && !!user);

  const { billing, isLoadingBilling, hasAccess, startCheckout, isStartingCheckout, openBillingPortal, isOpeningPortal } = useBilling(isAuthReady && !!user, showAlert);

  const [isAlertDismissed, setIsAlertDismissed] = useState(false);
  const [isExpiredAlertDismissed, setIsExpiredAlertDismissed] = useState(false);

  // ─── Firebase Auth ───────────────────────────────────────────────────────────

  // Subscribes to Firebase Auth state changes. Sets `user` and `isAuthReady`
  // so the rest of the app knows whether Firestore listeners can safely attach.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Owner'
        });
      } else {
        setUser(null);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  /**
   * Initiates a Google OAuth popup sign-in flow.
   * On success, `onAuthStateChanged` above updates `user` state automatically.
   * Errors are surfaced to the user via `authError` state.
   */
  const handleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login failed', error);
      setAuthError(describeAuthError(error, 'google'));
    }
  };

  /**
   * Handles email/password sign-in or account creation.
   *
   * - In 'signup' mode: creates the Firebase user and updates their display name.
   * - In 'login' mode: signs in with existing credentials.
   * Firebase-specific error codes are translated into human-readable messages.
   *
   * @param e - The form submit event (prevents page reload).
   */
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsAuthenticating(true);

    try {
      if (authMode === 'signup') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) {
          await updateProfile(userCredential.user, { displayName });
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error('Email auth failed', error);
      const message = describeAuthError(error, 'email');
      setAuthError(message);
    } finally {
      setIsAuthenticating(false);
    }
  };

  /**
   * Seeds realistic demo data for a newly created demo user in Firestore.
   * Sets up settings, materials, menu items, sales orders, production runs, and R&D sessions.
   * Uses a single atomic writeBatch to ensure all writes complete together.
   * Default currency is set to INR (Indian Rupee, code: 'INR', symbol: '₹').
   * The data itself lives in utils/demoData.ts, where every dependent number
   * (batch costs, ingredient and shelf stock) is derived so the demo adds up.
   */
  const seedDemoData = async (userId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const demo = buildDemoData(userId, today);
    const batch = writeBatch(db);

    batch.set(doc(db, 'users', userId, 'settings', 'bakery'), demo.settings);
    demo.materials.forEach(mat => batch.set(doc(db, 'users', userId, 'materials', mat.id), mat));
    demo.menu.forEach(item => batch.set(doc(db, 'users', userId, 'menu', item.id), item));
    demo.orders.forEach(order => batch.set(doc(db, 'users', userId, 'orders', order.id), order));
    demo.productionRuns.forEach(run => batch.set(doc(db, 'users', userId, 'productionRuns', run.id), run));
    demo.experiments.forEach(exp => batch.set(doc(db, 'users', userId, 'experiments', exp.id), exp));

    await batch.commit();
  };

  /**
   * Generates a unique temporary email and logs in as a demo user.
   * Once authenticated, seeds the Firestore space with rich mock data.
   */
  const handleDemoLogin = async () => {
    setAuthError(null);
    setIsDemoLoading(true);
    try {
      const demoEmail = `demo_${Date.now()}_${Math.floor(Math.random() * 10000)}@bettereat.com`;
      const demoPassword = `DemoPassword123!`;
      const userCredential = await createUserWithEmailAndPassword(auth, demoEmail, demoPassword);
      
      // Set the display name to "Demo Owner"
      await updateProfile(userCredential.user, { displayName: 'Demo Owner' });
      
      // Seed the database for this new UID
      await seedDemoData(userCredential.user.uid);
    } catch (error: any) {
      console.error('Demo login failed', error);
      setAuthError(describeAuthError(error, 'demo'));
      // If the account was created but seeding failed, don't leave the visitor
      // signed in to an empty app behind a stale error banner.
      if (auth.currentUser) await signOut(auth).catch(() => {});
    } finally {
      setIsDemoLoading(false);
    }
  };

  /**
   * Signs the current Firebase user out.
   * `onAuthStateChanged` will set `user` to null, unmounting the main app UI.
   */
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed', error);
    }
  };


  /**
   * Displays a confirmation modal with Cancel / Confirm actions.
   * @param title     - Modal heading.
   * @param message   - Body text to display.
   * @param onConfirm - Callback invoked when the user clicks the confirm button.
   */
  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalConfig({ show: true, title, message, onConfirm, type: 'confirm' });
  };

  const [showSaveFeedback, setShowSaveFeedback] = useState(false);

  // ── Settings Persistence ─────────────────────────────────────────────────────
  // Extracted to src/hooks/useSettings.ts as part of the Phase 4 breakup.
  // `settings` state itself stays here (populated by the combined Firestore
  // listener below) — this hook owns the save/update side effects only.
  const { updateSettingsField, updateCurrency, saveSettings } = useSettings(
    settings, setSettings, isAuthReady, categories, currency, setCurrency, setShowSaveFeedback
  );

  // ── Inventory / Materials Actions ────────────────────────────────────────────
  // Extracted to src/hooks/useInventoryActions.ts as part of the Phase 4 breakup.
  // `materials`/`categories`/`menu` state stays here (populated by the combined
  // Firestore listener above) — this hook owns materials/category CRUD, CSV
  // import/export, and the Restock modal's own state + submit handler.
  const {
    addMaterial, handleDownloadTemplate, handleImportCSV, addCategory, deleteCategory,
    updateMaterial, patchMaterial, deleteMaterial,
    restockMaterial, setRestockMaterial, restockQty, setRestockQty,
    restockBaseTotal, setRestockBaseTotal, restockExpiryDate, setRestockExpiryDate,
    handleRestock,
    nutritionEditMaterial, setNutritionEditMaterial, openNutritionEditor,
    nutritionCalories, setNutritionCalories, nutritionProtein, setNutritionProtein,
    nutritionCarbs, setNutritionCarbs, nutritionFat, setNutritionFat,
    nutritionAllergens, toggleNutritionAllergen, saveNutritionInfo, nutritionSourceUsed,
    nutritionSearchQuery, setNutritionSearchQuery, isSearchingNutrition,
    usdaSearchResults, usdaSearchError, offSearchResults, offSearchError,
    searchNutritionSources, applyNutritionSearchResult,
  } = useInventoryActions(materials, categories, menu, showAlert, showConfirm);

  // ── Menu / Recipe Actions ────────────────────────────────────────────────────
  // Extracted to src/hooks/useMenuActions.ts as part of the Phase 4 breakup.
  const {
    addMenuItem, updateMenuItem, updateMenuItemField, deleteMenuItem, clearFinishedGoodsStock,
    copyMenuItem, addIngredientToRecipe, addQuickIngredientsToRecipe,
    updateRecipeIngredient, removeIngredientFromRecipe,
  } = useMenuActions(menu, materials, orders, showAlert);

  // ── Order Actions ────────────────────────────────────────────────────────────
  // Extracted to src/hooks/useOrderActions.ts as part of the Phase 4 breakup.
  const {
    addOrderGroup, fulfillOrder, markOrdersPaid, updateOrder, deleteOrder, resetOrders,
  } = useOrderActions(menu, orders, orderDate, showConfirm, showAlert);

  // ── Production Run Actions ───────────────────────────────────────────────────
  // Extracted to src/hooks/useProductionActions.ts as part of the Phase 4 breakup.
  const {
    logProductionRun, logProductionRunSession, deleteProductionRun, deleteProductionRunSession, handleDiscardBatch,
  } = useProductionActions(menu, materials, productionRuns, orders, showAlert);

  // ── Experiment Actions ───────────────────────────────────────────────────────
  // Extracted to src/hooks/useExperimentActions.ts as part of the Phase 4 breakup.
  const {
    addExperiment, updateExperiment, deleteExperiment,
    addMaterialToExperiment, removeMaterialFromExperiment, updateExperimentMaterial,
  } = useExperimentActions(experiments, materials);

  // ── Wastage / Discard Actions ────────────────────────────────────────────────
  // Extracted to src/hooks/useWastageActions.ts as part of the Phase 4 breakup.
  // Wired up to real UI triggers in InventoryView (materials) and MenuView
  // (finished goods) — previously unreachable dead code.
  const {
    discardTarget, setDiscardTarget, discardQty, setDiscardQty,
    discardReason, setDiscardReason, handleDiscard,
  } = useWastageActions(materials, menu, showAlert);

  const filteredProductionRuns = useMemo(() => {
    return productionRuns.filter(r => r.date >= summaryDateStart && r.date <= summaryDateEnd);
  }, [productionRuns, summaryDateStart, summaryDateEnd]);

  // Sum of `costTotal` across all production runs in the selected period.
  const totalProductionCost = useMemo(() => {
    return filteredProductionRuns.reduce((sum, r) => sum + (r.costTotal || 0), 0);
  }, [filteredProductionRuns]);

  // Aggregated material usage from experiments (not range-filtered). Used
  // to compute remaining inventory displayed on the Inventory tab.
  //
  // Orders no longer factor in here as of the production-run/order
  // redesign: raw materials are deducted exactly once, at production time
  // (see logProductionRun) — an order only ever claims finished-goods
  // stock (a separate field), fulfilled or not, so it never touches raw
  // materials. Experiments are the one case that still needs this
  // projection: logging an experiment's material list never deducts
  // `initialStock` for real, so its usage stays a pending draw until the
  // material is actually restocked/adjusted by hand.
  const inventoryUsage = useMemo(
    () => getExperimentMaterialUsage(experiments, materials),
    [materials, experiments]
  );

  // Same as inventoryUsage, filtered to the summary date range.
  const summaryInventoryUsage = useMemo(() => {
    const rangeExperiments = experiments.filter(e => e.date >= summaryDateStart && e.date <= summaryDateEnd);
    return getExperimentMaterialUsage(rangeExperiments, materials);
  }, [materials, experiments, summaryDateStart, summaryDateEnd]);

  // Current on-hand stock after deducting all recorded usage.
  // `remaining` is displayed as the live stock level on the Inventory tab.
  const remainingInventory = useMemo(() => {
    return materials.map(mat => {
      const used = inventoryUsage[mat.id] || 0;
      return {
        ...mat,
        used: parseFloat(used.toFixed(2)),
        remaining: parseFloat((mat.initialStock - used).toFixed(2)),
        threshold: mat.threshold || 0
      };
    });
  }, [materials, inventoryUsage]);

  // `remainingInventory` sorted by the user's chosen column and direction.
  const sortedRemainingInventory = useMemo(() => {
    return [...remainingInventory].sort((a, b) => {
      let comparison = 0;
      switch (inventorySortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'stock':
          comparison = a.remaining - b.remaining;
          break;
        case 'cost':
          comparison = a.costPerUnit - b.costPerUnit;
          break;
        case 'date':
          comparison = (a.dateAdded || '').localeCompare(b.dateAdded || '');
          break;
      }
      return inventorySortOrder === 'asc' ? comparison : -comparison;
    });
  }, [remainingInventory, inventorySortBy, inventorySortOrder]);

  // Items whose remaining stock is at or below their percentage-based threshold.
  // Drives the header alert badge and the notification toasts.
  const lowStockItems = useMemo(() => {
    return remainingInventory.filter(item => {
      // Only alert when a threshold has been explicitly set (> 0)
      // to avoid false alerts on newly added items with 0 stock.
      return (item.threshold ?? 0) > 0 && item.remaining <= item.threshold!;
    });
  }, [remainingInventory]);

  // Low-stock notification effect: fires a toast whenever a new item crosses the
  // threshold (comparing current count to the previous render's count via ref).
  // Toasts auto-dismiss after 5 seconds.
  useEffect(() => {
    if (lowStockItems.length > prevLowStockCount.current) {
      setIsAlertDismissed(false);
      const newItem = lowStockItems[lowStockItems.length - 1];
      const newNotification = {
        id: Math.random().toString(36).substr(2, 9),
        message: `Low stock alert: ${newItem.name} is down to ${newItem.remaining} ${newItem.unit}`,
        type: 'low-stock' as const
      };
      setNotifications(prev => [...prev, newNotification]);
      
      // Auto-remove after 5 seconds
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
      }, 5000);
    }
    prevLowStockCount.current = lowStockItems.length;
  }, [lowStockItems]);

  /**
   * Computes income, ingredient expenses (orders + experiments), and profit
   * for orders and experiments that fall within [start, end].
   *
   * Income    = sum of (sellingPrice × quantity) across matching orders.
   * Expenses  = sum of (materialCostPerUnit × usedAmount) for both orders and R&D.
   * Profit    = income − expenses.
   *
   * This function is called both inline (for the financials memo) and
   * per-data-point inside `chartData` to avoid repeated filter logic.
   *
   * @param start - ISO date string for the range start (inclusive).
   * @param end   - ISO date string for the range end (inclusive).
   */
  const getFinancialsForRange = (start: string, end: string) => {
    const rangeOrders = orders.filter(o => o.date >= start && o.date <= end);
    const rangeExperiments = experiments.filter(e => e.date >= start && e.date <= end);
    const usage: Record<string, number> = {};
    const expUsage: Record<string, number> = {};
    
    rangeOrders.forEach(order => {
      const item = menu.find(m => m.id === order.menuItemId);
      if (item) {
        item.recipe.forEach(req => {
          const mat = materials.find(m => m.id === req.materialId);
          if (mat) {
            const convertedAmount = convertAmount(req.amount, req.unit || 'g', mat.unit);
            usage[req.materialId] = (usage[req.materialId] || 0) + (convertedAmount * order.quantity);
          }
        });
      }
    });

    rangeExperiments.forEach(exp => {
      exp.materials.forEach(req => {
        const mat = materials.find(m => m.id === req.materialId);
        if (mat) {
          const convertedAmount = convertAmount(req.amount, req.unit || 'g', mat.unit);
          expUsage[req.materialId] = (expUsage[req.materialId] || 0) + convertedAmount;
        }
      });
    });

    // Delivery charge/fee attributed once per orderGroupId, not once per
    // document within a group — see attributeDeliveryFieldByGroup. A group's
    // members share one delivery, so naively summing every document's field
    // would multiply-count it by the group size.
    const deliveryChargeByOrder = attributeDeliveryFieldByGroup(rangeOrders, 'deliveryCharge');
    const deliveryFeeByOrder = attributeDeliveryFieldByGroup(rangeOrders, 'deliveryFee');

    const income = rangeOrders.reduce((acc, order) => {
      const item = menu.find(m => m.id === order.menuItemId);
      const itemRevenue = item ? (item.sellingPrice || 0) * order.quantity : 0;
      return acc + itemRevenue + (deliveryChargeByOrder.get(order.id) || 0);
    }, 0);

    const orderExpenses = materials.reduce((acc, mat) => {
      const used = usage[mat.id] || 0;
      return acc + (used * (mat.costPerUnit || 0));
    }, 0);

    const experimentExpenses = materials.reduce((acc, mat) => {
      const used = expUsage[mat.id] || 0;
      return acc + (used * (mat.costPerUnit || 0));
    }, 0);

    // Fees paid to third-party couriers (Uber, Porter, etc.) for orders in
    // this range. Self-delivery/pickup orders have no fee tracked here.
    const deliveryExpenses = rangeOrders.reduce((acc, order) => acc + (deliveryFeeByOrder.get(order.id) || 0), 0);

    // Cost of discarded/expired stock logged in this range (see handleDiscardBatch
    // and useWastageActions) — wasted material and finished-goods cost that was
    // already paid for but never turned into revenue.
    const rangeWastage = wastageLogs.filter(w => w.date >= start && w.date <= end);
    const wastageExpenses = rangeWastage.reduce((acc, w) => acc + (w.cost || 0), 0);

    const expenses = orderExpenses + experimentExpenses + deliveryExpenses + wastageExpenses;

    // GST collected on sales (output tax) — only meaningful while GST is
    // switched on in Settings; otherwise there's no rate to apply.
    const gstCollected = settings.gstApplicable
      ? rangeOrders.reduce((acc, order) => {
          const item = menu.find(m => m.id === order.menuItemId);
          const itemRevenue = item ? (item.sellingPrice || 0) * order.quantity : 0;
          const saleAmount = itemRevenue + (deliveryChargeByOrder.get(order.id) || 0);
          return acc + splitSaleForGst(saleAmount, settings.gstRate || 0, settings.gstPricingMode || 'exclusive').gstAmount;
        }, 0)
      : 0;

    // GST paid on materials consumed by these orders (input tax), using each
    // material's own gstRate — independent of the output-side toggle above.
    const gstPaid = calculateMaterialGstPaid(
      materials.map(mat => ({ usedAmount: usage[mat.id] || 0, costPerUnit: mat.costPerUnit, gstRate: mat.gstRate }))
    );

    return { income, expenses, orderExpenses, experimentExpenses, deliveryExpenses, wastageExpenses, gstCollected, gstPaid, profit: income - orderExpenses - deliveryExpenses - wastageExpenses };
  };

  // Round-to-2-decimal wrapper around `getFinancialsForRange` for the summary period.
  // Re-computed when date bounds, orders, experiments, menu prices, or material costs change.
  const financials = useMemo(() => {
    const fins = getFinancialsForRange(summaryDateStart, summaryDateEnd);
    return { 
      income: parseFloat(fins.income.toFixed(2)), 
      expenses: parseFloat(fins.expenses.toFixed(2)), 
      orderExpenses: parseFloat(fins.orderExpenses.toFixed(2)),
      experimentExpenses: parseFloat(fins.experimentExpenses.toFixed(2)),
      deliveryExpenses: parseFloat(fins.deliveryExpenses.toFixed(2)),
      wastageExpenses: parseFloat(fins.wastageExpenses.toFixed(2)),
      gstCollected: parseFloat(fins.gstCollected.toFixed(2)),
      gstPaid: parseFloat(fins.gstPaid.toFixed(2)),
      profit: parseFloat(fins.profit.toFixed(2))
    };
  }, [summaryDateStart, summaryDateEnd, orders, experiments, menu, materials, wastageLogs, settings.gstApplicable, settings.gstRate, settings.gstPricingMode]);

  // Data points for the Recharts AreaChart.
  // Shape adapts based on summaryRange: daily→7 days, weekly→5 weeks, monthly→6 months.
  // Custom range shows per-day if ≤ 14 days, otherwise shows two aggregate points.
  const chartData = useMemo(() => {
    const data = [];
    const refDate = new Date(summaryRefDate);
    
    if (summaryRange === 'daily') {
      // Last 7 days
      for (let i = 6; i >= 0; i--) {
        const d = new Date(refDate);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const fins = getFinancialsForRange(dateStr, dateStr);
        data.push({ 
          name: d.toLocaleDateString('default', { month: 'short', day: 'numeric' }), 
          income: fins.income,
          expenses: fins.expenses,
          profit: fins.profit
        });
      }
    } else if (summaryRange === 'weekly') {
      // Last 5 weeks
      for (let i = 4; i >= 0; i--) {
        const start = new Date(refDate);
        start.setDate(refDate.getDate() - refDate.getDay() - (i * 7));
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];
        const fins = getFinancialsForRange(startStr, endStr);
        data.push({ 
          name: `W${start.getDate()}/${start.getMonth() + 1}`, 
          income: fins.income,
          expenses: fins.expenses,
          profit: fins.profit
        });
      }
    } else if (summaryRange === 'monthly') {
      // Last 6 months
      for (let i = 5; i >= 0; i--) {
        const d = new Date(refDate.getFullYear(), refDate.getMonth() - i, 1);
        const startStr = d.toISOString().split('T')[0];
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const endStr = end.toISOString().split('T')[0];
        const fins = getFinancialsForRange(startStr, endStr);
        data.push({ 
          name: d.toLocaleDateString('default', { month: 'short' }), 
          income: fins.income,
          expenses: fins.expenses,
          profit: fins.profit
        });
      }
    } else {
      // Custom range - just show start and end if long, or daily if short
      const start = new Date(summaryDateStart);
      const end = new Date(summaryDateEnd);
      const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 14) {
        for (let i = 0; i <= diffDays; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          const dateStr = d.toISOString().split('T')[0];
          const fins = getFinancialsForRange(dateStr, dateStr);
          data.push({ 
            name: d.toLocaleDateString('default', { month: 'short', day: 'numeric' }), 
            income: fins.income,
            expenses: fins.expenses,
            profit: fins.profit
          });
        }
      } else {
        // Just show summary
        data.push({ name: 'Period Start', income: 0, expenses: 0, profit: 0 });
        const fins = getFinancialsForRange(summaryDateStart, summaryDateEnd);
        data.push({ name: 'Period Total', income: fins.income, expenses: fins.expenses, profit: fins.profit });
      }
    }
    return data;
  }, [orders, menu, materials, wastageLogs, summaryRange, summaryRefDate, summaryDateStart, summaryDateEnd]);

  /**
   * Provides visual "refresh" feedback by updating `lastSynced`.
   * Because all data is sourced from `onSnapshot` listeners, no actual
   * re-fetch is needed — this simply reassures the user the data is current.
   */
  const refreshData = async () => {
    setIsRefreshing(true);
    // Since we use onSnapshot, data is already real-time.
    // This button provides visual feedback and ensures the UI is fresh.
    setLastSynced(new Date());
    setTimeout(() => setIsRefreshing(false), 800);
  };

  // ─── Material (Inventory) CRUD Handlers ───────────────────────────────────────────────

  /**
   * Adds a new blank `RawMaterial` document to Firestore (`users/{userId}/materials/{id}`).
   *
   * @param category - The category string to assign, defaults to 'Raw Materials'.
   */
  /**
   * Submits the Add Material modal form, creating a new material with all fields.
   */
  const handleAddMaterialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !addMatName.trim()) return;
    const userId = auth.currentUser.uid;
    const id = Math.random().toString(36).substr(2, 9);
    const newMat: RawMaterial = {
      id,
      name: addMatName.trim(),
      unit: addMatUnit,
      initialStock: parseFloat(addMatStock) || 0,
      costPerUnit: parseFloat(addMatCost) || 0,
      category: addMaterialCategory,
      threshold: parseFloat(addMatThreshold) || 0,
      dateAdded: new Date().toISOString().split('T')[0],
      ...(addMatExpiry ? { expiryDate: addMatExpiry } : {}),
    };
    try {
      await setDoc(doc(db, 'users', userId, 'materials', id), newMat);
      setShowAddMaterialModal(false);
      setAddMatName('');
      setAddMatUnit('g');
      setAddMatStock('');
      setAddMatCost('');
      setAddMatThreshold('');
      setAddMatExpiry('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userId}/materials/${id}`);
    }
  };

  // Add Material modal state
  const [showAddMaterialModal, setShowAddMaterialModal] = useState<boolean>(false);
  const [addMaterialCategory, setAddMaterialCategory] = useState<string>('Raw Materials');
  const [addMatName, setAddMatName] = useState<string>('');
  const [addMatUnit, setAddMatUnit] = useState<string>('g');
  const [addMatStock, setAddMatStock] = useState<string>('');
  const [addMatCost, setAddMatCost] = useState<string>('');
  const [addMatThreshold, setAddMatThreshold] = useState<string>('');
  const [addMatExpiry, setAddMatExpiry] = useState<string>('');

  // ─── Summary / Financial Helpers ─────────────────────────────────────────────────────

  /**
   * Computes `summaryDateStart` / `summaryDateEnd` from the selected
   * `summaryRange` and `refDate`. For 'custom', bounds are set manually.
   *
   * @param range   - The time window to apply.
   * @param refDate - The anchor date (defaults to `summaryRefDate`).
   */
  const handleRangeChange = (range: 'daily' | 'weekly' | 'monthly' | 'custom', refDate: string = summaryRefDate) => {
    setSummaryRange(range);
    setSummaryRefDate(refDate);
    const today = new Date(refDate);
    const start = new Date(today);
    let end = new Date(today);

    if (range === 'daily') {
      // already set to today
    } else if (range === 'weekly') {
      // Start of week (Sunday)
      start.setDate(today.getDate() - today.getDay());
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    } else if (range === 'monthly') {
      // Start of month
      start.setDate(1);
      // End of month
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    }

    setSummaryDateStart(start.toISOString().split('T')[0]);
    setSummaryDateEnd(end.toISOString().split('T')[0]);
  };

  // ─── Computed Values (useMemo) ──────────────────────────────────────────────────────
  // Unsold batches needing a freshness check today — aging (no known expiry
  // and sitting a couple of days, or close to a known expiry) or already
  // expired. See src/utils/stockAging.ts for the tiering rules.
  const agingBatches = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return getBatchesNeedingAttention(productionRuns, today);
  }, [productionRuns]);

  // Aggregated income/expenses/profit for the currently selected date range.
  // Re-computed whenever orders, menu prices, materials costs, or date bounds change.
  const summaryFinancials = useMemo(() => getFinancialsForRange(summaryDateStart, summaryDateEnd), [summaryDateStart, summaryDateEnd, orders, menu, materials, wastageLogs, settings.gstApplicable, settings.gstRate, settings.gstPricingMode]);
  // Count and average value of orders within the selected period.
  const activeOrdersCount = useMemo(() => orders.filter(o => o.date >= summaryDateStart && o.date <= summaryDateEnd).length, [orders, summaryDateStart, summaryDateEnd]);
  const averageOrderValue = useMemo(() => activeOrdersCount > 0 ? summaryFinancials.income / activeOrdersCount : 0, [summaryFinancials.income, activeOrdersCount]);

  /** Triggers a 2-second success animation without writing to Firestore. */
  const saveDay = () => {
    setShowSaveFeedback(true);
    setTimeout(() => setShowSaveFeedback(false), 2000);
  };

  // ─── Render Helpers ──────────────────────────────────────────────────────────────

  // ─── Render Gate: Loading ──────────────────────────────────────────────────────
  // Shows a spinner while Firebase Auth resolves the session on first load.
  if (!isAuthReady) {
    return <LoadingScreen />;
  }

  // ─── Render Gate: Authentication ───────────────────────────────────────────────────
  // If auth is ready but no user is signed in, render the login / sign-up card.
  // Supports Google OAuth popup and email/password auth modes.
  if (!user) {
    return (
      <AuthScreen
        mode={authMode}
        onModeChange={setAuthMode}
        displayName={displayName}
        onDisplayNameChange={setDisplayName}
        email={email}
        onEmailChange={setEmail}
        password={password}
        onPasswordChange={setPassword}
        error={authError}
        onClearError={() => setAuthError(null)}
        isAuthenticating={isAuthenticating}
        isDemoLoading={isDemoLoading}
        onGoogle={handleLogin}
        onEmailSubmit={handleEmailAuth}
        onDemo={handleDemoLogin}
      />
    );
  }

  // ─── Render Gate: Billing ───────────────────────────────────────────────────────────
  // Signed in but no active/trialing subscription: show a paywall instead of the app.
  // Waits for isLoadingBilling to resolve first, so we don't flash the paywall before
  // we actually know the user's real status.
  if (!SKIP_BILLING_GATE_FOR_TESTING && isLoadingBilling) {
    return <LoadingScreen message="Checking your plan..." />;
  }

  if (!SKIP_BILLING_GATE_FOR_TESTING && !hasAccess) {
    const isPastDueOrCanceled = billing.status === 'past_due' || billing.status === 'canceled';
    return (
      <PaywallScreen
        needsAttention={isPastDueOrCanceled}
        isBusy={isStartingCheckout || isOpeningPortal}
        onContinue={() => isPastDueOrCanceled ? openBillingPortal() : startCheckout(user?.email || undefined)}
        onSignOut={handleLogout}
      />
    );
  }

  const StatCard = ({ label, value, icon: Icon, color, trend, subtext }: { label: string, value: string, icon: any, color: string, trend?: { value: string, up: boolean }, subtext?: string }) => (
    <div className="bg-white p-6 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm bento-item flex flex-col justify-between">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${color} shadow-lg shadow-current/10`}>
          <Icon size={24} />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-bold ${trend.up ? 'text-emerald-600' : 'text-rose-600'}`}>
            {trend.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {trend.value}
          </div>
        )}
      </div>
      <div>
        <h3 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">{label}</h3>
        <div className="text-2xl font-sans font-bold text-stone-900">{value}</div>
        {subtext && <p className="text-[10px] text-stone-400 mt-1 font-medium font-sans italic">{subtext}</p>}
      </div>
    </div>
  );

  // ─── Main Application Render ──────────────────────────────────────────────────────
  // The primary UI layout, containing the top navigation header and the tabbed
  // main content area wrapped in an AnimatePresence for smooth transitions.

  
  const appProps: any = {
    patchMaterial, setRestockExpiryDate, restockMaterial, setRestockMaterial,
    setDiscardTarget, openNutritionEditor,
    shopifyStatus, shopifyConfig, shopifyShopInput, setShopifyShopInput, isConnectingShopify, connectShopify, disconnectShopify,
    importShopifyOrders, isImportingShopify,
    odooStatus, odooUrlInput, setOdooUrlInput, odooDbInput, setOdooDbInput, odooUsernameInput, setOdooUsernameInput,
    odooPasswordInput, setOdooPasswordInput, isConnectingOdoo, connectOdoo, disconnectOdoo,
    importOdooOrders, isImportingOdoo,
    isRefreshing, lastSynced, handleDownloadTemplate, handleImportCSV, setAddMaterialCategory, setShowAddMaterialModal,
    materials, setMaterials, categories, setCategories, menu, setMenu, orders, setOrders,
    experiments, setExperiments, productionRuns, setProductionRuns, wastageLogs, setWastageLogs,
    isProductionRunModalOpen, setIsProductionRunModalOpen, productionFilterRecipe, setProductionFilterRecipe,
    productionFilterPurpose, setProductionFilterPurpose, activeTab, setActiveTab, activeSettingsTab,
    setActiveSettingsTab, currency, setCurrency, summaryRange, setSummaryRange, summaryDateStart,
    setSummaryDateStart, summaryDateEnd, setSummaryDateEnd, orderDate, setOrderDate, orderFilterStart,
    setOrderFilterStart, orderFilterEnd, setOrderFilterEnd, isAddOrderModalOpen, setIsAddOrderModalOpen,
    openAddOrderModalFor,
    summaryRefDate, setSummaryRefDate, expandedRecipeId, setExpandedRecipeId, inventorySortBy,
    setInventorySortBy, inventorySortOrder, setInventorySortOrder, isIngredientSelectorOpen,
    setIsIngredientSelectorOpen, activeRecipeItemId, setActiveRecipeItemId, settings, setSettings,
    user, isAlertDismissed, setIsAlertDismissed, isExpiredAlertDismissed, setIsExpiredAlertDismissed,
    inventoryUsage, summaryInventoryUsage, remainingInventory, sortedRemainingInventory, lowStockItems,
    summaryFinancials, activeOrdersCount, averageOrderValue, financials, chartData, handleRangeChange,
    refreshData, addMaterial, addCategory, deleteCategory, updateMaterial, deleteMaterial,
    addMenuItem, updateMenuItem, updateMenuItemField, deleteMenuItem, clearFinishedGoodsStock,
    addExperiment, updateExperiment, deleteExperiment, addMaterialToExperiment, updateExperimentMaterial,
    removeMaterialFromExperiment, copyMenuItem, addIngredientToRecipe,
    addQuickIngredientsToRecipe, updateRecipeIngredient, removeIngredientFromRecipe, logProductionRun,
    deleteProductionRun, deleteProductionRunSession, handleDiscardBatch,
    addOrderGroup, fulfillOrder, markOrdersPaid, updateOrder, deleteOrder, resetOrders, saveSettings,
    handleRestock, showSaveFeedback, saveDay,
    updateCurrency, updateSettingsField, handleLogout, convertAmount,
    billing, openBillingPortal, isOpeningPortal, startCheckout, isStartingCheckout,
  };

  return (
    <div className="min-h-screen bg-surface text-ink font-sans flex flex-col md:flex-row pb-20 md:pb-0">
      
      {/* Desktop Left Sidebar */}
      <aside className="hidden md:flex flex-col w-64 lg:w-72 bg-white shadow-[1px_0_8px_rgba(0,0,0,0.04)] sticky top-0 h-screen overflow-y-auto shrink-0 z-40">
        <div className="h-16 px-6 flex items-center gap-3 shrink-0">
          <img src="/logo-icon.png" alt="" className="w-9 h-9" />
          <span className="text-base font-bold tracking-tight text-ink">STOCKPOT</span>
        </div>

        {menu.length > 0 && activeTab === 'production' && (
          <div className="px-4 pt-2 pb-4">
            <button
              onClick={() => setIsProductionRunModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-4 py-3 rounded-lg transition-colors active:scale-[0.98] text-sm font-semibold"
            >
              <Factory size={18} />
              New Production Run
            </button>
          </div>
        )}

        <div className="px-4 py-2 flex-1">
          <nav className="flex flex-col gap-1 relative">
            <SidebarTabButton id="summary" label="Dashboard" icon={LayoutDashboard} activeTab={activeTab} setActiveTab={setActiveTab} hasLowStockAlert={lowStockItems.length > 0 && !isAlertDismissed} />
            <SidebarTabButton id="inventory" label="Stock / Inventory" icon={Package} activeTab={activeTab} setActiveTab={setActiveTab} hasLowStockAlert={lowStockItems.length > 0 && !isAlertDismissed} />
            <SidebarTabButton id="orders" label="Orders" icon={ClipboardList} activeTab={activeTab} setActiveTab={setActiveTab} hasLowStockAlert={lowStockItems.length > 0 && !isAlertDismissed} />
            <SidebarTabButton id="production" label="Production Runs" icon={Factory} activeTab={activeTab} setActiveTab={setActiveTab} hasLowStockAlert={lowStockItems.length > 0 && !isAlertDismissed} />
            <SidebarTabButton id="menu" label="Recipes & Menus" icon={BookOpen} activeTab={activeTab} setActiveTab={setActiveTab} hasLowStockAlert={lowStockItems.length > 0 && !isAlertDismissed} />
            <SidebarTabButton id="experiments" label="R&D Lab" icon={FlaskConical} activeTab={activeTab} setActiveTab={setActiveTab} hasLowStockAlert={lowStockItems.length > 0 && !isAlertDismissed} />
            <SidebarTabButton id="wastage" label="Wastage" icon={Trash2} activeTab={activeTab} setActiveTab={setActiveTab} hasLowStockAlert={lowStockItems.length > 0 && !isAlertDismissed} />
          </nav>
        </div>

        <div className="p-4 mt-auto flex flex-col gap-2">
          <SidebarTabButton id="settings" label="Settings" icon={Settings} activeTab={activeTab} setActiveTab={setActiveTab} hasLowStockAlert={lowStockItems.length > 0 && !isAlertDismissed} />
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-stone-50 min-w-0">
            {settings.logo ? (
              <img src={settings.logo} alt="" className="w-6 h-6 rounded-md object-cover shrink-0" />
            ) : (
              <Store size={16} className="text-muted shrink-0" />
            )}
            <span className="text-xs font-semibold text-ink truncate">{settings.name || 'My Bakery'}</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className="bg-white/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] sticky top-0 z-30">
        {/* Notifications */}
        <div className="fixed top-24 right-4 z-50 flex flex-col gap-2 pointer-events-none">
          <AnimatePresence>
            {notifications.map(n => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: 50, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.9 }}
                className="bg-stone-900/90 backdrop-blur-md text-white px-4 sm:px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 pointer-events-auto border border-white/10 max-w-[calc(100vw-2rem)] sm:max-w-md w-full"
              >
                <div className="bg-rose-500 p-1.5 rounded-lg shadow-lg shadow-rose-500/20">
                  <AlertCircle size={16} />
                </div>
                <span className="text-sm font-medium">{n.message}</span>
                <button 
                  onClick={() => setNotifications(prev => prev.filter(notif => notif.id !== n.id))}
                  className="ml-2 text-stone-400 hover:text-white transition-colors"
                >
                  <Plus size={16} className="rotate-45" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="px-4 sm:px-6 lg:px-10">
          <div className="flex items-center h-16 gap-3">
            {/* Brand — mobile only; on desktop the sidebar carries it. Shows the
                bakery's own logo/name when set, otherwise Stockpot's. */}
            <div className="md:hidden flex items-center gap-2 min-w-0 shrink">
              {settings.logo ? (
                <img src={settings.logo} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
              ) : (
                <img src="/logo-icon.png" alt="" className="w-9 h-9 shrink-0" />
              )}
              <div className="min-w-0 leading-none">
                <h1 className="text-base font-bold tracking-tight text-ink truncate">{settings.name || 'STOCKPOT'}</h1>
                <div className="flex items-center gap-1 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-margin animate-pulse" />
                  <span className="text-[9.5px] font-semibold tracking-wider text-muted uppercase whitespace-nowrap">Live dashboard</span>
                </div>
              </div>
            </div>

            {/* Alerts — pushed right on mobile, left-aligned on desktop */}
            <div className="flex items-center gap-2 ml-auto md:ml-0 min-w-0">
                            {agingBatches.length > 0 && !isExpiredAlertDismissed && (() => {
                const hasExpired = agingBatches.some(b => b.urgency === 'expired');
                return (
                <div className="relative group shrink-0 z-50">
                  <button
                    className={`relative h-8 w-8 xl:w-auto xl:px-3 flex items-center justify-center gap-1.5 rounded-full text-xs font-semibold transition-colors ${hasExpired ? 'bg-coral text-white hover:bg-coral/90' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
                  >
                    <AlertCircle size={16} />
                    <span className="hidden xl:inline whitespace-nowrap">{hasExpired ? 'Expired stock' : 'Check freshness'}: {agingBatches.length} batch{agingBatches.length === 1 ? '' : 'es'}</span>
                    <span className={`xl:hidden absolute -top-1 -right-1 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center ${hasExpired ? 'bg-coral' : 'bg-amber-600'}`}>
                      {agingBatches.length}
                    </span>
                  </button>
                  <div className="absolute top-full right-0 md:right-auto md:left-0 mt-2 w-64 bg-white shadow-[0_20px_40px_-8px_rgba(43,49,61,0.16)] rounded-[14px] p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none group-hover:pointer-events-auto origin-top-right md:origin-top-left scale-95 group-hover:scale-100">
                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-stone-100">
                      <span className={`text-xs font-bold ${hasExpired ? 'text-rose-600' : 'text-amber-600'}`}>Freshness Alerts</span>
                      <button onClick={() => setIsExpiredAlertDismissed(true)} className="text-[10px] text-stone-400 hover:text-stone-600">Dismiss</button>
                    </div>
                    <ul className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                      {agingBatches.map(({ run: batch, urgency }) => {
                        const recipe = menu.find(m => m.id === batch.recipeId);
                        // Other items from the same multi-item session (see
                        // productionSessionId), so discarding one bad batch is
                        // an informed choice — not a guess based on the recipe
                        // name alone if several things were made together.
                        const sessionSiblings = batch.productionSessionId
                          ? productionRuns
                              .filter(r => r.productionSessionId === batch.productionSessionId && r.id !== batch.id)
                              .map(r => menu.find(m => m.id === r.recipeId)?.name || 'Unknown')
                          : [];
                        const tone = urgency === 'expired' ? 'rose' : 'amber';
                        return (
                          <li key={batch.id} className="flex flex-col gap-0.5 text-xs">
                            <div className="flex justify-between items-center gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0 ${tone === 'rose' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'}`}>
                                  {urgency === 'expired' ? 'Expired' : 'Check freshness'}
                                </span>
                                <span className="font-bold text-stone-700 truncate">{recipe?.name || 'Unknown'}</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`font-medium whitespace-nowrap px-1.5 py-0.5 rounded ${tone === 'rose' ? 'text-rose-500 bg-rose-50' : 'text-amber-600 bg-amber-50'}`}>
                                  Qty: {batch.remainingQuantity}
                                </span>
                                <button
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`Discard ${batch.remainingQuantity} unit(s) of "${recipe?.name || 'this item'}"? This will be logged as wastage.`)) {
                                      handleDiscardBatch(batch, urgency === 'expired' ? 'Expired' : 'Aging Stock');
                                    }
                                  }}
                                  className="p-1 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                  title="Discard this batch and log as wastage"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                            {sessionSiblings.length > 0 && (
                              <span className="text-[9px] text-stone-400 truncate">
                                Also from this session: {sessionSiblings.join(', ')}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <button
                      onMouseDown={() => { setActiveTab('production'); setIsExpiredAlertDismissed(true); }}
                      onClick={() => { setActiveTab('production'); setIsExpiredAlertDismissed(true); }}
                      className="mt-3 w-full block text-[10px] font-bold text-primary uppercase tracking-widest hover:text-primary-dark transition-colors text-center"
                    >
                      View Production Log
                    </button>
                  </div>
                </div>
                );
              })()}
              {lowStockItems.length > 0 && !isAlertDismissed && (
                <div className="relative group shrink-0 z-50">
                  <button
                    className="relative h-8 w-8 xl:w-auto xl:px-3 flex items-center justify-center gap-1.5 rounded-full text-xs font-semibold transition-colors bg-coral/10 text-coral hover:bg-coral/15"
                  >
                    <AlertCircle size={16} />
                    <span className="hidden xl:inline whitespace-nowrap">Low Stock: {lowStockItems.length} item{lowStockItems.length === 1 ? '' : 's'}</span>
                    <span className="xl:hidden absolute -top-1 -right-1 bg-coral text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                      {lowStockItems.length}
                    </span>
                  </button>
                  <div className="absolute top-full right-0 md:right-auto md:left-0 mt-2 w-64 bg-white shadow-[0_20px_40px_-8px_rgba(43,49,61,0.16)] rounded-[14px] p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none group-hover:pointer-events-auto origin-top-right md:origin-top-left scale-95 group-hover:scale-100">
                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-stone-100">
                      <span className="text-xs font-bold text-coral">Low Stock Alerts</span>
                      <button onClick={() => setIsAlertDismissed(true)} className="text-[10px] text-stone-400 hover:text-stone-600">Dismiss</button>
                    </div>
                    <ul className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                      {lowStockItems.map(item => (
                        <li key={item.id} className="flex justify-between items-center text-xs">
                          <span className="font-bold text-stone-700 truncate pr-2">{item.name}</span>
                          <span className="text-rose-500 font-medium whitespace-nowrap bg-rose-50 px-1.5 py-0.5 rounded">
                            {item.initialStock} {item.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <button 
                      onMouseDown={() => { setActiveTab('inventory'); setIsAlertDismissed(true); }}
                      onClick={() => { setActiveTab('inventory'); setIsAlertDismissed(true); }}
                      className="mt-3 w-full block text-[10px] font-bold text-primary uppercase tracking-widest hover:text-primary-dark transition-colors text-center"
                    >
                      View Inventory
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Currency, signed-in user, sign out */}
            <div className="flex items-center gap-2 sm:gap-3 md:ml-auto shrink-0">
              <div className="flex items-center gap-1 bg-stone-50 hover:bg-stone-100 transition-colors rounded-lg px-2 sm:px-3 py-1.5 shrink-0">
                <Globe size={14} className="text-primary hidden sm:block" />
                <select
                  value={currency.code}
                  onChange={(e) => {
                    const selected = CURRENCIES.find(c => c.code === e.target.value);
                    if (selected) updateCurrency(selected);
                  }}
                  className="bg-transparent border-none focus:ring-0 text-xs font-mono font-semibold text-ink cursor-pointer appearance-none pr-1 max-w-[78px] sm:max-w-none text-ellipsis"
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2.5 sm:pl-3">
                <div className="hidden sm:flex w-8 h-8 rounded-full bg-primary text-white items-center justify-center font-bold text-sm shrink-0" title={user?.email}>
                  {user?.name?.charAt(0)?.toUpperCase() || 'B'}
                </div>
                <div className="hidden xl:flex flex-col text-left leading-tight min-w-0">
                  <span className="text-xs font-semibold text-ink truncate max-w-[10rem]">{user?.name}</span>
                  <span className="font-mono text-[11px] text-muted truncate max-w-[10rem]">{user?.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-muted hover:bg-coral/10 hover:text-coral transition-colors"
                  title="Log Out"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 py-6 sm:px-6 lg:px-10">
        <React.Suspense fallback={
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        }>
          <AnimatePresence mode="wait">
              {activeTab === 'inventory' && <InventoryView key="inventory" {...appProps} />}
              {activeTab === 'menu' && <MenuView key="menu" {...appProps} />}
              {activeTab === 'orders' && <OrdersView key="orders" {...appProps} />}
              {activeTab === 'production' && <ProductionView key="production" {...appProps} />}
              {activeTab === 'experiments' && <ExperimentsView key="experiments" {...appProps} />}
              {activeTab === 'summary' && <SummaryView key="summary" {...appProps} />}
              {activeTab === 'wastage' && <WastageView key="wastage" {...appProps} />}
              {activeTab === 'settings' && <SettingsView key="settings" {...appProps} />}
          </AnimatePresence>
        </React.Suspense>
      
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-4 py-12 sm:px-6 lg:px-8 border-t border-stone-200 mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2 text-stone-400">
            <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center">
              <Database size={14} />
            </div>
            <div className="text-left">
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Data Storage</div>
              <div className="text-xs font-medium text-stone-600">Secure Cloud Storage</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-stone-400">
            <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center">
              <RefreshCw size={14} />
            </div>
            <div className="text-left">
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Sync Status</div>
              <div className="text-xs font-medium text-stone-600 flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Real-time Active
              </div>
            </div>
          </div>
        </div>
      </footer>


      {/* Custom Modal */}
      <AnimatePresence>
        <ProductionRunModal
          isOpen={isProductionRunModalOpen}
          onClose={() => setIsProductionRunModalOpen(false)}
          menu={menu}
          materials={materials}
          onSave={logProductionRunSession}
          currency={currency}
        />
        <AddOrderModal
          isOpen={isAddOrderModalOpen}
          onClose={() => { setIsAddOrderModalOpen(false); setAddOrderPresetItemId(null); }}
          menu={menu}
          onSave={addOrderGroup}
          currency={currency}
          presetMenuItemId={addOrderPresetItemId}
        />
        <IngredientSelectorModal
          isOpen={isIngredientSelectorOpen}
          onClose={() => {
            setIsIngredientSelectorOpen(false);
            setActiveRecipeItemId(null);
          }}
          materials={materials}
          categories={categories}
          onAddSelected={(ingredients) => {
            if (activeRecipeItemId) {
              addQuickIngredientsToRecipe(activeRecipeItemId, ingredients);
            }
          }}
        />

        {/* Discard Modal */}
        {discardTarget && (
          <DiscardModal
            target={discardTarget}
            currency={currency}
            qty={discardQty}
            onQtyChange={setDiscardQty}
            reason={discardReason}
            onReasonChange={setDiscardReason}
            onSubmit={handleDiscard}
            onClose={() => setDiscardTarget(null)}
          />
        )}

      {/* Restock Modal */}

      {/* Add Material Modal */}
      {showAddMaterialModal && (
        <AddMaterialModal
          category={addMaterialCategory}
          currency={currency}
          fields={{ name: addMatName, unit: addMatUnit, stock: addMatStock, cost: addMatCost, threshold: addMatThreshold, expiry: addMatExpiry }}
          onChange={(field, value) => {
            const setters = { name: setAddMatName, unit: setAddMatUnit, stock: setAddMatStock, cost: setAddMatCost, threshold: setAddMatThreshold, expiry: setAddMatExpiry };
            setters[field](value);
          }}
          onSubmit={handleAddMaterialSubmit}
          onClose={() => setShowAddMaterialModal(false)}
        />
      )}

        {restockMaterial && (
          <RestockModal
            material={restockMaterial}
            currency={currency}
            qty={restockQty}
            onQtyChange={setRestockQty}
            baseTotal={restockBaseTotal}
            onBaseTotalChange={setRestockBaseTotal}
            expiryDate={restockExpiryDate}
            onExpiryDateChange={setRestockExpiryDate}
            onSubmit={handleRestock}
            onClose={() => setRestockMaterial(null)}
          />
        )}

        {nutritionEditMaterial && (
          <NutritionModal
            material={nutritionEditMaterial}
            search={{
              query: nutritionSearchQuery,
              onQueryChange: setNutritionSearchQuery,
              onSearch: searchNutritionSources,
              isSearching: isSearchingNutrition,
              usdaResults: usdaSearchResults,
              usdaError: usdaSearchError,
              offResults: offSearchResults,
              offError: offSearchError,
              onApply: applyNutritionSearchResult,
            }}
            values={{ calories: nutritionCalories, protein: nutritionProtein, carbs: nutritionCarbs, fat: nutritionFat }}
            onValueChange={(field, value) => {
              ({ calories: setNutritionCalories, protein: setNutritionProtein, carbs: setNutritionCarbs, fat: setNutritionFat })[field](value);
            }}
            allergens={nutritionAllergens}
            onToggleAllergen={toggleNutritionAllergen}
            source={nutritionSourceUsed}
            onSubmit={saveNutritionInfo}
            onClose={() => setNutritionEditMaterial(null)}
          />
        )}

        {modalConfig.show && (
          <ConfirmDialog
            type={modalConfig.type}
            title={modalConfig.title}
            message={modalConfig.message}
            onConfirm={modalConfig.onConfirm}
            onClose={() => setModalConfig({ ...modalConfig, show: false })}
          />
        )}
      </AnimatePresence>
      </div> {/* End flex-1 min-w-0 main content area */}

      {/* Mobile Bottom Navigation & Floating Action */}
      <div className="md:hidden">
        {/* Floating Action Button - Positioned above the nav */}
        {menu.length > 0 && (activeTab === 'summary' || activeTab === 'production') && (
          <div className="fixed bottom-24 right-4 z-50">
            <button 
              onClick={() => setIsProductionRunModalOpen(true)}
              className="w-14 h-14 bg-primary text-white rounded-full flex items-center justify-center shadow-[0_8px_24px_rgba(0,121,123,0.3)] transition-transform active:scale-95"
            >
              <Factory size={24} />
            </button>
          </div>
        )}

        {/* Scrollable Bottom Nav */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white z-50 flex items-center pb-[env(safe-area-inset-bottom,8px)] pt-1 shadow-[0_-4px_24px_rgba(43,49,61,0.06)]">
          <BottomNavButton id="summary" label="Home" icon={LayoutDashboard} activeTab={activeTab} setActiveTab={setActiveTab} hasLowStockAlert={lowStockItems.length > 0 && !isAlertDismissed} />
          <BottomNavButton id="inventory" label="Stock" icon={Package} activeTab={activeTab} setActiveTab={setActiveTab} hasLowStockAlert={lowStockItems.length > 0 && !isAlertDismissed} />
          <BottomNavButton id="orders" label="Orders" icon={ClipboardList} activeTab={activeTab} setActiveTab={setActiveTab} hasLowStockAlert={lowStockItems.length > 0 && !isAlertDismissed} />
          <BottomNavButton id="production" label="Runs" icon={Factory} activeTab={activeTab} setActiveTab={setActiveTab} hasLowStockAlert={lowStockItems.length > 0 && !isAlertDismissed} />
          <BottomNavButton id="menu" label="Recipes" icon={BookOpen} activeTab={activeTab} setActiveTab={setActiveTab} hasLowStockAlert={lowStockItems.length > 0 && !isAlertDismissed} />
          <BottomNavButton id="experiments" label="R&D" icon={FlaskConical} activeTab={activeTab} setActiveTab={setActiveTab} hasLowStockAlert={lowStockItems.length > 0 && !isAlertDismissed} />
          <BottomNavButton id="wastage" label="Waste" icon={Trash2} activeTab={activeTab} setActiveTab={setActiveTab} hasLowStockAlert={lowStockItems.length > 0 && !isAlertDismissed} />
          <BottomNavButton id="settings" label="More" icon={Settings} activeTab={activeTab} setActiveTab={setActiveTab} hasLowStockAlert={lowStockItems.length > 0 && !isAlertDismissed} />
        </nav>
      </div>

    </div>
  );
}
