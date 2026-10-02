import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Award, BookOpen, Check, Copy, Edit2, Package, Percent, Plus, Salad, Search, Sparkles, Trash2,
  TriangleAlert, Utensils, X
} from 'lucide-react';
import { AppViewProps, IngredientRequirement, MenuItem as MenuItemType, RawMaterial } from '../types';
import { MetricCard } from '../components/MetricCard';
import { NutritionCard } from '../components/NutritionCard';
import { convertAmount } from '../utils/conversions';
import { calculateRecipeNutrition } from '../utils/nutritionCalculations';
import { getMarginInfo, MarginTier, recipeCost, SALES_PERIODS, SalesPeriod, salesPeriodRange, suggestedPrice, summarizeMenu } from '../utils/menuStats';
import { productProfits } from '../utils/profit';
import { ProductPerformance } from '../components/ProductPerformance';

type MarginFilter = 'all' | MarginTier;

const MARGIN_PILL: Record<MarginTier, string> = {
  high: 'bg-margin/10 text-[#006143]',
  mid: 'bg-amber-100 text-amber-700',
  low: 'bg-coral/10 text-coral',
};

const LABEL = 'font-mono text-[10px] font-semibold uppercase tracking-wider text-muted';
const selectCls =
  'h-10 rounded-lg bg-stone-50 border border-transparent px-3 text-sm font-medium text-ink focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none cursor-pointer';
const STAT_INPUT =
  'w-full bg-transparent border-none focus:ring-0 p-0 font-mono text-base font-semibold text-ink placeholder:text-stone-300';

/**
 * One ingredient or packaging line inside a recipe editor: which material,
 * how much (with unit) and what that line costs. Ingredients and packaging
 * share this row; they differ only in which materials can be picked and
 * which unit a new line defaults to.
 */
