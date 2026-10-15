import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Calendar, Check, CirclePlus, Factory, Loader2, Package, Sparkles, Trash2 } from 'lucide-react';
import { ModalShell, MODAL_LABEL, modalField, QuantityStepper } from './ModalShell';
import { productionRunCost } from '../utils/plans/planProduction';
import { effectiveRecipe, partsNeeded } from '../utils/itemParts';
import { expectedUnits, MAX_YIELD_OVER, runYieldLoss } from '../utils/batches';
import { formatItemQuantity, itemUnit, type ItemUnit } from '../utils/itemUnits';
import type { ProductionParser } from '../hooks/useProductionParser';
import type { NotFoundItem } from '../utils/orderParse';
import type { ProductionFillRow, ProductionFormFill, UnplacedWaste } from '../utils/productionParse';

// The run's types live in types/index.ts (so plain logic can use them without this component); kept importable from here.
import type { ProductionRun } from '../types';
export type { ProductionPurpose, ProductionRun } from '../types';

interface MenuItem {
  id: string;
  name: string;
  recipe: { materialId: string; amount: number; unit: string }[];
  sellingPrice: number;
  finishedGoodsStock?: number;
  /** How many one batch makes, when the item is made in batches. */
  batchMakes?: number;
  /** Made when it is ordered: never logged as production (utils/madeToOrder). */
  madeToOrder?: boolean;
  /** Counted by weight or volume (utils/itemUnits). */
  countedIn?: 'kg' | 'l';
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
  /** Reads a typed or pasted note into the form. Present only when AI is available to the account. */
  productionParser?: ProductionParser | null;
}

interface ProductionRow {
  recipeId: string;
  /** Pieces, or batches when `inBatches`. */
  quantity: number;
  /** Entered in batches (the item says how many one batch makes). */
  inBatches?: boolean;
  /** Pieces that actually came out, as typed. Undefined: the box is closed; '': open and empty. Either way, as planned. */
  made?: string;
}

const batchMakesOf = (menu: MenuItem[], id: string) => {
  const n = menu.find(m => m.id === id)?.batchMakes;
  return n && n > 0 ? n : undefined;
};
/** A fresh row for an item: in batches when the item is made in batches. */
const rowFor = (menu: MenuItem[], recipeId: string): ProductionRow => ({ recipeId, quantity: 1, ...(batchMakesOf(menu, recipeId) && { inBatches: true, made: '' }) });
const EMPTY_ROW = (menu: MenuItem[]): ProductionRow => rowFor(menu, menu.find(m => !m.madeToOrder)?.id || '');
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Pieces the row's ingredients are for. */
const plannedOf = (menu: MenuItem[], row: ProductionRow) => {
  const makes = batchMakesOf(menu, row.recipeId);
  return row.inBatches && makes ? expectedUnits(row.quantity, makes) : row.quantity;
};
/** Pieces that came out: what was entered, or as planned. */
const actualOf = (menu: MenuItem[], row: ProductionRow) => (row.made === undefined || row.made === '' ? plannedOf(menu, row) : Number(row.made));

