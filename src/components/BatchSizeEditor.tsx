import React, { useState } from 'react';
import { CookingPot } from 'lucide-react';
import type { MenuItem, ProductionRun } from '../types';
import { batchYield } from '../utils/batches';
import { formatItemQuantity, itemUnit, unitWord } from '../utils/itemUnits';

/**
 * In the recipe editor: how many one batch makes (4.5 sponge bases from one mix, or 0.8 kg of ganache), for items made in
 * batches, in the item's own unit (utils/itemUnits). The recipe stays per one piece (per kg); logging production in
 * batches works out the pieces (utils/batches). Once batches are logged with
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
}> = ({ item, runs, unitCost, currencySymbol, onSet }) => {
  const makes = item.batchMakes && item.batchMakes > 0 ? item.batchMakes : null;
  const unit = itemUnit(item);
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

  return (
    <section aria-label="Made in batches" className="space-y-2 rounded-xl bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CookingPot size={16} className="text-primary shrink-0" />
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          One batch makes
          <BatchInput value={makes} onCommit={commit} />
          <span className="font-normal text-muted">{unitWord(unit)}</span>
        </label>
        {makes !== null && unitCost > 0 && (
          <span className="text-xs text-muted">One batch costs <span className="font-mono font-semibold text-ink">{money(unitCost * makes)}</span></span>
        )}
      </div>
      <p className="text-xs text-muted">
        {makes === null
          ? unit === 'pcs'
            ? 'For things made in batches, such as 4.5 sponge bases from one mix. Leave it empty if you make them one at a time.'
            : `For things made in batches, such as 0.8 ${unit} of ganache from one mix.`
          : unit === 'pcs'
            ? `The recipe below is for one piece; a batch uses it ${fmt(makes)} times. Log production in batches, with what actually came out.`
            : `The recipe below is for 1 ${unitWord(unit, 1)}; a batch makes ${say(makes)}. Log production in batches, with what actually came out.`}
      </p>

      {offerDivide && makes !== null && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-ink">
          <span>Is the recipe below written for the whole batch?</span>
          <button type="button" onClick={() => { onSet(makes, 'from-whole-batch'); setOfferDivide(false); }} className="font-semibold text-primary hover:text-primary-dark underline">
            Divide it by {fmt(makes)}
          </button>
          <button type="button" onClick={() => setOfferDivide(false)} className="text-muted hover:text-ink">No, it is for one</button>
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
const BatchInput: React.FC<{ value: number | null; onCommit: (n: number | null) => void }> = ({ value, onCommit }) => {
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
      onChange={e => setText(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
      className="w-20 rounded-lg border border-stone-200 px-2 py-1.5 text-right font-mono text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
    />
  );
};
