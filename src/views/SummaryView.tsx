import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts';
import {
  ArrowRight, Calculator, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock, Factory,
  CreditCard, Package, Percent, Plus, Receipt, Tag, Trash2, TrendingUp, Truck, TriangleAlert, Wallet
} from 'lucide-react';
import { AppViewProps } from '../types';
import { MetricCard } from '../components/MetricCard';
import { DailyBriefing } from '../components/DailyBriefing';
import { getRunStatus } from '../utils/productionStats';
import { getBatchesNeedingAttention } from '../utils/stockAging';
import type { ProductionRun } from '../components/ProductionRunModal';

export const SummaryView: React.FC<AppViewProps> = (props) => {
  const {
    materials, menu, orders, productionRuns, wastageLogs,
    summaryRange, summaryDateStart, summaryDateEnd, setSummaryDateStart, setSummaryDateEnd, summaryRefDate,
    handleRangeChange, financials, chartData, currency, settings, lowStockItems, lastSynced,
    setActiveTab, setIsProductionRunModalOpen, setRestockMaterial, remainingInventory, experiments, dataReady,
  } = props;

  const fmt = (n: number) =>
    `${n < 0 ? '-' : ''}${currency.symbol}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const today = new Date().toISOString().split('T')[0];

  // Derived, date-range-filtered views used by the cards below.
  const filteredOrders = useMemo(
    () => orders.filter(o => o.date >= summaryDateStart && o.date <= summaryDateEnd),
    [orders, summaryDateStart, summaryDateEnd]
  );
  const filteredProductionRuns = useMemo(
    () => productionRuns.filter(r => r.date >= summaryDateStart && r.date <= summaryDateEnd),
    [productionRuns, summaryDateStart, summaryDateEnd]
  );
  const totalProductionCost = useMemo(
    () => filteredProductionRuns.reduce((sum, r) => sum + (r.costTotal || 0), 0),
    [filteredProductionRuns]
  );
  const filteredWastageLogs = useMemo(
    () => wastageLogs.filter(w => w.date >= summaryDateStart && w.date <= summaryDateEnd),
    [wastageLogs, summaryDateStart, summaryDateEnd]
  );
  const recentRuns = useMemo(
    () => [...filteredProductionRuns].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5),
    [filteredProductionRuns]
  );
  const freshnessAlerts = useMemo(
    () => getBatchesNeedingAttention(productionRuns, today),
    [productionRuns, today]
  );

  const itemsSold = filteredOrders.reduce((acc, o) => acc + o.quantity, 0);
  // A courier delivery is one physical trip: orders sharing an orderGroupId count once.
  const courierDeliveries = useMemo(
    () => new Set(filteredOrders.filter(o => o.deliveryMethod === 'third_party').map(o => o.orderGroupId || o.id)).size,
    [filteredOrders]
  );
  const income = financials.income;
  const ofIncome = (n: number) => (income > 0 ? `${((n / income) * 100).toFixed(1)}% of income` : null);
  const margin = income > 0 ? (financials.profit / income) * 100 : null;
  const avgRunCost = filteredProductionRuns.length > 0 ? totalProductionCost / filteredProductionRuns.length : 0;
  const hasChartData = !chartData.every(d => d.income === 0 && d.expenses === 0 && d.profit === 0);
  const expiredCount = freshnessAlerts.filter(a => a.urgency === 'expired').length;

  const shiftPeriod = (direction: 1 | -1) => {
    const d = new Date(summaryRefDate);
    if (summaryRange === 'daily') d.setDate(d.getDate() + direction);
    else if (summaryRange === 'weekly') d.setDate(d.getDate() + 7 * direction);
    else if (summaryRange === 'monthly') d.setMonth(d.getMonth() + direction);
    handleRangeChange(summaryRange, d.toISOString().split('T')[0]);
  };

  return (
    <motion.div
      key="summary"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-4 lg:space-y-6 pb-20"
    >
      {/* Title + period controls */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
            {settings.name || 'Stockpot'} <span className="mx-1">/</span> Analytics
          </div>
          <h2 className="text-[28px] md:text-4xl font-bold tracking-[-0.03em] text-ink leading-tight md:whitespace-nowrap">Performance Summary</h2>
          <p className="text-sm text-muted mt-1">Financials and inventory usage for the selected period.</p>
        </div>

        <div className="surface-card p-1.5 flex flex-wrap items-center gap-2 ml-auto">
          <div className="flex items-center bg-stone-100/70 p-1 rounded-lg">
            {(['daily', 'weekly', 'monthly', 'custom'] as const).map((range) => (
              <button
                key={range}
                onClick={() => handleRangeChange(range)}
                className={`px-3 py-1.5 rounded-md text-xs capitalize transition-colors ${
                  summaryRange === range
                    ? 'bg-white text-primary font-bold shadow-sm'
                    : 'text-muted font-medium hover:text-ink'
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          {summaryRange !== 'custom' ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => shiftPeriod(-1)}
                title="Previous period"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:bg-accent hover:text-primary transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-stone-50 rounded-lg font-mono text-[11px] font-semibold text-ink tracking-tight whitespace-nowrap">
                <Calendar size={14} className="text-primary shrink-0" />
                <span>{summaryDateStart} → {summaryDateEnd}</span>
              </div>
              <button
                onClick={() => shiftPeriod(1)}
                title="Next period"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:bg-accent hover:text-primary transition-colors"
              >
                <ChevronRight size={18} />
              </button>
              <input
                type="date"
                value={summaryRefDate}
                onChange={(e) => handleRangeChange(summaryRange, e.target.value)}
                title="Jump to a date"
                className="bg-stone-50 rounded-lg border-none px-2.5 py-1.5 font-mono text-[11px] font-semibold text-ink cursor-pointer focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={() => handleRangeChange(summaryRange, today)}
                className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold tracking-wider hover:bg-primary-dark transition-colors"
              >
                TODAY
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                From
                <input
                  type="date"
                  value={summaryDateStart}
                  onChange={(e) => setSummaryDateStart(e.target.value)}
                  className="bg-stone-50 rounded-lg border-none px-2.5 py-1.5 font-mono text-[11px] font-semibold text-ink focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                To
                <input
                  type="date"
                  value={summaryDateEnd}
                  onChange={(e) => setSummaryDateEnd(e.target.value)}
                  className="bg-stone-50 rounded-lg border-none px-2.5 py-1.5 font-mono text-[11px] font-semibold text-ink focus:ring-2 focus:ring-primary/30"
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* First-run onboarding */}
      {(materials.length === 0 || menu.length === 0 || orders.length === 0) && (
        <div className="surface-card p-6 md:p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent rounded-bl-full -mr-16 -mt-16" />
          <div className="relative">
            <h3 className="text-xl font-bold text-ink mb-1">Welcome to Stockpot! 👋</h3>
            <p className="text-sm text-muted mb-6">Let's get your business set up in 3 simple steps:</p>
            <div className="space-y-5">
              {[
                { done: materials.length > 0, n: '1', title: 'Add Materials', hint: 'Add ingredients to your stock (Stock tab)', tab: 'inventory' as const, show: materials.length === 0 },
                { done: menu.length > 0, n: '2', title: 'Build Recipes', hint: 'Create products with costs attached (Recipes tab)', tab: 'menu' as const, show: menu.length === 0 && materials.length > 0 },
                { done: orders.length > 0, n: '3', title: 'Log an Order', hint: 'Record a sale to track your profit (Orders tab)', tab: 'orders' as const, show: orders.length === 0 && menu.length > 0 },
              ].map(step => (
                <div key={step.n} className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg transition-colors ${step.done ? 'bg-margin/15 text-margin' : 'bg-stone-100 text-muted'}`}>
                    {step.done ? '✓' : step.n}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-ink">{step.title}</div>
                    <div className="text-xs text-muted">{step.hint}</div>
                  </div>
                  {step.show && (
                    <button onClick={() => setActiveTab(step.tab)} className="text-xs uppercase font-bold text-primary bg-primary/10 hover:bg-primary/15 px-4 py-2 rounded-lg transition-colors">Go</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Yesterday in a few lines: figures from the app, an explanation from AI where it is offered */}
      <DailyBriefing
        orders={orders} menu={menu} materials={remainingInventory ?? []} experiments={experiments ?? []}
        wastageLogs={wastageLogs} productionRuns={productionRuns} settings={settings} currency={currency} dataReady={!!dataReady}
      />

      {/* Headline figures */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6">
        <MetricCard
          label="Cost of Goods Sold"
          value={fmt(financials.orderExpenses)}
          icon={Package}
          tone="slate"
          footLeft="Materials cost"
          footRight={ofIncome(financials.orderExpenses)}
        />
        <MetricCard
          label="Production Cost"
          value={fmt(totalProductionCost)}
          icon={Factory}
          tone="teal"
          footLeft={`${filteredProductionRuns.length} run${filteredProductionRuns.length !== 1 ? 's' : ''} in period`}
          footRight={filteredProductionRuns.length > 0 ? `${fmt(avgRunCost)} / run` : null}
        />
        <MetricCard
          label="Delivery Expenses"
          value={fmt(financials.deliveryExpenses)}
          icon={Truck}
          tone="slate"
          footLeft="3rd-party couriers"
          footRight={courierDeliveries > 0 ? `${courierDeliveries} deliver${courierDeliveries === 1 ? 'y' : 'ies'}` : null}
        />
        <MetricCard
          label="Wastage"
          value={fmt(financials.wastageExpenses)}
          icon={Trash2}
          tone="coral"
          footLeft={`${filteredWastageLogs.length} log${filteredWastageLogs.length !== 1 ? 's' : ''} in period`}
          footRight={ofIncome(financials.wastageExpenses)}
        />
      </div>

      {settings.gstApplicable && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
          <MetricCard label="GST Collected" value={fmt(financials.gstCollected)} icon={Percent} tone="teal" footLeft="Output tax on sales in period" />
          <MetricCard label="GST Paid" value={fmt(financials.gstPaid)} icon={Percent} tone="slate" footLeft="Input tax on materials used" />
        </div>
      )}

      {/* What the business really made: after payment fees and fixed costs, and what each order made on average */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6">
        <MetricCard
          label="True Profit"
          value={fmt(financials.trueProfit ?? financials.profit)}
          icon={Wallet}
          tone="teal"
          footLeft="After all costs"
          footRight={income > 0 ? `${(((financials.trueProfit ?? financials.profit) / income) * 100).toFixed(1)}% of income` : null}
        />
        <MetricCard
          label="Avg Order Contribution"
          value={fmt(financials.avgOrderContribution ?? 0)}
          icon={Calculator}
          tone="slate"
          footLeft={`${financials.orderCount ?? 0} order${financials.orderCount === 1 ? '' : 's'}`}
          footRight="Made per order"
        />
        {(financials.fixedCosts ?? 0) > 0 && (
          <MetricCard label="Fixed Costs" value={fmt(financials.fixedCosts)} icon={Receipt} tone="slate" footLeft="Overheads" footRight="Prorated" />
        )}
        {(financials.paymentFees ?? 0) > 0 && (
          <MetricCard label="Payment Fees" value={fmt(financials.paymentFees)} icon={CreditCard} tone="coral" footLeft="Fees paid" footRight={ofIncome(financials.paymentFees)} />
        )}
        {(financials.discounts ?? 0) > 0 && (
          <MetricCard label="Discounts" value={fmt(financials.discounts)} icon={Tag} tone="coral" footLeft="Given away" footRight={ofIncome(financials.discounts)} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">
        {/* LEFT: trends + production */}
        <div className="lg:col-span-8 space-y-4 lg:space-y-6 min-w-0">
          <div className="surface-card p-5 md:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <TrendingUp size={20} />
              </div>
              <div>
                <h3 className="text-xl font-semibold tracking-tight text-ink">Financial Trends</h3>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Revenue vs expenses vs profitability</p>
              </div>
            </div>

            <div className="h-[300px] md:h-[340px] w-full">
              {!hasChartData ? (
                <div className="h-full w-full flex flex-col items-center justify-center text-muted bg-stone-50 rounded-xl">
                  <Calculator size={44} className="mb-3 text-stone-300" />
                  <p className="text-sm">No financial data for this period.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={3} barCategoryGap="24%">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dfe7e7" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: '#5A5A5A', fontWeight: 600 }}
                      dy={8}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      width={56}
                      tick={{ fontSize: 10, fill: '#5A5A5A', fontFamily: 'JetBrains Mono, monospace' }}
                      tickFormatter={(value) => `${currency.symbol}${value}`}
                    />
                    <ReferenceLine y={0} stroke="#bdc9c8" />
                    <Tooltip
                      formatter={(value) => fmt(Number(value))}
                      contentStyle={{
                        backgroundColor: '#fff',
                        borderRadius: '12px',
                        border: 'none',
                        boxShadow: '0 20px 40px -8px rgba(43, 49, 61, 0.16)',
                        fontSize: '12px',
                        fontWeight: 600,
                        padding: '12px 14px',
                      }}
                      itemStyle={{ padding: '2px 0' }}
                      cursor={{ fill: 'rgba(0, 121, 123, 0.05)' }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={36}
                      iconType="circle"
                      wrapperStyle={{ fontSize: '11px', fontWeight: 600, color: '#5A5A5A' }}
                    />
                    <Bar dataKey="expenses" name="Expenses" fill="#E4536B" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="income" name="Income" fill="#00797B" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="Net Profit" fill="#006143" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-margin" />
              <span>Live ledger synced{lastSynced ? ` · Updated ${lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
            </div>
          </div>

          <div className="surface-card p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h3 className="text-xl font-semibold tracking-tight text-ink">Recent Production Runs</h3>
                <p className="text-sm text-muted">Batch yield, cost and freshness in the selected period.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('production')}
                  className="px-3 py-2 rounded-lg bg-stone-50 text-muted hover:text-ink text-xs font-semibold whitespace-nowrap transition-colors"
                >
                  View all
                </button>
                {menu.length > 0 && (
                  <button
                    onClick={() => setIsProductionRunModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold whitespace-nowrap hover:bg-primary-dark transition-colors"
                  >
                    <Plus size={16} /> Log Production Run
                  </button>
                )}
              </div>
            </div>

            {recentRuns.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted bg-stone-50 rounded-xl">
                No production runs in this period.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-stone-50 text-[11px] uppercase tracking-wider text-muted">
                      <th className="px-3 py-2.5 font-semibold rounded-l-lg">Recipe</th>
                      <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">Status</th>
                      <th className="px-3 py-2.5 font-semibold text-right hidden xl:table-cell">Produced</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Yield</th>
                      <th className="px-3 py-2.5 font-semibold text-right rounded-r-lg">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.map(run => {
                      const status = getRunStatus(run, today);
                      const sellable = run.quantityYield ?? run.quantityProduced;
                      const yieldPct = run.quantityProduced > 0 ? (sellable / run.quantityProduced) * 100 : 100;
                      return (
                        <tr key={run.id} className="border-t border-stone-100 hover:bg-accent/60 transition-colors">
                          <td className="px-3 py-3">
                            <div className="text-sm font-semibold text-ink">{menu.find(m => m.id === run.recipeId)?.name || 'Unknown'}</div>
                            <div className="font-mono text-[11px] text-muted">{run.date}</div>
                            <span className={`sm:hidden inline-block mt-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${status.cls}`}>{status.label}</span>
                          </td>
                          <td className="px-3 py-3 hidden sm:table-cell">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${status.cls}`}>{status.label}</span>
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-sm text-ink hidden xl:table-cell">{run.quantityProduced}</td>
                          <td className={`px-3 py-3 text-right font-mono text-sm font-semibold ${yieldPct < 90 ? 'text-coral' : 'text-margin'}`}>{yieldPct.toFixed(0)}%</td>
                          <td className="px-3 py-3 text-right font-mono text-sm text-ink">{fmt(run.costTotal || 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: profit, low stock, freshness */}
        <div className="lg:col-span-4 space-y-4 lg:space-y-6 min-w-0">
          <div className="surface-card p-5 md:p-6 relative overflow-hidden">
            <div className="absolute -right-16 -bottom-16 w-56 h-56 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Net Profit</div>
                {margin !== null && (
                  <span className={`px-2.5 py-1 rounded-full font-mono text-[11px] font-bold ${margin >= 0 ? 'bg-margin/12 text-margin' : 'bg-coral/10 text-coral'}`}>
                    {margin.toFixed(1)}% margin
                  </span>
                )}
              </div>
              <div className={`mt-3 font-mono text-[32px] leading-none font-semibold tracking-tight ${financials.profit < 0 ? 'text-coral' : 'text-ink'}`}>
                {fmt(financials.profit)}
              </div>
              <p className="text-sm text-muted mt-2">Income after materials, delivery and wastage.</p>

              <div className="mt-4 rounded-xl bg-stone-50 p-4 space-y-2.5 text-sm">
                {[
                  { dot: 'bg-primary', label: settings.gstApplicable ? 'Income (excl. GST)' : 'Gross income', value: fmt(income), cls: 'text-ink' },
                  { dot: 'bg-coral', label: 'Materials (COGS)', value: `-${fmt(financials.orderExpenses)}`, cls: 'text-ink' },
                  { dot: 'bg-muted', label: 'Third-party couriers', value: `-${fmt(financials.deliveryExpenses)}`, cls: 'text-ink' },
                  { dot: 'bg-coral', label: 'Logged wastage', value: `-${fmt(financials.wastageExpenses)}`, cls: 'text-coral' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between gap-3">
                    <span className={`flex items-center gap-2 ${row.cls === 'text-coral' ? 'text-coral' : 'text-muted'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${row.dot}`} />
                      {row.label}
                    </span>
                    <span className={`font-mono text-[13px] ${row.cls}`}>{row.value}</span>
                  </div>
                ))}
                <div className="pt-2.5 mt-1 border-t border-stone-200 flex items-center justify-between">
                  <span className="font-semibold text-ink">Retained bottomline</span>
                  <span className={`font-mono font-semibold ${margin !== null && margin < 0 ? 'text-coral' : 'text-margin'}`}>
                    {margin !== null ? `${margin.toFixed(1)}%` : '—'}
                  </span>
                </div>
              </div>

              <div className="mt-3 font-mono text-[11px] uppercase tracking-wider text-muted space-y-1">
                <div>{filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''} · {itemsSold} item{itemsSold !== 1 ? 's' : ''} sold</div>
                {income === 0 && <div>No sales yet</div>}
                {financials.experimentExpenses > 0 && <div>Operating Exp: {fmt(financials.experimentExpenses)} R&amp;D</div>}
                {(financials.unpaidIncome ?? 0) > 0 && (
                  <div className="normal-case tracking-normal">Includes {fmt(financials.unpaidIncome)} not yet paid</div>
                )}
                {financials.estimated && (
                  <div
                    className="normal-case tracking-normal"
                    title="Some orders were made before prices and costs were recorded on each order, so they are shown at today's menu prices and material costs. Orders made from now on are exact."
                  >
                    Includes orders valued at today&apos;s prices (est.)
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="surface-card p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${lowStockItems.length > 0 ? 'bg-coral/10 text-coral' : 'bg-margin/10 text-margin'}`}>
                  {lowStockItems.length > 0 ? <TriangleAlert size={20} /> : <CheckCircle2 size={20} />}
                </div>
                <h3 className="text-base font-semibold text-ink truncate">
                  Low Stock <span className="font-mono">({lowStockItems.length})</span>
                </h3>
              </div>
              {lowStockItems.length > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-coral text-white text-[10px] font-bold tracking-wider">RESTOCK</span>
              )}
            </div>

            {lowStockItems.length === 0 ? (
              <p className="text-sm text-muted mt-3">Every material is above its low-stock threshold.</p>
            ) : (
              <>
                <p className="text-xs text-muted mt-3">Materials at or below their threshold.</p>
                <div className="mt-3 space-y-2">
                  {lowStockItems.slice(0, 4).map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-stone-50">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-ink truncate">{item.name}</div>
                        <div className="font-mono text-[11px] mt-0.5">
                          <span className="font-semibold text-coral">{parseFloat(Number(item.remaining).toFixed(2))} {item.unit} left</span>
                          <span className="text-muted"> · Threshold {item.threshold} {item.unit}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setRestockMaterial(materials.find(m => m.id === item.id) ?? item)}
                        className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-colors shrink-0"
                      >
                        Restock
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted">{lowStockItems.length > 4 ? `+${lowStockItems.length - 4} more flagged` : ''}</span>
                  <button onClick={() => setActiveTab('inventory')} className="flex items-center gap-1 font-semibold text-primary hover:text-primary-dark transition-colors">
                    Open Inventory <ArrowRight size={14} />
                  </button>
                </div>
              </>
            )}
          </div>

          {freshnessAlerts.length > 0 && (
            <div className="surface-card p-5 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${expiredCount > 0 ? 'bg-coral/10 text-coral' : 'bg-amber-100 text-amber-700'}`}>
                    <Clock size={20} />
                  </div>
                  <h3 className="text-base font-semibold text-ink truncate">
                    Freshness <span className="font-mono">({freshnessAlerts.length})</span>
                  </h3>
                </div>
                {expiredCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-coral text-white text-[10px] font-bold tracking-wider">EXPIRED</span>
                )}
              </div>
              <p className="text-xs text-muted mt-3">Unsold batches to check or discard.</p>
              <div className="mt-3 space-y-2">
                {freshnessAlerts.slice(0, 3).map(({ run, urgency }) => (
                  <div key={run.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-stone-50">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink truncate">{menu.find(m => m.id === run.recipeId)?.name || 'Unknown'}</div>
                      <div className="font-mono text-[11px] text-muted mt-0.5">{run.remainingQuantity} left · made {run.date}</div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0 ${urgency === 'expired' ? 'bg-coral/10 text-coral' : 'bg-amber-100 text-amber-700'}`}>
                      {urgency === 'expired' ? 'Expired' : 'Check'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-muted">{freshnessAlerts.length > 3 ? `+${freshnessAlerts.length - 3} more` : ''}</span>
                <button onClick={() => setActiveTab('production')} className="flex items-center gap-1 font-semibold text-primary hover:text-primary-dark transition-colors">
                  Open Production Log <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
