import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Calendar, ChevronLeft, ChevronRight, ClipboardList, Hourglass, Layers, Receipt, Search, ShieldCheck
} from 'lucide-react';
import { AppViewProps } from '../types';
import { MetricCard } from '../components/MetricCard';
import { reasonOf, summarizeWastage } from '../utils/wastageStats';

const PAGE_SIZE = 15;

type TypeFilter = 'all' | 'material' | 'recipe';

const TYPE_LABEL: Record<'material' | 'recipe', string> = { material: 'Raw Material', recipe: 'Finished Good' };
const TYPE_PILL: Record<'material' | 'recipe', string> = {
  material: 'bg-stone-100 text-muted',
  recipe: 'bg-primary/10 text-primary',
};

const TH = 'px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap';
const selectCls =
  'h-10 rounded-lg bg-stone-50 border border-transparent px-3 text-sm font-medium text-ink focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none cursor-pointer';

export const WastageView: React.FC<AppViewProps> = (props) => {
  const { materials, menu, wastageLogs, productionRuns, currency, settings } = props;

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [reasonFilter, setReasonFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // The page is remembered together with the filters it was chosen under, so
  // changing any filter falls back to page 1 without an effect.
  const [pageState, setPageState] = useState({ key: '', page: 1 });

  const money = (n: number) =>
    `${currency.symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const nameOf = (log: (typeof wastageLogs)[number]) =>
    (log.type === 'material' ? materials.find(m => m.id === log.itemId)?.name : menu.find(m => m.id === log.itemId)?.name) || 'Unknown Item';
  const unitOf = (log: (typeof wastageLogs)[number]) =>
    log.type === 'material' ? materials.find(m => m.id === log.itemId)?.unit || '' : 'pcs';

  // Summary cards and the reason breakdown cover the whole log; the table
  // below narrows by the filters.
  const summary = useMemo(() => summarizeWastage(wastageLogs, productionRuns || []), [wastageLogs, productionRuns]);
  const top = summary.byReason[0];

  const reasons = useMemo(() => summary.byReason.map(r => r.reason).sort((a, b) => a.localeCompare(b)), [summary]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () => [...wastageLogs]
      .filter(l => typeFilter === 'all' || l.type === typeFilter)
      .filter(l => reasonFilter === 'all' || reasonOf(l) === reasonFilter)
      .filter(l => (!dateFrom || l.date >= dateFrom) && (!dateTo || l.date <= dateTo))
      .filter(l => !q || nameOf(l).toLowerCase().includes(q) || reasonOf(l).toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wastageLogs, materials, menu, typeFilter, reasonFilter, dateFrom, dateTo, q]
  );
  const filteredLoss = filtered.reduce((s, l) => s + (l.cost || 0), 0);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const filterKey = [q, typeFilter, reasonFilter, dateFrom, dateTo].join('\u0000');
  const currentPage = Math.min(pageState.key === filterKey ? pageState.page : 1, pageCount);
  const setPage = (n: number) => setPageState({ key: filterKey, page: n });
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const hasFilters = !!(q || typeFilter !== 'all' || reasonFilter !== 'all' || dateFrom || dateTo);

  const tabs: [TypeFilter, string, number][] = [
    ['all', 'All Types', wastageLogs.length],
    ['material', 'Raw Materials', summary.materialCount],
    ['recipe', 'Finished Goods', summary.recipeCount],
  ];

  return (
    <motion.div
      key="wastage"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6 pb-20"
    >
      {/* Heading */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
          <span className="truncate">{settings.name || 'My Bakery'}</span>
          <span className="text-stone-300">/</span>
          <span className="text-primary font-semibold whitespace-nowrap">Audit &amp; Variance</span>
        </div>
        <h2 className="text-2xl md:text-[32px] md:leading-tight font-bold tracking-tight text-ink">Wastage &amp; Loss Ledger</h2>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          Track discarded ingredients, spoiled stock and finished goods. Log waste from Inventory or Market Stock.
        </p>
      </div>

      {/* Headline figures (whole log) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="Total Recorded Loss"
          value={money(summary.totalLoss)}
          icon={Receipt}
          tone={summary.totalLoss > 0 ? 'coral' : 'slate'}
          footLeft="At cost, all time"
        />
        <MetricCard
          label="Waste Incidents"
          value={`${summary.count} ${summary.count === 1 ? 'Entry' : 'Entries'}`}
          icon={ClipboardList}
          tone="slate"
          footLeft={`${summary.materialCount} raw material${summary.materialCount === 1 ? '' : 's'}`}
          footRight={`${summary.recipeCount} finished`}
        />
        <MetricCard
          label="Primary Waste Reason"
          value={top ? top.reason : '—'}
          icon={Hourglass}
          tone="slate"
          footLeft={top ? `${top.count} incident${top.count === 1 ? '' : 's'}` : 'Nothing logged yet'}
          footRight={top ? `${top.percent.toFixed(0)}% of loss` : null}
        />
        <MetricCard
          label="Loss vs Production"
          value={summary.lossVsProductionPercent === null ? '—' : `${summary.lossVsProductionPercent.toFixed(2)}%`}
          icon={ShieldCheck}
          tone="teal"
          footLeft="Of total production cost"
        />
      </div>

      {/* Filters */}
      <div className="surface-card p-4 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center gap-3">
          <div className="relative flex-1 min-w-0 xl:max-w-sm">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search item or reason"
              aria-label="Search wastage"
              className="w-full h-10 pl-10 pr-3 rounded-lg bg-stone-50 border border-transparent text-sm text-ink placeholder:text-muted focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            />
          </div>
          <select aria-label="Filter by reason" value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)} className={selectCls}>
            <option value="all">All Reasons</option>
            {reasons.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className="flex flex-wrap items-center gap-2 bg-stone-50 rounded-lg px-3 h-10">
            <Calendar size={15} className="text-primary shrink-0" />
            <input
              type="date"
              aria-label="From date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent border-none focus:ring-0 font-mono text-xs font-semibold text-ink p-0 cursor-pointer w-28 sm:w-32"
            />
            <span className="text-stone-300 font-bold text-xs">→</span>
            <input
              type="date"
              aria-label="To date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent border-none focus:ring-0 font-mono text-xs font-semibold text-ink p-0 cursor-pointer w-28 sm:w-32"
            />
          </div>
          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setTypeFilter('all'); setReasonFilter('all'); setDateFrom(''); setDateTo(''); }}
              className="h-10 px-3 rounded-lg text-sm font-semibold text-primary hover:bg-primary/10 transition-colors self-start xl:self-auto"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              aria-pressed={typeFilter === key}
              className={`flex items-center gap-2 px-3.5 h-9 rounded-full text-sm font-semibold transition-colors ${
                typeFilter === key ? 'bg-primary text-white shadow-sm' : 'bg-stone-50 text-muted hover:bg-stone-100'
              }`}
            >
              {label}
              <span className={`font-mono text-[11px] px-1.5 rounded-full ${typeFilter === key ? 'bg-white/20' : 'bg-white'}`}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Ledger */}
      <div className="surface-card overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-stone-100 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-ink text-base flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Ledger Entries
          </h3>
          <span className="font-mono text-[11px] text-muted">
            {filtered.length} of {wastageLogs.length} · <b className="text-coral">{money(filteredLoss)}</b>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left border-collapse">
            <thead className="bg-primary/5">
              <tr>
                <th className={TH}>Date</th>
                <th className={TH}>Discarded item</th>
                <th className={TH}>Category</th>
                <th className={`${TH} text-right`}>Qty lost</th>
                <th className={`${TH} text-right`}>Unit cost</th>
                <th className={`${TH} text-right`}>Cost impact</th>
                <th className={TH}>Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {pageRows.map(log => {
                const unit = unitOf(log);
                const unitCost = log.quantity > 0 ? log.cost / log.quantity : 0;
                return (
                  <tr key={log.id} className="hover:bg-primary/[0.03] transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-ink whitespace-nowrap">{log.date}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-ink min-w-[10rem]">{nameOf(log)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full font-mono text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${TYPE_PILL[log.type]}`}>
                        {TYPE_LABEL[log.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-ink whitespace-nowrap">
                      {log.quantity} <span className="text-[10px] uppercase text-muted">{unit}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted whitespace-nowrap">
                      {money(unitCost)}{unit && <span className="uppercase">/{unit}</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-coral whitespace-nowrap">{money(log.cost || 0)}</td>
                    <td className="px-4 py-3 text-sm text-muted">{reasonOf(log)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-14 text-center text-muted">
                    {wastageLogs.length === 0 ? 'No wastage logged yet. Great job!' : 'No entries match these filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 border-t border-stone-100 text-sm text-muted">
            <span>
              Showing <b className="text-ink">{pageStart + 1}</b> to <b className="text-ink">{Math.min(pageStart + PAGE_SIZE, filtered.length)}</b> of{' '}
              <b className="text-ink">{filtered.length}</b> records
            </span>
            {pageCount > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg hover:bg-stone-100 disabled:opacity-30 disabled:pointer-events-none"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-2 font-mono text-xs">Page <b className="text-ink">{currentPage}</b> / {pageCount}</span>
                <button
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === pageCount}
                  className="p-2 rounded-lg hover:bg-stone-100 disabled:opacity-30 disabled:pointer-events-none"
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Where the loss comes from */}
      {summary.byReason.length > 0 && (
        <div className="surface-card p-5 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Layers size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink">Loss by Reason</h3>
              <p className="text-xs text-muted">How the recorded loss splits across root causes.</p>
            </div>
          </div>
          <ul className="space-y-4">
            {summary.byReason.slice(0, 6).map((r, i) => (
              <li key={r.reason}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 min-w-0 text-ink">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${i === 0 ? 'bg-coral' : 'bg-primary'}`} />
                    <span className="truncate">{r.reason}</span>
                    <span className="font-mono text-[11px] text-muted whitespace-nowrap">{r.count}×</span>
                  </span>
                  <span className="font-mono text-xs text-muted whitespace-nowrap">
                    {r.percent.toFixed(0)}% <span className="text-ink font-semibold">({money(r.cost)})</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${i === 0 ? 'bg-coral' : 'bg-primary'}`} style={{ width: `${r.percent}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
};
