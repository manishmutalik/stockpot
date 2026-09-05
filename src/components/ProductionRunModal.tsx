import React, { useState, useMemo } from 'react';
import { X, ChevronDown, ChevronUp, Calendar, Package, Factory } from 'lucide-react';

/**
 * Describes why a production batch was made.
 * Determines whether finished-goods stock should be incremented after logging.
 */
export type ProductionPurpose = 'customer_order' | 'market_stock' | 'sampling' | 'personal_use' | 'other';

/**
 * Represents a single logged production run.
 * Stored in the `productionRuns` Firestore collection.
 */
export interface ProductionRun {
  id: string;
  recipeId: string;
  quantityProduced: number;
  remainingQuantity?: number; // Added for FIFO stock deduction
  quantityYield?: number;  // Sellable units after waste. Defaults to quantityProduced if not set.
  date: string;            // YYYY-MM-DD
  purpose: ProductionPurpose;
  notes?: string;
  costTotal: number;       // Material cost snapshotted at creation time (not live-calculated)
  createdAt: number;       // Unix ms timestamp
  expiryDate?: string;     // YYYY-MM-DD
}

interface MenuItem {
  id: string;
  name: string;
  recipe: { materialId: string; amount: number; unit: string }[];
  sellingPrice: number;
  finishedGoodsStock?: number;
}

interface RawMaterial {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
}

interface ProductionRunModalProps {
  isOpen: boolean;
  onClose: () => void;
  menu: MenuItem[];
  materials: RawMaterial[];
  onSave: (run: Omit<ProductionRun, 'id' | 'createdAt'>) => Promise<void>;
  currency: { symbol: string };
}

// ─── Purpose Options ──────────────────────────────────────────────────────────
// `addsStock: true` → the run will increment finishedGoodsStock for the menu item.
// `addsStock: false` → consumed internally; no stock delta is recorded.
const PURPOSE_OPTIONS: { value: ProductionPurpose; label: string; emoji: string; addsStock: boolean }[] = [
  { value: 'market_stock',    label: 'Market Stock',   emoji: '🛒', addsStock: true  },
  { value: 'customer_order',  label: 'Customer Order', emoji: '📦', addsStock: true  },
  { value: 'sampling',        label: 'Sampling',       emoji: '🎁', addsStock: false },
  { value: 'personal_use',    label: 'Personal Use',   emoji: '🏠', addsStock: false },
  { value: 'other',           label: 'Other',          emoji: '✳️', addsStock: true  },
];

// ─── Unit Conversion Utility ───────────────────────────────────────────────────
/**
 * Converts a measurement `amount` from one unit to another.
 * Handles g↔kg and ml↔L conversions. All other unit pairs are returned as-is,
 * so callers must ensure both units are within the same measurement family.
 *
 * @param amount   - The numeric quantity to convert.
 * @param fromUnit - The source unit string (case-insensitive).
 * @param toUnit   - The target unit string (case-insensitive).
 * @returns The converted amount, or the original amount if no conversion rule matches.
 */
function convertToBaseUnit(amount: number, fromUnit: string, toUnit: string): number {
  const from = fromUnit.toLowerCase();
  const to   = toUnit.toLowerCase();
  if (from === to) return amount;                      // same unit — no-op
  if (from === 'g'  && to === 'kg') return amount / 1000;
  if (from === 'kg' && to === 'g')  return amount * 1000;
  if (from === 'ml' && to === 'l')  return amount / 1000;
  if (from === 'l'  && to === 'ml') return amount * 1000;
  return amount; // incompatible units — return unchanged to avoid silent data corruption
}

/**
 * Modal form for logging a new production run.
 * Computes a live cost preview from recipe ingredients and saves via `onSave`.
 *
 * @param isOpen    - Controls visibility; renders nothing when false.
 * @param onClose   - Called after a successful save or when the user cancels.
 * @param menu      - List of menu items (recipes) available to select.
 * @param materials - Raw-material catalogue used for cost calculation.
 * @param onSave    - Async callback that persists the run; receives all fields except `id` and `createdAt`.
 * @param currency  - Locale currency config; only `symbol` is used for display.
 */
