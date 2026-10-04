import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import {
  AlertCircle, ChevronLeft, ChevronRight, CircleCheck, Download, Package, PackageMinus, Plus,
  History, RefreshCw, Salad, Search, ShoppingCart, SlidersHorizontal, Trash2, TriangleAlert, Upload, Wallet
} from 'lucide-react';
import { AppViewProps } from '../types';
import { UNIT_CONVERSIONS } from '../utils/conversions';
import { PriceHistoryModal } from '../components/PriceHistoryModal';
import { ReorderSuggestions } from '../components/ReorderSuggestions';
import { reorderSuggestions } from '../utils/reorder';
import { todayInZone } from '../utils/localDate';
import { getExpiryInfo, getParDeficitPercent, getStockStatus, StockStatus } from '../utils/inventoryStatus';

const PAGE_SIZE = 15;

type StatusFilter = 'all' | 'ok' | 'reorder' | 'low' | 'expiry';

const STATUS_PILL: Record<StockStatus, { label: string; cls: string }> = {
  low: { label: 'Low Stock', cls: 'bg-coral/10 text-coral' },
  reorder: { label: 'Reorder Soon', cls: 'bg-stone-100 text-muted' },
  ok: { label: 'In Stock', cls: 'bg-margin/10 text-[#006143]' },
};

const TH = 'px-3 py-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap';

// Numbers read as plain mono text until hovered/focused, then behave as inputs.
const CELL_INPUT =
  'bg-transparent border border-transparent hover:border-stone-200 focus:border-primary focus:bg-white rounded-md px-2 py-1 font-mono text-sm text-ink text-right outline-none focus:ring-2 focus:ring-primary/20 transition-colors';

