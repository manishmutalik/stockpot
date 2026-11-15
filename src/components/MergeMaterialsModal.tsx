import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Combine } from 'lucide-react';
import { ModalShell, MODAL_LABEL, modalField } from './ModalShell';
import { ConfirmDialog } from './ConfirmDialog';
import { mergeWarning } from '../utils/deleteWarnings';
import type { MenuItem, Order, PriceLogEntry, RawMaterial, RecipeExperiment, WastageLog } from '../types';
import { canMerge, mergeSummary, planMergeMaterials } from '../utils/mergeMaterials';
import { maybeSameItemName, sameItemName } from '../utils/duplicates';

type Item = RawMaterial & { remaining?: number };

/**
 * Merging two inventory items that are one thing (utils/mergeMaterials). Opened from an item: the owner picks the other
 * item (those that look the same first, and only items counted the same way), picks which name to keep, reads what will
 * happen (stock, cost, what moves across, that the other is deleted and it cannot be undone) and presses Merge, which
 * asks once more in the same popup every delete uses ("Merge Chini into Sugar?"). Nothing is written until that is
 * answered Merge.
 */
export function MergeMaterialsModal({ from, otherId, materials, menu, experiments, orders, wastageLogs, priceLog, currencySymbol, onMerge, onClose }: {
  from: Item;
  /** The other item to start with (from a duplicate's "Merge"). */
  otherId?: string;
  materials: Item[];
  menu: MenuItem[];
  experiments: RecipeExperiment[];
  orders: Order[];
  wastageLogs: WastageLog[];
  priceLog: PriceLogEntry[];
  currencySymbol: string;
  onMerge: (keepId: string, removeId: string) => Promise<boolean>;
  onClose: () => void;
}) {
  // The items it can merge with, those that look the same first.
  const groups = useMemo(() => {
    const others = materials.filter(m => m.id !== from.id && canMerge(from, m)).sort((a, b) => a.name.localeCompare(b.name));
    const same = others.filter(m => sameItemName(from.name, m.name));
    const maybe = others.filter(m => !same.includes(m) && maybeSameItemName(from.name, m.name));
    return { same, maybe, rest: others.filter(m => !same.includes(m) && !maybe.includes(m)) };
  }, [materials, from]);
  const first = otherId ?? groups.same[0]?.id ?? groups.maybe[0]?.id ?? '';
  const [other, setOther] = useState(first);
  const otherItem = materials.find(m => m.id === other);

  // Keep, by default, the one more recipes use, or else the older one.
  const uses = (id: string) => menu.filter(i => (i.recipe ?? []).some(r => r.materialId === id)).length;
  const defaultKeep = (o: Item) => (uses(o.id) > uses(from.id) || (uses(o.id) === uses(from.id) && (o.dateAdded || '') < (from.dateAdded || '')) ? o.id : from.id);
  const [keepChoice, setKeepChoice] = useState<string | null>(null);
  const keepId = otherItem ? (keepChoice && [from.id, otherItem.id].includes(keepChoice) ? keepChoice : defaultKeep(otherItem)) : from.id;
  const keep = keepId === from.id ? from : otherItem;
  const remove = keepId === from.id ? otherItem : from;

  const preview = useMemo(() => {
    if (!keep || !remove) return null;
    const input = { keep, remove, menu, experiments, orders, wastageLogs, priceLog };
    const plan = planMergeMaterials(input);
    if ('error' in plan) return { error: plan.error, lines: [] };
    const amount = (n: number, unit: string) => `${+n.toFixed(3)} ${unit}`;
    const money = (n: number) => `${currencySymbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;
    return { error: null, lines: mergeSummary(input, plan, { amount, money }) };
  }, [keep, remove, menu, experiments, orders, wastageLogs, priceLog, currencySymbol]);

  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const merge = async () => {
    if (!keep || !remove || busy) return;
    setBusy(true);
    const done = await onMerge(keep.id, remove.id);
    setBusy(false);
    if (done) onClose();
  };

  const option = (m: Item) => <option key={m.id} value={m.id}>{m.name.trim()} ({m.category})</option>;
  const stock = (m: Item) => `${+(m.remaining ?? m.initialStock ?? 0).toFixed(3)} ${m.unit || 'g'}`;

  return (
    <ModalShell
      title="Merge items"
      subtitle={`Two names for one thing? Make them one item.`}
      icon={Combine}
      tone="amber"
      widthClass="sm:max-w-lg"
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 h-12 rounded-xl bg-stone-100 text-ink text-sm font-semibold hover:bg-stone-200 transition-colors">Cancel</button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!keep || !remove || !!preview?.error || busy}
            className="flex-1 h-12 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md shadow-primary/20 flex items-center justify-center gap-2"
          >
            <Combine size={18} />
            {busy ? 'Merging…' : 'Merge'}
          </button>
        </div>
      }
    >
      <div>
        <label htmlFor="merge-other" className={MODAL_LABEL}>Merge {from.name.trim()} with</label>
        {groups.same.length + groups.maybe.length + groups.rest.length === 0 ? (
          <p className="text-sm text-muted">No other item is counted in {from.unit || 'g'} the same way, so there is nothing to merge it with.</p>
        ) : (
          <select id="merge-other" value={other} onChange={(e) => { setOther(e.target.value); setKeepChoice(null); }} className={modalField()}>
            {!other && <option value="">Choose an item</option>}
            {groups.same.length > 0 && <optgroup label="Looks like the same thing">{groups.same.map(option)}</optgroup>}
            {groups.maybe.length > 0 && <optgroup label="Maybe the same">{groups.maybe.map(option)}</optgroup>}
            {groups.rest.length > 0 && <optgroup label="Other items">{groups.rest.map(option)}</optgroup>}
          </select>
        )}
      </div>

      {otherItem && (
        <fieldset>
          <legend className={MODAL_LABEL}>Keep which one?</legend>
          <div className="grid gap-2">
            {[from, otherItem].map(m => (
              <label key={m.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${keepId === m.id ? 'border-primary bg-primary/5' : 'border-stone-200 hover:bg-stone-50'}`}>
                <input type="radio" name="merge-keep" value={m.id} checked={keepId === m.id} onChange={() => setKeepChoice(m.id)} className="accent-[var(--color-primary)]" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink truncate">{m.name.trim()}</span>
                  <span className="block font-mono text-[11px] text-muted">{m.category} · {stock(m)} · used in {uses(m.id)} {uses(m.id) === 1 ? 'recipe' : 'recipes'}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {preview && (
        <div role="status" className={`rounded-xl px-4 py-3 text-sm ${preview.error ? 'bg-coral/10 text-coral' : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
          {preview.error ?? (
            <>
              <p className="font-semibold mb-1">{remove!.name.trim()} becomes part of {keep!.name.trim()}:</p>
              <ul className="list-disc pl-5 space-y-0.5">{preview.lines.map(l => <li key={l}>{l}</li>)}</ul>
            </>
          )}
        </div>
      )}

      {confirming && keep && remove && (() => {
        const w = mergeWarning(keep.name, remove.name);
        return createPortal(<ConfirmDialog type="confirm" title={w.title} message={w.message} confirmLabel={w.confirmLabel} onConfirm={merge} onClose={() => setConfirming(false)} />, document.body);
      })()}
    </ModalShell>
  );
}
