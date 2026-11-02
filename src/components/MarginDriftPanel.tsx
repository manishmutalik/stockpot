import React, { useState } from 'react';
import { ChevronDown, TrendingDown } from 'lucide-react';
import type { BakerySettings, MenuItem, RawMaterial } from '../types';
import { formatDayMonth, formatShortDate, todayInZone } from '../utils/localDate';
import { priceReviewStatus, type MarginDrift } from '../utils/pricing';

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(Math.abs(n) >= 10 ? 0 : 1)}%`;

/**
 * How an item's margin has moved since it was priced. Always says when the price was set (or "tracking since"
 * for items that predate pricing stamps). When the margin has slipped or is below the owner's target it shows a
 * badge naming the ingredient that moved, and expands to the drivers and the part due to recipe edits (never blamed on
 * an ingredient's price). The facts only: new prices are suggested at the price review, which this points to.
 */
export const MarginDriftPanel: React.FC<{
  item: MenuItem;
  drift: MarginDrift | null;
  materials: RawMaterial[];
  settings: BakerySettings;
  currencySymbol: string;
  onStartReview?: () => void;
}> = ({ item, drift, materials, settings, currencySymbol, onStartReview }) => {
  const [open, setOpen] = useState(false);
  if (!(item.sellingPrice > 0) || !item.pricedAt) return null;
  const money = (n: number) => `${currencySymbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const nameOf = (id: string) => materials.find(m => m.id === id)?.name || 'An ingredient';
  const since = item.pricingIsBaseline ? `Tracking margin since ${formatShortDate(item.pricedAt)}` : `Price set ${formatShortDate(item.pricedAt)}`;

  if (!drift?.alert) {
    return <p className="font-mono text-[11px] text-muted">{since}</p>;
  }

  const top = drift.drivers.find(d => d.costImpact > 0);
  const review = priceReviewStatus(settings, todayInZone(settings.timezone));
  const headline = drift.alert === 'below_target'
    ? `Margin ${drift.marginNow.toFixed(0)}%, under your ${(item.targetMargin ?? settings.defaultTargetMargin ?? 0).toFixed(0)}% target`
    : `Margin ${drift.marginAtPricing.toFixed(0)}% → ${drift.marginNow.toFixed(0)}%`;
  const recipeChange = Math.abs(drift.recipeChangeImpact) >= 0.005;

  return (
    <div className={`rounded-xl border ${drift.alert === 'below_target' ? 'border-coral/30 bg-coral/5' : 'border-amber-200 bg-amber-50'}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
      >
        <TrendingDown size={18} className={drift.alert === 'below_target' ? 'text-coral shrink-0' : 'text-amber-700 shrink-0'} />
        <span className="flex-1 min-w-0 text-sm font-semibold text-ink">
          {headline}
          {top && top.pctChange !== null && <span className="font-normal text-muted"> · {nameOf(top.materialId)} {signed(top.pctChange)}</span>}
        </span>
        <ChevronDown size={16} className={`text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 text-sm">
          <p className="font-mono text-[11px] text-muted">
            {since}. It cost {money(drift.costAtPricing)} a unit then and {money(drift.costNow)} now.
          </p>
          {drift.drivers.length > 0 && (
            <ul className="space-y-1" aria-label="What changed">
              {drift.drivers.map(d => (
                <li key={d.materialId} className="flex justify-between gap-3">
                  <span className="text-ink">{nameOf(d.materialId)}{d.pctChange !== null && <span className="text-muted"> {signed(d.pctChange)}</span>}</span>
                  <span className="font-mono text-ink">{d.costImpact > 0 ? '+' : '−'}{money(Math.abs(d.costImpact))} a unit</span>
                </li>
              ))}
            </ul>
          )}
          {recipeChange && (
            <p className="text-ink">
              Recipe changes <span className="font-mono">{drift.recipeChangeImpact > 0 ? '+' : '−'}{money(Math.abs(drift.recipeChangeImpact))}</span> a unit
              <span className="text-muted"> (not ingredient prices)</span>
            </p>
          )}
          {review.due ? (
            <button type="button" onClick={onStartReview} className="text-sm font-semibold text-primary hover:text-primary-dark transition-colors">
              Your price review is due
            </button>
          ) : (
            <p className="text-xs text-muted">You'll get a suggested price at your price review on {formatDayMonth(review.nextReviewOn)}.</p>
          )}
        </div>
      )}
    </div>
  );
};
