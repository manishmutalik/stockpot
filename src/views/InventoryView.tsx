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


export const InventoryView: React.FC<AppViewProps> = (props) => {
  // Destructure all props to make variables available in the scope
  const { patchMaterial, setRestockExpiryDate, shopifyStatus, importShopifyOrders, isImportingShopify, odooStatus, importOdooOrders, isImportingOdoo, isRefreshing, lastSynced, handleDownloadTemplate, handleImportCSV, setAddMaterialCategory, setShowAddMaterialModal,
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
    addMenuItem, updateMenuItem, updateMenuItemField, deleteMenuItem, clearFinishedGoodsStock,
    addExperiment, updateExperiment, deleteExperiment, addMaterialToExperiment, updateExperimentMaterial,
    removeMaterialFromExperiment, processVoiceCommand, startListening, copyMenuItem, addIngredientToRecipe,
    addQuickIngredientsToRecipe, updateRecipeIngredient, removeIngredientFromRecipe, logProductionRun,
    deleteProductionRun, handleDiscardBatch, addOrder, updateOrder, deleteOrder, resetOrders, saveSettings,
    handleRestock, restockMaterial, setRestockMaterial, setDiscardTarget,
    showSaveFeedback, saveDay,
    updateCurrency, handleLogout, isListening, transcript, convertAmount
  } = props;

  return (
    <motion.div
              key="inventory"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-12"
            >
              {/* Low Stock Alerts */}
              {lowStockItems.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-rose-50 border border-rose-100 rounded-[10px] sm:rounded-[15px] p-6 space-y-4 shadow-sm"
                >
                  <div className="flex items-center gap-3 text-rose-600">
                    <AlertCircle size={24} />
                    <h3 className="font-bold uppercase tracking-widest text-[10px]">Critical Stock Alerts</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {lowStockItems.map(item => (
                      <div key={item.id} className="bg-white/80 backdrop-blur-sm border border-rose-200 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                        <div>
                          <div className="text-[10px] font-bold text-rose-800 uppercase tracking-widest mb-1">{item.name}</div>
                          <div className="text-2xl font-mono font-bold text-rose-600">
                            {item.remaining} <span className="text-xs font-normal text-rose-400">{item.unit}</span>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-rose-100 flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-rose-400">
                          <span>Threshold: {item.threshold} {item.unit}</span>
                          <span className="bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full">Low Stock</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Sorting & Refresh Options */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-stone-200/50 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-stone-600">
                    <Filter size={18} />
                    <span className="text-sm font-bold uppercase tracking-wider">Sort Inventory</span>
                  </div>
                  <div className="h-4 w-px bg-stone-200 hidden sm:block" />
                  <div className="flex items-center gap-2 text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                    <RefreshCw size={12} className={isRefreshing ? 'animate-spin text-primary' : ''} />
                    <span>Last Synced: {lastSynced.toLocaleTimeString()}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button 
                    onClick={refreshData}
                    disabled={isRefreshing}
                    className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-lg px-3 py-1.5 text-sm hover:bg-stone-100 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                    <span className="font-medium uppercase tracking-wider text-[10px]">Refresh</span>
                  </button>
                  <select 
                    value={inventorySortBy}
                    onChange={(e) => setInventorySortBy(e.target.value as any)}
                    className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  >
                    <option value="name">Name</option>
                    <option value="stock">Current Stock</option>
                    <option value="cost">Cost per Unit</option>
                    <option value="date">Date Added</option>
                  </select>
                  <button 
                    onClick={() => setInventorySortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                    className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-lg px-3 py-1.5 text-sm hover:bg-stone-100 transition-colors"
                  >
                    <TrendingUp size={16} className={inventorySortOrder === 'desc' ? 'rotate-180' : ''} />
                    <span className="hidden sm:inline font-medium uppercase tracking-wider text-[10px]">
                      {inventorySortOrder === 'asc' ? 'Ascending' : 'Descending'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Material Sections */}
              {categories.map(category => (
                <div key={category} className="space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-3">
                    <div>
                      <h2 className="text-2xl font-sans font-bold text-stone-800">{category}</h2>
                      <p className="text-stone-500 text-sm font-sans italic">Track stock levels and costs for {category.toLowerCase()}.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleDownloadTemplate()}
                        className="hidden md:flex items-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-600 px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm"
                        title="Download CSV Template"
                      >
                        <Download size={16} />
                        Template
                      </button>
                      <label className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20 transform active:scale-95 cursor-pointer">
                        <Upload size={16} />
                        <span className="hidden sm:inline">Import CSV</span>
                        <input 
                          type="file" 
                          accept=".csv" 
                          className="hidden" 
                          onChange={(e) => handleImportCSV(e, category)} 
                        />
                      </label>
                      <button 
                        onClick={() => { setAddMaterialCategory(category); setShowAddMaterialModal(true); }}
                        className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-primary/20 transform active:scale-95"
                      >
                        <Plus size={18} />
                        <span className="hidden sm:inline">Add Item</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-white rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left border-collapse">
                      <thead>
                        <tr className="bg-stone-50/50 border-b border-stone-100">
                          <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest w-56 min-w-[14rem]">Material Name</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Unit</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Current Stock</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest" title="Alert when current stock drops below this amount">Threshold (Alert)</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Cost / Unit</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest" title="Expiry date of the current stock batch">Expiry Date</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest w-20"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {sortedRemainingInventory.filter(m => m.category === category).map((mat) => {
                          const isLowStock = (mat.threshold ?? 0) > 0 && mat.remaining <= mat.threshold!;
                          
                          return (
                            <tr key={mat.id} className={`hover:bg-stone-50/30 transition-colors ${isLowStock ? 'bg-rose-50/20' : ''}`}>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  {isLowStock && <AlertCircle size={14} className="text-rose-500" />}
                                  <input 
                                    type="text" 
                                    value={mat.name || ''}
                                    onChange={(e) => updateMaterial(mat.id, 'name', e.target.value)}
                                    className={`w-full bg-transparent border-none focus:ring-0 font-bold p-0 text-sm font-sans ${isLowStock ? 'text-rose-700' : 'text-stone-700'}`}
                                  />
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <select
                                  value={mat.unit || 'g'}
                                  onChange={(e) => {
                                    const fromUnit = mat.unit || 'g';
                                    const toUnit = e.target.value;
                                    if (fromUnit === toUnit) return;
                                    const factor = UNIT_CONVERSIONS[fromUnit]?.[toUnit];
                                    if (factor !== undefined) {
                                      // Convert stock: e.g. 10 kg * 1000 = 10000 g
                                      const newStock = parseFloat((mat.initialStock * factor).toFixed(6));
                                      // Cost inverts: e.g. 45/kg / 1000 = 0.045/g
                                      const newCost = parseFloat((mat.costPerUnit / factor).toFixed(6));
                                      // Threshold also converts like stock
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
                                  }}
                                  className="bg-stone-100/50 border-none rounded-lg px-2 py-1 text-[10px] font-bold text-stone-500 focus:ring-2 focus:ring-primary/20 uppercase tracking-wider"
                                >
                                  <option value="g">g</option>
                                  <option value="kg">kg</option>
                                  <option value="ml">ml</option>
                                  <option value="l">l</option>
                                  <option value="pcs">pcs</option>
                                </select>
                              </td>
                              <td className="px-6 py-4">
                                <input 
                                  type="number" 
                                  value={mat.initialStock ?? 0}
                                  onChange={(e) => updateMaterial(mat.id, 'initialStock', parseFloat(e.target.value) || 0)}
                                  className="w-28 bg-stone-50/50 border border-stone-100 rounded-xl px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                />
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-1">
                                  <input 
                                    type="number" 
                                    value={mat.threshold ?? 0}
                                    onChange={(e) => updateMaterial(mat.id, 'threshold', parseFloat(e.target.value) || 0)}
                                    className={`w-20 border rounded-xl px-2 py-1.5 text-sm font-mono focus:ring-2 outline-none text-right transition-all ${isLowStock ? 'bg-rose-50/50 border-rose-100 focus:ring-rose-500' : 'bg-stone-50/50 border-stone-100 focus:ring-primary/20'}`}
                                    placeholder="5"
                                    title={`Alert when stock drops below this amount of ${mat.unit}`}
                                  />
                                  <span className="text-stone-400 text-[10px] font-bold">{mat.unit}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-1">
                                  <span className="text-stone-400 text-xs font-bold">{currency.symbol}</span>
                                  <input 
                                    type="number" 
                                    step="0.01"
                                    value={mat.costPerUnit != null ? +(mat.costPerUnit.toPrecision(4)) : 0}
                                    onChange={(e) => updateMaterial(mat.id, 'costPerUnit', parseFloat(e.target.value) || 0)}
                                    className="w-24 bg-stone-50/50 border border-stone-100 rounded-xl px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                  />
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                {(() => {
                                  const today = new Date();
                                  today.setHours(0,0,0,0);
                                  const expDate = mat.expiryDate ? new Date(mat.expiryDate) : null;
                                  if (expDate) expDate.setHours(0,0,0,0);
                                  const daysLeft = expDate ? Math.ceil((expDate.getTime() - today.getTime()) / 86400000) : null;
                                  const isExpiringSoon = daysLeft !== null && daysLeft <= 3 && daysLeft >= 0;
                                  const isExpired = daysLeft !== null && daysLeft < 0;
                                  return (
                                    <div className="flex flex-col gap-1">
                                      <input
                                        type="date"
                                        value={mat.expiryDate || ''}
                                        onChange={(e) => updateMaterial(mat.id, 'expiryDate', e.target.value)}
                                        className={`w-36 border rounded-xl px-2 py-1.5 text-xs font-mono focus:ring-2 outline-none transition-all ${
                                          isExpired
                                            ? 'bg-rose-50 border-rose-300 text-rose-700 focus:ring-rose-400'
                                            : isExpiringSoon
                                            ? 'bg-amber-50 border-amber-300 text-amber-700 focus:ring-amber-400'
                                            : 'bg-stone-50/50 border-stone-100 text-stone-600 focus:ring-primary/20'
                                        }`}
                                        title="Expiry date of current stock batch"
                                      />
                                      {isExpired && <span className="text-[9px] font-bold text-rose-600 uppercase tracking-wider">Expired</span>}
                                      {!isExpired && isExpiringSoon && <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">{daysLeft}d left</span>}
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button 
                                    onClick={() => { setRestockMaterial(mat); setRestockExpiryDate(mat.expiryDate || ''); }}
                                    className="flex items-center gap-1 text-emerald-500 hover:text-emerald-600 transition-colors px-2 py-1.5 hover:bg-emerald-50 rounded-xl text-[10px] font-bold uppercase tracking-wider"
                                    title="Restock this item"
                                  >
                                    <Plus size={16} />
                                    <span className="hidden sm:inline">Restock</span>
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
                                    className="flex items-center gap-1 text-amber-500 hover:text-amber-600 transition-colors px-2 py-1.5 hover:bg-amber-50 rounded-xl text-[10px] font-bold uppercase tracking-wider disabled:opacity-30 disabled:pointer-events-none"
                                    title="Log wasted/discarded stock"
                                  >
                                    <Trash2 size={16} />
                                    <span className="hidden sm:inline">Discard</span>
                                  </button>
                                  <button 
                                    onClick={() => deleteMaterial(mat.id)}
                                    className="text-stone-300 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50 rounded-xl"
                                    title="Delete Material"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {materials.filter(m => m.category === category).length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-stone-400 font-sans italic">
                              No materials added to {category} yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </div>
              ))}

              {/* Missing Categories Section */}
              {sortedRemainingInventory.filter(m => !categories.includes(m.category)).length > 0 && (
                <div className="space-y-6 mt-12">
                  <div className="flex justify-between items-end">
                    <div>
                      <h2 className="text-2xl font-sans font-bold text-stone-800">Uncategorized Items</h2>
                      <p className="text-stone-500 text-sm font-sans italic">These items have categories that are not in your master list.</p>
                    </div>
                  </div>

                  <div className="bg-white rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="w-full min-w-[400px] text-left border-collapse">
                      <thead>
                        <tr className="bg-stone-50/50 border-b border-stone-100">
                          <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Material Name</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Category</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-right w-20"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {sortedRemainingInventory.filter(m => !categories.includes(m.category)).map((mat) => (
                          <tr key={mat.id} className="hover:bg-stone-50/30 transition-colors">
                            <td className="px-6 py-4">
                              <span className="text-sm font-bold text-stone-700 font-sans">{mat.name}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="bg-stone-100 text-stone-500 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                                {mat.category}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => updateMaterial(mat.id, 'category', 'Raw Materials')}
                                className="text-primary hover:text-primary-dark text-[10px] font-bold uppercase tracking-widest"
                              >
                                Move to Raw Materials
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
  );
};
