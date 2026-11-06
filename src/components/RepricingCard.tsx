import React from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { BakerySettings, MenuItem, RawMaterial } from '../types';
import { formatDayMonth, todayInZone } from '../utils/localDate';
import { itemsNeedingRepricing, priceReviewStatus } from '../utils/pricing';

/**
 * Margins and the price review on the Dashboard. A slipped margin is flagged as soon as it happens: how many items, the
 * worst one, and the date of the next review, with a link to the Menu filtered to them. When a review is due it becomes a
 * strong prompt to raise prices, and stays until the review is done. No price here: those are on the review screen.
 * Shows nothing when every margin is holding and no review is due. Plain arithmetic, no AI.
 */
export const RepricingCard: React.FC<{
  menu: MenuItem[];
  materials: RawMaterial[];
  settings: BakerySettings;
  onOpen: () => void;
  onStartReview?: () => void;
  /** Records a due review as done, for when there is nothing to change. */
  onCompleteReview?: () => void;
}> = ({ menu, materials, settings, onOpen, onStartReview, onCompleteReview }) => {
  const items = itemsNeedingRepricing(menu, materials, settings);
  const review = priceReviewStatus(settings, todayInZone(settings.timezone));
  if (items.length === 0 && !review.due) return null;
  const worst = items[0];

  if (review.due) {
    const holding = items.length === 0;
    return (
      <section aria-label="Margins and price review" className={`surface-card p-5 md:p-6 flex items-center justify-between gap-4 ${holding ? '' : 'ring-2 ring-amber-300'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><TrendingUp size={20} /></span>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-ink">{holding ? "Price review due: every item's margin is holding" : 'Time to raise prices'}</h3>
            {!holding && (
              <p className="text-sm text-muted">
                Your quarterly price review is due: {items.length} item{items.length === 1 ? ' is' : 's are'} earning less than {items.length === 1 ? 'it' : 'they'} should.
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={holding ? onCompleteReview : onStartReview}
          className="h-10 px-4 rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary-dark transition-colors whitespace-nowrap"
        >
          {holding ? 'Done' : 'Start review'}
        </button>
      </section>
    );
  }

  return (
    <section aria-label="Margins and price review" className="surface-card p-5 md:p-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><TrendingDown size={20} /></span>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-ink">{items.length === 1 ? "1 item's margin has slipped" : `${items.length} items' margins have slipped`}</h3>
          <p className="text-sm text-muted">
            {worst.item.name || 'Untitled'} {worst.drift.marginAtPricing.toFixed(0)}% → {worst.drift.marginNow.toFixed(0)}%
            {items.length > 1 ? ` and ${items.length - 1} more` : ''} · Next price review {formatDayMonth(review.nextReviewOn)}
          </p>
        </div>
      </div>
      <button type="button" onClick={onOpen} className="text-sm font-semibold text-primary hover:text-primary-dark transition-colors whitespace-nowrap">
        View in Menu
      </button>
    </section>
  );
};
