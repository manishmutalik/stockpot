import React from 'react';
import { Info } from 'lucide-react';
import type { ProfitStep } from '../utils/profit';

/**
 * Sales down to true profit, one cost at a time (a waterfall): each cost is a coral bar hanging from where the money stood before
 * it, the subtotal and the total are full bars from zero. The figures are the dashboard's own (utils/profit.profitSteps), so the
 * lines always add up to the cards. Works as rows, so it reads the same on a phone.
 */
export const ProfitBreakdown: React.FC<{
  steps: ProfitStep[];
  money: (n: number) => string;
  /** Shown under the list when no fixed costs are set, so their absence is not mistaken for "nothing to pay". */
  noFixedCostsNote?: React.ReactNode;
}> = ({ steps, money, noFixedCostsNote }) => {
  // Where each bar starts and ends: costs hang from the running total, subtotals and the total stand on zero.
  type Span = { from: number; to: number; after: number };
  const spans = steps.reduce((acc: Span[], s: ProfitStep): Span[] => {
    const before = acc.length ? acc[acc.length - 1].after : 0;
    if (s.kind === 'start') return [...acc, { from: 0, to: s.amount, after: s.amount }];
    if (s.kind === 'subtotal' || s.kind === 'total') return [...acc, { from: 0, to: s.amount, after: before }];
    return [...acc, { from: before, to: before + s.amount, after: before + s.amount }];
  }, [] as Span[]);
  // The scale runs from the lowest point reached (0 unless the business lost money) to the highest.
  const lo = Math.min(0, ...spans.flatMap(p => [p.from, p.to]));
  const hi = Math.max(0, ...spans.flatMap(p => [p.from, p.to]));
  const range = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / range) * 100;
  const sales = steps[0]?.amount ?? 0;

  return (
    <section aria-label="From sales to true profit" className="surface-card p-5 md:p-6">
      <div className="mb-4">
        <h3 className="text-xl font-semibold tracking-tight text-ink">From sales to true profit</h3>
        <p className="text-sm text-muted">Every cost taken off what came in, in order.</p>
      </div>
      <ol className="space-y-1">
        {steps.map((s, i) => {
          const { from, to } = spans[i];
          const left = pct(Math.min(from, to));
          const width = Math.max(pct(Math.max(from, to)) - left, s.amount === 0 ? 0 : 0.6);
          const isTotal = s.kind === 'total';
          const isSub = s.kind === 'subtotal';
          const negative = (isTotal || isSub) && s.amount < 0;
          const bar = s.kind === 'cost' ? 'bg-coral/80'
            : s.kind === 'add' ? 'bg-margin/70'
              : isTotal ? (negative ? 'bg-coral' : 'bg-primary')
                : isSub ? (negative ? 'bg-coral/60' : 'bg-primary/45')
                  : 'bg-primary/25';
          const sharePct = sales > 0 ? (Math.abs(s.amount) / sales) * 100 : 0;
          // A small cost still shows it is there, rather than reading as "0%".
          const share = sales > 0 && s.kind !== 'start' ? (sharePct > 0 && sharePct < 1 ? '<1%' : `${sharePct.toFixed(0)}%`) : null;
          return (
            <li key={s.key}
              className={`grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-2 ${isSub || isTotal ? 'border-t border-stone-200 mt-1 pt-3' : ''}`}>
              <div className="min-w-0">
                <div className={`text-sm truncate ${isTotal ? 'font-bold text-ink' : isSub ? 'font-semibold text-ink' : 'text-ink'}`}>
                  {s.kind === 'cost' ? '− ' : s.kind === 'add' ? '+ ' : isSub || isTotal ? '= ' : ''}{s.label}
                </div>
                {s.hint && <div className="text-[11px] text-muted leading-snug">{s.hint}</div>}
              </div>
              <div className="relative h-3 rounded-full bg-stone-100 col-span-2 sm:col-span-1 order-last sm:order-none" aria-hidden="true">
                <div className={`absolute top-0 h-3 rounded-full ${bar}`} style={{ left: `${left}%`, width: `${width}%` }} />
              </div>
              <div className="text-right whitespace-nowrap">
                <span className={`font-mono ${isTotal ? 'text-lg font-semibold' : 'text-sm'} ${s.kind === 'cost' || negative ? 'text-coral' : isTotal ? 'text-primary' : 'text-ink'}`}>
                  {s.kind === 'cost' ? `−${money(-s.amount)}` : s.amount < 0 ? `−${money(-s.amount)}` : money(s.amount)}
                </span>
                {share && <span className="block font-mono text-[10px] text-muted">{share} of sales</span>}
              </div>
            </li>
          );
        })}
      </ol>
      {noFixedCostsNote && (
        <p className="mt-3 flex items-start gap-2 text-xs text-muted"><Info size={14} className="shrink-0 mt-0.5" />{noFixedCostsNote}</p>
      )}
    </section>
  );
};
