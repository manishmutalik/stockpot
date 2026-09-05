import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  Plus, Trash2, ChevronRight, ChevronDown, Package, Utensils, ClipboardList, Calculator,
  Save, RotateCcw, AlertCircle, CheckCircle2, Check, Info, Database, RefreshCw, Copy,
  DollarSign, Globe, Calendar, Filter, ArrowLeft, ArrowRight, Clock, Settings, Settings2,
  Layers, UserCog, Puzzle, User as UserIcon, LogOut, Image, Palette, Store, Mail, Phone,
  MapPin, UserCircle, TrendingUp, TrendingDown, Activity, ShoppingBag, BarChart3, Edit2,
  LogIn, FlaskConical, Sparkles, Factory, Download, Upload, X
} from 'lucide-react';
import { AppViewProps } from '../types';
import { IngredientSelectorModal } from '../components/IngredientSelectorModal';
import { ProductionRunModal } from '../components/ProductionRunModal';
import { CURRENCIES, INITIAL_MATERIALS } from '../App';
import { UNIT_CONVERSIONS } from '../App';


export const ProductionView: React.FC<AppViewProps> = (props) => {
  // Destructure all props to make variables available in the scope
  const { patchMaterial, setRestockExpiryDate, shopifyStatus, importShopifyOrders, isImportingShopify, odooStatus, importOdooOrders, isImportingOdoo,
    materials, setMaterials, categories, setCategories, menu, setMenu, orders, setOrders,
    experiments, setExperiments, productionRuns, setProductionRuns, wastageLogs, setWastageLogs,
    isProductionRunModalOpen, setIsProductionRunModalOpen, productionFilterRecipe, setProductionFilterRecipe,
    productionFilterPurpose, setProductionFilterPurpose, activeTab, setActiveTab, activeSettingsTab,
    setActiveSettingsTab, currency, setCurrency, summaryRange, setSummaryRange, summaryDateStart,
    setSummaryDateStart, summaryDateEnd, setSummaryDateEnd, orderDate, setOrderDate, orderFilterStart,
    setOrderFilterStart, orderFilterEnd, setOrderFilterEnd, isAddOrderModalOpen, setIsAddOrderModalOpen,
    modalOrderDate, setModalOrderDate, modalCustomerName, setModalCustomerName, modalCustomerPhone,
    setModalCustomerPhone, modalLineItems, setModalLineItems, isSavingOrder, setIsSavingOrder,
    summaryRefDate, setSummaryRefDate, expandedRecipeId, setExpandedRecipeId, inventorySortBy,
    setInventorySortBy, inventorySortOrder, setInventorySortOrder, isIngredientSelectorOpen,
    setIsIngredientSelectorOpen, activeRecipeItemId, setActiveRecipeItemId, settings, setSettings,
    user, isAlertDismissed, setIsAlertDismissed, isExpiredAlertDismissed, setIsExpiredAlertDismissed,
    inventoryUsage, summaryInventoryUsage, remainingInventory, sortedRemainingInventory, lowStockItems,
    summaryFinancials, activeOrdersCount, averageOrderValue, financials, chartData, handleRangeChange,
    refreshData, addMaterial, addCategory, deleteCategory, updateMaterial, deleteMaterial,
    addMenuItem, updateMenuItem, updateMenuItemField, deleteMenuItem,
    setDiscardTarget,
    addExperiment, updateExperiment, deleteExperiment, addMaterialToExperiment, updateExperimentMaterial,
    removeMaterialFromExperiment, processVoiceCommand, startListening, copyMenuItem, addIngredientToRecipe,
    addQuickIngredientsToRecipe, updateRecipeIngredient, removeIngredientFromRecipe, logProductionRun,
    deleteProductionRun, handleDiscardBatch, addOrder, updateOrder, deleteOrder, resetOrders, saveSettings,
    handleRestock, restockMaterial, setRestockMaterial,
    showSaveFeedback, saveDay,
    updateCurrency, handleLogout, isListening, transcript, convertAmount
  } = props;

  return (
    <motion.div
              key="production"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8 pb-20"
            >
              {/* Header */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                  <h2 className="text-3xl font-sans font-bold text-stone-800">Production Log</h2>
                  <p className="text-stone-500 text-sm italic font-sans">Record production runs and manage finished goods stock.</p>
                </div>
                <button
                  onClick={() => setIsProductionRunModalOpen(true)}
                  className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-amber-200 active:scale-95"
                >
                  <Factory size={16} />
                  Log Production Run
                </button>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm">
                  <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Total Runs</div>
                  <div className="text-3xl font-bold font-sans text-stone-800">{productionRuns.length}</div>
                  <div className="text-xs text-stone-500 mt-1">All time</div>
                </div>
                <div className="bg-white p-6 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm">
                  <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Units Baked</div>
                  <div className="text-3xl font-bold font-sans text-stone-800">
                    {productionRuns.reduce((s, r) => s + r.quantityProduced, 0)}
                  </div>
                  <div className="text-xs text-stone-500 mt-1">All time</div>
                </div>
                <div className="bg-white p-6 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm">
                  <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Total Prod. Cost</div>
                  <div className="text-3xl font-bold font-sans text-stone-800">
                    {currency.symbol}{productionRuns.reduce((s, r) => s + (r.costTotal || 0), 0).toFixed(2)}
                  </div>
                  <div className="text-xs text-stone-500 mt-1">All time</div>
                </div>
              </div>

              {/* Finished Goods Stock */}
              {menu.some(m => (m.finishedGoodsStock ?? 0) > 0) && (
                <div className="bg-white rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm overflow-hidden">
                  <div className="px-4 sm:px-8 py-5 border-b border-stone-100 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <Package size={18} />
                    </div>
                    <h3 className="text-base font-bold text-stone-800">Finished Goods In Stock</h3>
                  </div>
                  <div className="px-4 sm:px-8 py-5 flex flex-wrap gap-3">
                    {menu.filter(m => (m.finishedGoodsStock ?? 0) > 0).map(item => (
                      <div key={item.id} className="flex items-center gap-2 bg-stone-50 border border-stone-100 rounded-xl pl-4 pr-2 py-1.5">
                        <span className="text-sm font-bold text-stone-700">{item.name}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${(item.finishedGoodsStock ?? 0) <= 5 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {item.finishedGoodsStock} units
                        </span>
                        <button
                          onClick={() => {
                            const cost = item.recipe.reduce((total, req) => {
                              const mat = materials.find(m => m.id === req.materialId);
                              if (!mat) return total;
                              const convertedAmount = convertAmount(req.amount, req.unit || 'g', mat.unit);
                              return total + (convertedAmount * (mat.costPerUnit || 0));
                            }, 0);
                            setDiscardTarget({
                              id: item.id,
                              name: item.name,
                              type: 'recipe',
                              maxQty: item.finishedGoodsStock ?? 0,
                              unit: 'pcs',
                              costPerUnit: cost,
                            });
                          }}
                          className="p-1.5 ml-1 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center"
                          title="Discard / log as wastage"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={productionFilterRecipe}
                  onChange={e => setProductionFilterRecipe(e.target.value)}
                  className="bg-white border border-stone-200 rounded-xl px-4 py-2 text-xs font-bold text-stone-600 outline-none focus:ring-2 focus:ring-amber-400/30"
                >
                  <option value="">All Recipes</option>
                  {menu.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <select
                  value={productionFilterPurpose}
                  onChange={e => setProductionFilterPurpose(e.target.value)}
                  className="bg-white border border-stone-200 rounded-xl px-4 py-2 text-xs font-bold text-stone-600 outline-none focus:ring-2 focus:ring-amber-400/30"
                >
                  <option value="">All Purposes</option>
                  <option value="market_stock">🛒 Market Stock</option>
                  <option value="customer_order">📦 Customer Order</option>
                  <option value="sampling">🎁 Sampling</option>
                  <option value="personal_use">🏠 Personal Use</option>
                  <option value="other">✳️ Other</option>
                </select>
              </div>

              {/* Runs List */}
              {(() => {
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
                const filtered = [...productionRuns]
                  .filter(r => (!productionFilterRecipe || r.recipeId === productionFilterRecipe) && (!productionFilterPurpose || r.purpose === productionFilterPurpose))
                  .sort((a, b) => b.createdAt - a.createdAt);

                if (filtered.length === 0) {
                  return (
                    <div className="bg-white rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm p-16 text-center">
                      <div className="w-16 h-16 rounded-[10px] sm:rounded-[15px] bg-amber-50 flex items-center justify-center text-amber-400 mx-auto mb-4">
                        <Factory size={32} />
                      </div>
                      <h3 className="text-lg font-sans font-bold text-stone-700 mb-2">No production runs yet</h3>
                      <p className="text-sm text-stone-400 font-sans italic">Log a production run to start tracking finished goods.</p>
                    </div>
                  );
                }

                return (
                  <div className="bg-white rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                      <thead className="bg-stone-50">
                        <tr>
                          <th className="px-6 py-4 text-left text-[10px] font-bold text-stone-400 uppercase tracking-widest">Date</th>
                          <th className="px-6 py-4 text-left text-[10px] font-bold text-stone-400 uppercase tracking-widest">Recipe</th>
                          <th className="px-6 py-4 text-left text-[10px] font-bold text-stone-400 uppercase tracking-widest">Expiry</th>
                          <th className="px-6 py-4 text-left text-[10px] font-bold text-stone-400 uppercase tracking-widest">Purpose</th>
                          <th className="px-6 py-4 text-right text-[10px] font-bold text-stone-400 uppercase tracking-widest">Produced</th>
                          <th className="px-6 py-4 text-right text-[10px] font-bold text-stone-400 uppercase tracking-widest">Sellable</th>
                          <th className="px-6 py-4 text-right text-[10px] font-bold text-stone-400 uppercase tracking-widest">Cost</th>
                          <th className="px-6 py-4 text-right text-[10px] font-bold text-stone-400 uppercase tracking-widest">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {filtered.map(run => {
                          const recipe = menu.find(m => m.id === run.recipeId);
                          const sellable = run.quantityYield ?? run.quantityProduced;
                          const waste = run.quantityProduced - sellable;
                          return (
                            <tr key={run.id} className="hover:bg-stone-50/50 transition-colors">
                              <td className="px-6 py-4 text-sm text-stone-600">{new Date(run.date).toLocaleDateString()}</td>
                              <td className="px-6 py-4 text-sm font-bold text-stone-800">{recipe?.name || 'Unknown'}</td>
                              <td className="px-6 py-4 text-sm text-stone-600">{run.expiryDate ? new Date(run.expiryDate).toLocaleDateString() : '-'}</td>
                              <td className="px-6 py-4">
                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${PURPOSE_COLORS[run.purpose] || 'bg-stone-100 text-stone-600'}`}>
                                  {PURPOSE_LABELS[run.purpose] || run.purpose}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right text-sm font-bold text-stone-700">{run.quantityProduced}</td>
                              <td className="px-6 py-4 text-right text-sm text-stone-600">
                                {sellable}
                                {waste > 0 && <span className="text-xs text-amber-500 ml-1">(-{waste} waste)</span>}
                              </td>
                              <td className="px-6 py-4 text-right text-sm font-bold text-stone-900 font-sans">{currency.symbol}{(run.costTotal || 0).toFixed(2)}</td>
                              <td className="px-6 py-4 text-right">
                                <button
                                  onClick={() => deleteProductionRun(run.id)}
                                  className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                  title="Delete Production Run"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
  );
};
