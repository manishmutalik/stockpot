import React, { useState } from 'react';
import { ChevronDown, MessageCircle, Users } from 'lucide-react';
import { buildNudgeUrl, countByStatus, customersForTab, type CustomerProfile, type CustomerTab } from '../utils/customers';

const PAGE = 15;
const TABS: { key: CustomerTab; label: string }[] = [
  { key: 'due', label: 'Due' },
  { key: 'lapsed', label: 'Lapsed' },
  { key: 'all', label: 'All' },
];
const EMPTY: Record<CustomerTab, string> = {
  due: 'Nobody is due for a reorder right now.',
  lapsed: 'No lapsed customers.',
  all: 'No customers yet. They appear here once orders have a name or phone number.',
};

const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const ago = (days: number) => (days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`);
const usualGap = (c: CustomerProfile) =>
  c.medianDaysBetweenOrders === null ? 'Not enough orders yet'
  : c.medianDaysBetweenOrders < 1.5 ? 'Most days'
  : `Every ~${Math.round(c.medianDaysBetweenOrders)} days`;

const STATUS_TAG: Record<CustomerProfile['status'], { label: string; cls: string }> = {
  new: { label: 'New', cls: 'bg-primary/10 text-primary' },
  active: { label: 'Active', cls: 'bg-margin/10 text-[#006143]' },
  due: { label: 'Due', cls: 'bg-amber-100 text-amber-700' },
  lapsed: { label: 'Lapsed', cls: 'bg-coral/10 text-coral' },
};

/**
 * Who has ordered, how they order and who to nudge. Worked out from orders
 * alone (see utils/customers), across every date, with no AI involved: it works
 * with the AI features switched off. Each customer has a WhatsApp button that
 * opens their chat with a short message ready; nothing is sent until the owner
 * presses send in WhatsApp.
 */
export const CustomersPanel: React.FC<{
  customers: CustomerProfile[];
  money: (n: number) => string;
  businessName?: string;
}> = ({ customers, money, businessName }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<CustomerTab>('due');
  const [shown, setShown] = useState(PAGE);
  if (customers.length === 0) return null;

  const counts = countByStatus(customers);
  const tabCount: Record<CustomerTab, number> = { due: counts.due, lapsed: counts.lapsed, all: customers.length };
  const rows = customersForTab(customers, tab);

  return (
    <section aria-label="Customers" className="surface-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-6 py-4 text-left"
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Users size={20} /></span>
          <span className="min-w-0">
            <span className="block text-base font-bold text-ink">Customers</span>
            <span className="block font-mono text-[11px] uppercase tracking-wider text-muted">
              {customers.length} customer{customers.length === 1 ? '' : 's'} · <b className={counts.due ? 'text-amber-700' : 'text-ink'}>{counts.due} due</b> · {counts.lapsed} lapsed
            </span>
          </span>
        </span>
        <ChevronDown size={20} className={`text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-3 sm:px-4 pb-4">
          <div role="tablist" aria-label="Customer lists" className="flex gap-2 mb-3">
            {TABS.map(t => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => { setTab(t.key); setShown(PAGE); }}
                className={`flex items-center gap-2 px-3.5 h-9 rounded-full text-sm font-semibold transition-colors ${tab === t.key ? 'bg-primary text-white shadow-sm' : 'bg-stone-50 text-muted hover:bg-stone-100'}`}
              >
                {t.label}
                <span className={`font-mono text-[11px] px-1.5 rounded-full ${tab === t.key ? 'bg-white/20' : 'bg-white'}`}>{tabCount[t.key]}</span>
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">{EMPTY[tab]}</p>
          ) : (
            <ul className="space-y-2">
              {rows.slice(0, shown).map(c => {
                const nudge = buildNudgeUrl(c, businessName);
                const tag = STATUS_TAG[c.status];
                return (
                  <li key={c.key} className="flex flex-wrap items-center justify-between gap-3 p-3 bg-stone-50/60 rounded-xl">
                    <div className="min-w-0 flex-1 basis-56">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="font-semibold text-ink truncate">{c.name}</span>
                        {tab === 'all' && <span className={`font-mono text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${tag.cls}`}>{tag.label}</span>}
                        {!c.hasPhone && <span title="Known by name only, so they cannot be messaged and may also appear under another name" className="font-mono text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-stone-100 text-muted">No phone</span>}
                      </div>
                      <div className="font-mono text-[11px] text-muted mt-0.5">
                        Last order {shortDate(c.lastOrder)} ({ago(c.daysSinceLastOrder)}) · {usualGap(c)} · {c.orderCount} order{c.orderCount === 1 ? '' : 's'}
                      </div>
                      {c.favouriteItems.length > 0 && <div className="text-xs text-muted mt-0.5 truncate">Usually orders {c.favouriteItems.join(', ')}</div>}
                    </div>
                    <div className="flex items-center gap-3 ml-auto">
                      <div className="text-right">
                        <div className="font-mono text-sm font-semibold text-ink whitespace-nowrap">{money(c.totalContribution)}</div>
                        <div className="font-mono text-[10px] uppercase tracking-wider text-muted">made on them{c.estimated ? ' (est.)' : ''}</div>
                      </div>
                      {nudge ? (
                        <a
                          href={nudge}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Send a WhatsApp message to ${c.name}`}
                          className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-[#006143] bg-margin/10 text-xs font-semibold hover:bg-margin/20 transition-colors whitespace-nowrap"
                        >
                          <MessageCircle size={15} /> WhatsApp
                        </a>
                      ) : (
                        <span title="No phone number to message" className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-stone-100 text-muted text-xs font-semibold whitespace-nowrap cursor-not-allowed">
                          <MessageCircle size={15} /> No phone
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {rows.length > shown && (
            <button type="button" onClick={() => setShown(n => n + PAGE)} className="mt-3 w-full h-10 rounded-lg bg-stone-50 text-sm font-semibold text-muted hover:bg-stone-100 transition-colors">
              Show {Math.min(PAGE, rows.length - shown)} more of {rows.length - shown}
            </button>
          )}
        </div>
      )}
    </section>
  );
};
