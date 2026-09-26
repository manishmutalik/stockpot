import React, { useState, useMemo, useEffect } from 'react';
import { X, Plus, Trash2, Calendar, ShoppingBag, User, Phone } from 'lucide-react';

interface MenuItem {
  id: string;
  name: string;
  emoji?: string;
  sellingPrice: number;
  finishedGoodsStock?: number;
}

export interface OrderLineItem {
  menuItemId: string;
  quantity: number;
}

interface AddOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  menu: MenuItem[];
  currency: { symbol: string };
  /**
   * Saves every line item as one atomic group (see
   * useOrderActions.addOrderGroup). Throws on failure — the modal stays
   * open and the user can retry; nothing partially saves.
   */
  onSave: (
    common: { date: string; customerName?: string; customerPhone?: string },
    lineItems: OrderLineItem[]
  ) => Promise<void>;
}

const EMPTY_LINE_ITEM = (menu: MenuItem[]): OrderLineItem => ({ menuItemId: menu[0]?.id || '', quantity: 1 });

/**
 * Modal form for adding a customer order with one or more items in a
 * single submission (e.g. "2 cakes and 3 cookies" for one customer),
 * instead of adding a blank row and editing it inline per item.
 *
 * @param isOpen  - Controls visibility; renders nothing when false.
 * @param onClose - Called after a successful save or when the user cancels.
 * @param menu    - List of menu items available to select.
 * @param onSave  - Async callback that persists all line items; see AddOrderModalProps.
 * @param currency - Locale currency config; only `symbol` is used for display.
 */
