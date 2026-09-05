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


export const SettingsView: React.FC<AppViewProps> = (props) => {
  // Destructure all props to make variables available in the scope
  const { patchMaterial, setRestockExpiryDate, shopifyStatus, importShopifyOrders, isImportingShopify, odooStatus, importOdooOrders, isImportingOdoo,
    shopifyConfig, shopifyShopInput, setShopifyShopInput,
    isConnectingShopify, connectShopify, disconnectShopify,
    odooUrlInput, setOdooUrlInput, odooDbInput, setOdooDbInput, odooUsernameInput, setOdooUsernameInput,
    odooPasswordInput, setOdooPasswordInput, isConnectingOdoo, connectOdoo, disconnectOdoo,
    updateSettingsField,
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
    updateCurrency, handleLogout, isListening, transcript, convertAmount,
    billing, openBillingPortal, isOpeningPortal
  } = props;

  return (
    <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8 pb-20"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-sans font-bold text-stone-800">Settings</h2>
                  <p className="text-stone-500 text-sm italic font-sans">Manage your business profile, integrations, and preferences.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                  <div className="relative">
                    <select 
                      value={activeSettingsTab}
                      onChange={(e) => setActiveSettingsTab(e.target.value as any)}
                      className="appearance-none bg-white border border-stone-200 rounded-xl px-6 py-3 pr-12 text-sm font-bold uppercase tracking-widest text-stone-700 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm cursor-pointer hover:border-primary/30 w-full sm:w-auto"
                    >
                      <option value="bakery">Business Settings</option>
                      <option value="integrations">Integrations</option>
                      <option value="customisation">App Customisation</option>
                      <option value="account">User Account</option>
                      <option value="categories">Inventory Categories</option>
                    </select>
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-stone-400">
                      <ChevronDown size={18} />
                    </div>
                  </div>
                  <button 
                    onClick={saveSettings}
                    className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-primary/20 transform active:scale-95 w-full sm:w-auto"
                  >
                    <Save size={18} />
                    Save Changes
                  </button>
                </div>
              </div>

              {showSaveFeedback && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-center gap-3 text-emerald-700 shadow-sm"
                >
                  <CheckCircle2 size={20} />
                  <p className="text-sm font-bold uppercase tracking-widest">Settings saved successfully!</p>
                </motion.div>
              )}

              <div className="grid grid-cols-1 gap-8">
                {/* Bakery Settings Section */}
                {activeSettingsTab === 'bakery' && (
                  <div className="bg-white p-4 sm:p-8 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm space-y-8">
                    <div className="flex items-center gap-3 border-b border-stone-100 pb-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Settings2 size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-stone-800 uppercase tracking-widest text-[10px]">Business Profile</h3>
                        <p className="text-[10px] text-stone-400 font-sans italic">Identity and contact information</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Business Name</label>
                        <input 
                          type="text" 
                          value={settings.name}
                          onChange={(e) => updateSettingsField('name', e.target.value)}
                          className="w-full bg-stone-50/50 border border-stone-200 rounded-xl px-5 py-3 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-sans text-lg"
                          placeholder="The Sourdough Loft"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Phone Number</label>
                        <input 
                          type="text" 
                          value={settings.phone}
                          onChange={(e) => updateSettingsField('phone', e.target.value)}
                          className="w-full bg-stone-50/50 border border-stone-200 rounded-xl px-5 py-3 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-sans text-lg"
                          placeholder="+1 (555) 000-0000"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Address</label>
                        <input 
                          type="text" 
                          value={settings.address}
                          onChange={(e) => updateSettingsField('address', e.target.value)}
                          className="w-full bg-stone-50/50 border border-stone-200 rounded-xl px-5 py-3 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-sans text-lg"
                          placeholder="123 Flour St, Bread City"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Integrations Section */}
                {activeSettingsTab === 'integrations' && (
                  <div className="bg-white p-8 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm space-y-8">
                    <div className="flex items-center gap-3 border-b border-stone-100 pb-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Puzzle size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-stone-800 uppercase tracking-widest text-[10px]">Integrations</h3>
                        <p className="text-[10px] text-stone-400 font-sans italic">Connect your tools</p>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className={`p-6 rounded-[10px] sm:rounded-[15px] border transition-all duration-300 ${shopifyStatus.connected ? 'bg-emerald-50/30 border-emerald-100 shadow-sm shadow-emerald-500/5' : 'bg-stone-50/50 border-stone-100'}`}>
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-4">
                            <div className={`w-14 h-14 rounded-xl flex items-center justify-center shadow-sm transition-colors duration-300 ${shopifyStatus.connected ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-stone-100 text-stone-600'}`}>
                              <Store size={28} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-base font-sans font-bold text-stone-800">Shopify Store</h4>
                                {shopifyStatus.connected && (
                                  <span className="flex items-center gap-1 bg-emerald-500 text-white text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full shadow-sm shadow-emerald-500/10">
                                    <Check size={10} />
                                    Connected
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-stone-500 font-sans italic mt-0.5">
                                {shopifyStatus.connected ? `Linked to ${shopifyStatus.shop}.myshopify.com` : 'Sync your online orders automatically'}
                              </p>
                            </div>
                          </div>
                          {shopifyStatus.connected && (
                            <button 
                              onClick={disconnectShopify}
                              className="flex items-center gap-1.5 text-[10px] font-bold text-rose-500 hover:text-rose-600 uppercase tracking-widest transition-colors group"
                            >
                              <LogOut size={14} className="group-hover:-translate-x-0.5 transition-transform" />
                              Disconnect
                            </button>
                          )}
                        </div>

                        {!shopifyStatus.connected ? (
                          <div className="space-y-5">
                            {!shopifyConfig.hasEnvCredentials && (
                              <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-100 rounded-xl">
                                <AlertCircle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                                <p className="text-xs text-stone-600 font-sans">
                                  Shopify integration isn't configured on this server yet. An administrator needs to
                                  set <code className="font-mono bg-amber-100/60 px-1 rounded">SHOPIFY_CLIENT_ID</code> and{' '}
                                  <code className="font-mono bg-amber-100/60 px-1 rounded">SHOPIFY_CLIENT_SECRET</code> in
                                  the server environment before any store can connect.
                                </p>
                              </div>
                            )}

                            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                              <div className={`flex items-center gap-3 bg-white border border-stone-200 rounded-xl px-4 py-3 shadow-sm flex-1 group focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all ${!shopifyConfig.hasEnvCredentials ? 'opacity-50' : ''}`}>
                                <Globe size={16} className="text-stone-300 group-focus-within:text-primary transition-colors" />
                                <input 
                                  type="text" 
                                  value={shopifyShopInput}
                                  onChange={(e) => setShopifyShopInput(e.target.value)}
                                  placeholder="your-store-name"
                                  disabled={!shopifyConfig.hasEnvCredentials}
                                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium text-stone-700 p-0 placeholder:text-stone-300 disabled:cursor-not-allowed"
                                />
                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">.myshopify.com</span>
                              </div>
                              <button 
                                onClick={connectShopify}
                                disabled={isConnectingShopify || !shopifyConfig.hasEnvCredentials}
                                className={`flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-primary/20 transform active:scale-95 ${isConnectingShopify || !shopifyConfig.hasEnvCredentials ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                {isConnectingShopify ? (
                                  <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Connecting...</span>
                                  </>
                                ) : (
                                  <>
                                    <Globe size={18} />
                                    <span>Connect Store</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 p-4 bg-emerald-500/5 rounded-xl border border-emerald-100/50">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                              <CheckCircle2 size={20} />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-emerald-800">Connection Active</p>
                              <p className="text-[10px] text-emerald-600/70 font-sans italic">Your orders are being synced automatically.</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className={`p-6 rounded-[10px] sm:rounded-[15px] border transition-all duration-300 ${odooStatus.connected ? 'bg-emerald-50/30 border-emerald-100 shadow-sm shadow-emerald-500/5' : 'bg-stone-50/50 border-stone-100'}`}>
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-4">
                            <div className={`w-14 h-14 rounded-xl flex items-center justify-center shadow-sm transition-colors duration-300 ${odooStatus.connected ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-stone-100 text-stone-600'}`}>
                              <Database size={28} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-base font-sans font-bold text-stone-800">Odoo eCommerce</h4>
                                {odooStatus.connected && (
                                  <span className="flex items-center gap-1 bg-emerald-500 text-white text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full shadow-sm shadow-emerald-500/10">
                                    <Check size={10} />
                                    Connected
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-stone-500 font-sans italic mt-0.5">
                                {odooStatus.connected ? `Linked to ${odooStatus.url}` : 'Sync your Odoo website orders'}
                              </p>
                            </div>
                          </div>
                          {odooStatus.connected && (
                            <button 
                              onClick={disconnectOdoo}
                              className="flex items-center gap-1.5 text-[10px] font-bold text-rose-500 hover:text-rose-600 uppercase tracking-widest transition-colors group"
                            >
                              <LogOut size={14} className="group-hover:-translate-x-0.5 transition-transform" />
                              Disconnect
                            </button>
                          )}
                        </div>

                        {!odooStatus.connected ? (
                          <div className="space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 bg-white border border-stone-200/60 rounded-xl shadow-sm relative overflow-hidden group">
                              <div className="absolute top-0 left-0 w-1 h-full bg-primary/20" />
                              <div className="col-span-full mb-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <AlertCircle size={14} className="text-primary" />
                                  <p className="text-[10px] font-bold text-stone-600 uppercase tracking-widest">Odoo API Credentials</p>
                                </div>
                                <p className="text-[10px] text-stone-400 font-sans italic">Enter your Odoo instance details to sync orders.</p>
                              </div>
                              <div className="space-y-1.5 sm:col-span-2">
                                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Instance URL</label>
                                <input 
                                  type="text" 
                                  value={odooUrlInput}
                                  onChange={(e) => setOdooUrlInput(e.target.value)}
                                  placeholder="https://your-business.odoo.com"
                                  className="w-full bg-stone-50/50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Database Name</label>
                                <input 
                                  type="text" 
                                  value={odooDbInput}
                                  onChange={(e) => setOdooDbInput(e.target.value)}
                                  placeholder="e.g. my-business-db"
                                  className="w-full bg-stone-50/50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Username / Email</label>
                                <input 
                                  type="text" 
                                  value={odooUsernameInput}
                                  onChange={(e) => setOdooUsernameInput(e.target.value)}
                                  placeholder="admin@example.com"
                                  className="w-full bg-stone-50/50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                />
                              </div>
                              <div className="space-y-1.5 sm:col-span-2">
                                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Password / API Key</label>
                                <input 
                                  type="password" 
                                  value={odooPasswordInput}
                                  onChange={(e) => setOdooPasswordInput(e.target.value)}
                                  placeholder="••••••••••••"
                                  className="w-full bg-stone-50/50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                />
                              </div>
                            </div>

                            <button 
                              onClick={connectOdoo}
                              disabled={isConnectingOdoo}
                              className={`w-full flex items-center justify-center gap-2 bg-stone-800 hover:bg-stone-900 text-white px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-stone-200 transform active:scale-95 ${isConnectingOdoo ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              {isConnectingOdoo ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  <span>Connecting...</span>
                                </>
                              ) : (
                                <>
                                  <Database size={18} />
                                  <span>Connect Odoo</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 p-4 bg-emerald-500/5 rounded-xl border border-emerald-100/50">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                              <CheckCircle2 size={20} />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-emerald-800">Connection Active</p>
                              <p className="text-[10px] text-emerald-600/70 font-sans italic">Your Odoo orders are ready to be synced.</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="p-5 bg-amber-50/30 rounded-xl border border-amber-100/50 space-y-3">
                        <div className="flex items-center gap-2 text-amber-700">
                          <AlertCircle size={14} />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Setup Instructions</span>
                        </div>
                        <p className="text-[10px] text-amber-800/70 leading-relaxed font-sans italic">
                          1. Enter your shop subdomain (e.g. <b>my-shop</b>). <br/>
                          2. In your Shopify Partner Dashboard, set the <b>Allowed redirection URL</b> to:
                        </p>
                        <div className="relative group">
                          <code className="block p-2.5 bg-white border border-amber-100 rounded-xl text-[10px] text-amber-900 font-mono break-all select-all shadow-sm">
                            {window.location.origin}/api/auth/shopify/callback
                          </code>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/api/auth/shopify/callback`);
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-amber-400 hover:text-amber-600 transition-colors"
                            title="Copy to clipboard"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* App Customisation Section */}
                {activeSettingsTab === 'customisation' && (
                  <div className="bg-white p-8 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm space-y-8">
                    <div className="flex items-center gap-3 border-b border-stone-100 pb-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Palette size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-stone-800 uppercase tracking-widest text-[10px]">App Customisation</h3>
                        <p className="text-[10px] text-stone-400 font-sans italic">Personalise your workspace</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                      <div className="space-y-4">
                        <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Theme Colour</label>
                        <div className="flex flex-wrap gap-3">
                          {['#8B4513', '#D2691E', '#CD853F', '#DEB887', '#BC8F8F', '#A0522D', '#2D2D2D'].map(color => (
                            <button
                              key={color}
                              onClick={() => updateSettingsField('primaryColor', color)}
                              className={`w-10 h-10 rounded-full border-4 transition-all transform hover:scale-110 shadow-sm ${
                                settings.primaryColor === color ? 'border-white ring-2 ring-primary scale-110 shadow-md' : 'border-transparent'
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                          <div className="relative group">
                            <input 
                              type="color" 
                              value={settings.primaryColor}
                              onChange={(e) => updateSettingsField('primaryColor', e.target.value)}
                              className="w-10 h-10 rounded-full border-none p-0 overflow-hidden cursor-pointer shadow-sm hover:scale-110 transition-transform"
                            />
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                              Custom Color
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Business Logo</label>
                        <div className="flex items-center gap-4">
                          <div className="w-24 h-24 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-center overflow-hidden shadow-inner">
                            {settings.logo ? (
                              <img src={settings.logo} alt="Logo Preview" className="w-full h-full object-cover" />
                            ) : (
                              <Image size={32} className="text-stone-300" />
                            )}
                          </div>
                          <div className="flex-1 space-y-2">
                            <label className="cursor-pointer bg-stone-100 hover:bg-stone-200 text-stone-600 px-5 py-2.5 rounded-xl text-xs font-bold transition-all inline-block shadow-sm">
                              Upload Logo
                              <input 
                                type="file" 
                                className="hidden" 
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      updateSettingsField('logo', reader.result as string);
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                            {settings.logo && (
                              <button 
                                onClick={() => updateSettingsField('logo', '')}
                                className="ml-3 text-rose-500 text-xs font-bold hover:underline"
                              >
                                Remove
                              </button>
                            )}
                            <p className="text-[10px] text-stone-400 font-sans italic">Recommended: Square SVG or PNG</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* User Account Section */}
                {activeSettingsTab === 'account' && (
                  <div className="bg-white p-8 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm space-y-8">
                    <div className="flex items-center gap-3 border-b border-stone-100 pb-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <UserCog size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-stone-800 uppercase tracking-widest text-[10px]">User Account</h3>
                        <p className="text-[10px] text-stone-400 font-sans italic">Manage your profile and access</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-center text-center space-y-6 py-4">
                      <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-primary border-4 border-white shadow-md">
                        <UserIcon size={48} />
                      </div>
                      <div>
                        <h4 className="font-bold text-stone-800 font-sans text-2xl">{user?.name}</h4>
                        <p className="text-sm text-stone-500 font-sans italic">{user?.email}</p>
                      </div>
                      <div className="bg-primary/10 text-primary px-6 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest">
                        Business Owner
                      </div>

                      <div className="w-full max-w-md pt-6 border-t border-stone-100 space-y-4">
                        <div className="flex items-center justify-between bg-stone-50 border border-stone-200/60 rounded-xl px-4 py-3">
                          <div className="text-left">
                            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Subscription</p>
                            <p className={`text-sm font-bold capitalize ${billing.status === 'active' || billing.status === 'trialing' ? 'text-emerald-600' : 'text-rose-500'}`}>
                              {billing.status === 'none' ? 'No active plan' : billing.status.replace('_', ' ')}
                            </p>
                          </div>
                          <button
                            onClick={openBillingPortal}
                            disabled={isOpeningPortal}
                            className="text-xs font-bold text-primary hover:text-primary-dark uppercase tracking-widest disabled:opacity-50"
                          >
                            {isOpeningPortal ? 'Opening…' : 'Manage Billing'}
                          </button>
                        </div>

                        <button 
                          onClick={handleLogout}
                          className="w-full flex items-center justify-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-600 py-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm shadow-rose-500/5"
                        >
                          <LogOut size={16} />
                          Sign Out of Stockpot
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Inventory Categories Section */}
                {activeSettingsTab === 'categories' && (
                  <div className="bg-white p-8 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm space-y-8">
                    <div className="flex items-center gap-3 border-b border-stone-100 pb-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Layers size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-stone-800 uppercase tracking-widest text-[10px]">Inventory Categories</h3>
                        <p className="text-[10px] text-stone-400 font-sans italic">Organize your materials by category</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <p className="text-sm font-sans text-stone-800 italic">Add or remove categories to better organize your inventory.</p>
                        <div className="flex items-center gap-2">
                          <input 
                            type="text" 
                            placeholder="New category..."
                            id="new-category-input-settings"
                            className="flex-1 sm:w-48 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                addCategory(e.currentTarget.value);
                                e.currentTarget.value = '';
                              }
                            }}
                          />
                          <button 
                            onClick={() => {
                              const input = document.getElementById('new-category-input-settings') as HTMLInputElement;
                              addCategory(input.value);
                              input.value = '';
                            }}
                            className="bg-primary text-white p-2.5 rounded-xl hover:opacity-90 transition-all shadow-md shadow-primary/20"
                          >
                            <Plus size={18} />
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {categories.map(cat => (
                          <div key={cat} className="flex items-center gap-3 bg-stone-50 px-5 py-3 rounded-xl border border-stone-200 group transition-all hover:border-primary/30 hover:bg-white hover:shadow-sm">
                            <span className="text-xs font-bold text-stone-600 uppercase tracking-wider">{cat}</span>
                            {cat !== 'Raw Materials' && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteCategory(cat);
                                }}
                                className="p-1.5 text-stone-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                title={`Delete ${cat}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
  );
};
