import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, ChevronDown, ChevronUp, Calendar, Package, Factory, Plus, Trash2 } from 'lucide-react';

/**
 * Describes why a production batch was made. Currently determines whether
 * finished-goods stock is incremented after logging (see STOCK_PURPOSES in
 * useProductionActions.logProductionRun).
 *
 * Being retired from new production runs: going forward, every run adds to
 * stock regardless of purpose — what an item is used for (sold to a
 * customer, kept as personal use, etc.) is decided later, when it's
 * consumed from stock, not at bake time. This type and PURPOSE_OPTIONS
 * below stay only so ProductionRun.purpose can still be read on runs
 * logged before that change.
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
  /** See ProductionPurpose above — required on existing records, no longer
   * set by new production-run logging once that change lands. */
  purpose: ProductionPurpose;
  notes?: string;
  costTotal: number;       // Material cost snapshotted at creation time (not live-calculated)
  createdAt: number;       // Unix ms timestamp
  expiryDate?: string;     // YYYY-MM-DD
  /** Groups several single-recipe ProductionRun documents that were logged
   * together in one session (e.g. "today's baking run made cookies and a
   * cake"). Same semantics as Order.orderGroupId — display/UX grouping only,
   * each run stays an independent, fully-functioning document underneath. */
  productionSessionId?: string;
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
  /**
   * Saves one or more rows from a single submission (see
   * useProductionActions.logProductionRunSession). `existingSessionId`
   * must be passed back in on a retry so the remaining rows keep sharing
   * the same session as the ones that already saved. Returns how many rows
   * saved before stopping, the index of the first row that failed (or null
   * if every row succeeded), and the sessionId used — capture it and pass
   * it back in if a retry is needed.
   */
  onSave: (
    rows: Omit<ProductionRun, 'id' | 'createdAt' | 'productionSessionId'>[],
    existingSessionId?: string
  ) => Promise<{ succeededCount: number; failedIndex: number | null; sessionId?: string }>;
  currency: { symbol: string };
}

