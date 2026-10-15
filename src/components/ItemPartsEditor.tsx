import React, { useState } from 'react';
import { Layers, X } from 'lucide-react';
import type { ItemPart, MenuItem, RawMaterial } from '../types';
import { partCandidates } from '../utils/itemParts';
import { recipeCost } from '../utils/menuStats';
import { fromEntry, itemUnit, perUnit, smallUnit, toEntry } from '../utils/itemUnits';

/**
 * In the recipe editor: the other items this one is made from (a sponge base in a cream cake, cookies in a hamper, a
 * ganache), each with how many go into one (for an item counted by weight, how many grams: utils/itemUnits) and what that
 * costs. Making the item takes them from their finished stock (utils/itemParts).
 * Only items that would not put this one inside itself are offered.
 */
export const ItemPartsEditor: React.FC<{
  item: MenuItem;
  menu: MenuItem[];
  /** Each item as costing sees it (its own parts counted). */
  costed: Map<string, MenuItem>;
  materials: RawMaterial[];
  currencySymbol: string;
  onChange: (parts: ItemPart[]) => void;
}> = ({ item, menu, costed, materials, currencySymbol, onChange }) => {
  const parts = item.parts ?? [];
  const used = new Set(parts.map(p => p.itemId));
  const options = partCandidates(menu, item.id).filter(m => !used.has(m.id));
  const unitCost = (id: string) => {
    const part = costed.get(id) ?? menu.find(m => m.id === id);
    return part ? recipeCost(part.recipe, materials) : 0;
  };
  const money = (n: number) => `${currencySymbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <section aria-label="Made from other items" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
          <Layers size={14} className="text-primary" />
          <span>Made from other items</span>
        </div>
        {options.length > 0 && (
          <select
            aria-label="Add a made item"
            value=""
            onChange={e => {
              const added = menu.find(m => m.id === e.target.value);
              // A piece, or 100 g (100 ml) of something counted by weight.
              if (added) onChange([...parts, { itemId: added.id, quantity: itemUnit(added) === 'pcs' ? 1 : 0.1 }]);
            }}
            className="h-9 rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">+ Add a made item…</option>
            {options.map(m => <option key={m.id} value={m.id}>{m.name}{m.notForSale ? ' (made for other items)' : ''}</option>)}
          </select>
        )}
      </div>
      {parts.length === 0 ? (
        <p className="text-xs text-muted">
          A base, a filling or anything else you make ahead and keep. Making this item takes it from that item's stock.
          {options.length === 0 && ' Add the base as its own item first (turn off "Sold on the menu" for it).'}
        </p>
      ) : (
        <div className="space-y-2">
          {parts.map((p, i) => {
            const part = menu.find(m => m.id === p.itemId);
            const unit = itemUnit(part);
            const small = smallUnit(unit);
            return (
              <div key={p.itemId} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-sm">
                <span className="flex-1 min-w-0 truncate text-sm font-semibold text-ink">{part?.name ?? 'Missing item'}</span>
                <QuantityInput
                  label={small ? `How much ${part?.name ?? 'of it'} goes into one, in ${small}` : `How many ${part?.name ?? 'of it'} go into one`}
                  value={toEntry(unit, p.quantity)}
                  onCommit={q => onChange(parts.map((x, j) => (j === i ? { ...x, quantity: fromEntry(unit, q) } : x)))}
                />
                <span className="w-6 text-xs text-muted">{small ?? ''}</span>
                <span className="w-20 text-right font-mono text-xs text-muted">{money(unitCost(p.itemId) * p.quantity)}</span>
                <button type="button" aria-label={`Remove ${part?.name ?? 'item'}`} onClick={() => onChange(parts.filter((_, j) => j !== i))}
                  className="p-1.5 rounded-lg text-muted hover:text-coral hover:bg-coral/10">
                  <X size={14} />
                </button>
              </div>
            );
          })}
          <p className="text-[11px] text-muted">
            {itemUnit(item) === 'pcs' ? 'Per one of this item.' : `${perUnit(itemUnit(item)).replace('per', 'Per')} of this item.`}
            {parts.some(p => itemUnit(menu.find(m => m.id === p.itemId)) === 'pcs') && ' Use 0.5 for half (a half-kg cake on half a base).'}
          </p>
        </div>
      )}
    </section>
  );
};

/** A quantity box that keeps what is typed and commits a positive number on blur or Enter. */
const QuantityInput: React.FC<{ label: string; value: number; onCommit: (n: number) => void }> = ({ label, value, onCommit }) => {
  const [text, setText] = useState(String(value));
  // A new value from outside (the saved one) replaces what is in the box.
  const [shown, setShown] = useState(value);
  if (shown !== value) { setShown(value); setText(String(value)); }
  const commit = () => {
    const n = Number(text.replace(',', '.'));
    if (Number.isFinite(n) && n > 0 && n !== value) onCommit(Math.round(n * 1000) / 1000);
    else setText(String(value));
  };
  return (
    <input
      aria-label={label} inputMode="decimal" value={text} onChange={e => setText(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
      className="w-20 rounded-lg border border-stone-200 px-2 py-1.5 text-right font-mono text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
    />
  );
};
