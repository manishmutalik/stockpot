import React, { useState } from 'react';
import { CheckCheck, ChevronDown, Receipt, Wallet } from 'lucide-react';
import type { Order } from '../types';
import type { PendingCustomer } from '../utils/payments';

const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * Customers who still owe for orders, with what they owe and two actions:
 * send one consolidated bill (a statement) covering all their pending orders,
 * or mark them all paid once the money is in. Shown only while something is
 * pending, and always across every date, not just the Orders tab's range.
 */
export const PendingPayments: React.FC<{
  customers: PendingCustomer[];
  money: (n: number) => string;
  onStatement: (orders: Order[]) => void;
  onMarkPaid: (customer: PendingCustomer) => void;
}> = ({ customers, money, onStatement, onMarkPaid }) => {
  const [open, setOpen] = useState(true);
  if (customers.length === 0) return null;

  const owed = customers.reduce((sum, c) => sum + c.dueTotal, 0);
  const orderCount = customers.reduce((sum, c) => sum + c.orderCount, 0);

  return (
    <section aria-label="Pending payments" className="surface-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-6 py-4 text-left"
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-coral/10 text-coral flex items-center justify-center shrink-0"><Wallet size={20} /></span>
          <span className="min-w-0">
            <span className="block text-base font-bold text-ink">Payments pending</span>
            <span className="block font-mono text-[11px] uppercase tracking-wider text-muted">
              {customers.length} customer{customers.length === 1 ? '' : 's'} · {orderCount} order{orderCount === 1 ? '' : 's'} · <b className="text-ink">{money(owed)}</b> owed
            </span>
          </span>
        </span>
        <ChevronDown size={20} className={`text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ul className="px-3 sm:px-4 pb-4 space-y-2">
          {customers.map(c => (
            <li key={c.key} className="flex flex-wrap items-center justify-between gap-3 p-3 bg-stone-50/60 rounded-xl">
              <div className="min-w-0">
                <div className="font-semibold text-ink truncate">{c.name}</div>
                <div className="font-mono text-[11px] text-muted">
                  {c.phone ? `${c.phone} · ` : ''}{c.orderCount} order{c.orderCount === 1 ? '' : 's'} · since {shortDate(c.oldestDate)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 ml-auto">
                <span className="font-mono text-sm font-semibold text-ink whitespace-nowrap mr-1">{money(c.dueTotal)}</span>
                <button
                  type="button"
                  onClick={() => onStatement(c.orders)}
                  aria-label={`Send consolidated bill to ${c.name}`}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-colors"
                >
                  <Receipt size={15} /> Consolidated bill
                </button>
                <button
                  type="button"
                  onClick={() => onMarkPaid(c)}
                  aria-label={`Mark everything paid for ${c.name}`}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-[#006143] bg-margin/10 text-xs font-semibold hover:bg-margin/20 transition-colors"
                >
                  <CheckCheck size={15} /> Mark all paid
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
