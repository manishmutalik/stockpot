import React from 'react';
import { History } from 'lucide-react';
import type { PriceLogEntry, RawMaterial } from '../types';
import { priceHistory, PRICE_SOURCE_LABELS } from '../utils/priceLog';
import type { MaterialPriceStats, RecipeAffected } from '../utils/pricing';
import { ModalShell } from './ModalShell';

/** A price per unit with enough decimals for per-gram and per-ml costs (0.045), and cents for the rest. */
export function formatUnitCost(n: number, symbol: string): string {
  if (n >= 1) return `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${symbol}${+n.toPrecision(3)}`;
}

const formatDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  // The year only when it isn't this one: it keeps the column narrow enough for a phone.
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }) });
};

const TH = 'px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted text-left whitespace-nowrap';

/**
 * Every price recorded for one material, newest first: when, what was paid per
 * unit, how much was bought and why it was recorded. Read-only; entries are
 * only ever added (by restocking, adding a material with a cost, or editing its
 * cost). It starts from the day price logging began, so older purchases are not
 * in it.
 */
export const PriceHistoryModal: React.FC<{
  material: Pick<RawMaterial, 'id' | 'name' | 'unit'>;
  entries: PriceLogEntry[];
  /** Last price, 90-day average and 30/90-day change, from `materialPriceStats`. */
  stats?: MaterialPriceStats;
  /** The recipes that use this material, from `recipesAffectedBy`, with the item's name. */
  usedIn?: (RecipeAffected & { name: string })[];
  currencySymbol: string;
  onClose: () => void;
}> = ({ material, entries, stats, usedIn = [], currencySymbol, onClose }) => {
  const rows = priceHistory(entries, material);
  const change = (value: number | null, has: boolean) =>
    !has || value === null ? <span className="text-muted font-normal">not enough history yet</span>
      : <span className={value > 0 ? 'text-coral' : value < 0 ? 'text-[#006143]' : 'text-ink'}>{value > 0 ? '+' : value < 0 ? '−' : ''}{Math.abs(value).toFixed(1)}%</span>;
  return (
    <ModalShell
      title={`Price history: ${material.name}`}
      subtitle="What you paid, newest first"
      icon={History}
      onClose={onClose}
      closeOnBackdrop
      widthClass="sm:max-w-xl"
      footer={
        <button type="button" onClick={onClose} className="w-full h-12 rounded-xl bg-stone-100 text-ink text-sm font-semibold hover:bg-stone-200 transition-colors">
          Close
        </button>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">
          No prices recorded yet. A price is recorded each time you restock this item, add it with a cost, or change its cost.
        </p>
      ) : (
        <>
          {stats && stats.lastPrice !== null && (
            <dl className="grid grid-cols-2 gap-3 text-sm" aria-label="Price summary">
              <div className="rounded-xl bg-stone-50 px-3 py-2"><dt className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Last paid</dt><dd className="font-mono font-semibold text-ink">{formatUnitCost(stats.lastPrice, currencySymbol)} / {material.unit}</dd></div>
              <div className="rounded-xl bg-stone-50 px-3 py-2"><dt className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">90-day average</dt><dd className="font-mono font-semibold text-ink">{stats.avgPrice90d !== null ? formatUnitCost(stats.avgPrice90d, currencySymbol) : '–'}</dd></div>
              <div className="rounded-xl bg-stone-50 px-3 py-2"><dt className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">30-day change</dt><dd className="font-mono font-semibold">{change(stats.change30d, stats.hasEnoughHistory.d30)}</dd></div>
              <div className="rounded-xl bg-stone-50 px-3 py-2"><dt className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">90-day change</dt><dd className="font-mono font-semibold">{change(stats.change90d, stats.hasEnoughHistory.d90)}</dd></div>
            </dl>
          )}
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className={TH}>Date</th>
                  <th className={`${TH} text-right`}>Paid per unit</th>
                  <th className={`${TH} text-right`}>Bought</th>
                  <th className={`${TH} hidden sm:table-cell text-right`}>Average after</th>
                  <th className={TH}>Why</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-stone-50 last:border-0">
                    <td className="px-3 py-2.5 whitespace-nowrap text-ink">{formatDate(r.date)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-ink whitespace-nowrap">
                      {formatUnitCost(r.unitCost, currencySymbol)}<span className="text-muted font-normal"> / {r.unit}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted whitespace-nowrap">
                      {r.quantity != null ? `${+r.quantity.toPrecision(6)} ${r.unit}` : '–'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted whitespace-nowrap hidden sm:table-cell">
                      {r.macAfter != null ? formatUnitCost(r.macAfter, currencySymbol) : '–'}
                    </td>
                    <td className="px-3 py-2.5 text-muted text-xs sm:text-sm">{PRICE_SOURCE_LABELS[r.source]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Costs are before any GST. History starts from when price logging began, so earlier purchases are not shown. Changes and the average count purchases only (restocks and goods receipts).</p>
        </>
      )}
      {usedIn.length > 0 && (
        <div>
          <h4 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">Used in</h4>
          <ul className="space-y-1.5 text-sm" aria-label="Used in">
            {usedIn.map(r => (
              <li key={r.menuItemId} className="flex justify-between gap-3">
                <span className="text-ink">{r.name} <span className="text-muted">({Math.round(r.costShare * 100)}% of its cost)</span></span>
                <span className="font-mono text-ink whitespace-nowrap">+{currencySymbol}{r.unitCostImpactOf10pct.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} a unit if the price rises 10%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ModalShell>
  );
};
