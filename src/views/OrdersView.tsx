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
import { AppViewProps, Order } from '../types';
import { IngredientSelectorModal } from '../components/IngredientSelectorModal';
import { ProductionRunModal } from '../components/ProductionRunModal';
import { CURRENCIES, INITIAL_MATERIALS } from '../App';
import { UNIT_CONVERSIONS } from '../App';


export const OrdersView: React.FC<AppViewProps> = (props) => {
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
    addMenuItem, updateMenuItem, updateMenuItemField, deleteMenuItem, clearFinishedGoodsStock,
    addExperiment, updateExperiment, deleteExperiment, addMaterialToExperiment, updateExperimentMaterial,
    removeMaterialFromExperiment, processVoiceCommand, startListening, copyMenuItem, addIngredientToRecipe,
    addQuickIngredientsToRecipe, updateRecipeIngredient, removeIngredientFromRecipe, logProductionRun,
    deleteProductionRun, handleDiscardBatch, addOrder, fulfillOrder, updateOrder, deleteOrder, resetOrders, saveSettings,
    handleRestock, restockMaterial, setRestockMaterial,
    showSaveFeedback, saveDay,
    updateCurrency, handleLogout, isListening, transcript, convertAmount
  } = props;

  return (
    <motion.div
              key="orders"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8 pb-20"
            >
              {/* Header */}
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
                <div>
                  <h2 className="text-3xl font-sans font-bold text-stone-800">Order History</h2>
                  <p className="text-stone-500 text-sm italic font-sans">Browse and manage all customer orders by date range.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                  {/* Date range pickers */}
                  <div className="flex flex-wrap items-center gap-2 bg-white border border-stone-200/50 rounded-xl px-3 py-2 shadow-sm">
                    <Calendar size={15} className="text-primary shrink-0" />
                    <input
                      type="date"
                      value={orderFilterStart}
                      onChange={(e) => setOrderFilterStart(e.target.value)}
                      className="bg-transparent border-none focus:ring-0 text-sm font-bold text-stone-700 p-0 cursor-pointer w-28 sm:w-32"
                    />
                    <span className="text-stone-300 font-bold text-xs">→</span>
                    <input
                      type="date"
                      value={orderFilterEnd}
                      onChange={(e) => setOrderFilterEnd(e.target.value)}
                      className="bg-transparent border-none focus:ring-0 text-sm font-bold text-stone-700 p-0 cursor-pointer w-28 sm:w-32"
                    />
                  </div>

                  {/* Quick range shortcuts */}
                  <div className="flex items-center gap-1.5">
                    {[
                      { label: 'Today', days: 0 },
                      { label: '7 Days', days: 6 },
                      { label: '30 Days', days: 29 },
                    ].map(({ label, days }) => (
                      <button
                        key={label}
                        onClick={() => {
                          const end = new Date();
                          const start = new Date();
                          start.setDate(end.getDate() - days);
                          setOrderFilterStart(start.toISOString().split('T')[0]);
                          setOrderFilterEnd(end.toISOString().split('T')[0]);
                        }}
                        className="px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="h-8 w-px bg-stone-200 hidden lg:block" />

                  {/* Add Order Button */}
                  <button
                    onClick={() => {
                      setModalOrderDate(new Date().toISOString().split('T')[0]);
                      setModalCustomerName('');
                      setModalCustomerPhone('');
                      setModalLineItems([{ menuItemId: menu[0]?.id || '', quantity: 1 }]);
                      setIsAddOrderModalOpen(true);
                    }}
                    disabled={menu.length === 0}
                    className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-primary/20 transform active:scale-95 disabled:opacity-50"
                  >
                    <Plus size={18} />
                    Add Order
                  </button>

                  {shopifyStatus.connected && (
                    <button
                      onClick={importShopifyOrders}
                      disabled={isImportingShopify}
                      className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg transform active:scale-95 ${
                        isImportingShopify
                          ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                          : 'bg-primary hover:bg-primary-dark text-white shadow-primary/20'
                      }`}
                    >
                      <Globe size={18} className={isImportingShopify ? 'animate-spin' : ''} />
                      {isImportingShopify ? 'Importing...' : 'Shopify Import'}
                    </button>
                  )}
                  {odooStatus.connected && (
                    <button
                      onClick={importOdooOrders}
                      disabled={isImportingOdoo}
                      className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg transform active:scale-95 ${
                        isImportingOdoo
                          ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                          : 'bg-stone-800 hover:bg-stone-900 text-white shadow-stone-200'
                      }`}
                    >
                      <Database size={18} className={isImportingOdoo ? 'animate-spin' : ''} />
                      {isImportingOdoo ? 'Importing...' : 'Odoo Import'}
                    </button>
                  )}
                </div>
              </div>

              {/* Summary bar */}
              {(() => {
                const rangeOrders = orders.filter(o => o.date >= orderFilterStart && o.date <= orderFilterEnd);
                const totalItems = rangeOrders.reduce((s, o) => s + o.quantity, 0);
                return rangeOrders.length > 0 ? (
                  <div className="flex flex-wrap gap-4">
                    <div className="bg-white border border-stone-200/50 rounded-xl px-5 py-3 shadow-sm flex items-center gap-3">
                      <ShoppingBag size={16} className="text-primary" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Orders</span>
                      <span className="text-lg font-bold text-stone-800">{rangeOrders.length}</span>
                    </div>
                    <div className="bg-white border border-stone-200/50 rounded-xl px-5 py-3 shadow-sm flex items-center gap-3">
                      <Package size={16} className="text-emerald-500" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Items Sold</span>
                      <span className="text-lg font-bold text-stone-800">{totalItems}</span>
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Orders table */}
              <div className="bg-white rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm overflow-hidden">
                {(() => {
                  const rangeOrders = orders
                    .filter(o => o.date >= orderFilterStart && o.date <= orderFilterEnd)
                    .sort((a, b) => b.date.localeCompare(a.date));

                  if (rangeOrders.length === 0) {
                    return (
                      <div className="text-center py-20 px-8">
                        <div className="w-20 h-20 bg-stone-50 rounded-[10px] sm:rounded-[15px] shadow-sm border border-stone-100 flex items-center justify-center mx-auto mb-6 text-stone-200">
                          <ClipboardList size={40} />
                        </div>
                        <h3 className="text-xl font-sans font-bold text-stone-800 mb-2">No orders in this range</h3>
                        <p className="text-stone-500 text-sm mb-8 italic font-sans">Try changing the date range or add a new order.</p>
                        <button
                          onClick={() => {
                            setModalOrderDate(new Date().toISOString().split('T')[0]);
                            setModalCustomerName('');
                            setModalCustomerPhone('');
                            setModalLineItems([{ menuItemId: menu[0]?.id || '', quantity: 1 }]);
                            setIsAddOrderModalOpen(true);
                          }}
                          disabled={menu.length === 0}
                          className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-primary/20 transform active:scale-95 disabled:opacity-50"
                        >
                          <Plus size={18} />
                          Log First Sale
                        </button>
                      </div>
                    );
                  }

                  // Group by date descending
                  const byDate: Record<string, Order[]> = {};
                  rangeOrders.forEach(o => {
                    if (!byDate[o.date]) byDate[o.date] = [];
                    byDate[o.date].push(o);
                  });

                  return (
                    <div className="divide-y divide-stone-50">
                      {Object.keys(byDate).sort((a, b) => b.localeCompare(a)).map(date => (
                        <div key={date}>
                          {/* Date group header */}
                          <div className="px-4 sm:px-8 py-3 bg-stone-50/70 border-b border-stone-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Calendar size={13} className="text-primary" />
                              <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
                                {new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold text-stone-400">
                              {byDate[date].length} order{byDate[date].length !== 1 ? 's' : ''} · {byDate[date].reduce((s, o) => s + o.quantity, 0)} items
                            </span>
                          </div>
                          {/* Column headers — desktop only */}
                          <div className="hidden sm:grid grid-cols-12 gap-4 px-4 sm:px-8 pt-3 pb-1 text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                            <div className="col-span-4">Item Sold</div>
                            <div className="col-span-2">Qty</div>
                            <div className="col-span-2">Customer</div>
                            <div className="col-span-2">Phone</div>
                            <div className="col-span-2 text-right">Actions</div>
                          </div>
                          <div className="px-3 sm:px-8 pb-4 space-y-2">
                            {byDate[date].map(order => (
                              <div key={order.id} className="group p-3 bg-stone-50/50 rounded-xl border border-stone-100 hover:border-primary/20 transition-all">
                                {/* Mobile: stacked card layout */}
                                <div className="flex flex-col gap-2 sm:hidden">
                                  <select
                                    value={order.menuItemId || ''}
                                    onChange={(e) => updateOrder(order.id, 'menuItemId', e.target.value)}
                                    className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-sm font-bold text-stone-700 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none shadow-sm"
                                  >
                                    <option value="" disabled>Select Item</option>
                                    {menu.map(m => <option key={m.id} value={m.id}>{m.emoji ? `${m.emoji} ` : ''}{m.name}</option>)}
                                  </select>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number" min="1"
                                      value={order.quantity ?? 0}
                                      onChange={(e) => updateOrder(order.id, 'quantity', parseInt(e.target.value) || 0)}
                                      className="w-20 bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-stone-700 focus:ring-2 focus:ring-primary/20 outline-none shadow-sm text-center"
                                    />
                                    <div className="flex-1 bg-stone-50 border border-stone-100 rounded-xl px-3 py-2.5 text-sm font-medium text-stone-500 overflow-hidden text-ellipsis whitespace-nowrap flex items-center justify-between">
                                      <span>{order.customerName || <span className="text-stone-300 italic">No name</span>}</span>
                                      {order.customerPhone && <span className="text-stone-400 text-xs font-normal shrink-0">({order.customerPhone})</span>}
                                    </div>
                                    {!order.fulfilled ? (
                                      <button
                                        onClick={() => fulfillOrder(order)}
                                        className="p-2.5 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors shrink-0"
                                        title="Fulfill Order (deduct inventory)"
                                      >
                                        <CheckCircle2 size={18} />
                                      </button>
                                    ) : (
                                      <span className="p-2.5 text-emerald-500 shrink-0" title="Order fulfilled — inventory deducted">
                                        <CheckCircle2 size={18} fill="currentColor" className="text-emerald-100" />
                                      </span>
                                    )}
                                    <button
                                      onClick={() => deleteOrder(order.id)}
                                      className="p-2.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors shrink-0"
                                      title="Delete Order"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                  </div>
                                </div>
                                {/* Desktop: grid row layout */}
                                <div className="hidden sm:grid grid-cols-12 items-center gap-4">
                                  <div className="col-span-4">
                                    <select
                                      value={order.menuItemId || ''}
                                      onChange={(e) => updateOrder(order.id, 'menuItemId', e.target.value)}
                                      className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-sm font-bold text-stone-700 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none shadow-sm transition-all"
                                    >
                                      <option value="" disabled>Select Item</option>
                                      {menu.map(m => <option key={m.id} value={m.id}>{m.emoji ? `${m.emoji} ` : ''}{m.name}</option>)}
                                    </select>
                                  </div>
                                  <div className="col-span-2">
                                    <input
                                      type="number" min="1"
                                      value={order.quantity ?? 0}
                                      onChange={(e) => updateOrder(order.id, 'quantity', parseInt(e.target.value) || 0)}
                                      className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-sm font-mono font-bold text-stone-700 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none shadow-sm transition-all"
                                    />
                                  </div>
                                  <div className="col-span-2">
                                    <div className="w-full bg-stone-50 border border-stone-100 rounded-xl px-3 py-2 text-sm font-medium text-stone-500 overflow-hidden text-ellipsis whitespace-nowrap">
                                      {order.customerName || <span className="text-stone-300 italic">No name</span>}
                                    </div>
                                  </div>
                                  <div className="col-span-2">
                                    <div className="w-full bg-stone-50 border border-stone-100 rounded-xl px-3 py-2 text-sm font-medium text-stone-500 overflow-hidden text-ellipsis whitespace-nowrap">
                                      {order.customerPhone || <span className="text-stone-300 italic">No phone</span>}
                                    </div>
                                  </div>
                                  <div className="col-span-2 flex justify-end gap-1">
                                    {!order.fulfilled ? (
                                      <button
                                        onClick={() => fulfillOrder(order)}
                                        className="text-stone-300 hover:text-emerald-500 transition-colors p-2 hover:bg-emerald-50 rounded-xl opacity-0 group-hover:opacity-100"
                                        title="Fulfill Order (deduct inventory)"
                                      >
                                        <CheckCircle2 size={18} />
                                      </button>
                                    ) : (
                                      <span className="text-emerald-500 p-2" title="Order fulfilled — inventory deducted">
                                        <CheckCircle2 size={18} fill="currentColor" className="text-emerald-100" />
                                      </span>
                                    )}
                                    <button
                                      onClick={() => deleteOrder(order.id)}
                                      className="text-stone-300 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50 rounded-xl opacity-0 group-hover:opacity-100"
                                      title="Delete Order"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </motion.div>
  );
};
