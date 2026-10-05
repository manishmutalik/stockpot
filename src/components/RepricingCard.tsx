import React from 'react';
import { TrendingDown } from 'lucide-react';
import type { BakerySettings, MenuItem, RawMaterial } from '../types';
import { itemsNeedingRepricing } from '../utils/pricing';

/**
 * "N items need repricing": menu items whose margin has slipped since they were priced (or is under the owner's
 * target), by how much, with a link to the Menu tab filtered to them. Plain arithmetic, no AI. Shows nothing when
 * every item's margin is holding.
 */
export const RepricingCard: React.FC<{
  menu: MenuItem[];
  materials: RawMaterial[];
  settings: BakerySettings;
  onOpen: () => void;
}> = ({ menu, materials, settings, onOpen }) => {
  const items = itemsNeedingRepricing(menu, materials, settings);
  if (items.length === 0) return null;
  const worst = items[0];
  return (
    <section aria-label="Items needing repricing" className="surface-card p-5 md:p-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><TrendingDown size={20} /></span>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-ink">{items.length} item{items.length === 1 ? '' : 's'} need{items.length === 1 ? 's' : ''} repricing</h3>
          <p className="text-sm text-muted">
            {worst.item.name || 'Untitled'}: margin {worst.drift.marginAtPricing.toFixed(0)}% → {worst.drift.marginNow.toFixed(0)}%
            {items.length > 1 ? ` and ${items.length - 1} more` : ''}
          </p>
        </div>
      </div>
      <button type="button" onClick={onOpen} className="text-sm font-semibold text-primary hover:text-primary-dark transition-colors whitespace-nowrap">
        View in Menu
      </button>
    </section>
  );
};
