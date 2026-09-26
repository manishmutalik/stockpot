import React, { useState } from 'react';
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
import { AppViewProps, Order, MenuItem } from '../types';
import { clusterOrdersByGroup } from '../utils/orderClustering';
import { IngredientSelectorModal } from '../components/IngredientSelectorModal';
import { ProductionRunModal } from '../components/ProductionRunModal';
import { CURRENCIES, INITIAL_MATERIALS } from '../App';
import { UNIT_CONVERSIONS } from '../App';


/**
 * Expandable delivery details for one order: method, address, what the
 * customer is charged, and (only for third-party couriers) what's paid out
 * to the courier. Shared between the mobile and desktop layouts below.
 */
const DeliveryDetailsSection: React.FC<{
  order: Order;
  updateOrder: (id: string, field: keyof Order, value: any) => void;
  currencySymbol: string;
}> = ({ order, updateOrder, currencySymbol }) => {
  const method = order.deliveryMethod || 'pickup';
  return (
    <div className="mt-2 p-3 bg-white border border-stone-100 rounded-xl space-y-2.5">
      <div>
        <label className="block text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">Delivery Method</label>
        <select
          value={method}
          onChange={(e) => updateOrder(order.id, 'deliveryMethod', e.target.value)}
          className="w-full bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-700 focus:ring-2 focus:ring-primary/20 outline-none"
        >
          <option value="pickup">Pickup (no delivery)</option>
          <option value="self_delivery">Self-Delivery</option>
          <option value="third_party">Third-Party Courier (Uber, Porter, etc.)</option>
        </select>
      </div>
      {method !== 'pickup' && (
        <>
          <div>
            <label className="block text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">Delivery Address</label>
            <input
              type="text"
              value={order.deliveryAddress || ''}
              onChange={(e) => updateOrder(order.id, 'deliveryAddress', e.target.value)}
              placeholder="Where is this being delivered?"
              className="w-full bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-stone-700 focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">Charged to Customer</label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-stone-400">{currencySymbol}</span>
                <input
                  type="number" min="0" step="0.01"
                  value={order.deliveryCharge ?? ''}
                  onChange={(e) => updateOrder(order.id, 'deliveryCharge', parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-stone-700 focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
            </div>
            {method === 'third_party' && (
              <div>
                <label className="block text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">Paid to Courier</label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-stone-400">{currencySymbol}</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={order.deliveryFee ?? ''}
                    onChange={(e) => updateOrder(order.id, 'deliveryFee', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-stone-700 focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

/**
 * One order's editable row — item, quantity, customer name/phone, and its
 * actions (delivery details, fulfill, delete). Extracted so the same row
 * renders identically whether it stands alone or sits nested inside a
 * multi-item order's clustered container (see the orderGroupId clustering
 * in OrdersView below) — one implementation, not two copies to keep in sync.
 */
const OrderRow: React.FC<{
  order: Order;
  menu: MenuItem[];
  updateOrder: (id: string, field: keyof Order, value: any) => void;
  fulfillOrder: (order: Order) => void;
  deleteOrder: (id: string) => void;
  expandedOrderIds: Set<string>;
  toggleDeliveryDetails: (orderId: string) => void;
  currencySymbol: string;
}> = ({ order, menu, updateOrder, fulfillOrder, deleteOrder, expandedOrderIds, toggleDeliveryDetails, currencySymbol }) => {
  // Stock available for a given menu item, from this order's point of view:
  // its own current item gets its already-claimed quantity added back in,
  // since that's this same order's claim being resized, not new stock.
  const availableFor = (item: MenuItem) => (item.finishedGoodsStock ?? 0) + (item.id === order.menuItemId ? order.quantity : 0);
  const currentItem = menu.find(m => m.id === order.menuItemId);
  const maxQty = currentItem ? availableFor(currentItem) : undefined;

  return (
    <div className="group p-3 bg-stone-50/50 rounded-xl border border-stone-100 hover:border-primary/20 transition-all">
      {/* Mobile: stacked card layout */}
      <div className="flex flex-col gap-2 sm:hidden">
        <select
          value={order.menuItemId || ''}
          onChange={(e) => updateOrder(order.id, 'menuItemId', e.target.value)}
          className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-sm font-bold text-stone-700 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none shadow-sm"
        >
          <option value="" disabled>Select Item</option>
          {menu.map(m => <option key={m.id} value={m.id}>{m.emoji ? `${m.emoji} ` : ''}{m.name} ({availableFor(m)} in stock)</option>)}
        </select>
        <div className="flex items-center gap-2">
          <input
            type="number" min="1" max={maxQty}
            value={order.quantity ?? 0}
            onChange={(e) => updateOrder(order.id, 'quantity', parseInt(e.target.value) || 0)}
            className="w-20 bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-stone-700 focus:ring-2 focus:ring-primary/20 outline-none shadow-sm text-center"
          />
          <button
            onClick={() => toggleDeliveryDetails(order.id)}
            className="p-2.5 text-stone-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-colors shrink-0"
            title="Delivery details"
          >
            <MapPin size={18} fill={order.deliveryMethod && order.deliveryMethod !== 'pickup' ? 'currentColor' : 'none'} />
          </button>
          {!order.fulfilled ? (
            <button
              onClick={() => fulfillOrder(order)}
              className="p-2.5 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors shrink-0"
              title="Mark Fulfilled"
            >
              <CheckCircle2 size={18} />
            </button>
          ) : (
            <span className="p-2.5 text-emerald-500 shrink-0" title="Order fulfilled">
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
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={order.customerName || ''}
            onChange={(e) => updateOrder(order.id, 'customerName', e.target.value)}
            placeholder="Customer name"
            className="flex-1 bg-white border border-stone-200 rounded-xl px-3 py-2 text-sm font-medium text-stone-700 focus:ring-2 focus:ring-primary/20 outline-none shadow-sm"
          />
          <input
            type="text"
            value={order.customerPhone || ''}
            onChange={(e) => updateOrder(order.id, 'customerPhone', e.target.value)}
            placeholder="Phone"
            className="w-28 bg-white border border-stone-200 rounded-xl px-3 py-2 text-sm font-medium text-stone-700 focus:ring-2 focus:ring-primary/20 outline-none shadow-sm"
          />
        </div>
        {expandedOrderIds.has(order.id) && (
          <DeliveryDetailsSection order={order} updateOrder={updateOrder} currencySymbol={currencySymbol} />
        )}
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
            {menu.map(m => <option key={m.id} value={m.id}>{m.emoji ? `${m.emoji} ` : ''}{m.name} ({availableFor(m)} in stock)</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <input
            type="number" min="1" max={maxQty}
            value={order.quantity ?? 0}
            onChange={(e) => updateOrder(order.id, 'quantity', parseInt(e.target.value) || 0)}
            className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-sm font-mono font-bold text-stone-700 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none shadow-sm transition-all"
          />
        </div>
        <div className="col-span-2">
          <input
            type="text"
            value={order.customerName || ''}
            onChange={(e) => updateOrder(order.id, 'customerName', e.target.value)}
            placeholder="No name"
            className="w-full bg-stone-50 border border-stone-100 rounded-xl px-3 py-2 text-sm font-medium text-stone-700 focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white outline-none transition-all"
          />
        </div>
        <div className="col-span-2">
          <input
            type="text"
            value={order.customerPhone || ''}
            onChange={(e) => updateOrder(order.id, 'customerPhone', e.target.value)}
            placeholder="No phone"
            className="w-full bg-stone-50 border border-stone-100 rounded-xl px-3 py-2 text-sm font-medium text-stone-700 focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white outline-none transition-all"
          />
        </div>
        <div className="col-span-2 flex justify-end gap-1">
          <button
            onClick={() => toggleDeliveryDetails(order.id)}
            className={`transition-colors p-2 rounded-xl ${order.deliveryMethod && order.deliveryMethod !== 'pickup' ? 'text-primary bg-primary/5' : 'text-stone-300 hover:text-primary hover:bg-primary/5 opacity-0 group-hover:opacity-100'}`}
            title="Delivery details"
          >
            <MapPin size={18} fill={order.deliveryMethod && order.deliveryMethod !== 'pickup' ? 'currentColor' : 'none'} />
          </button>
          {!order.fulfilled ? (
            <button
              onClick={() => fulfillOrder(order)}
              className="text-stone-300 hover:text-emerald-500 transition-colors p-2 hover:bg-emerald-50 rounded-xl opacity-0 group-hover:opacity-100"
              title="Mark Fulfilled"
            >
              <CheckCircle2 size={18} />
            </button>
          ) : (
            <span className="text-emerald-500 p-2" title="Order fulfilled">
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
      {expandedOrderIds.has(order.id) && (
        <div className="hidden sm:block">
          <DeliveryDetailsSection order={order} updateOrder={updateOrder} currencySymbol={currencySymbol} />
        </div>
      )}
    </div>
  );
};

export const OrdersView: React.FC<AppViewProps> = (props) => {
  // Which orders currently have their "Delivery Details" section expanded.
  // Purely local, ephemeral UI state — not persisted, so it doesn't need to
  // go through the app-wide props like the actual order data does.
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());
  const toggleDeliveryDetails = (orderId: string) => {
    setExpandedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
      return next;
    });
  };

  // Destructure all props to make variables available in the scope
  const { patchMaterial, setRestockExpiryDate, shopifyStatus, importShopifyOrders, isImportingShopify, odooStatus, importOdooOrders, isImportingOdoo,
    materials, setMaterials, categories, setCategories, menu, setMenu, orders, setOrders,
    experiments, setExperiments, productionRuns, setProductionRuns, wastageLogs, setWastageLogs,
    isProductionRunModalOpen, setIsProductionRunModalOpen, productionFilterRecipe, setProductionFilterRecipe,
    productionFilterPurpose, setProductionFilterPurpose, activeTab, setActiveTab, activeSettingsTab,
    setActiveSettingsTab, currency, setCurrency, summaryRange, setSummaryRange, summaryDateStart,
    setSummaryDateStart, summaryDateEnd, setSummaryDateEnd, orderDate, setOrderDate, orderFilterStart,
    setOrderFilterStart, orderFilterEnd, setOrderFilterEnd,
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
    deleteProductionRun, handleDiscardBatch, fulfillOrder, updateOrder, deleteOrder, resetOrders, saveSettings,
    isAddOrderModalOpen, setIsAddOrderModalOpen,
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

                  {/* Add Order Button — handles both a single item and several at once */}
                  <button
                    onClick={() => setIsAddOrderModalOpen(true)}
                    disabled={menu.length === 0}
                    title="Add a customer order — one item or several, with customer details"
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
                          onClick={() => setIsAddOrderModalOpen(true)}
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
                            {(() => {
                              const clusters = clusterOrdersByGroup(byDate[date]);

                              return clusters.map(cluster => cluster.type === 'single' ? (
                                <OrderRow
                                  key={cluster.order.id}
                                  order={cluster.order}
                                  menu={menu}
                                  updateOrder={updateOrder}
                                  fulfillOrder={fulfillOrder}
                                  deleteOrder={deleteOrder}
                                  expandedOrderIds={expandedOrderIds}
                                  toggleDeliveryDetails={toggleDeliveryDetails}
                                  currencySymbol={currency.symbol}
                                />
                              ) : (
                                <div key={cluster.groupId} className="border-2 border-primary/15 rounded-xl overflow-hidden">
                                  <div className="flex items-center justify-between px-3 py-2 bg-primary/5 border-b border-primary/10">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <ShoppingBag size={13} className="text-primary shrink-0" />
                                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary truncate">
                                        Order ({cluster.orders.length} items){cluster.orders[0].customerName ? ` — ${cluster.orders[0].customerName}` : ''}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {cluster.orders.some(o => !o.fulfilled) && (
                                        <button
                                          onClick={() => cluster.orders.forEach(o => { if (!o.fulfilled) fulfillOrder(o); })}
                                          title="Fulfill every item in this order"
                                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest text-emerald-600 hover:bg-emerald-50 transition-colors"
                                        >
                                          <CheckCircle2 size={13} /> Fulfill All
                                        </button>
                                      )}
                                      <button
                                        onClick={() => {
                                          if (window.confirm(`Delete this whole order? This removes all ${cluster.orders.length} items.`)) {
                                            cluster.orders.forEach(o => deleteOrder(o.id));
                                          }
                                        }}
                                        title="Delete every item in this order"
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest text-rose-500 hover:bg-rose-50 transition-colors"
                                      >
                                        <Trash2 size={13} /> Delete All
                                      </button>
                                    </div>
                                  </div>
                                  <div className="p-2 space-y-2 bg-white">
                                    {cluster.orders.map(order => (
                                      <OrderRow
                                        key={order.id}
                                        order={order}
                                        menu={menu}
                                        updateOrder={updateOrder}
                                        fulfillOrder={fulfillOrder}
                                        deleteOrder={deleteOrder}
                                        expandedOrderIds={expandedOrderIds}
                                        toggleDeliveryDetails={toggleDeliveryDetails}
                                        currencySymbol={currency.symbol}
                                      />
                                    ))}
                                  </div>
                                </div>
                              ));
                            })()}
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
