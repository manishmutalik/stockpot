import React, { useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import type { BakerySettings, MenuItem, Order, RawMaterial } from '../types';
import { pricesFromPercent, pricingScenario, type BreakEven } from '../utils/pricing';
import { MODAL_LABEL, ModalShell, modalField } from './ModalShell';

/** The break-even as a sentence: what the owner can lose (or must gain) and still make the same profit. */
export function breakEvenSentence(b: BreakEven, daysUsed: number): string {
  switch (b.type) {
    case 'can_lose': return `You could lose up to ${b.pct.toFixed(1)}% of these sales and still make the same profit as today.`;
    case 'must_gain': return `At these prices you would need ${b.pct.toFixed(1)}% more sales to make the same profit as today.`;
    case 'unchanged': return 'These prices make the same profit as today.';
    default: return `There are not enough sales in the last ${daysUsed} days to work out a break-even.`;
  }
}

const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };

/**
 * "What if I change my prices?": pick items, a percentage change or exact new prices, and how much history to go by.
 * Shows each item's monthly contribution now and after, and the honest answer to what happens: Stockpot cannot
 * know how customers will react, so it says how far sales could fall before profit is no better than today.
 */
export const PricingScenarioModal: React.FC<{
  menu: MenuItem[];
  orders: Order[];
  materials: RawMaterial[];
  settings: BakerySettings;
  today: string;
  currencySymbol: string;
  onClose: () => void;
}> = ({ menu, orders, materials, settings, today, currencySymbol, onClose }) => {
  const priced = useMemo(() => menu.filter(m => m.sellingPrice > 0), [menu]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(priced.map(m => m.id)));
  const [percent, setPercent] = useState('8');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [lookback, setLookback] = useState<30 | 90>(30);
  const [volume, setVolume] = useState('');

  const money = (n: number) => `${currencySymbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const signedMoney = (n: number) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;

  const changes = useMemo(() => {
    const fromPercent = pricesFromPercent(priced, [...selected], num(percent));
    return fromPercent.map(c => (overrides[c.menuItemId] !== undefined && overrides[c.menuItemId] !== '' ? { ...c, newPrice: Math.max(num(overrides[c.menuItemId]), 0) } : c));
  }, [priced, selected, percent, overrides]);

  const scenario = useMemo(
    () => pricingScenario({ changes, lookbackDays: lookback, expectedVolumeChangePct: volume === '' ? 0 : num(volume), orders, menu, materials, settings, today }),
    [changes, lookback, volume, orders, menu, materials, settings, today]
  );

  const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allSelected = selected.size === priced.length;
  const delta = scenario.monthlyContributionAfter - scenario.monthlyContributionNow;

  return (
    <ModalShell
      title="What if I change prices?"
      subtitle="From your own sales, no guessing"
      icon={Calculator}
      onClose={onClose}
      closeOnBackdrop
      widthClass="sm:max-w-3xl"
      footer={<button type="button" onClick={onClose} className="w-full h-12 rounded-xl bg-stone-100 text-ink text-sm font-semibold hover:bg-stone-200 transition-colors">Close</button>}
    >
      {priced.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">Set a price on a menu item first, then you can try changing it here.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="scenario-percent" className={MODAL_LABEL}>Change prices by (%)</label>
              <input id="scenario-percent" type="number" step="0.5" value={percent} onChange={e => { setPercent(e.target.value); setOverrides({}); }} className={`${modalField()} font-mono`} />
            </div>
            <div>
              <label htmlFor="scenario-lookback" className={MODAL_LABEL}>Go by sales over</label>
              <select id="scenario-lookback" value={lookback} onChange={e => setLookback(Number(e.target.value) as 30 | 90)} className={modalField()}>
                <option value={30}>The last 30 days</option>
                <option value={90}>The last 90 days</option>
              </select>
            </div>
            <div className="col-span-2 md:col-span-1">
              <label htmlFor="scenario-volume" className={MODAL_LABEL}>If sales change by (%, optional)</label>
              <input id="scenario-volume" type="number" step="1" value={volume} placeholder="0" onChange={e => setVolume(e.target.value)} className={`${modalField()} font-mono`} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className={MODAL_LABEL + ' mb-0'}>Items</span>
              <button type="button" onClick={() => setSelected(allSelected ? new Set() : new Set(priced.map(m => m.id)))} className="text-xs font-semibold text-primary hover:text-primary-dark">
                {allSelected ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted text-left">
                    <th className="px-2 py-2 w-8"><span className="sr-only">Include</span></th>
                    <th className="px-2 py-2">Item</th>
                    <th className="px-2 py-2 text-right whitespace-nowrap hidden sm:table-cell">Now</th>
                    <th className="px-2 py-2 text-right whitespace-nowrap">New price</th>
                    <th className="px-2 py-2 text-right whitespace-nowrap hidden sm:table-cell">Sold</th>
                    <th className="px-2 py-2 text-right whitespace-nowrap hidden sm:table-cell">Per month</th>
                  </tr>
                </thead>
                <tbody>
                  {priced.map(m => {
                    const row = scenario.perItem.find(p => p.menuItemId === m.id);
                    const change = changes.find(c => c.menuItemId === m.id);
                    const perMonth = !selected.has(m.id) || !row ? <span className="text-muted">–</span>
                      : row.noRecentSales ? <span className="text-muted text-xs">No recent sales</span>
                        : <span className="text-ink">{money(row.contributionNow)} → {money(row.contributionAfter)}</span>;
                    return (
                      <tr key={m.id} className="border-b border-stone-50 last:border-0">
                        <td className="px-2 py-2"><input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} aria-label={`Include ${m.name}`} className="h-4 w-4 accent-[var(--color-primary)]" /></td>
                        <td className="px-2 py-2 text-ink">
                          {m.emoji} {m.name}
                          <div className="sm:hidden font-mono text-[11px] text-muted mt-0.5">Now {money(m.sellingPrice)} · per month {perMonth}</div>
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-muted whitespace-nowrap hidden sm:table-cell">{money(m.sellingPrice)}</td>
                        <td className="px-2 py-2 text-right">
                          {selected.has(m.id) ? (
                            <input
                              type="number" step="0.01" min="0" aria-label={`New price for ${m.name}`}
                              value={overrides[m.id] ?? String(change?.newPrice ?? '')}
                              onChange={e => setOverrides(o => ({ ...o, [m.id]: e.target.value }))}
                              className="w-24 bg-stone-50 rounded-lg px-2 py-1.5 text-right font-mono text-sm outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          ) : <span className="text-muted">–</span>}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-muted hidden sm:table-cell">{row && !row.noRecentSales ? row.unitsInPeriod : ''}</td>
                        <td className="px-2 py-2 text-right font-mono whitespace-nowrap hidden sm:table-cell">{perMonth}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl bg-primary/5 p-4 space-y-2" role="status" aria-label="Result">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className={MODAL_LABEL + ' mb-0'}>Contribution per month</span>
              <span className="font-mono text-sm text-ink">
                {money(scenario.monthlyContributionNow)} → <b>{money(scenario.monthlyContributionAfter)}</b>
                <span className={delta >= 0 ? 'text-[#006143]' : 'text-coral'}> ({signedMoney(delta)})</span>
              </span>
            </div>
            <p className="text-sm text-ink font-semibold">{breakEvenSentence(scenario.breakEven, scenario.daysUsed)}</p>
            <p className="text-xs text-muted">
              Based on the units you really sold in {scenario.daysUsed} day{scenario.daysUsed === 1 ? '' : 's'}{scenario.daysUsed < lookback ? ` (that is all the history there is)` : ''}, scaled to a month, at today's menu prices and costs.
              Contribution is what sales leave after ingredients, packaging, discounts and payment fees. Fixed costs do not change with price, so this change is also the change in your monthly profit.
              Stockpot cannot know how customers will react; this only shows how far sales could move before you are no better off.
            </p>
          </div>
        </>
      )}
    </ModalShell>
  );
};
