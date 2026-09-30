import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Calendar, ChevronLeft, ChevronRight, CircleCheck, Clock, Coins, Factory, Gift, Home, Package,
  ShoppingBag, Trash2, TriangleAlert, Wheat, History
} from 'lucide-react';
import { AppViewProps, MenuItem } from '../types';
import type { ProductionRun } from '../components/ProductionRunModal';
import { MetricCard } from '../components/MetricCard';
import { clusterProductionRunsBySession } from '../utils/productionRunClustering';
import { daysBetween, getWorstUrgencyForItem } from '../utils/stockAging';
import { getOldestBatchDate, getRunStatus, getYieldInfo, sellableOf, summarizeProduction } from '../utils/productionStats';

const PAGE_SIZE = 12;

// Historical display only — new production runs no longer set `purpose`
// (see ProductionRun.purpose); these labels/colors only render for runs
// logged before that change.
const PURPOSE_LABELS: Record<string, string> = {
  market_stock: '🛒 Market Stock',
  customer_order: '📦 Customer Order',
  sampling: '🎁 Sampling',
  personal_use: '🏠 Personal Use',
  other: '✳️ Other',
};
const PURPOSE_COLORS: Record<string, string> = {
  market_stock: 'bg-blue-50 text-blue-700',
  customer_order: 'bg-emerald-50 text-emerald-700',
  sampling: 'bg-purple-50 text-purple-700',
  personal_use: 'bg-stone-100 text-stone-600',
  other: 'bg-amber-50 text-amber-700',
};

const TH = 'px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap';
const selectCls =
  'h-10 rounded-lg bg-stone-50 border border-transparent px-3 text-sm font-medium text-ink focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none cursor-pointer';

/**
 * One production run's table row. Extracted so the same row renders
 * identically whether it stands alone or sits nested inside a session's
 * clustered group (see the productionSessionId clustering in
 * ProductionView below) — one implementation, not two copies to keep in
 * sync. `tinted` lightly shades a row that's part of a session, to
 * visually connect it to its group header above.
 */
