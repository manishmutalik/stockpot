import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Calendar, Check, ChevronDown, ChevronUp, CirclePlus, Factory, Hourglass, Package, Trash2 } from 'lucide-react';
import { ModalShell, MODAL_LABEL, modalField, QuantityStepper } from './ModalShell';
import { convertAmount } from '../utils/conversions';

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
  /** See ProductionPurpose above — set on existing records, no longer
   * written by new production-run logging. */
  purpose?: ProductionPurpose;
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
    rows: Omit<ProductionRun, 'id' | 'createdAt' | 'productionSessionId' | 'purpose'>[],
    existingSessionId?: string
  ) => Promise<{ succeededCount: number; failedIndex: number | null; sessionId?: string }>;
  currency: { symbol: string };
}

interface ProductionRow {
  recipeId: string;
  quantity: number;
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
      const convertedAmt = convertAmount(req.amount, req.unit || 'g', mat.unit);
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

  const totalUnits = rows.reduce((sum, r) => sum + r.quantity, 0);
  const perUnit = totalUnits > 0 ? costTotal / totalUnits : 0;
  const expected = rows[0]?.quantity ?? 0;
  const good = yieldQty === '' ? null : Number(yieldQty);
  const waste = good === null ? 0 : Math.max(0, expected - good);
  const yieldPct = good === null || expected <= 0 ? null : Math.min(100, (good / expected) * 100);

  return (
    <ModalShell
      title="Log Production Run"
      subtitle="Record a production run"
      icon={Factory}
      onClose={handleClose}
      footer={
        <>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 sm:flex-none sm:w-36 h-12 rounded-xl bg-stone-100 text-ink text-sm font-semibold hover:bg-stone-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 h-12 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md shadow-primary/20 flex items-center justify-center gap-2"
            >
              {!isSaving && <Check size={18} />}
              {isSaving ? 'Logging...' : rows.length > 1 ? `Log ${rows.length} Items` : 'Log Run'}
            </button>
          </div>
          {error && <div className="text-coral text-xs font-semibold mt-2 text-center">{error}</div>}
        </>
      }
    >
      {/* Items */}
      <div>
        <label className={MODAL_LABEL}>
          {rows.length > 1 ? `Items (${rows.length})` : 'Recipe'}
        </label>
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i}>
              <div className="flex gap-2 items-stretch">
                <select
                  value={row.recipeId}
                  onChange={e => updateRow(i, { recipeId: e.target.value })}
                  className={`${modalField(invalidRowIndex === i && !row.recipeId)} flex-1 min-w-0 font-semibold`}
                >
                  <option value="" disabled>Select a recipe...</option>
                  {menu.map(item => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                <QuantityStepper
                  value={row.quantity}
                  onChange={n => updateRow(i, { quantity: n })}
                  invalid={invalidRowIndex === i && row.quantity < 1}
                />
                {rows.length > 1 && (
                  <button
                    onClick={() => removeRow(i)}
                    title="Remove item"
                    className="px-3 text-muted hover:text-coral hover:bg-coral/10 rounded-xl transition-colors shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              {rows.length > 1 && row.recipeId && (
                <div className="mt-1.5 px-1 font-mono text-[11px] text-muted">
                  Material cost <span className="font-semibold text-ink">{currency.symbol}{rowCosts[i].toFixed(2)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={addRow}
          className="flex items-center gap-1.5 mt-3 text-sm font-semibold text-primary hover:text-primary-dark transition-colors"
        >
          <CirclePlus size={16} /> Add another item
        </button>
      </div>

      {/* Date */}
      <div className="sm:max-w-xs">
        <label className={`${MODAL_LABEL} flex items-center gap-1.5`}>
          <Calendar size={12} /> Production date
        </label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className={`${modalField()} font-mono font-semibold`}
        />
      </div>

      {/* Yield accountability (collapsible) — only meaningful for a single item; with
          multiple items a single "sellable units" number can't represent
          per-item waste. Use the Production Log's per-item Discard action
          afterward for a multi-item session that had partial waste. */}
      {rows.length === 1 && (
        <div className="bg-stone-50 rounded-2xl">
          <button
            onClick={() => setShowYield(!showYield)}
            aria-expanded={showYield}
            className="w-full flex items-center justify-between gap-3 p-4 text-left"
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-primary shrink-0">
                <Hourglass size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">Yield &amp; waste accountability</span>
                <span className="block text-xs text-muted">
                  {showYield ? 'Account for trimming scrap or recipe variance' : '+ Add yield info (account for waste)'}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {showYield && yieldPct !== null && (
                <span
                  className={`font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    yieldPct >= 100 ? 'bg-margin/10 text-[#006143]' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {yieldPct >= 100 ? '100% target met' : `${yieldPct.toFixed(0)}% yield`}
                </span>
              )}
              {showYield ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
            </span>
          </button>
          {showYield && (
            <div className="px-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white rounded-xl px-3 py-2">
                  <div className={`${MODAL_LABEL} !mb-0.5`}>Expected yield</div>
                  <div className="font-mono text-lg font-semibold text-ink">{expected} <span className="text-xs font-normal text-muted">units</span></div>
                </div>
                <div className="bg-white rounded-xl px-3 py-2">
                  <label htmlFor="sellable-units" className={`${MODAL_LABEL} !mb-0.5`}>Sellable units (after waste)</label>
                  <input
                    id="sellable-units"
                    type="number"
                    min={0}
                    max={expected}
                    value={yieldQty}
                    onChange={e => setYieldQty(e.target.value === '' ? '' : parseInt(e.target.value))}
                    placeholder={`Max: ${expected}`}
                    className="w-full bg-transparent font-mono text-lg font-semibold text-ink outline-none placeholder:text-stone-300 placeholder:font-normal placeholder:text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </div>
                <div className="bg-white rounded-xl px-3 py-2">
                  <div className={`${MODAL_LABEL} !mb-0.5`}>Waste</div>
                  <div className={`font-mono text-lg font-semibold ${waste > 0 ? 'text-amber-600' : 'text-ink'}`}>
                    {waste} <span className="text-xs font-normal text-muted">units</span>
                  </div>
                </div>
              </div>
              {waste > 0 && (
                <p className="text-xs text-amber-700 mt-2 font-semibold">
                  ⚠ {waste} unit(s) will be logged as waste
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div>
        <label className={MODAL_LABEL}>Notes (optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Any observations about this production run..."
          className={`${modalField()} resize-none`}
        />
      </div>

      {/* Cost Preview */}
      <div className="bg-amber-50 rounded-2xl p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] font-semibold text-amber-700 uppercase tracking-wider">Total Production Cost</div>
          <div className="flex items-baseline flex-wrap gap-x-2 mt-0.5">
            <span className="text-2xl font-mono font-semibold text-ink">{currency.symbol}{costTotal.toFixed(2)}</span>
            {totalUnits > 0 && (
              <span className="font-mono text-xs text-muted">({currency.symbol}{perUnit.toFixed(2)} / unit)</span>
            )}
          </div>
        </div>
        <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-amber-600 shrink-0">
          <Package size={22} />
        </div>
      </div>
    </ModalShell>
  );
}
