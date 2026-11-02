import React, { useMemo, useState } from 'react';
import { Check, TrendingUp } from 'lucide-react';
import type { BakerySettings, MenuItem, Order, RawMaterial } from '../types';
import { formatDayMonth } from '../utils/localDate';
import { monthlyCostOfSlippedMargins, priceReviewRows, priceReviewStatus, priceReviewSummary, type PriceReviewChoice } from '../utils/pricing';
import { MenuShareModal } from './MenuShareModal';
import { ModalShell } from './ModalShell';

/**
 * The quarterly price review: every item whose margin has slipped or is under target on one screen, each with a
 * recommended new price, already ticked, so one tap on Apply accepts the lot. The only place Stockpot puts a new price
 * for an item already on sale in front of the owner unasked. A tick means "change this price"; choosing Keep unticks it.
 */
export const PriceReviewModal: React.FC<{
  menu: MenuItem[];
  materials: RawMaterial[];
  orders: Order[];
  settings: BakerySettings;
  currency: { code: string; symbol: string };
  today: string;
  /** Saves the chosen prices and the review date in one batch. An empty list records the review with nothing changed. */
  onApply: (changes: { menuItemId: string; newPrice: number }[]) => Promise<boolean>;
  onClose: () => void;
}> = ({ menu, materials, orders, settings, currency, today, onApply, onClose }) => {
  // Worked out once when the screen opens: applying moves the items off the list, and the outcome should stay on show.
  const [rows] = useState(() => priceReviewRows(menu, materials, settings));
  const [monthlyCost] = useState(() => monthlyCostOfSlippedMargins(rows, { orders, menu, materials, settings, today }));
  const [choices, setChoices] = useState<Record<string, PriceReviewChoice>>(() => Object.fromEntries(rows.map(r => [r.item.id, r.recommended])));
  const [customs, setCustoms] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);

  const money = (n: number) => `${currency.symbol}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const nameOf = (id: string) => materials.find(m => m.id === id)?.name || 'An ingredient';

  const changes = useMemo(() => rows.flatMap(r => {
    const choice = choices[r.item.id];
    const price = choice === 'custom' ? Number(customs[r.item.id]) : choice === 'keep' ? 0 : r.options[choice]?.price ?? 0;
    return price > 0 && price !== r.item.sellingPrice ? [{ menuItemId: r.item.id, newPrice: price }] : [];
  }), [rows, choices, customs]);
  const summary = priceReviewSummary(rows.map(r => r.item), changes);

  const choose = (id: string, choice: PriceReviewChoice) => setChoices(prev => ({ ...prev, [id]: choice }));

  const save = async (list: { menuItemId: string; newPrice: number }[]) => {
    setSaving(true);
    setError('');
    const ok = await onApply(list);
    setSaving(false);
    if (!ok) { setError('That could not be saved, so no prices have changed. Please try again.'); return; }
    if (list.length === 0) onClose(); else setApplied(list.length);
  };

  if (sharing) return <MenuShareModal menu={menu} settings={settings} currency={currency} onClose={onClose} />;

  if (applied !== null) {
    const next = priceReviewStatus({ ...settings, lastPriceReviewOn: today }, today).nextReviewOn;
    return (
      <ModalShell
        title="Prices updated" subtitle={`Next price review ${formatDayMonth(next)}`} icon={Check} onClose={onClose} widthClass="sm:max-w-md"
        footer={(
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg bg-stone-100 text-sm font-semibold text-ink hover:bg-stone-200">Done</button>
            <button type="button" onClick={() => setSharing(true)} className="h-10 px-4 rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary-dark">Share updated menu</button>
          </div>
        )}
      >
        <p className="text-sm text-ink">{applied === 1 ? '1 price has' : `${applied} prices have`} changed. Your customers can have the new menu on WhatsApp.</p>
      </ModalShell>
    );
  }

  const optionCls = (on: boolean) => `h-9 px-3 rounded-lg text-xs font-semibold transition-colors ${on ? 'bg-primary text-white' : 'bg-stone-100 text-ink hover:bg-stone-200'}`;

  return (
    <ModalShell
      title="Time to raise prices"
      subtitle="Your quarterly price review"
      icon={TrendingUp}
      tone="amber"
      onClose={onClose}
      widthClass="sm:max-w-2xl"
      footer={(
        <div className="space-y-2">
          {error && <p role="alert" className="text-sm text-coral">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" disabled={saving} onClick={() => save([])} className="text-sm text-muted underline underline-offset-2 hover:text-ink disabled:opacity-50">
              Keep all prices for now
            </button>
            <div className="flex items-center gap-3">
              {summary.count > 0 && <span className="text-sm text-ink">Changing {summary.count} price{summary.count === 1 ? '' : 's'}. Average rise {summary.averageRisePct.toFixed(0)}%.</span>}
              <button type="button" disabled={saving || changes.length === 0} onClick={() => save(changes)} className="h-10 px-5 rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
        {rows.length === 0 && <p className="text-sm text-ink">Every item's margin is holding, so no price needs to change.</p>}
        {monthlyCost !== null && (
          <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm font-semibold text-ink">
            These margins are costing you about {currency.symbol}{Math.round(monthlyCost).toLocaleString()} a month, going by the last 30 days of sales.
          </p>
        )}
        {rows.map(r => {
          const id = r.item.id;
          const choice = choices[id];
          const name = r.item.name || 'Untitled';
          const { restore, target } = r.options;
          const showTarget = target && target.price !== restore?.price;
          return (
            <div key={id} role="group" aria-label={name} className="rounded-xl border border-stone-200 p-3 space-y-2.5">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  aria-label={`Change the price of ${name}`}
                  checked={choice !== 'keep'}
                  onChange={e => choose(id, !e.target.checked ? 'keep' : r.recommended === 'keep' ? 'custom' : r.recommended)}
                  className="mt-1 w-4 h-4 accent-primary"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink">{name}</div>
                  <div className="text-xs text-muted">
                    Price now {money(r.item.sellingPrice)} · margin {r.drift.marginAtPricing.toFixed(0)}% → {r.drift.marginNow.toFixed(0)}%
                    {r.mainDriverId ? ` · ${nameOf(r.mainDriverId)}` : ' · recipe changed'}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-7">
                <button type="button" aria-pressed={choice === 'keep'} onClick={() => choose(id, 'keep')} className={optionCls(choice === 'keep')}>Keep {money(r.item.sellingPrice)}</button>
                {restore && <button type="button" aria-pressed={choice === 'restore'} onClick={() => choose(id, 'restore')} className={optionCls(choice === 'restore')}>Restore margin {money(restore.price)}</button>}
                {showTarget && <button type="button" aria-pressed={choice === 'target'} onClick={() => choose(id, 'target')} className={optionCls(choice === 'target')}>Reach target {money(target.price)}</button>}
                <button type="button" aria-pressed={choice === 'custom'} onClick={() => choose(id, 'custom')} className={optionCls(choice === 'custom')}>Custom</button>
                {choice === 'custom' && (
                  <input
                    type="number" min="0" step="any" inputMode="decimal"
                    aria-label={`Custom price for ${name}`}
                    value={customs[id] ?? ''}
                    onChange={e => setCustoms(prev => ({ ...prev, [id]: e.target.value }))}
                    className="h-9 w-24 rounded-lg bg-stone-50 border border-stone-200 px-2 text-sm font-mono text-ink"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
};
