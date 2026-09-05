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


export const ExperimentsView: React.FC<AppViewProps> = (props) => {
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
              key="experiments"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8 pb-20"
            >
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
                <div>
                  <h2 className="text-3xl font-sans font-bold text-stone-800">R&D</h2>
                  <p className="text-stone-500 text-sm italic font-sans">Log your daily experiments and track material usage.</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
                  
                  <button 
                    onClick={addExperiment}
                    className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-primary/20 transform active:scale-95"
                  >
                    <Plus size={18} />
                    New R&D Session
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {[...experiments].sort((a,b) => b.date.localeCompare(a.date)).map((exp) => (
                  <div key={exp.id} className="bg-white rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm overflow-hidden p-8 space-y-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 max-w-md">
                        <input 
                          type="text" 
                          value={exp.name}
                          onChange={(e) => updateExperiment(exp.id, 'name', e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-0 text-2xl font-sans font-bold text-stone-800 p-0"
                          placeholder="Experiment Name"
                        />
                        <textarea 
                          value={exp.notes || ''}
                          onChange={(e) => updateExperiment(exp.id, 'notes', e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-0 text-sm text-stone-500 italic font-sans p-0 mt-1 resize-none h-12"
                          placeholder="Add notes about this experiment..."
                        />
                      </div>
                      <button 
                        onClick={() => deleteExperiment(exp.id)}
                        className="text-stone-300 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50 rounded-xl"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                        <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Materials Used</h4>
                        <div className="flex items-center gap-2">
                          <select 
                            onChange={(e) => {
                              if (e.target.value) {
                                addMaterialToExperiment(exp.id, e.target.value);
                                e.target.value = '';
                              }
                            }}
                            className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-1 text-xs font-bold text-stone-600 outline-none focus:ring-2 focus:ring-primary/20"
                          >
                            <option value="">+ Add Material</option>
                            {materials.map(m => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {exp.materials.map((req, idx) => {
                          const mat = materials.find(m => m.id === req.materialId);
                          return (
                            <div key={idx} className="flex items-center gap-3 bg-stone-50/50 p-4 rounded-xl border border-stone-100 group">
                              <div className="flex-1">
                                <div className="text-[10px] font-bold text-stone-800 uppercase tracking-widest truncate">{mat?.name || 'Unknown'}</div>
                                <div className="flex items-center gap-2 mt-1">
                                  <input 
                                    type="number" 
                                    value={req.amount}
                                    onChange={(e) => updateExperimentMaterial(exp.id, req.materialId, parseFloat(e.target.value) || 0)}
                                    className="w-20 bg-white border border-stone-200 rounded-lg px-2 py-1 text-sm font-mono font-bold text-stone-700 outline-none focus:ring-2 focus:ring-primary/20"
                                  />
                                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{req.unit}</span>
                                </div>
                              </div>
                              <button 
                                onClick={() => removeMaterialFromExperiment(exp.id, req.materialId)}
                                className="text-stone-300 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50 rounded-xl opacity-100 md:opacity-0 md:group-hover:opacity-100"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}

                {experiments.filter(e => e.date === orderDate).length === 0 && (
                  <div className="text-center py-20 bg-white rounded-[10px] sm:rounded-[15px] border-2 border-dashed border-stone-100">
                    <div className="w-20 h-20 bg-stone-50 rounded-[10px] sm:rounded-[15px] shadow-sm border border-stone-100 flex items-center justify-center mx-auto mb-6 text-stone-200">
                      <FlaskConical size={40} />
                    </div>
                    <h3 className="text-xl font-sans font-bold text-stone-800 mb-2">No R&D sessions logged</h3>
                    <p className="text-stone-500 text-sm mb-8 italic font-sans">Track your R&D and recipe testing costs.</p>
                    <button 
                      onClick={addExperiment}
                      className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-primary/20 transform active:scale-95"
                    >
                      <Plus size={18} />
                      Log First R&D Session
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
  );
};
