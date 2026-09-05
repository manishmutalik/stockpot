import React, { useMemo } from 'react';
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


export const SummaryView: React.FC<AppViewProps> = (props) => {
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
    summaryRefDate, expandedRecipeId, setExpandedRecipeId, inventorySortBy,
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
    handleRestock, restockMaterial, setRestockMaterial,
    showSaveFeedback, saveDay,
    updateCurrency, handleLogout, isListening, transcript, convertAmount
  } = props;

  // Derived, date-range-filtered views used by the summary cards below.
  // Mirrors the same `date >= start && date <= end` filtering pattern used
  // elsewhere in the app (e.g. App.tsx's own order/production filtering).
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

  return (
    <motion.div
              key="summary"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8 pb-20"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                  <h2 className="text-3xl font-sans font-bold text-stone-800">Performance Summary</h2>
                  <p className="text-stone-500 text-sm italic font-sans">Financials and inventory usage for the selected period.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 bg-stone-100/50 p-1 rounded-xl border border-stone-200/50">
                  {(['daily', 'weekly', 'monthly', 'custom'] as const).map((range) => (
                    <button
                      key={range}
                      onClick={() => handleRangeChange(range)}
                      className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                        summaryRange === range 
                          ? 'bg-white text-primary shadow-sm' 
                          : 'text-stone-400 hover:text-stone-600'
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>

              {(materials.length === 0 || menu.length === 0 || orders.length === 0) && (
                <div className="bg-white p-6 md:p-8 rounded-[10px] sm:rounded-[15px] border border-amber-200/50 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-bl-full -mr-16 -mt-16 z-0" />
                  <div className="relative z-10">
                    <h3 className="text-xl font-bold text-stone-800 mb-2">Welcome to Stockpot! 👋</h3>
                    <p className="text-stone-500 text-sm mb-8">Let's get your business set up in 3 simple steps:</p>
                    
                    <div className="space-y-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg transition-colors ${materials.length > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-stone-100 text-stone-400'}`}>
                          {materials.length > 0 ? '✓' : '1'}
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-stone-700">Add Materials</div>
                          <div className="text-xs text-stone-500">Add ingredients to your stock (Stock tab)</div>
                        </div>
                        {materials.length === 0 && <button onClick={() => setActiveTab('inventory')} className="text-xs uppercase font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 px-4 py-2 rounded-xl transition-colors">Go</button>}
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg transition-colors ${menu.length > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-stone-100 text-stone-400'}`}>
                          {menu.length > 0 ? '✓' : '2'}
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-stone-700">Build Recipes</div>
                          <div className="text-xs text-stone-500">Create products with costs attached (Recipes tab)</div>
                        </div>
                        {menu.length === 0 && materials.length > 0 && <button onClick={() => setActiveTab('menu')} className="text-xs uppercase font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 px-4 py-2 rounded-xl transition-colors">Go</button>}
                      </div>

                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg transition-colors ${orders.length > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-stone-100 text-stone-400'}`}>
                          {orders.length > 0 ? '✓' : '3'}
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-stone-700">Log an Order</div>
                          <div className="text-xs text-stone-500">Record a sale to track your profit (Orders tab)</div>
                        </div>
                        {orders.length === 0 && menu.length > 0 && <button onClick={() => setActiveTab('orders')} className="text-xs uppercase font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 px-4 py-2 rounded-xl transition-colors">Go</button>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {summaryRange !== 'custom' && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm">
                  <div className="flex items-center gap-3 text-stone-400 text-[10px] font-bold uppercase tracking-widest">
                    <Clock size={16} className="text-primary/40" />
                    <span>Period: <span className="text-stone-600">{summaryDateStart}</span> to <span className="text-stone-600">{summaryDateEnd}</span></span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-stone-50 border border-stone-100 rounded-xl p-1">
                      <button 
                        onClick={() => {
                          const d = new Date(summaryRefDate);
                          if (summaryRange === 'daily') d.setDate(d.getDate() - 1);
                          else if (summaryRange === 'weekly') d.setDate(d.getDate() - 7);
                          else if (summaryRange === 'monthly') d.setMonth(d.getMonth() - 1);
                          handleRangeChange(summaryRange, d.toISOString().split('T')[0]);
                        }}
                        className="p-2 text-stone-400 hover:text-primary hover:bg-white rounded-lg transition-all shadow-sm"
                      >
                        <ArrowLeft size={16} />
                      </button>
                      <div className="flex items-center gap-2 px-3">
                        <Calendar size={14} className="text-primary/40" />
                        <input 
                          type="date" 
                          value={summaryRefDate}
                          onChange={(e) => handleRangeChange(summaryRange, e.target.value)}
                          className="bg-transparent border-none focus:ring-0 text-sm font-bold text-stone-700 p-0 cursor-pointer"
                        />
                      </div>
                      <button 
                        onClick={() => {
                          const d = new Date(summaryRefDate);
                          if (summaryRange === 'daily') d.setDate(d.getDate() + 1);
                          else if (summaryRange === 'weekly') d.setDate(d.getDate() + 7);
                          else if (summaryRange === 'monthly') d.setMonth(d.getMonth() + 1);
                          handleRangeChange(summaryRange, d.toISOString().split('T')[0]);
                        }}
                        className="p-2 text-stone-400 hover:text-primary hover:bg-white rounded-lg transition-all shadow-sm"
                      >
                        <ArrowRight size={16} />
                      </button>
                    </div>
                    <button 
                      onClick={() => handleRangeChange(summaryRange, new Date().toISOString().split('T')[0])}
                      className="text-[10px] font-bold text-primary uppercase tracking-widest hover:text-primary-dark transition-colors px-2"
                    >
                      Today
                    </button>
                  </div>
                </div>
              )}

              {summaryRange === 'custom' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="flex flex-wrap items-center gap-3 sm:gap-6 bg-white p-5 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">From</span>
                    <input 
                      type="date" 
                      value={summaryDateStart}
                      onChange={(e) => setSummaryDateStart(e.target.value)}
                      className="bg-stone-50 border border-stone-100 rounded-xl px-4 py-2 text-sm font-bold text-stone-700 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">To</span>
                    <input 
                      type="date" 
                      value={summaryDateEnd}
                      onChange={(e) => setSummaryDateEnd(e.target.value)}
                      className="bg-stone-50 border border-stone-100 rounded-xl px-4 py-2 text-sm font-bold text-stone-700 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                </motion.div>
              )}

              {/* Charts Section */}
              <div className="bg-white p-8 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm space-y-8">
                <div className="flex items-center justify-between border-b border-stone-100 pb-6">
                  <div className="flex items-center gap-4">
                    <div className="bg-emerald-500/10 p-3 rounded-xl text-emerald-600">
                      <TrendingUp size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-sans font-bold text-stone-800">Financial Trends</h3>
                      <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold mt-0.5">Revenue vs Expenses vs Profitability</p>
                    </div>
                  </div>
                </div>

                <div className="h-[350px] w-full">
                  {chartData.every(d => d.income === 0 && d.expenses === 0 && d.profit === 0) ? (
                    <div className="h-full w-full flex flex-col items-center justify-center text-stone-400 bg-stone-50/50 rounded-xl border border-dashed border-stone-200">
                      <Calculator size={48} className="mb-4 text-stone-200" />
                      <p className="font-sans italic">No financial data for this period.</p>
                    </div>
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8B5E3C" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#8B5E3C" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#a8a29e', fontWeight: 700 }}
                        dy={15}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#a8a29e', fontWeight: 700 }}
                        tickFormatter={(value) => `${currency.symbol}${value}`}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#fff', 
                          borderRadius: '24px', 
                          border: '1px solid #f5f5f4',
                          boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.05)',
                          fontSize: '12px',
                          fontWeight: 700,
                          padding: '16px'
                        }}
                        itemStyle={{ padding: '4px 0' }}
                        cursor={{ stroke: '#e7e5e4', strokeWidth: 2 }}
                      />
                      <Legend 
                        verticalAlign="top" 
                        align="right" 
                        height={48}
                        iconType="circle"
                        wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#78716c' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="income" 
                        stroke="#10b981" 
                        strokeWidth={4}
                        fillOpacity={1} 
                        fill="url(#colorIncome)" 
                        name="Income"
                      />
                      <Area 
                        type="monotone" 
                        dataKey="expenses" 
                        stroke="#f43f5e" 
                        strokeWidth={4}
                        fillOpacity={1} 
                        fill="url(#colorExpenses)" 
                        name="Expenses"
                      />
                      <Area 
                        type="monotone" 
                        dataKey="profit" 
                        stroke="#8B5E3C" 
                        strokeWidth={4}
                        fillOpacity={1} 
                        fill="url(#colorProfit)" 
                        name="Profit"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-8 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm group hover:shadow-md transition-all">
                  <div className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mb-3">Total Income</div>
                  <div className="text-4xl font-sans font-bold text-emerald-600">{currency.symbol}{financials.income}</div>
                  <div className="text-[10px] text-stone-400 mt-2 uppercase font-bold tracking-wider">From {filteredOrders.reduce((acc, o) => acc + o.quantity, 0)} items sold</div>
                </div>
                <div className="bg-white p-8 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm group hover:shadow-md transition-all">
                  <div className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mb-3">Cost of Goods Sold</div>
                  <div className="text-4xl font-sans font-bold text-rose-600">{currency.symbol}{financials.orderExpenses.toFixed(2)}</div>
                  <div className="text-[10px] text-stone-400 mt-2 uppercase font-bold tracking-wider">
                    Cost of fulfilled orders
                  </div>
                </div>
                <div className="bg-amber-50 p-8 rounded-[10px] sm:rounded-[15px] border border-amber-100 shadow-sm group hover:shadow-md transition-all">
                  <div className="text-amber-600/70 text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Factory size={11} /> Production Cost
                  </div>
                  <div className="text-4xl font-sans font-bold text-amber-700">{currency.symbol}{totalProductionCost.toFixed(2)}</div>
                  <div className="text-[10px] text-amber-500 mt-2 uppercase font-bold tracking-wider">
                    {filteredProductionRuns.length} run{filteredProductionRuns.length !== 1 ? 's' : ''} in period
                  </div>
                </div>
                <div className="bg-primary/5 p-8 rounded-[10px] sm:rounded-[15px] border border-primary/20 shadow-lg shadow-primary/5 group hover:shadow-primary/10 transition-all">
                  <div className="text-primary/60 text-[10px] font-bold uppercase tracking-widest mb-3">Net Profit</div>
                  <div className="text-4xl font-sans font-bold text-primary">{currency.symbol}{financials.profit.toFixed(2)}</div>
                  <div className="text-[10px] text-primary/40 mt-2 uppercase font-bold tracking-wider">
                    {financials.income > 0 ? `${((financials.profit / financials.income) * 100).toFixed(1)}% margin` : 'No sales yet'}
                    {financials.experimentExpenses > 0 && <span className="block mt-1">Operating Exp: {currency.symbol}{financials.experimentExpenses.toFixed(2)} R&amp;D</span>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-white p-8 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm">
                  <div className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mb-3">Orders in Period</div>
                  <div className="text-4xl font-sans font-bold text-stone-800">{filteredOrders.length}</div>
                  <div className="text-[10px] text-stone-400 mt-2 uppercase font-bold tracking-wider">{filteredOrders.reduce((acc, o) => acc + o.quantity, 0)} items sold</div>
                </div>
                <div className="bg-white p-8 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm">
                  <div className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mb-3">Items on Menu</div>
                  <div className="text-4xl font-sans font-bold text-stone-800">{menu.length}</div>
                </div>
                <div className="bg-white p-8 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm">
                  <div className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mb-3">Dates with Data</div>
                  <div className="text-4xl font-sans font-bold text-stone-800">
                    {[...new Set(orders.map(o => o.date))].length}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full min-w-[500px] text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50/50 border-b border-stone-100">
                      <th className="px-8 py-5 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Material</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Initial Stock</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Used in Period</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Current Stock</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50">
                    {(['raw', 'packaging'] as const).map((cat) => {
                      const categoryItems = remainingInventory.filter(i => i.category === cat);
                      if (categoryItems.length === 0) return null;

                      return (
                        <React.Fragment key={cat}>
                          <tr className="bg-stone-50/30">
                            <td colSpan={5} className="px-8 py-3 text-[10px] font-bold text-primary/60 uppercase tracking-widest bg-primary/5">
                              {cat === 'raw' ? 'Raw Materials' : 'Packaging Materials'}
                            </td>
                          </tr>
                          {categoryItems.map((item) => {
                            const isLow = item.currentStock <= (item.minStock || 0);
                            return (
                              <tr key={item.id} className="group hover:bg-stone-50/50 transition-colors">
                                <td className="px-8 py-5">
                                  <div className="font-sans font-bold text-stone-800">{item.name}</div>
                                  <div className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">{item.unit}</div>
                                </td>
                                <td className="px-8 py-5 font-mono text-sm text-stone-600">
                                  {item.initialStock.toFixed(2)}
                                </td>
                                <td className="px-8 py-5 font-mono text-sm text-stone-600">
                                  {item.usedInPeriod.toFixed(2)}
                                </td>
                                <td className="px-8 py-5">
                                  <div className={`font-mono text-sm font-bold ${isLow ? 'text-rose-600' : 'text-stone-800'}`}>
                                    {item.currentStock.toFixed(2)}
                                  </div>
                                </td>
                                <td className="px-8 py-5 text-right">
                                  {isLow ? (
                                    <span className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-600 text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border border-rose-100">
                                      <AlertCircle size={10} />
                                      Low Stock
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-600 text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border border-emerald-100">
                                      <Check size={10} />
                                      Healthy
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            </motion.div>
  );
};