const RecipeLine: React.FC<{
  itemId: string;
  req: IngredientRequirement;
  idx: number;
  packaging: boolean;
  materials: RawMaterial[];
  categories: string[];
  currencySymbol: string;
  updateRecipeIngredient: AppViewProps['updateRecipeIngredient'];
  removeIngredientFromRecipe: AppViewProps['removeIngredientFromRecipe'];
}> = ({ itemId, req, idx, packaging, materials, categories, currencySymbol, updateRecipeIngredient, removeIngredientFromRecipe }) => {
  const mat = materials.find(m => m.id === req.materialId);
  const lineCost = convertAmount(req.amount, req.unit || 'g', mat?.unit || 'g') * (mat?.costPerUnit || 0);
  return (
    <div className="flex items-center gap-3 bg-white p-3 rounded-xl shadow-sm hover:shadow transition-shadow">
      <div className="flex-1 min-w-0">
        <select
          aria-label={packaging ? 'Packaging material' : 'Ingredient material'}
          value={req.materialId || ''}
          onChange={(e) => updateRecipeIngredient(itemId, idx, 'materialId', e.target.value)}
          className="w-full bg-transparent border-none focus:ring-0 text-sm font-semibold text-ink p-0 cursor-pointer"
        >
          {packaging ? (
            <optgroup label="Packaging Materials">
              {materials.filter(m => m.category === 'Packaging Materials').map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </optgroup>
          ) : (
            categories.filter(c => c !== 'Packaging Materials').map(cat => (
              <optgroup key={cat} label={cat}>
                {materials.filter(m => m.category === cat).map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </optgroup>
            ))
          )}
        </select>
        <div className="font-mono text-[11px] text-muted mt-0.5">Cost: {currencySymbol}{lineCost.toFixed(2)}</div>
      </div>
      <div className="flex items-center gap-1 bg-stone-50 rounded-lg px-2 py-1">
        <input
          type="number"
          aria-label="Amount"
          value={req.amount ?? 0}
          onChange={(e) => updateRecipeIngredient(itemId, idx, 'amount', parseFloat(e.target.value) || 0)}
          className="w-16 bg-transparent border-none focus:ring-0 text-sm font-mono font-semibold text-ink p-1 text-right"
        />
        <select
          aria-label="Unit"
          value={req.unit || (packaging ? 'pcs' : 'g')}
          onChange={(e) => updateRecipeIngredient(itemId, idx, 'unit', e.target.value)}
          className="bg-transparent border-none focus:ring-0 font-mono text-[10px] font-semibold text-muted uppercase p-0 cursor-pointer"
        >
          {(packaging ? ['pcs', 'g', 'kg', 'ml', 'l'] : ['g', 'kg', 'ml', 'l', 'pcs']).map(u => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>
      <button
        onClick={() => removeIngredientFromRecipe(itemId, idx)}
        className="text-stone-300 hover:text-coral transition-colors p-2 hover:bg-coral/10 rounded-lg"
        title="Remove line"
        aria-label="Remove line"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
};

export const MenuView: React.FC<AppViewProps> = (props) => {
  const {
    materials, categories, menu, orders, settings, currency, expandedRecipeId, setExpandedRecipeId,
    setIsIngredientSelectorOpen, setActiveRecipeItemId, addMenuItem, updateMenuItem, updateMenuItemField,
    deleteMenuItem, copyMenuItem, addIngredientToRecipe, updateRecipeIngredient, removeIngredientFromRecipe
  } = props;

  // Purely local, ephemeral UI state for the shareable nutrition card — not
  // persisted, so it doesn't need to go through the app-wide props like the
  // actual menu/recipe data does (same rationale as OrdersView's expanded-row
  // state). Holds the item currently being rendered off-screen for capture.
  const [shareCardItem, setShareCardItem] = useState<MenuItemType | null>(null);
  const [isGeneratingCard, setIsGeneratingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shareCardItem) return;
    let cancelled = false;

    (async () => {
      setIsGeneratingCard(true);
      setCardError(null);
      try {
        // Dynamically imported so html2canvas (a sizeable library) only
        // loads when someone actually generates a card, not on every
        // visit to the Menu tab.
        const { default: html2canvas } = await import('html2canvas');
        if (!shareCardRef.current) return;
        const canvas = await html2canvas(shareCardRef.current, { scale: 2, backgroundColor: '#ffffff' });
        if (cancelled) return;

        const link = document.createElement('a');
        const safeName = shareCardItem.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        link.download = `${safeName || 'menu-item'}-nutrition.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } catch (err) {
        console.error('Failed to generate nutrition card:', err);
        if (!cancelled) setCardError('Failed to generate the nutrition card image.');
      } finally {
        if (!cancelled) {
          setIsGeneratingCard(false);
          setShareCardItem(null);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [shareCardItem]);

  const [search, setSearch] = useState('');
  const [marginFilter, setMarginFilter] = useState<MarginFilter>('all');
  const [salesPeriod, setSalesPeriod] = useState<SalesPeriod>('30');

  const money = (n: number) =>
    `${currency.symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const summary = useMemo(() => summarizeMenu(menu, materials), [menu, materials]);

  // What each product sold and made over the chosen period, from the same sums as the Orders and Summary screens.
  const productSales = useMemo(() => {
    const { start, end } = salesPeriodRange(salesPeriod, new Date().toISOString().split('T')[0]);
    const inPeriod = (orders ?? []).filter(o => o.date <= end && (start === null || o.date >= start));
    return productProfits(inPeriod, menu, materials, settings);
  }, [orders, menu, materials, settings.gstApplicable, settings.gstRate, settings.gstPricingMode, salesPeriod]);
  const periodPhrase = SALES_PERIODS.find(p => p.value === salesPeriod)!.phrase;

  const q = search.trim().toLowerCase();
  const visible = useMemo(
    () => menu.filter(item => {
      if (q && !(item.name || '').toLowerCase().includes(q)) return false;
      if (marginFilter === 'all') return true;
      // Unpriced items have no margin to speak of: they belong under "needs review".
      if (!(item.sellingPrice > 0)) return marginFilter === 'low';
      return getMarginInfo(item.sellingPrice, recipeCost(item.recipe, materials)).tier === marginFilter;
    }),
    [menu, materials, q, marginFilter]
  );

  const isPackaging = (req: IngredientRequirement) => materials.find(m => m.id === req.materialId)?.category === 'Packaging Materials';

  return (
    <>
    <motion.div
      key="menu"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      {/* Heading */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
            <span className="truncate">{settings.name || 'My Bakery'}</span>
            <span className="text-stone-300">/</span>
            <span className="text-primary font-semibold whitespace-nowrap">Production Formulation</span>
          </div>
          <h2 className="text-2xl md:text-[32px] md:leading-tight font-bold tracking-tight text-ink">Menu &amp; Master Recipes</h2>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Define how much of each material goes into every item, and watch food cost and margin update as prices change.
          </p>
        </div>
        <button
          onClick={addMenuItem}
          className="h-10 flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-5 rounded-lg text-sm font-semibold shadow-sm transition-colors"
        >
          <Plus size={18} />
          Add Menu Item
        </button>
      </div>

      <datalist id="menu-categories">
        {[...new Set(menu.map(m => (m.category || '').trim()).filter(Boolean))].map(c => <option key={c} value={c} />)}
      </datalist>

      {/* Headline figures */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="Menu Items"
          value={String(summary.itemCount)}
          icon={BookOpen}
          tone="teal"
          footLeft={`${menu.filter(m => m.recipe.length > 0).length} with a recipe`}
        />
        <MetricCard
          label="Average Food Cost"
          value={summary.avgFoodCostPercent === null ? '—' : `${summary.avgFoodCostPercent.toFixed(1)}%`}
          icon={Percent}
          tone="slate"
          footLeft="Recipe cost ÷ sale price"
        />
        <MetricCard
          label="Highest Margin Item"
          value={summary.best ? summary.best.item.name || 'Untitled' : '—'}
          icon={Award}
          tone="slate"
          footLeft={summary.best ? 'Gross margin' : 'Add a recipe and a price'}
          footRight={summary.best ? `${summary.best.margin.toFixed(0)}%` : null}
        />
        <MetricCard
          label="Items Needing Review"
          value={String(summary.needsReview.length)}
          icon={TriangleAlert}
          tone={summary.needsReview.length > 0 ? 'coral' : 'slate'}
          footLeft={summary.needsReview.length > 0
            ? summary.needsReview.slice(0, 2).map(i => i.name || 'Untitled').join(', ') + (summary.needsReview.length > 2 ? ` +${summary.needsReview.length - 2}` : '')
            : 'Margins look healthy'}
          footRight={summary.needsReview.length > 0 ? 'Margin < 40%' : null}
        />
      </div>

      {/* Search + margin filter */}
      <div className="surface-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu items"
            aria-label="Search menu items"
            className="w-full h-10 pl-10 pr-3 rounded-lg bg-stone-50 border border-transparent text-sm text-ink placeholder:text-muted focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
          />
        </div>
        <select aria-label="Filter by margin" value={marginFilter} onChange={(e) => setMarginFilter(e.target.value as MarginFilter)} className={selectCls}>
          <option value="all">All Margins</option>
          <option value="high">60% and up</option>
          <option value="mid">40% – 60%</option>
          <option value="low">Under 40% / unpriced</option>
        </select>
        <select aria-label="Sales period" value={salesPeriod} onChange={(e) => setSalesPeriod(e.target.value as SalesPeriod)} className={selectCls}>
          {SALES_PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <span className="font-mono text-[11px] text-muted sm:ml-auto">
          {visible.length} of {menu.length} item{menu.length === 1 ? '' : 's'}
        </span>
      </div>

      {menu.length === 0 && (
        <div className="surface-card text-center py-16 px-8">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Utensils size={30} />
          </div>
          <h3 className="text-xl font-bold text-ink mb-2">No menu items yet</h3>
          <p className="text-muted text-sm mb-6">Add your first item, then build its recipe from your raw materials.</p>
          <button
            onClick={addMenuItem}
            className="inline-flex items-center gap-2 h-10 bg-primary hover:bg-primary-dark text-white px-6 rounded-lg text-sm font-semibold shadow-sm transition-colors"
          >
            <Plus size={18} />
            Add Menu Item
          </button>
        </div>
      )}
      {menu.length > 0 && visible.length === 0 && (
        <div className="surface-card text-center py-14 text-muted">No menu items match these filters.</div>
      )}

      <div className="grid gap-4">
        {visible.map((item) => {
          const cost = recipeCost(item.recipe, materials);
          const { margin, tier, isLoss } = getMarginInfo(item.sellingPrice, cost);
          const expanded = expandedRecipeId === item.id;
          const suggested = suggestedPrice(cost);
          const ingredientLines = item.recipe.filter(r => !isPackaging(r));
          const packagingLines = item.recipe.filter(r => isPackaging(r));
          return (
            <div key={item.id} className={`surface-card overflow-hidden ${expanded ? 'ring-1 ring-primary/30' : ''}`}>
              <div className="p-4 sm:p-5 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="relative w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-2xl shrink-0 overflow-hidden cursor-text hover:bg-primary/20 transition-colors">
                      <input
                        type="text"
                        maxLength={2}
                        aria-label="Emoji"
                        value={item.emoji || ''}
                        onChange={(e) => updateMenuItemField(item.id, 'emoji', e.target.value)}
                        className="absolute inset-0 w-full h-full text-center bg-transparent outline-none z-10 cursor-text"
                      />
                      {!item.emoji && <Utensils size={24} className="opacity-50 absolute pointer-events-none" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        aria-label="Item name"
                        value={item.name || ''}
                        onChange={(e) => updateMenuItem(item.id, e.target.value)}
                        className="w-full bg-transparent border border-transparent hover:border-stone-200 focus:border-primary focus:bg-white rounded-md px-2 py-0.5 -mx-2 text-xl font-bold text-ink outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="Item Name"
                      />
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="font-mono text-[11px] text-muted">Cost: {money(cost)}</span>
                        <span className={`font-mono text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${MARGIN_PILL[tier]}`}>
                          {isLoss ? `Loss (${margin.toFixed(0)}%)` : `${margin.toFixed(0)}% Margin`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 shrink-0">
                    <button
                      onClick={() => setExpandedRecipeId(expanded ? null : item.id)}
                      title={expanded ? 'Close Editor' : 'Edit Recipe'}
                      className={`flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold transition-colors ${
                        expanded ? 'bg-ink text-white shadow-sm' : 'bg-stone-50 text-ink hover:bg-primary/10 hover:text-primary'
                      }`}
                    >
                      {expanded ? <Check size={16} /> : <Edit2 size={16} />}
                      <span>{expanded ? 'Done' : 'Recipe'}</span>
                    </button>
                    <button
                      onClick={() => {
                        if (!item.servings || item.servings <= 0) {
                          setCardError(`Set servings for "${item.name}" before sharing its nutrition card.`);
                          return;
                        }
                        setShareCardItem(item);
                      }}
                      disabled={isGeneratingCard}
                      title="Share Nutrition Card"
                      aria-label={`Share nutrition card for ${item.name}`}
                      className="text-muted hover:text-primary transition-colors p-2 hover:bg-primary/10 rounded-lg disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <Salad size={18} />
                    </button>
                    <button
                      onClick={() => copyMenuItem(item)}
                      title="Duplicate Recipe"
                      aria-label={`Duplicate ${item.name}`}
                      className="text-muted hover:text-primary transition-colors p-2 hover:bg-primary/10 rounded-lg"
                    >
                      <Copy size={18} />
                    </button>
                    <button
                      onClick={() => deleteMenuItem(item.id)}
                      title="Delete Recipe"
                      aria-label={`Delete ${item.name}`}
                      className="text-muted hover:text-coral transition-colors p-2 hover:bg-coral/10 rounded-lg"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Price, shelf life, servings */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <label className="bg-stone-50 rounded-xl px-3 py-2 block">
                    <span className={LABEL}>Sale price</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-sm font-semibold text-muted">{currency.symbol}</span>
                      <input
                        type="number"
                        step="0.01"
                        aria-label="Sale price"
                        value={item.sellingPrice ?? 0}
                        onChange={(e) => updateMenuItemField(item.id, 'sellingPrice', parseFloat(e.target.value) || 0)}
                        className={STAT_INPUT}
                        placeholder="Price"
                      />
                    </div>
                  </label>
                  <label className="bg-stone-50 rounded-xl px-3 py-2 block" title="Shelf Life (Days)">
                    <span className={LABEL}>Shelf life (days)</span>
                    <input
                      type="number"
                      aria-label="Shelf life in days"
                      value={item.shelfLifeDays || ''}
                      onChange={(e) => updateMenuItemField(item.id, 'shelfLifeDays', parseInt(e.target.value) || undefined)}
                      className={`${STAT_INPUT} mt-0.5`}
                      placeholder="-"
                    />
                  </label>
                  <label className="bg-stone-50 rounded-xl px-3 py-2 block" title="Servings this recipe yields — needed to estimate per-serving nutrition">
                    <span className={LABEL}>Servings</span>
                    <input
                      type="number"
                      min="0"
                      aria-label="Servings"
                      value={item.servings || ''}
                      onChange={(e) => updateMenuItemField(item.id, 'servings', parseInt(e.target.value) || undefined)}
                      className={`${STAT_INPUT} mt-0.5`}
                      placeholder="-"
                    />
                  </label>
                  <button
                    onClick={() => updateMenuItemField(item.id, 'sellingPrice', suggested)}
                    className="bg-primary/5 hover:bg-primary/10 rounded-xl px-3 py-2 text-left transition-colors"
                    title="Apply 3.5x markup suggestion"
                  >
                    <span className={LABEL}>Suggest</span>
                    <div className="font-mono text-base font-semibold text-primary mt-0.5">{currency.symbol}{suggested.toFixed(2)}</div>
                  </button>
                </div>

                {/* What it sold and what it made over the period chosen above */}
                <div className="rounded-xl border border-stone-100 px-3 py-2.5">
                  <div className={`${LABEL} mb-1.5`}>{SALES_PERIODS.find(p => p.value === salesPeriod)!.label}</div>
                  <ProductPerformance
                    name={item.name}
                    profit={productSales.get(item.id)}
                    recipe={{ tier, margin }}
                    money={money}
                    periodLabel={periodPhrase}
                  />
                </div>

                {/* Shown on the menu PDF you share with customers */}
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
                  <label className="bg-stone-50 rounded-xl px-3 py-2 block" title="Groups this item into a section on the shared menu, e.g. Cakes">
                    <span className={LABEL}>Menu category</span>
                    <input
                      type="text"
                      list="menu-categories"
                      aria-label="Menu category"
                      value={item.category || ''}
                      onChange={(e) => updateMenuItemField(item.id, 'category', e.target.value)}
                      className={`${STAT_INPUT} mt-0.5`}
                      placeholder="e.g. Cakes"
                    />
                  </label>
                  <label className="bg-stone-50 rounded-xl px-3 py-2 block" title="A short line under the item's name on the shared menu">
                    <span className={LABEL}>Menu description</span>
                    <input
                      type="text"
                      aria-label="Menu description"
                      value={item.description || ''}
                      onChange={(e) => updateMenuItemField(item.id, 'description', e.target.value)}
                      className={`${STAT_INPUT} mt-0.5`}
                      placeholder="e.g. Rich dark chocolate, 6 inch"
                    />
                  </label>
                </div>
              </div>

              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden bg-primary/[0.03]"
                  >
                    <div className="p-4 sm:p-6 space-y-6 border-t border-stone-100">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex flex-wrap items-stretch gap-3">
                          <div className="p-3 bg-white rounded-xl shadow-sm">
                            <h4 className={`${LABEL} mb-1`}>Recipe cost</h4>
                            <div className="font-mono text-xl font-semibold text-primary">{money(cost)}</div>
                          </div>
                          {(() => {
                            const rollup = calculateRecipeNutrition(item.recipe, materials, item.servings || 0);
                            const noServings = !item.servings || item.servings <= 0;
                            return (
                              <div className="p-3 bg-white rounded-xl shadow-sm min-w-[200px]">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Salad size={12} className="text-primary" />
                                  <h4 className={LABEL}>Nutrition (est.) / serving</h4>
                                  {!noServings && rollup.hasIncompleteData && (
                                    <span className="text-[8px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Partial</span>
                                  )}
                                </div>
                                {noServings ? (
                                  <p className="text-[11px] text-muted">Set servings above to estimate</p>
                                ) : (
                                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs font-mono font-semibold text-ink">
                                    <span>{rollup.perServing.calories.toFixed(0)} kcal</span>
                                    <span className="text-muted font-normal">P {rollup.perServing.protein.toFixed(1)}g</span>
                                    <span className="text-muted font-normal">C {rollup.perServing.carbs.toFixed(1)}g</span>
                                    <span className="text-muted font-normal">F {rollup.perServing.fat.toFixed(1)}g</span>
                                  </div>
                                )}
                                {rollup.allergens.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {rollup.allergens.map(tag => (
                                      <span key={tag} className="text-[8px] font-bold uppercase tracking-wide bg-coral/10 text-coral px-1.5 py-0.5 rounded-full">
                                        {tag.replace(/_/g, ' ')}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => {
                              setActiveRecipeItemId(item.id);
                              setIsIngredientSelectorOpen(true);
                            }}
                            className="flex items-center gap-2 h-9 bg-primary text-white px-4 rounded-lg text-sm font-semibold shadow-sm hover:bg-primary-dark transition-colors"
                          >
                            <Sparkles size={14} />
                            Quick Add
                          </button>
                          {categories.map(cat => (
                            <button
                              key={cat}
                              onClick={() => addIngredientToRecipe(item.id, cat)}
                              className="flex items-center gap-2 h-9 bg-white hover:bg-stone-50 text-ink px-3.5 rounded-lg text-sm font-medium shadow-sm transition-colors"
                            >
                              <Plus size={14} className="text-primary" />
                              Add {cat}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-6">
                        {([
                          { title: 'Ingredients', icon: Utensils, lines: ingredientLines, packaging: false, empty: 'No ingredients added' },
                          { title: 'Packaging', icon: Package, lines: packagingLines, packaging: true, empty: 'No packaging added' },
                        ] as const).map(section => (
                          <div key={section.title} className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className={`flex items-center gap-2 ${LABEL}`}>
                                <section.icon size={14} className="text-primary" />
                                <span>{section.title}</span>
                              </div>
                              <span className={`${LABEL} text-stone-300`}>{section.lines.length} Items</span>
                            </div>
                            <div className="space-y-2">
                              {section.lines.map(req => (
                                <RecipeLine
                                  key={item.recipe.indexOf(req)}
                                  itemId={item.id}
                                  req={req}
                                  idx={item.recipe.indexOf(req)}
                                  packaging={section.packaging}
                                  materials={materials}
                                  categories={categories}
                                  currencySymbol={currency.symbol}
                                  updateRecipeIngredient={updateRecipeIngredient}
                                  removeIngredientFromRecipe={removeIngredientFromRecipe}
                                />
                              ))}
                              {section.lines.length === 0 && (
                                <div className="text-center py-6 rounded-xl bg-white/60 text-muted text-[11px] uppercase font-semibold tracking-wider">
                                  {section.empty}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>

    {/* Rendered off-screen (not display:none — html2canvas needs real
        layout) purely to be captured as a PNG; never shown to the user. */}
    {shareCardItem && (
      <div style={{ position: 'fixed', top: 0, left: -9999, pointerEvents: 'none' }}>
        <div ref={shareCardRef}>
          <NutritionCard
            itemName={shareCardItem.name}
            emoji={shareCardItem.emoji}
            businessName={settings.name || 'My Food Business'}
            logo={settings.logo}
            primaryColor={settings.primaryColor || '#10b981'}
            rollup={calculateRecipeNutrition(shareCardItem.recipe, materials, shareCardItem.servings || 0)}
          />
        </div>
      </div>
    )}

    {cardError && (
      <div className="fixed bottom-6 right-6 z-[80] bg-rose-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-bold flex items-center gap-3">
        {cardError}
        <button onClick={() => setCardError(null)} className="text-white/80 hover:text-white">
          <X size={16} />
        </button>
      </div>
    )}
    </>
  );
};