export function AddOrderModal({ isOpen, onClose, menu, onSave, currency }: AddOrderModalProps) {
  const today = new Date().toISOString().split('T')[0];
  const [date,          setDate]          = useState(today);
  const [customerName,  setCustomerName]  = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [lineItems,     setLineItems]     = useState<OrderLineItem[]>([EMPTY_LINE_ITEM(menu)]);
  const [isSaving,      setIsSaving]      = useState(false);
  const [error,         setError]         = useState('');
  const [invalidRowIndex, setInvalidRowIndex] = useState<number | null>(null);

  // Re-sync every row's selected item against the *current* menu whenever
  // the modal opens — same reasoning as ProductionRunModal's equivalent
  // effect: menu can still be loading when a row's default was first set.
  useEffect(() => {
    if (!isOpen) return;
    setLineItems(prev => prev.map(li =>
      menu.some(m => m.id === li.menuItemId) ? li : { ...li, menuItemId: menu[0]?.id || '' }
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, menu]);

  const totalValue = useMemo(() => lineItems.reduce((sum, li) => {
    const item = menu.find(m => m.id === li.menuItemId);
    return sum + (item ? item.sellingPrice * li.quantity : 0);
  }, 0), [lineItems, menu]);

  const updateLineItem = (index: number, patch: Partial<OrderLineItem>) => {
    setLineItems(prev => prev.map((li, i) => i === index ? { ...li, ...patch } : li));
    setError('');
    setInvalidRowIndex(null);
  };
  const addLineItem = () => setLineItems(prev => [...prev, EMPTY_LINE_ITEM(menu)]);
  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
  };

  const resetForm = () => {
    setDate(today);
    setCustomerName('');
    setCustomerPhone('');
    setLineItems([EMPTY_LINE_ITEM(menu)]);
    setInvalidRowIndex(null);
  };
  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSave = async () => {
    setError('');
    setInvalidRowIndex(null);

    const badItemIndex = lineItems.findIndex(li => !li.menuItemId || !menu.some(m => m.id === li.menuItemId));
    if (badItemIndex !== -1) {
      setInvalidRowIndex(badItemIndex);
      setError(lineItems.length > 1 ? `Please select an item for row ${badItemIndex + 1}.` : 'Please select an item.');
      return;
    }
    const badQtyIndex = lineItems.findIndex(li => li.quantity < 1);
    if (badQtyIndex !== -1) {
      setInvalidRowIndex(badQtyIndex);
      setError(lineItems.length > 1 ? `Quantity must be at least 1 for row ${badQtyIndex + 1}.` : 'Quantity must be at least 1.');
      return;
    }

    // Stock is a hard cap — combine quantities first, since the same item
    // can appear in more than one row and each row passing individually
    // doesn't mean their total fits what's actually available.
    const requestedByItem = new Map<string, number>();
    for (const li of lineItems) {
      requestedByItem.set(li.menuItemId, (requestedByItem.get(li.menuItemId) ?? 0) + li.quantity);
    }
    for (const [menuItemId, requested] of requestedByItem) {
      const item = menu.find(m => m.id === menuItemId);
      const available = item?.finishedGoodsStock ?? 0;
      if (requested > available) {
        setInvalidRowIndex(lineItems.findIndex(li => li.menuItemId === menuItemId));
        setError(`Only ${available} unit(s) of "${item?.name}" in stock — this order needs ${requested}.`);
        return;
      }
    }

    setIsSaving(true);
    try {
      await onSave(
        { date, customerName: customerName.trim() || undefined, customerPhone: customerPhone.trim() || undefined },
        lineItems
      );
      resetForm();
      onClose();
    } catch (err) {
      console.error('Failed to add order:', err);
      setError('Failed to add order. Please try again.');
      // Don't close — leave the form intact so the user can retry.
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-[2.5rem] shadow-2xl border border-stone-100 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-6 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <ShoppingBag size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-800">Add Order</h2>
              <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">Log a customer order</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-xl hover:bg-stone-100 text-stone-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-8 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Items */}
          <div>
            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 block">
              {lineItems.length > 1 ? `Items (${lineItems.length})` : 'Item'}
            </label>
            <div className="space-y-2">
              {lineItems.map((li, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <select
                    value={li.menuItemId}
                    onChange={e => updateLineItem(i, { menuItemId: e.target.value })}
                    className={`flex-1 min-w-0 bg-stone-50 border rounded-xl px-4 py-3 text-sm font-bold text-stone-700 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${invalidRowIndex === i && !li.menuItemId ? 'border-rose-400' : 'border-stone-200'}`}
                  >
                    <option value="" disabled>Select an item...</option>
                    {menu.map(item => (
                      <option key={item.id} value={item.id}>{item.emoji ? `${item.emoji} ` : ''}{item.name} ({item.finishedGoodsStock ?? 0} in stock)</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={li.quantity === 0 ? '' : li.quantity}
                    onChange={e => updateLineItem(i, { quantity: parseInt(e.target.value) || 0 })}
                    placeholder="Qty"
                    className={`w-20 bg-stone-50 border rounded-xl px-3 py-3 text-sm font-bold text-stone-700 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${invalidRowIndex === i && li.quantity < 1 ? 'border-rose-400' : 'border-stone-200'}`}
                  />
                  {lineItems.length > 1 && (
                    <button
                      onClick={() => removeLineItem(i)}
                      title="Remove item"
                      className="p-3 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addLineItem}
              className="flex items-center gap-1.5 mt-2 text-[11px] font-bold text-primary hover:text-primary-dark transition-colors"
            >
              <Plus size={14} /> Add another item
            </button>
          </div>

          {/* Date */}
          <div>
            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 block flex items-center gap-1.5">
              <Calendar size={11} /> Date
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold text-stone-700 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          {/* Customer */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 block flex items-center gap-1.5">
                <User size={11} /> Customer (optional)
              </label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="Name"
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium text-stone-700 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5 block flex items-center gap-1.5">
                <Phone size={11} /> Phone (optional)
              </label>
              <input
                type="text"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="Phone"
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium text-stone-700 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>

          {lineItems.length > 1 && (
            <div className="text-[10px] text-stone-400 font-bold">
              ℹ️ Delivery details can be added per item afterward from the Orders tab.
            </div>
          )}

          {/* Total Preview */}
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">Total Order Value</div>
              <div className="text-xl font-bold font-serif text-stone-800 mt-0.5">
                {currency.symbol}{totalValue.toFixed(2)}
              </div>
            </div>
            <ShoppingBag size={28} className="text-primary/30" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-stone-100 flex gap-3">
          <button
            onClick={handleClose}
            className="flex-1 py-3 rounded-2xl border border-stone-200 text-stone-600 text-sm font-bold hover:bg-stone-50 transition-all"
          >
            Cancel
          </button>
          <div className="flex flex-col flex-1">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full py-3 rounded-2xl bg-primary text-white text-sm font-bold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
            >
              {isSaving ? 'Adding...' : lineItems.length > 1 ? `Add Order (${lineItems.length} Items)` : 'Add Order'}
            </button>
            {error && <div className="text-rose-500 text-[10px] font-bold mt-1 text-center">{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
