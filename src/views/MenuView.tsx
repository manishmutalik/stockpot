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


export const MenuView: React.FC<AppViewProps> = (props) => {
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
    deleteProductionRun, handleDiscardBatch, addOrder, updateOrder, deleteOrder, resetOrders, saveSettings,
    handleRestock, restockMaterial, setRestockMaterial,
    showSaveFeedback, saveDay,
    updateCurrency, handleLogout, isListening, transcript, convertAmount
  } = props;

  return (
    <motion.div
              key="menu"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-sans font-bold text-stone-800">Menu & Recipes</h2>
                  <p className="text-stone-500 text-sm font-sans italic">Define how much of each material is used per item.</p>
                </div>
                <button 
                  onClick={addMenuItem}
                  className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-primary/20 transform active:scale-95"
                >
                  <Plus size={18} />
                  Add Menu Item
                </button>
              </div>

              <div className="grid gap-6">
                {menu.map((item) => (
                  <div key={item.id} className="bg-white rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm overflow-hidden transition-all hover:shadow-md">
                    <div className="px-6 py-5 bg-stone-50/50 border-b border-stone-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="relative w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-2xl shrink-0 overflow-hidden cursor-text hover:bg-primary/20 transition-colors">
                          <input 
                            type="text"
                            maxLength={2}
                            value={item.emoji || ''}
                            onChange={(e) => updateMenuItemField(item.id, 'emoji', e.target.value)}
                            className="absolute inset-0 w-full h-full text-center bg-transparent outline-none z-10 cursor-text"
                          />
                          {!item.emoji && <Utensils size={24} className="opacity-50 absolute pointer-events-none" />}
                        </div>
                        <div className="flex-1">
                          <input 
                            type="text" 
                            value={item.name || ''}
                            onChange={(e) => updateMenuItem(item.id, e.target.value)}
                            className="bg-transparent border-none focus:ring-0 font-sans font-bold text-stone-800 text-xl p-0 w-full"
                            placeholder="Item Name"
                          />
                          <div className="flex items-center gap-3 mt-1">
                            {(() => {
                              const cost = item.recipe.reduce((total, req) => {
                                const mat = materials.find(m => m.id === req.materialId);
                                if (!mat) return total;
                                const convertedAmount = convertAmount(req.amount, req.unit || 'g', mat.unit);
                                return total + (convertedAmount * (mat.costPerUnit || 0));
                              }, 0);
                              const margin = item.sellingPrice > 0 ? ((item.sellingPrice - cost) / item.sellingPrice) * 100 : 0;
                              
                              return (
                                <>
                                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                                    Cost: {currency.symbol}{cost.toFixed(2)}
                                  </span>
                                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${margin >= 60 ? 'bg-emerald-50 text-emerald-600' : margin >= 40 ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>
                                    {item.sellingPrice < cost ? `LOSS (${margin.toFixed(0)}%)` : `${margin.toFixed(0)}% Margin`}
                                  </span>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-4 py-2 shadow-sm">
                              <span className="text-stone-400 text-sm font-bold">{currency.symbol}</span>
                              <input 
                                type="number" 
                                step="0.01"
                                value={item.sellingPrice ?? 0}
                                onChange={(e) => updateMenuItemField(item.id, 'sellingPrice', parseFloat(e.target.value) || 0)}
                                className="w-16 bg-transparent border-none focus:ring-0 text-lg font-bold text-stone-700 p-0"
                                placeholder="Price"
                              />
                              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Sale</span>
                            </div>
                            <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-3 py-2 shadow-sm" title="Shelf Life (Days)">
                              <input 
                                type="number" 
                                value={item.shelfLifeDays || ''}
                                onChange={(e) => updateMenuItemField(item.id, 'shelfLifeDays', parseInt(e.target.value) || undefined)}
                                className="w-8 bg-transparent border-none focus:ring-0 text-lg font-bold text-stone-700 p-0 text-center"
                                placeholder="-"
                              />
                              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Days</span>
                            </div>
                          </div>
                          {(() => {
                            const cost = item.recipe.reduce((total, req) => {
                              const mat = materials.find(m => m.id === req.materialId);
                              if (!mat) return total;
                              const convertedAmount = convertAmount(req.amount, req.unit || 'g', mat.unit);
                              return total + (convertedAmount * (mat.costPerUnit || 0));
                            }, 0);
                            const suggested = cost * 3.5;
                            
                            return (
                              <button 
                                onClick={() => updateMenuItemField(item.id, 'sellingPrice', parseFloat(suggested.toFixed(2)))}
                                className="text-[9px] font-bold text-primary uppercase tracking-widest hover:text-primary-dark transition-colors"
                                title="Apply 3.5x markup suggestion"
                              >
                                Suggest: {currency.symbol}{suggested.toFixed(2)}
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 md:border-l border-stone-200 md:pl-4 md:ml-4">
                        <button 
                          onClick={() => setExpandedRecipeId(expandedRecipeId === item.id ? null : item.id)}
                          title={expandedRecipeId === item.id ? "Close Editor" : "Edit Recipe"}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                            expandedRecipeId === item.id 
                              ? 'bg-stone-800 text-white shadow-lg' 
                              : 'bg-white text-stone-600 border border-stone-200 hover:border-primary hover:text-primary shadow-sm'
                          }`}
                        >
                          {expandedRecipeId === item.id ? <Check size={16} /> : <Edit2 size={16} />}
                          <span>{expandedRecipeId === item.id ? "Done" : "Recipe"}</span>
                        </button>
                        <button 
                          onClick={() => copyMenuItem(item)}
                          title="Duplicate Recipe"
                          className="text-stone-400 hover:text-emerald-600 transition-colors p-2 hover:bg-emerald-50 rounded-xl"
                        >
                          <Copy size={18} />
                        </button>
                        <button 
                          onClick={() => deleteMenuItem(item.id)}
                          title="Delete Recipe"
                          className="text-stone-400 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50 rounded-xl"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    <AnimatePresence>
                      {expandedRecipeId === item.id && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden bg-stone-50/30"
                        >
                          <div className="p-4 sm:p-8 space-y-6 sm:space-y-8 border-t border-stone-100">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                              <div className="flex items-center gap-4">
                                <div className="p-3 bg-white rounded-xl shadow-sm border border-stone-100">
                                  <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Recipe Cost</h4>
                                  <div className="flex items-center gap-1.5 text-primary">
                                    <span className="text-sm font-bold">{currency.symbol}</span>
                                    <span className="text-xl font-mono font-bold">
                                      {item.recipe.reduce((total, req) => {
                                        const mat = materials.find(m => m.id === req.materialId);
                                        if (!mat) return total;
                                        const convertedAmount = convertAmount(req.amount, req.unit || 'g', mat.unit);
                                        return total + (convertedAmount * (mat.costPerUnit || 0));
                                      }, 0).toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0">
                                <button
                                  onClick={() => {
                                    setActiveRecipeItemId(item.id);
                                    setIsIngredientSelectorOpen(true);
                                  }}
                                  className="flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-primary/20 hover:bg-primary/20 transition-all shadow-sm active:scale-95"
                                >
                                  <Sparkles size={14} />
                                  Quick Add
                                </button>
                                {categories.map(cat => (
                                  <button 
                                    key={cat}
                                    onClick={() => addIngredientToRecipe(item.id, cat)}
                                    className="flex items-center gap-2 bg-white hover:bg-stone-50 text-stone-700 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-stone-200 transition-all shadow-sm active:scale-95"
                                  >
                                    <Plus size={14} className="text-primary" />
                                    Add {cat}
                                  </button>
                                ))}
                              </div>
                            </div>
                            
                            <div className="grid md:grid-cols-2 gap-8">
                              {/* Ingredients Section */}
                              <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                                    <Utensils size={14} className="text-primary" />
                                    <span>Ingredients</span>
                                  </div>
                                  <span className="text-[10px] font-bold text-stone-300 uppercase tracking-widest">
                                    {item.recipe.filter(req => materials.find(m => m.id === req.materialId)?.category !== 'Packaging Materials').length} Items
                                  </span>
                                </div>
                                <div className="space-y-3">
                                  {item.recipe.map((req, idx) => {
                                    const mat = materials.find(m => m.id === req.materialId);
                                    if (mat?.category === 'Packaging Materials') return null;
                                    
                                    const convertedAmount = convertAmount(req.amount, req.unit || 'g', mat?.unit || 'g');
                                    const ingredientCost = convertedAmount * (mat?.costPerUnit || 0);
                                    
                                    return (
                                      <div key={idx} className="group flex items-center gap-3 bg-white p-4 rounded-xl border border-stone-100 shadow-sm transition-all hover:border-primary/20">
                                        <div className="flex-1">
                                          <select 
                                            value={req.materialId || ''}
                                            onChange={(e) => updateRecipeIngredient(item.id, idx, 'materialId', e.target.value)}
                                            className="w-full bg-transparent border-none focus:ring-0 text-sm font-bold text-stone-700 p-0"
                                          >
                                            {categories.filter(c => c !== 'Packaging Materials').map(cat => (
                                              <optgroup key={cat} label={cat}>
                                                {materials.filter(m => m.category === cat).map(m => (
                                                  <option key={m.id} value={m.id}>{m.name}</option>
                                                ))}
                                              </optgroup>
                                            ))}
                                          </select>
                                          <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">
                                            Cost: {currency.symbol}{ingredientCost.toFixed(2)}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 bg-stone-50 rounded-xl px-2 py-1">
                                          <input 
                                            type="number" 
                                            value={req.amount ?? 0}
                                            onChange={(e) => updateRecipeIngredient(item.id, idx, 'amount', parseFloat(e.target.value) || 0)}
                                            className="w-16 bg-transparent border-none focus:ring-0 text-sm font-mono font-bold text-stone-700 p-1 text-right"
                                          />
                                          <select 
                                            value={req.unit || 'g'}
                                            onChange={(e) => updateRecipeIngredient(item.id, idx, 'unit', e.target.value)}
                                            className="bg-transparent border-none focus:ring-0 text-[10px] font-bold text-stone-400 uppercase tracking-widest p-0"
                                          >
                                            <option value="g">g</option>
                                            <option value="kg">kg</option>
                                            <option value="ml">ml</option>
                                            <option value="l">l</option>
                                            <option value="pcs">pcs</option>
                                          </select>
                                        </div>
                                        <button 
                                          onClick={() => removeIngredientFromRecipe(item.id, idx)}
                                          className="text-stone-300 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50 rounded-xl opacity-100 md:opacity-0 md:group-hover:opacity-100"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </div>
                                    );
                                  })}
                                  {item.recipe.filter(req => materials.find(m => m.id === req.materialId)?.category !== 'Packaging Materials').length === 0 && (
                                    <div className="text-center py-8 border-2 border-dashed border-stone-200 rounded-[10px] sm:rounded-[15px] text-stone-400 text-[10px] uppercase font-bold tracking-widest bg-white/50">
                                      No ingredients added
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Packaging Section */}
                              <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                                    <Package size={14} className="text-primary" />
                                    <span>Packaging</span>
                                  </div>
                                  <span className="text-[10px] font-bold text-stone-300 uppercase tracking-widest">
                                    {item.recipe.filter(req => materials.find(m => m.id === req.materialId)?.category === 'Packaging Materials').length} Items
                                  </span>
                                </div>
                                <div className="space-y-3">
                                  {item.recipe.map((req, idx) => {
                                    const mat = materials.find(m => m.id === req.materialId);
                                    if (mat?.category !== 'Packaging Materials') return null;
                                    
                                    const convertedAmount = convertAmount(req.amount, req.unit || 'g', mat?.unit || 'g');
                                    const ingredientCost = convertedAmount * (mat?.costPerUnit || 0);
                                    
                                    return (
                                      <div key={idx} className="group flex items-center gap-3 bg-white p-4 rounded-xl border border-stone-100 shadow-sm transition-all hover:border-primary/20">
                                        <div className="flex-1">
                                          <select 
                                            value={req.materialId || ''}
                                            onChange={(e) => updateRecipeIngredient(item.id, idx, 'materialId', e.target.value)}
                                            className="w-full bg-transparent border-none focus:ring-0 text-sm font-bold text-stone-700 p-0"
                                          >
                                            <optgroup label="Packaging Materials">
                                              {materials.filter(m => m.category === 'Packaging Materials').map(m => (
                                                <option key={m.id} value={m.id}>{m.name}</option>
                                              ))}
                                            </optgroup>
                                          </select>
                                          <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-1">
                                            Cost: {currency.symbol}{ingredientCost.toFixed(2)}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 bg-stone-50 rounded-xl px-2 py-1">
                                          <input 
                                            type="number" 
                                            value={req.amount ?? 0}
                                            onChange={(e) => updateRecipeIngredient(item.id, idx, 'amount', parseFloat(e.target.value) || 0)}
                                            className="w-16 bg-transparent border-none focus:ring-0 text-sm font-mono font-bold text-stone-700 p-1 text-right"
                                          />
                                          <select 
                                            value={req.unit || 'pcs'}
                                            onChange={(e) => updateRecipeIngredient(item.id, idx, 'unit', e.target.value)}
                                            className="bg-transparent border-none focus:ring-0 text-[10px] font-bold text-stone-400 uppercase tracking-widest p-0"
                                          >
                                            <option value="pcs">pcs</option>
                                            <option value="g">g</option>
                                            <option value="kg">kg</option>
                                            <option value="ml">ml</option>
                                            <option value="l">l</option>
                                          </select>
                                        </div>
                                        <button 
                                          onClick={() => removeIngredientFromRecipe(item.id, idx)}
                                          className="text-stone-300 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50 rounded-xl opacity-100 md:opacity-0 md:group-hover:opacity-100"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </div>
                                    );
                                  })}
                                  {item.recipe.filter(req => materials.find(m => m.id === req.materialId)?.category === 'Packaging Materials').length === 0 && (
                                    <div className="text-center py-8 border-2 border-dashed border-stone-200 rounded-[10px] sm:rounded-[15px] text-stone-400 text-[10px] uppercase font-bold tracking-widest bg-white/50">
                                      No packaging added
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </motion.div>
  );
};