const ProductionRunRow: React.FC<{
  run: ProductionRun;
  menu: MenuItem[];
  money: (n: number) => string;
  today: string;
  showPurpose: boolean;
  deleteProductionRun: (id: string) => void;
  tinted?: boolean;
}> = ({ run, menu, money, today, showPurpose, deleteProductionRun, tinted }) => {
  const recipe = menu.find(m => m.id === run.recipeId);
  const sellable = sellableOf(run);
  const { percent, waste } = getYieldInfo(run);
  const status = getRunStatus(run, today);
  const remaining = run.remainingQuantity ?? 0;
  // A due/expired date only matters while there is still stock from the batch.
  const expiryDays = run.expiryDate ? daysBetween(today, run.expiryDate) : null;
  const expiryTone = remaining > 0 && expiryDays !== null
    ? (expiryDays < 0 ? 'text-coral font-semibold' : expiryDays <= 1 ? 'text-amber-600 font-semibold' : 'text-ink')
    : 'text-ink';
  return (
    <tr className={`hover:bg-primary/[0.03] transition-colors ${tinted ? 'bg-primary/[0.03]' : ''}`}>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="font-mono text-xs font-semibold text-ink">{new Date(run.date + 'T00:00:00').toLocaleDateString()}</div>
        {run.createdAt > 0 && (
          <div className="font-mono text-[11px] text-muted">
            {new Date(run.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </td>
      <td className="px-4 py-3 min-w-[11rem] text-sm font-semibold text-ink">{recipe?.name || 'Unknown'}</td>
      {showPurpose && (
        <td className="px-4 py-3">
          {run.purpose ? (
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${PURPOSE_COLORS[run.purpose] || 'bg-stone-100 text-stone-600'}`}>
              {PURPOSE_LABELS[run.purpose] || run.purpose}
            </span>
          ) : (
            <span className="text-stone-300">—</span>
          )}
        </td>
      )}
      <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-ink whitespace-nowrap">{run.quantityProduced}</td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full font-mono text-[10px] font-semibold tracking-wide ${
            waste > 0 ? 'bg-coral/10 text-coral' : 'bg-margin/10 text-[#006143]'
          }`}
          title={waste > 0 ? `${sellable} of ${run.quantityProduced} sellable` : 'Everything produced was sellable'}
        >
          {waste > 0 ? `${Math.round(percent)}% · -${waste} waste` : '100% yield'}
        </span>
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-ink whitespace-nowrap">{money(run.costTotal || 0)}</td>
      <td className={`px-4 py-3 font-mono text-xs whitespace-nowrap ${expiryTone}`}>
        {run.expiryDate ? new Date(run.expiryDate + 'T00:00:00').toLocaleDateString() : '—'}
        {remaining > 0 && expiryDays !== null && expiryDays < 0 && <span className="ml-1">(Expired)</span>}
        {remaining > 0 && expiryDays !== null && expiryDays >= 0 && expiryDays <= 1 && <span className="ml-1">(Due)</span>}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full font-mono text-[10px] font-semibold tracking-wide whitespace-nowrap ${status.cls}`}>
          {status.label}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={() => deleteProductionRun(run.id)}
          className="p-2 text-stone-300 hover:text-coral hover:bg-coral/10 rounded-lg transition-colors"
          title="Delete Production Run"
          aria-label="Delete Production Run"
        >
          <Trash2 size={16} />
        </button>
      </td>
    </tr>
  );
};

export const ProductionView: React.FC<AppViewProps> = (props) => {
  const {
    materials, menu, productionRuns, productionFilterRecipe, setProductionFilterRecipe,
    setIsProductionRunModalOpen, currency, settings, openAddOrderModalFor, setDiscardTarget,
    deleteProductionRun, deleteProductionRunSession, convertAmount
  } = props;

  // Material cost per unit for one menu item, at current material prices —
  // shared by every Market Stock action below (Personal Use, Sampling,
  // Discard) since they all log the same kind of wastage entry.
  const costPerUnitFor = (item: MenuItem) => item.recipe.reduce((total, req) => {
    const mat = materials.find(m => m.id === req.materialId);
    if (!mat) return total;
    const convertedAmount = convertAmount(req.amount, req.unit || 'g', mat.unit);
    return total + (convertedAmount * (mat.costPerUnit || 0));
  }, 0);
  const today = new Date().toISOString().split('T')[0];
  const money = (n: number) =>
    `${currency.symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // The page is remembered together with the filters it was chosen under, so
  // changing any filter falls back to page 1 without an effect.
  const [pageState, setPageState] = useState({ key: '', page: 1 });

  const summary = useMemo(() => summarizeProduction(productionRuns, today), [productionRuns, today]);

  const stockedItems = menu.filter(m => (m.finishedGoodsStock ?? 0) > 0);
  const unitsOnShelf = stockedItems.reduce((s, m) => s + (m.finishedGoodsStock ?? 0), 0);
  const freshnessAlerts = stockedItems.filter(m => getWorstUrgencyForItem(m.id, productionRuns, today) !== 'fresh').length;

  const filtered = useMemo(
    () => [...productionRuns]
      .filter(r => !productionFilterRecipe || r.recipeId === productionFilterRecipe)
      .filter(r => (!dateFrom || r.date >= dateFrom) && (!dateTo || r.date <= dateTo))
      .sort((a, b) => b.createdAt - a.createdAt),
    [productionRuns, productionFilterRecipe, dateFrom, dateTo]
  );
  // Sessions stay whole across pages: paginate clusters, not rows.
  const clusters = useMemo(() => clusterProductionRunsBySession(filtered), [filtered]);
  const pageCount = Math.max(1, Math.ceil(clusters.length / PAGE_SIZE));
  const filterKey = [productionFilterRecipe, dateFrom, dateTo].join('\u0000');
  const currentPage = Math.min(pageState.key === filterKey ? pageState.page : 1, pageCount);
  const setPage = (n: number) => setPageState({ key: filterKey, page: n });
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageClusters = clusters.slice(pageStart, pageStart + PAGE_SIZE);
  const shownRuns = pageClusters.reduce((n, c) => n + (c.type === 'single' ? 1 : c.runs.length), 0);
  const showPurpose = filtered.some(r => r.purpose);
  const colCount = showPurpose ? 9 : 8;
  const hasFilters = !!(productionFilterRecipe || dateFrom || dateTo);

  const iconBtn = 'p-2 rounded-lg text-muted transition-colors flex items-center justify-center';

  return (
    <motion.div
      key="production"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6 pb-20"
    >
      {/* Heading */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
            <span className="truncate">{settings.name || 'My Bakery'}</span>
            <span className="text-stone-300">/</span>
            <span className="text-primary font-semibold whitespace-nowrap">Production &amp; Baking Logs</span>
          </div>
          <h2 className="text-2xl md:text-[32px] md:leading-tight font-bold tracking-tight text-ink">Production Runs &amp; Finished Goods</h2>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Record production runs, track yield and batch cost, and manage finished goods stock.
          </p>
        </div>
        <button
          onClick={() => setIsProductionRunModalOpen(true)}
          className="h-10 flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-5 rounded-lg text-sm font-semibold shadow-sm transition-colors"
        >
          <Factory size={16} />
          Log Production Run
        </button>
      </div>

      {/* Headline figures (all time) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="Total Runs"
          value={String(summary.totalRuns)}
          icon={History}
          tone="teal"
          footLeft="All time log count"
          footRight={summary.runsThisWeek > 0 ? `${summary.runsThisWeek} this week` : null}
        />
        <MetricCard
          label="Units Baked"
          value={String(summary.unitsProduced)}
          icon={Wheat}
          tone="slate"
          footLeft={summary.unitsProduced > 0 ? `${summary.unitsSellable} sellable` : 'All time'}
          footRight={summary.unitsProduced > 0 ? `${summary.yieldPercent.toFixed(1)}% yield` : null}
        />
        <MetricCard
          label="Total Prod. Cost"
          value={money(summary.totalCost)}
          icon={Coins}
          tone="slate"
          footLeft="Avg cost per unit"
          footRight={summary.unitsProduced > 0 ? money(summary.costPerUnit) : null}
        />
        <MetricCard
          label="Finished Goods"
          value={String(stockedItems.length)}
          icon={Package}
          tone={freshnessAlerts > 0 ? 'coral' : 'teal'}
          footLeft={`${unitsOnShelf} unit${unitsOnShelf === 1 ? '' : 's'} on shelf`}
          footRight={freshnessAlerts > 0 ? `${freshnessAlerts} freshness alert${freshnessAlerts === 1 ? '' : 's'}` : null}
        />
      </div>

      {/* Market Stock — what's left to sell after orders have claimed their share */}
      {stockedItems.length > 0 && (
        <div className="surface-card overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-stone-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Package size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-ink">Market Stock &amp; Freshness</h3>
              <p className="text-xs text-muted">What's left to sell — add it to an order, mark it used, or discard it here.</p>
            </div>
          </div>
          <div className="px-4 sm:px-6 py-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {stockedItems.map(item => {
              const stock = item.finishedGoodsStock ?? 0;
              const baseTarget = { id: item.id, name: item.name, type: 'recipe' as const, maxQty: stock, unit: 'pcs', costPerUnit: costPerUnitFor(item) };
              const urgency = getWorstUrgencyForItem(item.id, productionRuns, today);
              const oldest = getOldestBatchDate(item.id, productionRuns);
              const age = oldest ? daysBetween(oldest, today) : null;
              return (
                <div key={item.id} className={`flex items-center justify-between gap-2 rounded-xl pl-4 pr-2 py-3 ${urgency === 'expired' ? 'bg-coral/5' : 'bg-stone-50'}`}>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink truncate">{item.name}</div>
                    <div className="flex items-center flex-wrap gap-1.5 mt-1">
                      <span className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded-full ${stock <= 5 ? 'bg-amber-100 text-amber-700' : 'bg-margin/10 text-[#006143]'}`}>
                        {stock} unit{stock === 1 ? '' : 's'}
                      </span>
                      {urgency === 'fresh' ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full bg-margin/10 text-[#006143]">
                          <CircleCheck size={10} /> Fresh
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full ${urgency === 'expired' ? 'bg-coral/10 text-coral' : 'bg-amber-100 text-amber-700'}`}>
                          {urgency === 'expired' ? <TriangleAlert size={10} /> : <Clock size={10} />}
                          {urgency === 'expired' ? 'Expired batch' : 'Check freshness'}
                        </span>
                      )}
                    </div>
                    {age !== null && (
                      <div className="font-mono text-[10px] text-muted mt-1">
                        Oldest batch {age <= 0 ? 'baked today' : `${age}d old`}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => openAddOrderModalFor(item.id)}
                      className={`${iconBtn} hover:text-primary hover:bg-primary/10`}
                      title="Add to an Order"
                      aria-label={`Add ${item.name} to an order`}
                    >
                      <ShoppingBag size={16} />
                    </button>
                    <button
                      onClick={() => setDiscardTarget({ ...baseTarget, presetReason: 'Personal Use' })}
                      className={`${iconBtn} hover:text-amber-600 hover:bg-amber-50`}
                      title="Mark as Personal Use"
                      aria-label={`Mark ${item.name} as personal use`}
                    >
                      <Home size={16} />
                    </button>
                    <button
                      onClick={() => setDiscardTarget({ ...baseTarget, presetReason: 'Sampling' })}
                      className={`${iconBtn} hover:text-purple-600 hover:bg-purple-50`}
                      title="Mark as Sampling"
                      aria-label={`Mark ${item.name} as sampling`}
                    >
                      <Gift size={16} />
                    </button>
                    <button
                      onClick={() => setDiscardTarget(baseTarget)}
                      className={`${iconBtn} hover:text-coral hover:bg-coral/10`}
                      title="Discard / log as wastage"
                      aria-label={`Discard ${item.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="surface-card p-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <select
          aria-label="Filter by recipe"
          value={productionFilterRecipe}
          onChange={e => setProductionFilterRecipe(e.target.value)}
          className={selectCls}
        >
          <option value="">All Recipes</option>
          {menu.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div className="flex flex-wrap items-center gap-2 bg-stone-50 rounded-lg px-3 h-10">
          <Calendar size={15} className="text-primary shrink-0" />
          <input
            type="date"
            aria-label="From date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="bg-transparent border-none focus:ring-0 font-mono text-xs font-semibold text-ink p-0 cursor-pointer w-28 sm:w-32"
          />
          <span className="text-stone-300 font-bold text-xs">→</span>
          <input
            type="date"
            aria-label="To date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="bg-transparent border-none focus:ring-0 font-mono text-xs font-semibold text-ink p-0 cursor-pointer w-28 sm:w-32"
          />
        </div>
        {hasFilters && (
          <button
            onClick={() => { setProductionFilterRecipe(''); setDateFrom(''); setDateTo(''); }}
            className="h-10 px-3 rounded-lg text-sm font-semibold text-primary hover:bg-primary/10 transition-colors self-start lg:self-auto"
          >
            Clear filters
          </button>
        )}
        <span className="font-mono text-[11px] text-muted lg:ml-auto">
          {filtered.length} of {productionRuns.length} run{productionRuns.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Runs list */}
      {filtered.length === 0 ? (
        <div className="surface-card p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mx-auto mb-4">
            <Factory size={32} />
          </div>
          {productionRuns.length === 0 ? (
            <>
              <h3 className="text-lg font-bold text-ink mb-2">No production runs yet</h3>
              <p className="text-sm text-muted">Log a production run to start tracking finished goods.</p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-bold text-ink mb-2">No runs match these filters</h3>
              <p className="text-sm text-muted">Change the recipe or date range to see more.</p>
            </>
          )}
        </div>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="bg-primary/5">
                <tr>
                  <th className={`${TH} text-left`}>Batch date</th>
                  <th className={`${TH} text-left`}>Recipe</th>
                  {showPurpose && <th className={`${TH} text-left`} title="Only set on runs logged before purpose was retired">Purpose</th>}
                  <th className={`${TH} text-right`}>Produced</th>
                  <th className={`${TH} text-right`} title="Sellable units as a share of what was produced">Yield</th>
                  <th className={`${TH} text-right`}>Batch cost</th>
                  <th className={`${TH} text-left`}>Shelf expiry</th>
                  <th className={`${TH} text-left`}>Status</th>
                  <th className={`${TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {pageClusters.flatMap(cluster => cluster.type === 'single' ? (
                  <ProductionRunRow
                    key={cluster.run.id}
                    run={cluster.run}
                    menu={menu}
                    money={money}
                    today={today}
                    showPurpose={showPurpose}
                    deleteProductionRun={deleteProductionRun}
                  />
                ) : [
                  <tr key={`${cluster.groupId}-header`} className="bg-primary/5">
                    <td colSpan={colCount} className="px-4 py-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                          <Factory size={12} /> Session ({cluster.runs.length} items)
                        </span>
                        <button
                          onClick={() => deleteProductionRunSession(cluster.groupId)}
                          title="Delete every item in this session"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-[10px] font-semibold uppercase tracking-wider text-coral hover:bg-coral/10 transition-colors"
                        >
                          <Trash2 size={12} /> Delete Session
                        </button>
                      </div>
                    </td>
                  </tr>,
                  ...cluster.runs.map(run => (
                    <ProductionRunRow
                      key={run.id}
                      run={run}
                      menu={menu}
                      money={money}
                      today={today}
                      showPurpose={showPurpose}
                      deleteProductionRun={deleteProductionRun}
                      tinted
                    />
                  )),
                ])}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 border-t border-stone-100 text-sm text-muted">
            <span>
              Showing <b className="text-ink">{shownRuns}</b> of <b className="text-ink">{filtered.length}</b> logged run{filtered.length === 1 ? '' : 's'}
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
        </div>
      )}
    </motion.div>
  );
};
