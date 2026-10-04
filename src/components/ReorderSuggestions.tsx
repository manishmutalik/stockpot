import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { formatFigure } from '../utils/aiFigures';
import type { ReorderResult, ReorderSuggestion } from '../utils/reorder';

const MAX_SHOWN = 8;

const cover = (s: ReorderSuggestion) => {
  if (s.stock <= 0) return 'Out of stock';
  const days = Math.floor(s.daysOfCover);
  return days < 1 ? 'Less than a day left' : `About ${days} ${days === 1 ? 'day' : 'days'} left`;
};

/**
 * Materials likely to run out soon, from what the business has actually been
 * using (see utils/reorder). Pure calculation from its own records, so it is
 * shown to every account, with or without AI. Says so plainly when a material
 * has too little history to judge, rather than guessing.
 */
export const ReorderSuggestions: React.FC<{
  result: ReorderResult;
  /** Names by material id, for the "not enough history" note. */
  names: Record<string, string>;
  onRestock: (materialId: string) => void;
}> = ({ result, names, onRestock }) => {
  const { suggestions, notEnoughHistory } = result;
  if (suggestions.length === 0 && notEnoughHistory.length === 0) return null;
  const shown = suggestions.slice(0, MAX_SHOWN);
  const fx = { currencySymbol: '' };

  return (
    <section aria-label="Reorder suggestions" className="surface-card p-4 md:p-5 space-y-3">
      <div>
        <h3 className="text-base font-bold text-ink">Reorder suggestions</h3>
        <p className="text-xs text-muted mt-0.5">From what you have used in the last four weeks. These may run out before the low-stock alert would warn.</p>
      </div>

      {shown.length > 0 && (
        <ul className="divide-y divide-stone-100">
          {shown.map(s => (
            <li key={s.materialId} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 basis-48">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{s.name}</span>
                  {s.flag === 'at_threshold' && <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-coral/10 text-coral">Already low</span>}
                  {s.confidence === 'low' && (
                    <span title={s.historyDays < 14 ? 'Based on under two weeks of history' : 'Your use varies a lot from day to day'} className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">Low confidence</span>
                  )}
                </div>
                <div className="font-mono text-[11px] text-muted mt-0.5">
                  {cover(s)}{s.stock > 0 ? ` · runs out ${formatFigure({ kind: 'date', value: s.runOutDate, label: '' }, fx)}` : ''}
                </div>
              </div>
              <div className="text-sm text-ink">
                Order about <span className="font-mono font-semibold">{formatFigure({ kind: 'quantity', value: s.suggestedQty, unit: s.unit, label: '' }, fx)}</span>
              </div>
              <button
                type="button"
                onClick={() => onRestock(s.materialId)}
                aria-label={`Restock ${s.name}`}
                className="h-9 px-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
              >
                <ShoppingCart size={14} /> Restock
              </button>
            </li>
          ))}
        </ul>
      )}
      {suggestions.length > shown.length && <p className="text-xs text-muted">And {suggestions.length - shown.length} more.</p>}

      {notEnoughHistory.length > 0 && (
        <p className="text-xs text-muted">
          Not enough history yet to say for {notEnoughHistory.map(id => names[id]).filter(Boolean).join(', ')}.
        </p>
      )}
    </section>
  );
};