export const InventoryView: React.FC<AppViewProps> = (props) => {
  const {
    patchMaterial, setRestockExpiryDate, isRefreshing, lastSynced, handleDownloadTemplate,
    handleImportCSV, setAddMaterialCategory, setShowAddMaterialModal, categories, settings,
    currency, inventorySortBy, setInventorySortBy, inventorySortOrder, setInventorySortOrder,
    sortedRemainingInventory, remainingInventory, lowStockItems, refreshData, updateMaterial,
    deleteMaterial, setRestockMaterial, setDiscardTarget, openNutritionEditor, priceLog,
    menu, productionRuns, wastageLogs
  } = props;

  // The material whose price history is open (kept by id, so it follows the material if it is renamed).
  const [historyForId, setHistoryForId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [unitFilter, setUnitFilter] = useState('all');
  // The page is remembered together with the filters it was chosen under, so
  // changing any filter falls back to page 1 without an effect.
  const [pageState, setPageState] = useState({ key: '', page: 1 });

  // Materials can carry a category that is no longer in the master list; keep
  // them reachable in the filter and the row's category picker.
  const allCategories = useMemo(() => {
    const extra = remainingInventory.map(m => m.category).filter(c => c && !categories.includes(c));
    return [...categories, ...Array.from(new Set(extra))];
  }, [categories, remainingInventory]);

  const units = useMemo(
    () => Array.from(new Set(remainingInventory.map(m => m.unit || 'g'))).sort(),
    [remainingInventory]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedRemainingInventory.filter(m => {
      if (q && !m.name.toLowerCase().includes(q)) return false;
      if (categoryFilter !== 'all' && m.category !== categoryFilter) return false;
      if (unitFilter !== 'all' && (m.unit || 'g') !== unitFilter) return false;
      if (statusFilter === 'expiry') {
        const { state } = getExpiryInfo(m.expiryDate);
        return state === 'expiring' || state === 'expired';
      }
      if (statusFilter !== 'all') return getStockStatus(m.remaining, m.threshold) === statusFilter;
      return true;
    });
  }, [sortedRemainingInventory, search, categoryFilter, unitFilter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const filterKey = [search, categoryFilter, statusFilter, unitFilter].join('\u0000');
  const setPage = (n: number) => setPageState({ key: filterKey, page: n });
  const currentPage = Math.min(pageState.key === filterKey ? pageState.page : 1, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(pageStart, pageStart + PAGE_SIZE);

  // Adding/importing lands in the category being browsed, else the first one.
  const targetCategory = categoryFilter !== 'all' ? categoryFilter : (categories[0] || 'Raw Materials');

  const inventoryValue = remainingInventory.reduce(
    (sum, m) => sum + Math.max(m.remaining, 0) * (m.costPerUnit || 0), 0
  );
  const money = (n: number) =>
    `${currency.symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Trim float noise (0.055000000000000001) from converted quantities.
  const fmt = (n: number | undefined) => +(n ?? 0).toFixed(3);

  const totalSkus = remainingInventory.length;
  const lowShare = totalSkus > 0 ? (lowStockItems.length / totalSkus) * 100 : 0;
  const healthyShare = totalSkus > 0 ? 100 - lowShare : 100;

  // The single most urgent material: furthest below its threshold.
  const worst = useMemo(() => {
    let pick: (typeof lowStockItems)[number] | null = null;
    let pickDeficit = -1;
    for (const item of lowStockItems) {
      const d = getParDeficitPercent(item.remaining, item.threshold);
      if (d > pickDeficit) { pick = item; pickDeficit = d; }
    }
    return pick ? { item: pick, deficit: pickDeficit } : null;
  }, [lowStockItems]);

  // Which materials will run out soon, from recent production and discards (a calculation, no AI).
  const reorder = useMemo(() => reorderSuggestions({
    materials: remainingInventory, menu: menu ?? [], productionRuns: productionRuns ?? [], wastageLogs: wastageLogs ?? [], today: todayInZone(settings.timezone),
  }), [remainingInventory, menu, productionRuns, wastageLogs, settings.timezone]);

  const openRestock = (mat: (typeof remainingInventory)[number]) => {
    setRestockMaterial(mat);
    setRestockExpiryDate(mat.expiryDate || '');
  };

  const changeUnit = (mat: (typeof remainingInventory)[number], toUnit: string) => {
    const fromUnit = mat.unit || 'g';
    if (fromUnit === toUnit) return;
    const factor = UNIT_CONVERSIONS[fromUnit]?.[toUnit];
    if (factor !== undefined) {
      // Stock and threshold scale with the factor; cost per unit inverts.
      const newStock = parseFloat((mat.initialStock * factor).toFixed(6));
      const newCost = parseFloat((mat.costPerUnit / factor).toFixed(6));
      const newThreshold = mat.threshold !== undefined ? parseFloat((mat.threshold * factor).toFixed(6)) : undefined;
      // Single atomic write — no race condition
      patchMaterial(mat.id, {
        unit: toUnit,
        initialStock: newStock,
        costPerUnit: newCost,
        ...(newThreshold !== undefined && { threshold: newThreshold })
      });
    } else {
      // Incompatible unit family (e.g. kg to pcs): only relabel
      patchMaterial(mat.id, { unit: toUnit });
    }
  };

  const selectCls =
    'h-10 rounded-lg bg-stone-50 border border-transparent px-3 font-sans text-sm font-medium text-ink focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none cursor-pointer';

  return (
    <motion.div
      key="inventory"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      {/* Heading */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
            <span className="truncate">{settings.name || 'My Bakery'}</span>
            <span className="text-stone-300">/</span>
            <span className="text-primary font-semibold whitespace-nowrap">Inventory &amp; Raw Materials</span>
          </div>
          <h2 className="text-2xl md:text-[32px] md:leading-tight font-bold tracking-tight text-ink">Raw Materials &amp; Inventory</h2>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Track stock levels, reorder thresholds and costs across everything you cook and bake with.
          </p>
        </div>
        <button
          onClick={refreshData}
          disabled={isRefreshing}
          className="surface-card flex items-center gap-2 px-3.5 py-2 text-sm text-muted hover:text-primary transition-colors disabled:opacity-60 shrink-0 self-start lg:self-auto"
          title="Reload data from the server"
        >
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          <span className="font-mono text-[11px] uppercase tracking-wider">Sync</span>
          <span className="font-mono text-[11px] text-muted/70 hidden sm:inline">{lastSynced.toLocaleTimeString()}</span>
        </button>
      </div>

      {/* Alert + headline stats */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {worst ? (
          <div className="lg:col-span-5 surface-card p-5 relative overflow-hidden flex flex-col justify-between gap-4">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-coral" />
            <div className="flex items-start justify-between gap-3 pl-1">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-coral/10 text-coral flex items-center justify-center shrink-0">
                  <TriangleAlert size={22} />
                </div>
                <div className="min-w-0">
                  <span className="inline-flex px-2 py-0.5 rounded-full bg-coral/10 text-coral font-mono text-[10px] font-semibold tracking-wide">
                    CRITICAL STOCK ALERT
                  </span>
                  <h3 className="text-lg font-bold text-ink mt-1.5 break-words">{worst.item.name}</h3>
                  <p className="text-sm text-muted mt-0.5">
                    Current: <span className="font-mono font-bold text-coral">{fmt(worst.item.remaining)} {worst.item.unit}</span>
                    {' · '}Threshold: <span className="font-mono font-medium text-ink">{fmt(worst.item.threshold)} {worst.item.unit}</span>
                  </p>
                </div>
              </div>
              <span className="font-mono text-xs font-semibold text-coral bg-coral/10 px-2 py-1 rounded shrink-0">
                -{worst.deficit}% Par
              </span>
            </div>
            <div className="bg-stone-50 rounded-lg p-2.5 flex items-center justify-between gap-3">
              <span className="text-sm text-muted">
                {lowStockItems.length > 1 ? `${lowStockItems.length - 1} more below threshold` : 'Only item below threshold'}
              </span>
              <button
                onClick={() => openRestock(worst.item)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-coral text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity"
              >
                <ShoppingCart size={15} />
                Restock
              </button>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-5 surface-card p-5 relative overflow-hidden flex items-center gap-3">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-margin" />
            <div className="w-10 h-10 rounded-lg bg-margin/10 text-margin flex items-center justify-center shrink-0 ml-1">
              <CircleCheck size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink">All stocked up</h3>
              <p className="text-sm text-muted">Every material is above its low-stock threshold.</p>
            </div>
          </div>
        )}

        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="surface-card p-4 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted">Tracked SKUs</span>
              <div className="w-8 h-8 rounded-lg bg-stone-100 text-muted flex items-center justify-center"><Package size={16} /></div>
            </div>
            <div>
              <div className="font-mono text-3xl font-semibold text-ink leading-tight">{totalSkus}</div>
              <div className="flex items-center justify-between gap-2 mt-1 text-sm text-muted">
                <span>Across {allCategories.length} {allCategories.length === 1 ? 'category' : 'categories'}</span>
                <span className="font-mono text-[11px] text-primary font-medium whitespace-nowrap">{Math.round(healthyShare)}% healthy</span>
              </div>
            </div>
            <div className="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-primary h-full rounded-full" style={{ width: `${healthyShare}%` }} />
            </div>
          </div>

          <div className="surface-card p-4 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted">Under Threshold</span>
              <div className="w-8 h-8 rounded-lg bg-coral/10 text-coral flex items-center justify-center"><AlertCircle size={16} /></div>
            </div>
            <div>
              <div className={`font-mono text-3xl font-semibold leading-tight ${lowStockItems.length > 0 ? 'text-coral' : 'text-ink'}`}>
                {lowStockItems.length} <span className="text-base font-normal text-muted">{lowStockItems.length === 1 ? 'SKU' : 'SKUs'}</span>
              </div>
              <div className="mt-1 text-sm text-muted truncate">
                {lowStockItems.length === 0
                  ? 'Nothing needs restocking'
                  : lowStockItems.slice(0, 2).map(i => i.name).join(', ') + (lowStockItems.length > 2 ? ` +${lowStockItems.length - 2}` : '')}
              </div>
            </div>
            <div className="font-mono text-[11px] text-muted">{lowShare.toFixed(1)}% of stock</div>
          </div>

          <div className="surface-card p-4 flex flex-col justify-between gap-3 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted">Raw Inventory Value</span>
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Wallet size={16} /></div>
            </div>
            <div className="font-mono text-2xl font-semibold text-ink leading-tight truncate" title={money(inventoryValue)}>
              {money(inventoryValue)}
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Stock on hand × cost
            </div>
          </div>
        </div>
      </div>

      <ReorderSuggestions
        result={reorder}
        names={Object.fromEntries(remainingInventory.map(m => [m.id, m.name]))}
        onRestock={(id) => { const mat = remainingInventory.find(m => m.id === id); if (mat) openRestock(mat); }}
      />

      {/* Search / filter / actions */}
      <div className="surface-card p-4 flex flex-col gap-3">
        <div className="flex flex-col xl:flex-row xl:items-center gap-3">
          <div className="relative flex-1 min-w-0 xl:max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search materials by name"
              aria-label="Search materials"
              className="w-full h-10 pl-10 pr-3 rounded-lg bg-stone-50 border border-transparent text-sm text-ink placeholder:text-muted focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <select aria-label="Filter by category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={selectCls}>
              <option value="all">All Categories</option>
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className={selectCls}>
              <option value="all">All Statuses</option>
              <option value="ok">In Stock</option>
              <option value="reorder">Reorder Soon</option>
              <option value="low">Low Stock</option>
              <option value="expiry">Expiring / Expired</option>
            </select>
            <select aria-label="Filter by unit" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className={selectCls}>
              <option value="all">All Units</option>
              {units.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <SlidersHorizontal size={16} className="text-muted ml-1" />
              <select aria-label="Sort by" value={inventorySortBy} onChange={(e) => setInventorySortBy(e.target.value as any)} className={selectCls}>
                <option value="name">Name</option>
                <option value="stock">Current Stock</option>
                <option value="cost">Cost per Unit</option>
                <option value="date">Date Added</option>
              </select>
              <button
                onClick={() => setInventorySortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="h-10 px-3 rounded-lg bg-stone-50 text-ink font-mono text-[11px] font-semibold uppercase tracking-wider hover:bg-stone-100 transition-colors"
                title="Toggle sort direction"
              >
                {inventorySortOrder === 'asc' ? 'A → Z' : 'Z → A'}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 xl:ml-auto">
            <button
              onClick={() => handleDownloadTemplate()}
              className="hidden md:flex h-10 items-center gap-2 px-3 rounded-lg bg-stone-50 hover:bg-stone-100 text-muted text-sm font-medium transition-colors"
              title="Download CSV Template"
            >
              <Download size={16} />
              Template
            </button>
            <label
              className="h-10 flex items-center gap-2 px-3 rounded-lg bg-stone-50 hover:bg-stone-100 text-ink text-sm font-medium transition-colors cursor-pointer"
              title={`Import materials from CSV into ${targetCategory}`}
            >
              <Upload size={16} />
              <span className="hidden sm:inline">Import CSV</span>
              <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImportCSV(e, targetCategory)} />
            </label>
            <button
              onClick={() => { setAddMaterialCategory(targetCategory); setShowAddMaterialModal(true); }}
              className="h-10 flex items-center gap-2 px-4 rounded-lg bg-primary hover:bg-primary-dark text-white text-sm font-semibold shadow-sm transition-colors"
              title={`Add an item to ${targetCategory}`}
            >
              <Plus size={18} />
              Add Item
            </button>
          </div>
        </div>
      </div>

      {/* Materials table */}
      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left border-collapse">
            <thead>
              <tr className="bg-primary/5 border-b border-stone-100">
                <th className={`${TH} min-w-[11rem]`}>Material</th>
                <th className={TH}>Category</th>
                <th className={TH}>Unit</th>
                <th className={`${TH} text-right`}>Current Stock</th>
                <th className={`${TH} text-right`} title="Alert when current stock drops to or below this amount">Threshold</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Cost / Unit</th>
                {settings.gstApplicable && (
                  <th className={`${TH} text-right`} title="GST rate paid when this material is purchased">GST %</th>
                )}
                <th className={`${TH} text-right`}>Total Value</th>
                <th className={TH} title="Expiry date of the current stock batch">Expiry</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {pageRows.map((mat) => {
                const status = getStockStatus(mat.remaining, mat.threshold);
                const isLow = status === 'low';
                const expiry = getExpiryInfo(mat.expiryDate);
                const pill = STATUS_PILL[status];
                return (
                  <tr key={mat.id} className={`hover:bg-primary/[0.03] transition-colors ${isLow ? 'bg-coral/[0.03]' : ''}`}>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {isLow && <AlertCircle size={14} className="text-coral shrink-0" />}
                        <input
                          type="text"
                          aria-label={`Name of ${mat.name}`}
                          value={mat.name || ''}
                          onChange={(e) => updateMaterial(mat.id, 'name', e.target.value)}
                          className={`w-full bg-transparent border border-transparent hover:border-stone-200 focus:border-primary focus:bg-white rounded-md px-2 py-1 -mx-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/20 ${isLow ? 'text-coral' : 'text-ink'}`}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        aria-label={`Category of ${mat.name}`}
                        value={mat.category}
                        onChange={(e) => updateMaterial(mat.id, 'category', e.target.value)}
                        className="max-w-[8rem] bg-stone-100 rounded-md px-2 py-1 text-xs text-muted border-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                      >
                        {allCategories.includes(mat.category) ? null : <option value={mat.category}>{mat.category}</option>}
                        {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        aria-label={`Unit of ${mat.name}`}
                        value={mat.unit || 'g'}
                        onChange={(e) => changeUnit(mat, e.target.value)}
                        className="bg-stone-100 border-none rounded-md px-2 py-1 font-mono text-[11px] font-semibold text-muted uppercase focus:ring-2 focus:ring-primary/20 cursor-pointer"
                      >
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                        <option value="ml">ml</option>
                        <option value="l">l</option>
                        <option value="pcs">pcs</option>
                      </select>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <input
                        type="number"
                        aria-label={`Current stock of ${mat.name}`}
                        value={mat.initialStock ?? 0}
                        onChange={(e) => updateMaterial(mat.id, 'initialStock', parseFloat(e.target.value) || 0)}
                        className={`${CELL_INPUT} w-24 ${isLow ? '!text-coral font-semibold' : ''}`}
                      />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <input
                        type="number"
                        aria-label={`Threshold of ${mat.name}`}
                        value={mat.threshold ?? 0}
                        onChange={(e) => updateMaterial(mat.id, 'threshold', parseFloat(e.target.value) || 0)}
                        className={`${CELL_INPUT} w-20`}
                        placeholder="5"
                        title={`Alert when stock drops to or below this amount of ${mat.unit}`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full font-mono text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${pill.cls}`}>
                        {pill.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <span className="text-muted text-xs font-semibold">{currency.symbol}</span>
                        <input
                          type="number"
                          step="0.01"
                          aria-label={`Cost per unit of ${mat.name}`}
                          value={mat.costPerUnit != null ? +(mat.costPerUnit.toPrecision(4)) : 0}
                          onChange={(e) => updateMaterial(mat.id, 'costPerUnit', parseFloat(e.target.value) || 0)}
                          className={`${CELL_INPUT} w-20`}
                        />
                      </div>
                    </td>
                    {settings.gstApplicable && (
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            aria-label={`GST rate of ${mat.name}`}
                            value={mat.gstRate ?? 0}
                            onChange={(e) => updateMaterial(mat.id, 'gstRate', parseFloat(e.target.value) || 0)}
                            className={`${CELL_INPUT} w-16`}
                            title="GST rate paid on purchases of this material"
                          />
                          <span className="text-muted text-xs font-semibold">%</span>
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-3 text-right font-mono text-sm font-semibold text-ink whitespace-nowrap">
                      {money(Math.max(mat.remaining, 0) * (mat.costPerUnit || 0))}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <input
                          type="date"
                          aria-label={`Expiry date of ${mat.name}`}
                          value={mat.expiryDate || ''}
                          onChange={(e) => updateMaterial(mat.id, 'expiryDate', e.target.value)}
                          className={`w-32 border rounded-md px-1.5 py-1 font-mono text-xs outline-none focus:ring-2 transition-colors ${
                            expiry.state === 'expired'
                              ? 'bg-coral/10 border-coral/40 text-coral focus:ring-coral/30'
                              : expiry.state === 'expiring'
                              ? 'bg-amber-50 border-amber-300 text-amber-700 focus:ring-amber-300'
                              : 'bg-transparent border-transparent hover:border-stone-200 text-ink focus:ring-primary/20 focus:border-primary'
                          }`}
                          title="Expiry date of current stock batch"
                        />
                        {expiry.state === 'expired' && <span className="font-mono text-[10px] font-semibold text-coral uppercase tracking-wider">Expired</span>}
                        {expiry.state === 'expiring' && <span className="font-mono text-[10px] font-semibold text-amber-600 uppercase tracking-wider">{expiry.daysLeft}d left</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openRestock(mat)}
                          className={isLow
                            ? 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-colors'
                            : 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-primary hover:bg-primary/10 text-xs font-semibold transition-colors'}
                          title="Restock this item"
                          aria-label={`Restock ${mat.name}`}
                        >
                          <ShoppingCart size={14} />
                          {isLow && 'Restock'}
                        </button>
                        <button
                          onClick={() => setHistoryForId(mat.id)}
                          className="p-2 rounded-lg text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Price history"
                          aria-label={`Price history of ${mat.name}`}
                        >
                          <History size={16} />
                        </button>
                        <button
                          onClick={() => openNutritionEditor(mat)}
                          className="p-2 rounded-lg text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Nutrition & allergens"
                          aria-label={`Nutrition and allergens for ${mat.name}`}
                        >
                          <Salad size={16} />
                        </button>
                        <button
                          onClick={() => setDiscardTarget({
                            id: mat.id,
                            name: mat.name,
                            type: 'material',
                            maxQty: mat.initialStock,
                            unit: mat.unit,
                            costPerUnit: mat.costPerUnit,
                          })}
                          disabled={mat.initialStock <= 0}
                          className="p-2 rounded-lg text-muted hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                          title="Log wasted/discarded stock"
                          aria-label={`Discard ${mat.name}`}
                        >
                          <PackageMinus size={16} />
                        </button>
                        <button
                          onClick={() => deleteMaterial(mat.id)}
                          className="p-2 rounded-lg text-stone-300 hover:text-coral hover:bg-coral/10 transition-colors"
                          title="Delete Material"
                          aria-label={`Delete ${mat.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={settings.gstApplicable ? 11 : 10} className="px-6 py-14 text-center text-muted">
                    {totalSkus === 0
                      ? 'No materials yet — add your first item to start tracking stock.'
                      : 'No materials match these filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {rows.length > 0 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-3 py-3 border-t border-stone-100 text-sm text-muted">
            <span>
              Showing <b className="text-ink">{pageStart + 1}</b> to <b className="text-ink">{Math.min(pageStart + PAGE_SIZE, rows.length)}</b> of{' '}
              <b className="text-ink">{rows.length}</b> materials
              {lowStockItems.length > 0 && <span className="hidden md:inline"> · {lowStockItems.length} below threshold</span>}
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

      {historyForId && (() => {
        const material = remainingInventory.find(m => m.id === historyForId);
        // In a portal, so the screen's entrance animation can't offset the fixed overlay.
        return material ? createPortal(
          <PriceHistoryModal material={material} entries={priceLog ?? []} currencySymbol={currency.symbol} onClose={() => setHistoryForId(null)} />,
          document.body
        ) : null;
      })()}
    </motion.div>
  );
};
