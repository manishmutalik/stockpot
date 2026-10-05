import React from 'react';
import { CalendarClock } from 'lucide-react';
import type { MenuItem, Order } from '../types';
import { addDays } from '../utils/localDate';
import { summarizeDue, type DueSummary } from '../utils/preorders';

const Section: React.FC<{ title: string; tone: 'now' | 'next'; due: DueSummary }> = ({ title, tone, due }) => (
  <div className={`rounded-xl px-4 py-3 ${tone === 'now' ? 'bg-amber-50' : 'bg-stone-50'}`}>
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">{title}</span>
      <span className="font-mono text-[11px] text-muted">{due.orderCount} order{due.orderCount === 1 ? '' : 's'}</span>
    </div>
    <p className="text-sm font-semibold text-ink mt-1">
      {due.items.map(i => `${i.name} × ${i.quantity}`).join(', ')}
    </p>
  </div>
);

/**
 * Pre-orders to prepare: those due today (or overdue) that have not been handed over, and those due tomorrow, as the
 * items and quantities to make. Built from the orders alone: no AI. Shows nothing when there are none.
 */
export const DueTomorrowCard: React.FC<{
  orders: Order[];
  menu: MenuItem[];
  /** Today in the business's time zone. */
  today: string;
  /** Opens the Upcoming list in the Orders tab. */
  onOpen: () => void;
}> = ({ orders, menu, today, onOpen }) => {
  const tomorrow = addDays(today, 1);
  const now = summarizeDue(orders, menu, d => d <= today);
  const next = summarizeDue(orders, menu, d => d === tomorrow);
  if (!now && !next) return null;
  return (
    <section aria-label="Pre-orders due" className="surface-card p-5 md:p-6 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><CalendarClock size={20} /></span>
          <h3 className="text-base font-bold text-ink">Pre-orders to prepare</h3>
        </div>
        <button type="button" onClick={onOpen} className="text-sm font-semibold text-primary hover:text-primary-dark transition-colors whitespace-nowrap">
          View in Orders
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {now && <Section title="Due today" tone="now" due={now} />}
        {next && <Section title="Due tomorrow" tone="next" due={next} />}
      </div>
    </section>
  );
};
