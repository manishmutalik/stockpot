import React from 'react';
import type { ProductProfit } from '../utils/profit';
import { getMarginInfo, type MarginTier } from '../utils/menuStats';

const TIER_CLASS: Record<MarginTier, string> = {
  high: 'text-[#006143] bg-margin/10',
  mid: 'text-amber-700 bg-amber-100',
  low: 'text-coral bg-coral/10',
};

const Stat: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
    <div className="font-mono text-sm font-semibold text-ink mt-0.5 truncate">{children}</div>
  </div>
);

/**
 * What a product actually sold and kept over the period chosen on the Menu
 * screen: units, revenue, what it made and what that is per unit. A product can
 * have a healthy recipe margin and still keep little once discounts, card fees
 * and courier costs are taken off; when its realised margin falls a band below
 * its recipe margin, it says so.
 */
export const ProductPerformance: React.FC<{
  name: string;
  profit: ProductProfit | undefined;
  /** The recipe's gross margin tier and percent, from the price and recipe cost. */
  recipe: { tier: MarginTier; margin: number };
  money: (n: number) => string;
  periodLabel: string;
}> = ({ name, profit, recipe, money, periodLabel }) => {
  if (!profit || profit.unitsSold === 0) {
    return <p className="text-xs text-muted" aria-label={`Sales of ${name}`}>No sales {periodLabel}.</p>;
  }
  const kept = profit.revenue > 0 ? getMarginInfo(profit.revenue, profit.revenue - profit.contribution) : null;
  const eroded = kept && !kept.isLoss && recipe.tier === 'high' && kept.tier !== 'high';
  return (
    <div role="group" aria-label={`Sales of ${name}`} className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Sold">{profit.unitsSold} {profit.unitsSold === 1 ? 'unit' : 'units'}</Stat>
        <Stat label="Revenue">{money(profit.revenue)}</Stat>
        <Stat label="Made">
          <span className={profit.contribution < 0 ? 'text-coral' : ''}>{profit.contribution < 0 ? '-' : ''}{money(Math.abs(profit.contribution))}</span>
          {profit.estimated && <span className="ml-1 text-[9px] text-muted font-semibold" title="Some of these orders are valued at today's prices because they were made before prices were recorded on each order">est.</span>}
        </Stat>
        <Stat label="Per unit">
          {profit.avgContributionPerUnit < 0 ? '-' : ''}{money(Math.abs(profit.avgContributionPerUnit))}
          {kept && (
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] align-middle ${TIER_CLASS[kept.tier]}`} title="Share of sales kept after all costs">
              {kept.isLoss ? 'loss' : `${kept.margin.toFixed(0)}% kept`}
            </span>
          )}
        </Stat>
      </div>
      {eroded && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
          The recipe margin is {recipe.margin.toFixed(0)}%, but only {kept!.margin.toFixed(0)}% of sales is kept: discounts, payment fees or delivery are eating into it.
        </p>
      )}
    </div>
  );
};