export function ProductionRunModal({ isOpen, onClose, menu, materials, onSave, currency }: ProductionRunModalProps) {
  // ─── Local State ────────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]; // default date = today (YYYY-MM-DD)
  const [recipeId,   setRecipeId]   = useState(menu[0]?.id || '');
  const [quantity,   setQuantity]   = useState(1);
  const [date,       setDate]       = useState(today);
  const [purpose,    setPurpose]    = useState<ProductionPurpose>('market_stock');
  const [showYield,  setShowYield]  = useState(false);
  const [yieldQty,   setYieldQty]   = useState<number | ''>('');
  const [notes,      setNotes]      = useState('');
  const [isSaving,   setIsSaving]   = useState(false);
  const [error,      setError]      = useState('');

  // ─── Derived Values ─────────────────────────────────────────────────────────
  const selectedRecipe = menu.find(m => m.id === recipeId);
  const purposeInfo    = PURPOSE_OPTIONS.find(p => p.value === purpose);

  /**
   * Live material-cost estimate for the current recipe × quantity.
   * Each recipe ingredient amount is unit-converted to match the raw-material's
   * stored unit before multiplying by `costPerUnit`.
   * Re-runs whenever the selected recipe, quantity, or materials list changes.
   */
  const costTotal = useMemo(() => {
    if (!selectedRecipe) return 0;
    return selectedRecipe.recipe.reduce((sum, req) => {
      const mat = materials.find(m => m.id === req.materialId);
      if (!mat) return sum; // skip ingredients whose material record is missing
      // Convert recipe unit (e.g. 'g') → material's stored unit (e.g. 'kg') before costing
      const convertedAmt = convertToBaseUnit(req.amount, req.unit || 'g', mat.unit);
      return sum + convertedAmt * mat.costPerUnit * quantity;
    }, 0);
  }, [selectedRecipe, materials, quantity]); // quantity drives the total scale

  // ─── Save Handler ────────────────────────────────────────────────────────────
  /**
   * Validates, persists, and resets the form.
   * Flow: validate → call `onSave` → reset state → close modal.
   * On failure the modal stays open so the user can retry.
   */
   const handleSave = async () => {
    setError('');
    if (!recipeId) {
      setError('Please select a recipe before logging.');
      return;
    }
    if (quantity < 1) {
      setError('Quantity must be at least 1.');
      return;
    }
    setIsSaving(true);
    try {
      // Use the explicit yield quantity only when the yield section is visible and filled in;
      // otherwise fall back to quantityProduced (i.e. no waste recorded).
      const effectiveYield = showYield && yieldQty !== '' ? Number(yieldQty) : quantity;
      await onSave({
        recipeId,
        quantityProduced: quantity,
        quantityYield: effectiveYield,
        date,
        purpose,
        notes: notes.trim() || undefined,
        costTotal: parseFloat(costTotal.toFixed(2)), // snapshot rounded to 2 dp
      });
      // Reset form on success so the modal is blank for the next run
      setRecipeId('');
      setQuantity(1);
      setDate(today);
      setPurpose('market_stock');
      setShowYield(false);
      setYieldQty('');
      setNotes('');
      onClose();
    } catch (err) {
      console.error('Failed to log production run:', err);
      // Don't close – leave the form intact so the user can retry
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-[2.5rem] shadow-2xl border border-stone-100 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-6 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Factory size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-800">Log Production Run</h2>
              <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">Record a production run</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100 text-stone-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-8 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Recipe */}
          <div>
            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 block">Recipe</label>
            <select
              value={recipeId}
              onChange={e => {
                setRecipeId(e.target.value);
                setError('');
              }}
              className={`w-full bg-stone-50 border rounded-xl px-4 py-3 text-sm font-bold text-stone-700 outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all ${error && !recipeId ? 'border-rose-400' : 'border-stone-200'}`}
            >
              <option value="" disabled>Select a recipe...</option>
              {menu.map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>

          {/* Quantity + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 block">Units Produced</label>
              <input
                type="number"
                min={1}
                value={quantity === 0 ? '' : quantity}
                onChange={e => setQuantity(parseInt(e.target.value) || 0)}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold text-stone-700 outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 block flex items-center gap-1.5">
                <Calendar size={11} /> Date
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold text-stone-700 outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all"
              />
            </div>
          </div>

          {/* Purpose */}
          <div>
            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2 block">Purpose</label>
            <div className="grid grid-cols-2 gap-2">
              {PURPOSE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPurpose(opt.value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${
                    purpose === opt.value
                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <span className="text-base">{opt.emoji}</span>
                  <div>
                    <div className="text-[11px] font-bold">{opt.label}</div>
                    <div className="text-[9px] text-stone-400">{opt.addsStock ? 'Adds to stock' : 'No stock added'}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Yield toggle (collapsible) */}
          <div>
            <button
              onClick={() => setShowYield(!showYield)}
              className="flex items-center gap-2 text-[11px] font-bold text-stone-400 hover:text-stone-600 transition-colors"
            >
              {showYield ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showYield ? 'Hide yield info' : '+ Add yield info (account for waste)'}
            </button>
            {showYield && (
              <div className="mt-3">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 block">
                  Sellable Units (after waste)
                </label>
                <input
                  type="number"
                  min={0}
                  max={quantity}
                  value={yieldQty}
                  onChange={e => setYieldQty(e.target.value === '' ? '' : parseInt(e.target.value))}
                  placeholder={`Max: ${quantity}`}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold text-stone-700 outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all"
                />
                {yieldQty !== '' && Number(yieldQty) < quantity && (
                  <p className="text-[10px] text-amber-600 mt-1.5 font-bold">
                    ⚠ {quantity - Number(yieldQty)} unit(s) will be logged as waste
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 block">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Any observations about this production run..."
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm text-stone-700 outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all resize-none"
            />
          </div>

          {/* Cost Preview */}
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Total Production Cost</div>
              <div className="text-xl font-bold font-serif text-stone-800 mt-0.5">
                {currency.symbol}{costTotal.toFixed(2)}
              </div>
              {purposeInfo && !purposeInfo.addsStock && (
                <div className="text-[10px] text-amber-600 mt-1 font-bold">ℹ️ No finished goods will be added (purpose: {purposeInfo.label})</div>
              )}
            </div>
            <Package size={28} className="text-amber-300" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-stone-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl border border-stone-200 text-stone-600 text-sm font-bold hover:bg-stone-50 transition-all"
          >
            Cancel
          </button>
          <div className="flex flex-col flex-1">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full py-3 rounded-2xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-200"
            >
              {isSaving ? 'Logging...' : 'Log Run'}
            </button>
            {error && <div className="text-rose-500 text-[10px] font-bold mt-1 text-center">{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
