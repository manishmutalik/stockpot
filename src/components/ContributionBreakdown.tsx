import React from 'react';
import type { OrderContribution } from '../utils/profit';
import { getMarginInfo } from '../utils/menuStats';

const TIER_CLASS = { high: 'text-[#006143] bg-margin/10', mid: 'text-amber-700 bg-amber-100', low: 'text-coral bg-coral/10' } as const;

/** Revenue after discount, before costs. */
const netRevenue = (c: OrderContribution) => c.itemsRevenue + c.deliveryCharged - c.discount;

/**
 * "Made ₹438": what an order or multi-item order actually made, coloured by
 * the same margin bands as menu items (60% and up healthy, 40 to 60 watch,
 * below 40 or a loss needs a look). Click for the breakdown. An "est." marker
 * says the figure uses today's prices because the order predates price records.
 */
export const MadeBadge: React.FC<{
  contribution: OrderContribution;
  money: (n: number) => string;
  open: boolean;
  onToggle: () => void;
}> = ({ contribution, money, open, onToggle }) => {
  const revenue = netRevenue(contribution);
  const tier = revenue > 0 ? getMarginInfo(revenue, revenue - contribution.contribution).tier : 'low';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${contribution.contribution < 0 ? 'Lost' : 'Made'} ${money(Math.abs(contribution.contribution))}${contribution.estimated ? ' (estimated)' : ''}. Show breakdown`}
      title="What you made on this order. Click for the breakdown"
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[10px] font-semibold whitespace-nowrap transition-colors hover:opacity-80 ${TIER_CLASS[tier]}`}
    >
      {contribution.contribution < 0 ? 'Lost' : 'Made'} {money(Math.abs(contribution.contribution))}
      {contribution.estimated && <span title="Valued at today's prices because this order was made before prices were recorded on each order">est.</span>}
    </button>
  );
};

/** The sums behind a "Made" figure: revenue, discount, costs, and what is left. GST is shown but is never part of it. */
export const ContributionBreakdown: React.FC<{
  contribution: OrderContribution;
  money: (n: number) => string;
  gstOn: boolean;
}> = ({ contribution: c, money, gstOn }) => {
  const rows: { label: string; value: number; sign: '+' | '-'; hide?: boolean }[] = [
    { label: 'Items', value: c.itemsRevenue, sign: '+' },
    { label: 'Delivery charged', value: c.deliveryCharged, sign: '+', hide: c.deliveryCharged === 0 },
    { label: 'Discount', value: c.discount, sign: '-', hide: c.discount === 0 },
    { label: 'Ingredients', value: c.ingredients, sign: '-' },
    { label: 'Packaging', value: c.packaging, sign: '-', hide: c.packaging === 0 },
    { label: 'Courier fee', value: c.courierFee, sign: '-', hide: c.courierFee === 0 },
    { label: 'Payment fee', value: c.paymentFee, sign: '-', hide: c.paymentFee === 0 },
  ];
  return (
    <div className="mt-3 p-3 bg-white rounded-xl border border-stone-100 text-sm" role="group" aria-label="How this was worked out">
      <div className="space-y-1">
        {rows.filter(r => !r.hide).map(r => (
          <div key={r.label} className="flex justify-between gap-3">
            <span className="text-muted">{r.label}</span>
            <span className="font-mono">{r.sign === '-' ? '-' : ''}{money(r.value)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-3 pt-1.5 mt-1.5 border-t border-stone-200 font-semibold">
          <span>{c.contribution < 0 ? 'Lost on this order' : 'Made on this order'}</span>
          <span className={`font-mono ${c.contribution < 0 ? 'text-coral' : 'text-ink'}`}>{money(c.contribution)}</span>
        </div>
      </div>
      {gstOn && c.gstOnSale > 0 && (
        <p className="text-xs text-muted mt-2">GST of {money(c.gstOnSale)} on this sale is owed to the government, so it is not counted as money made.</p>
      )}
      {c.estimated && (
        <p className="text-xs text-muted mt-2">
          Estimated: this order was made before prices and costs were recorded on each order, so it is valued at today&apos;s menu prices and material costs.
        </p>
      )}
    </div>
  );
};
