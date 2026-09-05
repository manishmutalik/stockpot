import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Trash2, ChevronRight, ChevronDown, Package, Utensils, ClipboardList, Calculator,
  Save, RotateCcw, AlertCircle, CheckCircle2, Check, Info, Database, RefreshCw, Copy,
  DollarSign, Globe, Calendar, Filter, ArrowLeft, ArrowRight, Clock, Settings, Settings2,
  Layers, UserCog, Puzzle, User as UserIcon, LogOut, Image, Palette, Store, Mail, Phone,
  MapPin, UserCircle, TrendingUp, TrendingDown, Activity, ShoppingBag, BarChart3, Edit2,
  LogIn, FlaskConical, Sparkles, Factory, Download, Upload, X, AlertTriangle
} from 'lucide-react';
import { AppViewProps } from '../types';

export const WastageView: React.FC<AppViewProps> = (props) => {
  const { patchMaterial, setRestockExpiryDate, shopifyStatus, importShopifyOrders, isImportingShopify, odooStatus, importOdooOrders, isImportingOdoo,
    materials, menu, wastageLogs, currency
  } = props;

  return (
            <motion.div
              key="wastage"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 max-w-7xl mx-auto"
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
                <div>
                  <h1 className="text-3xl font-bold text-stone-800 tracking-tight">Wastage Log</h1>
                  <p className="text-stone-500 text-sm mt-1">Track discarded ingredients and finished goods</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-white p-6 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center flex-shrink-0">
                    <Trash2 className="w-6 h-6 text-rose-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Total Loss</p>
                    <p className="text-2xl font-black text-stone-800">
                      {currency.symbol}{wastageLogs.reduce((sum, log) => sum + log.cost, 0).toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-6 h-6 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Total Items Logged</p>
                    <p className="text-2xl font-black text-stone-800">
                      {wastageLogs.length} Entries
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[10px] sm:rounded-[15px] border border-stone-200/50 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
                  <h2 className="font-bold text-stone-800 text-lg flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-stone-400" />
                    Wastage History
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-100">
                        <th className="p-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Date</th>
                        <th className="p-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Item</th>
                        <th className="p-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Type</th>
                        <th className="p-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-right">Quantity</th>
                        <th className="p-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-right">Cost</th>
                        <th className="p-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {[...wastageLogs].sort((a,b) => b.date.localeCompare(a.date)).map(log => {
                        const mat = materials.find(m => m.id === log.itemId);
                        const recipe = menu.find(m => m.id === log.itemId);
                        const itemName = log.type === 'material' ? mat?.name : recipe?.name;
                        const unit = log.type === 'material' ? mat?.unit : 'pcs';

                        return (
                          <tr key={log.id} className="hover:bg-stone-50 transition-colors group">
                            <td className="p-4 text-sm font-medium text-stone-600 whitespace-nowrap">{log.date}</td>
                            <td className="p-4 font-bold text-stone-800">{itemName || 'Unknown Item'}</td>
                            <td className="p-4">
                              <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest \${log.type === 'material' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                {log.type}
                              </span>
                            </td>
                            <td className="p-4 font-mono font-medium text-stone-600 text-right">{log.quantity} <span className="text-[10px] uppercase">{unit}</span></td>
                            <td className="p-4 font-mono font-bold text-rose-600 text-right">{currency.symbol}{log.cost.toFixed(2)}</td>
                            <td className="p-4 text-sm text-stone-500 italic">{log.reason}</td>
                          </tr>
                        );
                      })}
                      {wastageLogs.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-stone-400 italic">No wastage logged yet. Great job!</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
  );
};
