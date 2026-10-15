import React, { useState } from 'react';
import { CookingPot } from 'lucide-react';
import type { MenuItem, ProductionRun } from '../types';
import { batchYield } from '../utils/batches';
import { defaultEntryUnit, ENTRY_UNITS, entryUnitsFor, familyOf, formatItemQuantity, fromEntryUnit, inEntryUnit, itemUnit, unitWord, type EntryUnit } from '../utils/itemUnits';
import type { ItemUnitByMeasure } from '../types';

/**
 * In the recipe editor: how many one batch makes (4.5 sponge bases from one mix, or 400 g of ganache), a number and the unit
 * beside it (pieces, g, kg, ml, litres). For an item made for other items the unit is also what it is counted in
 * (utils/itemUnits): choosing kg counts it by weight, and the number typed is carried over. The recipe stays per one piece
 * (per kg); logging production in batches works out the pieces (utils/batches). Once batches are logged with
 * what actually came out, the average is shown against the size set, with a button to use it: one batch keeps the same
 * ingredients, so each piece then carries a little more of them.
 */
export const BatchSizeEditor: React.FC<{
  item: MenuItem;
  runs: Pick<ProductionRun, 'recipeId' | 'batches' | 'quantityProduced' | 'quantityYield' | 'date' | 'createdAt'>[];
  /** What one piece (one kg, one litre) costs in ingredients, its parts counted. */
  unitCost: number;
  currencySymbol: string;
  onSet: (makes: number | null, scale?: 'keep-batch' | 'from-whole-batch') => void;
  /**
   * Counts the item in pieces (null), kg or litres; resolves whether it changed (the owner may decline, or another item
   * may use it). Absent: pieces only (an item sold on the menu, for now).
   */
  onUnit?: (unit: ItemUnitByMeasure | null) => Promise<boolean>;
}> = ({ item, runs, unitCost, currencySymbol, onSet, onUnit }) => {
  const makes = item.batchMakes && item.batchMakes > 0 ? item.batchMakes : null;
  const unit = itemUnit(item);
  // What the number is shown and typed in: chosen beside it, else grams below 1 kg and kg above.
  const [shownIn, setShownIn] = useState<EntryUnit | null>(null);
  const entryUnit = shownIn && familyOf(shownIn) === unit ? shownIn : defaultEntryUnit(unit, makes);
  const units: EntryUnit[] = onUnit ? ENTRY_UNITS.map(u => u.value) : entryUnitsFor(unit);
  const [typed, setTyped] = useState<number | null>(null);
  const say = (n: number) => (unit === 'pcs' ? fmt(n) : formatItemQuantity(unit, n));
  // Offered once, right after a batch size is first set: the recipe may have been typed in for the whole batch.
  const [offerDivide, setOfferDivide] = useState(false);
  const report = batchYield(item, runs);
  const fmt = (n: number) => String(Math.round(n * 100) / 100);
  const money = (n: number) => `${currencySymbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const hasRecipe = (item.recipe?.length ?? 0) > 0 || (item.parts?.length ?? 0) > 0;
  const differs = report && Math.abs(report.averagePerBatch - report.expected) >= 0.05;

  const commit = (n: number | null) => {
    if (n === makes) return;
    if (makes === null && n !== null && hasRecipe) setOfferDivide(true);
    if (n === null) setOfferDivide(false);
    onSet(n);
  };

  /**
   * A different unit. Within the same kind (g and kg) only the number shown changes. Between pieces and weight the item is
   * counted afresh (its recipe goes back to the whole batch), and the number typed is kept in the new unit: 1.5 pieces
   * becomes 1.5 kg, and the offer to make the recipe for 1 kg follows.
   */
  const changeUnit = async (next: EntryUnit) => {
    const family = familyOf(next);
    if (family === unit) { setShownIn(next); return; }
    if (!onUnit) return;
    const number = makes !== null ? inEntryUnit(makes, entryUnit) : typed;
    if (!(await onUnit(family === 'pcs' ? null : family))) return;
    setShownIn(next);
    if (number !== null && number > 0) {
      setOfferDivide(hasRecipe);
      onSet(fromEntryUnit(number, next));
    }
  };

  return (
    <section aria-label="Made in batches" className="space-y-2 rounded-xl bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CookingPot size={16} className="text-primary shrink-0" />
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          One batch makes
          <BatchInput key={entryUnit} value={makes === null ? null : inEntryUnit(makes, entryUnit)} onTyped={setTyped} onCommit={n => commit(n === null ? null : fromEntryUnit(n, entryUnit))} />
        </label>
        {units.length > 1 ? (
          <select aria-label="One batch makes, in" value={entryUnit} onChange={e => changeUnit(e.target.value as EntryUnit)}
            className="h-9 rounded-lg border border-stone-200 bg-white px-2 text-sm font-medium text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
            {ENTRY_UNITS.filter(u => units.includes(u.value)).map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        ) : (
          <span className="text-sm text-muted">{unitWord(unit)}</span>
        )}
        {makes !== null && unitCost > 0 && (
          <span className="text-xs text-muted">One batch costs <span className="font-mono font-semibold text-ink">{money(unitCost * makes)}</span></span>
        )}
      </div>
      <p className="text-xs text-muted">
        {makes === null
          ? unit === 'pcs'
            ? `For things made in batches, such as 4.5 sponge bases from one mix. Leave it empty if you make them one at a time.${onUnit ? ' A ganache or custard kept by weight? Choose g or kg.' : ''}`
            : `How much one mix makes: 400 g for a ganache that makes 400 g, or 1.5 kg.`
          : unit === 'pcs'
            ? `The recipe below is for one piece; a batch uses it ${fmt(makes)} times. Log production in batches, with what actually came out.`
            : `The recipe below is for 1 ${unitWord(unit, 1)}; a batch makes ${say(makes)}. Log production in batches, with what actually came out.`}
      </p>

      {offerDivide && makes !== null && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-ink">
          <span>Is the recipe below written for the whole batch?</span>
          <button type="button" onClick={() => { onSet(makes, 'from-whole-batch'); setOfferDivide(false); }} className="font-semibold text-primary hover:text-primary-dark underline">
            {unit === 'pcs' ? `Divide it by ${fmt(makes)}` : `Yes, make it for 1 ${unitWord(unit, 1)}`}
          </button>
          <button type="button" onClick={() => setOfferDivide(false)} className="text-muted hover:text-ink">{unit === 'pcs' ? 'No, it is for one' : `No, it is for 1 ${unitWord(unit, 1)}`}</button>
        </div>
      )}

      {report && (
        <div className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs ${differs ? 'bg-amber-50 text-amber-800' : 'bg-stone-50 text-muted'}`}>
          <span>
            {report.runs === 1 ? 'Your last run in batches' : `Your last ${report.runs} runs in batches`} made <span className="font-mono font-semibold">{say(report.averagePerBatch)}</span> per batch
            {differs ? ` (you set ${say(report.expected)}).` : ', as set.'}
          </span>
          {differs && report.averagePerBatch > 0 && (
            <button
              type="button" onClick={() => onSet(report.averagePerBatch, 'keep-batch')}
              title={`One batch keeps the same ingredients, so the cost ${unit === 'pcs' ? 'of each piece' : `per ${unitWord(unit, 1)}`} changes to match`}
              className="font-semibold text-primary hover:text-primary-dark underline"
            >
              Use {say(report.averagePerBatch)}
            </button>
          )}
        </div>
      )}
    </section>
  );
};

/** A batch size box that keeps what is typed and commits on blur or Enter: a positive number, or empty for none. */
const BatchInput: React.FC<{ value: number | null; onCommit: (n: number | null) => void; onTyped?: (n: number | null) => void }> = ({ value, onCommit, onTyped }) => {
  const [text, setText] = useState(value === null ? '' : String(value));
  // A new value from outside (the saved one) replaces what is in the box.
  const [shown, setShown] = useState(value);
  if (shown !== value) { setShown(value); setText(value === null ? '' : String(value)); }
  const commit = () => {
    const t = text.trim().replace(',', '.');
    if (t === '') { onCommit(null); return; }
    const n = Number(t);
    if (Number.isFinite(n) && n > 0) onCommit(Math.round(n * 1000) / 1000);
    else setText(value === null ? '' : String(value));
  };
  return (
    <input
      aria-label="One batch makes" inputMode="decimal" value={text} placeholder="-"
      onChange={e => { setText(e.target.value); const n = Number(e.target.value.trim().replace(',', '.')); onTyped?.(e.target.value.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null); }} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
      className="w-20 rounded-lg border border-stone-200 px-2 py-1.5 text-right font-mono text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
    />
  );
};