/** A row read from a note: in batches when the note gave batches (and nothing in pieces was added to them). */
const rowFromFill = (menu: MenuItem[], r: ProductionFillRow): ProductionRow => {
  const makes = batchMakesOf(menu, r.recipeId);
  if (r.batches && makes && Math.abs(expectedUnits(r.batches, makes) - r.quantity) < 1e-6) {
    return { recipeId: r.recipeId, quantity: r.batches, inBatches: true, made: r.made === undefined ? '' : String(r.made) };
  }
  return { recipeId: r.recipeId, quantity: r.quantity, ...(r.made !== undefined && { made: String(r.made) }) };
};

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
export function ProductionRunModal({ isOpen, onClose, menu, materials, onSave, currency, productionParser }: ProductionRunModalProps) {
  // ─── Local State ────────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]; // default date = today (YYYY-MM-DD)
  const [rows,       setRows]       = useState<ProductionRow[]>([EMPTY_ROW(menu)]);
  const [date,       setDate]       = useState(today);
  const [notes,      setNotes]      = useState('');
  const [isSaving,   setIsSaving]   = useState(false);
  const [error,      setError]      = useState('');
  const [invalidRowIndex, setInvalidRowIndex] = useState<number | null>(null);

  // Filling the form from a note (only when AI is available): nothing is saved, the owner checks the form.
  const [message,    setMessage]    = useState('');
  const [isReading,  setIsReading]  = useState(false);
  const [readError,  setReadError]  = useState('');
  const [filled,     setFilled]     = useState(false);
  const [readNotes,  setReadNotes]  = useState<string[]>([]);
  const [notFound,   setNotFound]   = useState<NotFoundItem[]>([]);
  const [unplaced,   setUnplaced]   = useState<UnplacedWaste[]>([]);
  const [unplacedBatches, setUnplacedBatches] = useState<ProductionFormFill['unplacedBatches']>([]);
  const [leftOutMade, setLeftOutMade] = useState<string[]>([]);

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
      menu.some(m => m.id === row.recipeId && !m.madeToOrder) ? row : EMPTY_ROW(menu)
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
    // Ingredients whose material record is missing are skipped; each amount is unit-converted to the material's stored unit.
    // An item made from others (a cream cake on a sponge base) counts its parts too.
    return productionRunCost(effectiveRecipe(recipe, menu), materials, plannedOf(menu, row));
  }), [rows, menu, materials]);
  const costTotal = useMemo(() => rowCosts.reduce((sum, c) => sum + c, 0), [rowCosts]);
  // The other items each row takes from finished stock (bases for cream cakes), counting earlier rows' use and what
  // earlier rows make (bases logged in the same go are there for the cakes after them).
  const partUse = useMemo(() => {
    const stock = new Map(menu.map(m => [m.id, m.finishedGoodsStock ?? 0]));
    return rows.map(row => {
      const item = menu.find(m => m.id === row.recipeId);
      const qty = plannedOf(menu, row) || 0;
      const used = item && qty > 0 ? partsNeeded(item, qty) : [];
      const out = used.map(p => {
        const inStock = stock.get(p.itemId) ?? 0;
        stock.set(p.itemId, inStock - p.quantity);
        const part = menu.find(m => m.id === p.itemId);
        return { itemId: p.itemId, name: part?.name ?? 'item', unit: itemUnit(part), quantity: p.quantity, inStock, short: p.quantity > inStock + 1e-9 };
      });
      if (item && qty > 0) stock.set(item.id, (stock.get(item.id) ?? 0) + (actualOf(menu, row) || 0));
      return out;
    });
  }, [rows, menu]);
  const fmtQty = (n: number) => String(Math.round(n * 100) / 100);
  /** A part's amount: "2 Sponge base", "150 g of Ganache". */
  const partAmount = (unit: ItemUnit, n: number, name: string) => (unit === 'pcs' ? `${fmtQty(n)} ${name}` : `${formatItemQuantity(unit, n)} of ${name}`);
  const unitOfRow = (row: ProductionRow) => itemUnit(menu.find(m => m.id === row.recipeId));

  // ─── Row Management ─────────────────────────────────────────────────────────
  const updateRow = (index: number, patch: Partial<ProductionRow>) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r));
    setError('');
    setInvalidRowIndex(null);
  };
  const addRow = () => setRows(prev => [...prev, EMPTY_ROW(menu)]);
  /** A different item: in batches if it is made in batches; the quantity stays when the way it is counted does. */
  const chooseItem = (index: number, recipeId: string) => {
    const fresh = rowFor(menu, recipeId);
    const row = rows[index];
    updateRow(index, { ...fresh, quantity: !!row.inBatches === !!fresh.inBatches ? row.quantity : 1 });
  };
  /** Batches to pieces or back, keeping what the ingredients are for. */
  const setInBatches = (index: number, inBatches: boolean) => {
    const row = rows[index];
    const makes = batchMakesOf(menu, row.recipeId);
    if (!makes || !!row.inBatches === inBatches) return;
    updateRow(index, { inBatches, quantity: inBatches ? round3(row.quantity / makes) : expectedUnits(row.quantity, makes) });
  };
  const removeRow = (index: number) => {
    setRows(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
  };

  // Pre-fills the form from the note. Nothing is saved: the owner checks it and presses Log Run.
  const readMessage = async () => {
    if (!productionParser || isReading) return;
    setIsReading(true);
    setReadError('');
    setFilled(false);
    setReadNotes([]);
    setNotFound([]);
    setUnplaced([]);
    setUnplacedBatches([]);
    setLeftOutMade([]);
    try {
      const outcome = await productionParser.parse(message);
      if (outcome.ok === false) { setReadError(outcome.message); return; }
      const f = outcome.form;
      const notes: string[] = [];
      if (f.rows.length > 0) {
        setRows(f.rows.map(r => rowFromFill(menu, r)));
      } else {
        // Nothing matched: leave an empty row to choose from, not the first menu item standing in for what was made.
        setRows([{ recipeId: '', quantity: 1 }]);
        if (f.notFound.length === 0 && f.unplacedBatches.length === 0 && f.madeToOrder.length === 0 && f.byWeight.length === 0) notes.push('No items were found in the note.');
      }
      for (const name of f.byWeight) notes.push(`Left out ${name}: it is counted by weight. Choose it below and enter how much you made, in kg.`);
      if (f.date) setDate(f.date);
      if (f.dateNotUnderstood) notes.push(`Couldn't tell the date from "${f.dateNotUnderstood}". Please check the production date.`);
      if (f.notes !== undefined) setNotes(f.notes);
      setNotFound(f.notFound);
      setUnplaced(f.unplacedWaste);
      setUnplacedBatches(f.unplacedBatches);
      setLeftOutMade(f.madeToOrder);
      setReadNotes(notes);
      setFilled(true);
      setError('');
      setInvalidRowIndex(null);
    } finally {
      setIsReading(false);
    }
  };
  const applySuggestion = (missing: NotFoundItem) => {
    if (!missing.suggestion) return;
    const id = missing.suggestion.id;
    setRows(prev => {
      // Pieces add to a row counted in pieces; a row in batches is left as it is, beside a new one.
      if (prev.some(r => r.recipeId === id && !r.inBatches)) return prev.map(r => (r.recipeId === id && !r.inBatches ? { ...r, quantity: r.quantity + missing.quantity } : r));
      // The empty row left when nothing matched is replaced rather than kept beside it.
      if (prev.length === 1 && prev[0].recipeId === '') return [{ recipeId: id, quantity: missing.quantity }];
      return [...prev, { recipeId: id, quantity: missing.quantity }];
    });
    setNotFound(prev => prev.filter(n => n !== missing));
  };

  // Clears the in-progress session link before closing, so an abandoned
  // multi-item attempt (cancelled mid-retry) can never leak its session id
  // into a later, unrelated submission.
  const handleClose = () => {
    sessionIdRef.current = undefined;
    onClose();
  };

  const resetForm = () => {
    setMessage('');
    setIsReading(false);
    setReadError('');
    setFilled(false);
    setReadNotes([]);
    setNotFound([]);
    setUnplaced([]);
    setUnplacedBatches([]);
    setLeftOutMade([]);
    setRows([EMPTY_ROW(menu)]);
    setDate(today);
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

    const badRecipeIndex = rows.findIndex(r => !r.recipeId || !menu.some(m => m.id === r.recipeId && !m.madeToOrder));
    if (badRecipeIndex !== -1) {
      setInvalidRowIndex(badRecipeIndex);
      setError(rows.length > 1 ? `Please select a recipe for item ${badRecipeIndex + 1}.` : 'Please select a recipe before logging.');
      return;
    }
    const badQtyIndex = rows.findIndex(r => !(r.quantity > 0));
    if (badQtyIndex !== -1) {
      setInvalidRowIndex(badQtyIndex);
      setError(rows.length > 1 ? `Quantity must be more than 0 for item ${badQtyIndex + 1}.` : 'Quantity must be more than 0.');
      return;
    }
    const badMadeIndex = rows.findIndex(r => { const a = actualOf(menu, r); return !(a >= 0) || a > plannedOf(menu, r) * MAX_YIELD_OVER; });
    if (badMadeIndex !== -1) {
      setInvalidRowIndex(badMadeIndex);
      setError(`What was actually made${rows.length > 1 ? ` for item ${badMadeIndex + 1}` : ''} can be at most ${MAX_YIELD_OVER} times what was planned.`);
      return;
    }

    setIsSaving(true);
    try {
      // What the ingredients were for, and what came out (as planned unless entered).
      const payload = rows.map((row, i) => ({
        recipeId: row.recipeId,
        quantityProduced: plannedOf(menu, row),
        quantityYield: actualOf(menu, row),
        ...(row.inBatches && batchMakesOf(menu, row.recipeId) && { batches: row.quantity }),
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

  // Per piece (kg) that came out: a short batch makes each piece cost more. Not shown for pieces and kilos together.
  const rowUnits = new Set<ItemUnit>(rows.filter(r => r.recipeId).map(unitOfRow));
  const totalUnits = rowUnits.size <= 1 ? rows.reduce((sum, r) => sum + (actualOf(menu, r) || 0), 0) : 0;
  const perUnit = totalUnits > 0 ? costTotal / totalUnits : 0;
  const perWhat = ({ pcs: 'unit', kg: 'kg', l: 'litre' } as const)[[...rowUnits][0] ?? 'pcs'];
  const money = (n: number) => `${currency.symbol}${n.toFixed(2)}`;

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
      {/* Fill the form from a note (only when AI is available) */}
      {productionParser && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <label htmlFor="production-message" className={`${MODAL_LABEL} flex items-center gap-1.5 !mb-0 text-primary`}>
            <Sparkles size={12} /> Fill from a note
          </label>
          <textarea
            id="production-message"
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={3}
            maxLength={1500}
            placeholder="e.g. Made 40 croissants and 24 muffins this morning, 3 croissants burnt"
            className={`${modalField()} resize-none bg-white`}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={readMessage}
              disabled={isReading || message.trim() === ''}
              className="h-10 px-4 shrink-0 whitespace-nowrap rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isReading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {isReading ? 'Reading…' : 'Fill the form'}
            </button>
            <p className="text-[11px] text-muted leading-snug">Phone numbers are not sent. You check everything before the run is logged.</p>
          </div>
          {readError && <p role="alert" className="text-xs font-semibold text-coral">{readError}</p>}
          {filled && (
            <div className="space-y-1.5 text-xs text-ink">
              <p className="font-semibold">Filled from your note. Please check it.</p>
              {readNotes.map(n => <p key={n} className="text-muted">{n}</p>)}
              {unplaced.map((w, i) => (
                <p key={`${w.name}-${i}`} className="text-muted">
                  {w.units} {w.name} {w.units === 1 ? 'was' : 'were'} wasted. Once the item is chosen and logged, record it with Discard in the Production Log.
                </p>
              ))}
              {leftOutMade.map(name => (
                <p key={`mto-${name}`} className="text-muted">
                  Left out {name}: it is made when ordered, so it comes out of stock when you sell it.
                </p>
              ))}
              {unplacedBatches.map((b, i) => (
                <p key={`${b.name}-b${i}`} className="text-amber-800">
                  Left out {fmtQty(b.batches)} {b.batches === 1 ? 'batch' : 'batches'} of {b.name}: set how many one batch makes on the Menu, or enter it in pieces below.
                </p>
              ))}
              {notFound.map((n, i) => (
                <div key={`${n.nameAsWritten}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                  <span>Couldn&apos;t find &ldquo;{n.nameAsWritten}&rdquo; on the menu (×{n.quantity}).</span>
                  {n.suggestion ? (
                    <button type="button" onClick={() => applySuggestion(n)} className="font-semibold text-primary hover:text-primary-dark underline">
                      Use {n.suggestion.name}?
                    </button>
                  ) : (
                    <span>Pick it from the list below.</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
                  onChange={e => chooseItem(i, e.target.value)}
                  className={`${modalField(invalidRowIndex === i && !row.recipeId)} flex-1 min-w-0 font-semibold`}
                >
                  <option value="" disabled>Select a recipe...</option>
                  {menu.filter(item => !item.madeToOrder).map(item => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                <QuantityStepper
                  value={row.quantity}
                  onChange={n => updateRow(i, { quantity: n })}
                  invalid={invalidRowIndex === i && !(row.quantity > 0)}
                  decimal
                  label={row.inBatches ? 'Batches' : ({ pcs: 'Pieces', kg: 'kg', l: 'Litres' } as const)[unitOfRow(row)]}
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
              {row.recipeId && (
                <RowOutcome
                  row={row}
                  makes={batchMakesOf(menu, row.recipeId)}
                  unit={unitOfRow(row)}
                  planned={plannedOf(menu, row)}
                  cost={rowCosts[i]}
                  showCost={rows.length > 1}
                  money={money}
                  invalid={invalidRowIndex === i}
                  onBatches={b => setInBatches(i, b)}
                  onMade={made => updateRow(i, { made })}
                />
              )}
              {partUse[i].map(p => (
                <div key={p.itemId} className={`mt-1 px-1 text-[11px] ${p.short ? 'text-amber-700 font-semibold' : 'text-muted'}`}>
                  Takes {partAmount(p.unit, p.quantity, p.name)} from stock ({p.unit === 'pcs' ? fmtQty(p.inStock) : formatItemQuantity(p.unit, p.inStock)} there){p.short ? ': not enough. Log the batch you made first, or it goes below nothing.' : ''}
                </div>
              ))}
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
              <span className="font-mono text-xs text-muted">({currency.symbol}{perUnit.toFixed(2)} / {perWhat})</span>
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

/**
 * Under a row: batches or pieces (for an item made in batches), what that comes to, and what actually came out, with what
 * a short batch cost (utils/batches). Closed until asked for, unless the row is in batches, where it is the usual thing to
 * fill in.
 */
function RowOutcome({ row, makes, unit, planned, cost, showCost, money, invalid, onBatches, onMade }: {
  row: ProductionRow;
  makes?: number;
  /** What the item is counted in (utils/itemUnits). */
  unit: ItemUnit;
  planned: number;
  cost: number;
  showCost: boolean;
  money: (n: number) => string;
  invalid: boolean;
  onBatches: (inBatches: boolean) => void;
  onMade: (made: string | undefined) => void;
}) {
  const fmt = (n: number) => String(Math.round(n * 100) / 100);
  const say = (n: number) => (unit === 'pcs' ? fmt(n) : formatItemQuantity(unit, n));
  const actual = row.made === undefined || row.made === '' || !Number.isFinite(Number(row.made)) ? null : Number(row.made);
  const loss = actual === null ? 0 : runYieldLoss({ quantityProduced: planned, quantityYield: actual, costTotal: cost });
  const diff = actual === null ? 0 : Math.round((actual - planned) * 1000) / 1000;
  const toggle = (on: boolean, label: string) => (
    <button
      type="button" onClick={() => onBatches(on)} aria-pressed={!!row.inBatches === on}
      className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${!!row.inBatches === on ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
    >{label}</button>
  );
  return (
    <div className="mt-1.5 px-1 space-y-1.5 text-[11px] text-muted">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {makes && (
          <span className="inline-flex rounded-lg bg-stone-100 p-0.5" role="group" aria-label="Count in">
            {toggle(true, 'Batches')}{toggle(false, ({ pcs: 'Pieces', kg: 'kg', l: 'Litres' } as const)[unit])}
          </span>
        )}
        {makes && row.inBatches && <span>Makes <span className="font-mono font-semibold text-ink">{say(planned)}</span> (one batch makes {say(makes)})</span>}
        {showCost && <span className="font-mono">Material cost <span className="font-semibold text-ink">{money(cost)}</span></span>}
        {row.made === undefined && (
          <button type="button" onClick={() => onMade('')} className="font-semibold text-primary hover:text-primary-dark">+ Came out different?</button>
        )}
      </div>
      {row.made !== undefined && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            <span>Actually made</span>
            <input
              type="text" inputMode="decimal" aria-label="Actually made"
              value={row.made}
              onChange={e => {
                const t = e.target.value.replace(',', '.');
                if ((unit === 'pcs' ? /^\d*\.?\d{0,2}$/ : /^\d*\.?\d{0,3}$/).test(t)) onMade(t);
              }}
              placeholder={fmt(planned)}
              className={`w-20 rounded-lg border bg-white px-2 py-1 text-right font-mono text-sm font-semibold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ${invalid && actual !== null ? 'border-coral' : 'border-stone-200'}`}
            />
            <span>{({ pcs: 'pieces', kg: 'kg', l: 'litres' } as const)[unit]}</span>
          </label>
          {diff < 0 && <span className="font-semibold text-amber-700">{say(-diff)} short · {money(loss)} lost in production</span>}
          {diff > 0 && <span className="font-semibold text-[#006143]">{say(diff)} more than planned</span>}
          {!row.inBatches && (
            <button type="button" onClick={() => onMade(undefined)} className="text-muted hover:text-ink underline">As planned</button>
          )}
        </div>
      )}
    </div>
  );
}