interface ProductionRow {
  recipeId: string;
  quantity: number;
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

const EMPTY_ROW = (menu: MenuItem[]): ProductionRow => ({ recipeId: menu[0]?.id || '', quantity: 1 });

/**
 * Modal form for logging a new production run — or several at once, when
 * a single session made multiple different recipes (e.g. "cookies and a
 * cake this morning"). Computes a live cost preview per row and saves all
 * rows via one `onSave` call.
 *
 * @param isOpen    - Controls visibility; renders nothing when false.
 * @param onClose   - Called after a fully successful save or when the user cancels.
 * @param menu      - List of menu items (recipes) available to select.
 * @param materials - Raw-material catalogue used for cost calculation.
 * @param onSave    - Async callback that persists all rows; see ProductionRunModalProps.
 * @param currency  - Locale currency config; only `symbol` is used for display.
 */
export function ProductionRunModal({ isOpen, onClose, menu, materials, onSave, currency }: ProductionRunModalProps) {
  // ─── Local State ────────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]; // default date = today (YYYY-MM-DD)
  const [rows,       setRows]       = useState<ProductionRow[]>([EMPTY_ROW(menu)]);
  const [date,       setDate]       = useState(today);
  const [purpose,    setPurpose]    = useState<ProductionPurpose>('market_stock');
  const [showYield,  setShowYield]  = useState(false);
  const [yieldQty,   setYieldQty]   = useState<number | ''>('');
  const [notes,      setNotes]      = useState('');
  const [isSaving,   setIsSaving]   = useState(false);
  const [error,      setError]      = useState('');
  const [invalidRowIndex, setInvalidRowIndex] = useState<number | null>(null);

  // Preserves the session grouping across a partial-failure retry (see
  // handleSave): once a multi-row submission starts, every row saved in
  // this modal instance — including any left over after a retry — must
  // share the same productionSessionId, even if a retry only has one row
  // left. Reset on full success or Cancel; never touched by the recipe
  // re-sync effect below, which can fire mid-session on unrelated menu updates.
  const sessionIdRef = useRef<string | undefined>(undefined);

  // Re-sync every row's selected recipe against the *current* menu whenever
  // the modal opens. `menu` can still be loading (or have changed) since a
  // row's recipeId was first set, so a value picked earlier may no longer
  // exist — without this, a stale id silently survives validation and gets
  // saved with no matching menu item (see logProductionRun's `item` lookup).
  useEffect(() => {
    if (!isOpen) return;
    setRows(prev => prev.map(row =>
      menu.some(m => m.id === row.recipeId) ? row : { ...row, recipeId: menu[0]?.id || '' }
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, menu]);

  // ─── Derived Values ─────────────────────────────────────────────────────────
  const purposeInfo = PURPOSE_OPTIONS.find(p => p.value === purpose);

  /**
   * Live material-cost estimate per row (recipe × that row's quantity).
   * Each recipe ingredient amount is unit-converted to match the raw-material's
   * stored unit before multiplying by `costPerUnit`.
   */
  const rowCosts = useMemo(() => rows.map(row => {
    const recipe = menu.find(m => m.id === row.recipeId);
    if (!recipe) return 0;
    return recipe.recipe.reduce((sum, req) => {
      const mat = materials.find(m => m.id === req.materialId);
      if (!mat) return sum; // skip ingredients whose material record is missing
      // Convert recipe unit (e.g. 'g') → material's stored unit (e.g. 'kg') before costing
      const convertedAmt = convertToBaseUnit(req.amount, req.unit || 'g', mat.unit);
      return sum + convertedAmt * mat.costPerUnit * row.quantity;
    }, 0);
  }), [rows, menu, materials]);
  const costTotal = useMemo(() => rowCosts.reduce((sum, c) => sum + c, 0), [rowCosts]);

  // ─── Row Management ─────────────────────────────────────────────────────────
  const updateRow = (index: number, patch: Partial<ProductionRow>) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r));
    setError('');
    setInvalidRowIndex(null);
  };
  const addRow = () => {
    setRows(prev => [...prev, EMPTY_ROW(menu)]);
    // Per-item yield override doesn't make sense once there's more than one
    // item — hide it rather than leave a stale value applying to every row.
    setShowYield(false);
    setYieldQty('');
  };
  const removeRow = (index: number) => {
    setRows(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
  };

  // Clears the in-progress session link before closing, so an abandoned
  // multi-item attempt (cancelled mid-retry) can never leak its session id
  // into a later, unrelated submission.
  const handleClose = () => {
    sessionIdRef.current = undefined;
    onClose();
  };

  const resetForm = () => {
    setRows([EMPTY_ROW(menu)]);
    setDate(today);
    setPurpose('market_stock');
    setShowYield(false);
    setYieldQty('');
    setNotes('');
    setInvalidRowIndex(null);
    sessionIdRef.current = undefined;
  };

  // ─── Save Handler ────────────────────────────────────────────────────────────
  /**
   * Validates every row up front (so a bad row blocks the whole submission
   * before any writes happen), then persists all rows in one `onSave` call.
   * On a partial failure, drops the rows that already saved — so a retry
   * only resubmits what's left, instead of creating duplicates for rows
   * that succeeded — and keeps the session id stable across that retry.
   */
   const handleSave = async () => {
    setError('');
    setInvalidRowIndex(null);

    const badRecipeIndex = rows.findIndex(r => !r.recipeId || !menu.some(m => m.id === r.recipeId));
    if (badRecipeIndex !== -1) {
      setInvalidRowIndex(badRecipeIndex);
      setError(rows.length > 1 ? `Please select a recipe for item ${badRecipeIndex + 1}.` : 'Please select a recipe before logging.');
      return;
    }
    const badQtyIndex = rows.findIndex(r => r.quantity < 1);
    if (badQtyIndex !== -1) {
      setInvalidRowIndex(badQtyIndex);
      setError(rows.length > 1 ? `Quantity must be at least 1 for item ${badQtyIndex + 1}.` : 'Quantity must be at least 1.');
      return;
    }

    setIsSaving(true);
    try {
      // Use the explicit yield quantity only when the yield section is visible,
      // filled in, and there's exactly one item; otherwise fall back to
      // quantityProduced (i.e. no waste recorded) for every row.
      const effectiveYield = rows.length === 1 && showYield && yieldQty !== '' ? Number(yieldQty) : undefined;
      const payload = rows.map((row, i) => ({
        recipeId: row.recipeId,
        quantityProduced: row.quantity,
        quantityYield: effectiveYield ?? row.quantity,
        date,
        purpose,
        notes: notes.trim() || undefined,
        costTotal: parseFloat(rowCosts[i].toFixed(2)), // snapshot rounded to 2 dp
      }));

      const { succeededCount, failedIndex, sessionId } = await onSave(payload, sessionIdRef.current);
      sessionIdRef.current = sessionId;

      if (failedIndex === null) {
        // Every row saved — blank form for the next run/session.
        resetForm();
        onClose();
      } else {
        // Drop the rows that already saved so a retry doesn't resubmit them
        // (which would create duplicate production runs). Keep the rest,
        // including the one that failed, for the user to fix and retry —
        // sessionIdRef now holds the same session id, so the retry stays
        // grouped with the rows that already saved.
        setRows(prev => prev.slice(succeededCount));
        setInvalidRowIndex(0);
        setError(
          succeededCount > 0
            ? `Logged ${succeededCount} of ${rows.length} item(s) — the rest are still saved. Fix the highlighted item and log again for the remainder.`
            : 'Failed to log this item. Please try again.'
        );
      }
    } catch (err) {
      console.error('Failed to log production run(s):', err);
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
          <button onClick={handleClose} className="p-2 rounded-xl hover:bg-stone-100 text-stone-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-8 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                {rows.length > 1 ? `Items (${rows.length})` : 'Recipe'}
              </label>
            </div>
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <select
                    value={row.recipeId}
                    onChange={e => updateRow(i, { recipeId: e.target.value })}
                    className={`flex-1 min-w-0 bg-stone-50 border rounded-xl px-4 py-3 text-sm font-bold text-stone-700 outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all ${invalidRowIndex === i && !row.recipeId ? 'border-rose-400' : 'border-stone-200'}`}
                  >
                    <option value="" disabled>Select a recipe...</option>
                    {menu.map(item => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={row.quantity === 0 ? '' : row.quantity}
                    onChange={e => updateRow(i, { quantity: parseInt(e.target.value) || 0 })}
                    placeholder="Qty"
                    className={`w-20 bg-stone-50 border rounded-xl px-3 py-3 text-sm font-bold text-stone-700 outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all ${invalidRowIndex === i && row.quantity < 1 ? 'border-rose-400' : 'border-stone-200'}`}
                  />
                  {rows.length > 1 && (
                    <button
                      onClick={() => removeRow(i)}
                      title="Remove item"
                      className="p-3 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addRow}
              className="flex items-center gap-1.5 mt-2 text-[11px] font-bold text-amber-600 hover:text-amber-700 transition-colors"
            >
              <Plus size={14} /> Add another item
            </button>
          </div>

          {/* Date */}
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

          {/* Yield toggle (collapsible) — only meaningful for a single item; with
              multiple items a single "sellable units" number can't represent
              per-item waste. Use the Production Log's per-item Discard action
              afterward for a multi-item session that had partial waste. */}
          {rows.length === 1 && (
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
                    max={rows[0].quantity}
                    value={yieldQty}
                    onChange={e => setYieldQty(e.target.value === '' ? '' : parseInt(e.target.value))}
                    placeholder={`Max: ${rows[0].quantity}`}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold text-stone-700 outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all"
                  />
                  {yieldQty !== '' && Number(yieldQty) < rows[0].quantity && (
                    <p className="text-[10px] text-amber-600 mt-1.5 font-bold">
                      ⚠ {rows[0].quantity - Number(yieldQty)} unit(s) will be logged as waste
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

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
              {purpose === 'customer_order' && rows.length > 1 && (
                <div className="text-[10px] text-amber-600 mt-1 font-bold">ℹ️ Each item will create its own separate order in the Orders tab</div>
              )}
            </div>
            <Package size={28} className="text-amber-300" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-stone-100 flex gap-3">
          <button
            onClick={handleClose}
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
              {isSaving ? 'Logging...' : rows.length > 1 ? `Log ${rows.length} Items` : 'Log Run'}
            </button>
            {error && <div className="text-rose-500 text-[10px] font-bold mt-1 text-center">{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
