import React, { useState, useMemo, useEffect } from 'react';
import { Calendar, Check, CirclePlus, Phone, ShoppingBag, Trash2, User } from 'lucide-react';
import { ModalShell, MODAL_LABEL, modalField, QuantityStepper } from './ModalShell';

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
    common: { date: string; customerName?: string; customerPhone?: string; paymentStatus?: 'paid' | 'unpaid' },
    lineItems: OrderLineItem[]
  ) => Promise<void>;
  /** When set, the modal opens with a single line item pre-filled to this
   * menu item instead of defaulting to the first one — used by Market
   * Stock's "Add to Order" action. */
  presetMenuItemId?: string | null;
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
 * @param presetMenuItemId - See AddOrderModalProps.
 */
export function AddOrderModal({ isOpen, onClose, menu, onSave, currency, presetMenuItemId }: AddOrderModalProps) {
  const today = new Date().toISOString().split('T')[0];
  const [date,          setDate]          = useState(today);
  const [customerName,  setCustomerName]  = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [payLater,      setPayLater]      = useState(false);
  const [lineItems,     setLineItems]     = useState<OrderLineItem[]>([EMPTY_LINE_ITEM(menu)]);
  const [isSaving,      setIsSaving]      = useState(false);
  const [error,         setError]         = useState('');
  const [invalidRowIndex, setInvalidRowIndex] = useState<number | null>(null);

  // Re-sync every row's selected item against the *current* menu whenever
  // the modal opens — same reasoning as ProductionRunModal's equivalent
  // effect: menu can still be loading when a row's default was first set.
  //
  // A presetMenuItemId (Market Stock's "Add to Order" action) instead
  // replaces whatever was there with a single fresh row for that item —
  // opening "Order this" shouldn't carry over rows left from an unrelated
  // earlier attempt.
  useEffect(() => {
    if (!isOpen) return;
    if (presetMenuItemId) {
      setLineItems([{ menuItemId: presetMenuItemId, quantity: 1 }]);
      return;
    }
    setLineItems(prev => prev.map(li =>
      menu.some(m => m.id === li.menuItemId) ? li : { ...li, menuItemId: menu[0]?.id || '' }
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, menu, presetMenuItemId]);

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
    setPayLater(false);
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
        { date, customerName: customerName.trim() || undefined, customerPhone: customerPhone.trim() || undefined, paymentStatus: payLater ? 'unpaid' : 'paid' },
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
    <ModalShell
      title="Add Order"
      subtitle="Log a customer order"
      icon={ShoppingBag}
      onClose={handleClose}
      footer={
        <>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 sm:flex-none sm:w-36 h-12 rounded-xl bg-stone-100 text-ink text-sm font-semibold hover:bg-stone-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 h-12 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md shadow-primary/20 flex items-center justify-center gap-2"
            >
              {!isSaving && <Check size={18} />}
              {isSaving ? 'Adding...' : lineItems.length > 1 ? `Add Order (${lineItems.length} Items)` : 'Add Order'}
            </button>
          </div>
          {error && <div className="text-coral text-xs font-semibold mt-2 text-center">{error}</div>}
        </>
      }
    >
      {/* Items */}
      <div>
        <label className={MODAL_LABEL}>
          {lineItems.length > 1 ? `Items (${lineItems.length})` : 'Item'}
        </label>
        <div className="space-y-3">
          {lineItems.map((li, i) => {
            const item = menu.find(m => m.id === li.menuItemId);
            const stock = item?.finishedGoodsStock ?? 0;
            return (
              <div key={i}>
                <div className="flex gap-2 items-stretch">
                  <select
                    value={li.menuItemId}
                    onChange={e => updateLineItem(i, { menuItemId: e.target.value })}
                    className={`${modalField(invalidRowIndex === i && !li.menuItemId)} flex-1 min-w-0 font-semibold`}
                  >
                    <option value="" disabled>Select an item...</option>
                    {menu.map(m => (
                      <option key={m.id} value={m.id}>{m.emoji ? `${m.emoji} ` : ''}{m.name} ({m.finishedGoodsStock ?? 0} in stock)</option>
                    ))}
                  </select>
                  <QuantityStepper
                    value={li.quantity}
                    onChange={n => updateLineItem(i, { quantity: n })}
                    invalid={invalidRowIndex === i && li.quantity < 1}
                  />
                  {lineItems.length > 1 && (
                    <button
                      onClick={() => removeLineItem(i)}
                      title="Remove item"
                      className="px-3 text-muted hover:text-coral hover:bg-coral/10 rounded-xl transition-colors shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                {item && (
                  <div className="flex items-center gap-2 mt-1.5 px-1 font-mono text-[11px] text-muted">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold ${
                        stock <= 0 ? 'bg-coral/10 text-coral' : 'bg-margin/10 text-[#006143]'
                      }`}
                    >
                      {stock} available
                    </span>
                    <span>{currency.symbol}{item.sellingPrice.toFixed(2)} each</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button
          onClick={addLineItem}
          className="flex items-center gap-1.5 mt-3 text-sm font-semibold text-primary hover:text-primary-dark transition-colors"
        >
          <CirclePlus size={16} /> Add another item
        </button>
      </div>

      {/* Date + customer */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={`${MODAL_LABEL} flex items-center gap-1.5`}>
            <Calendar size={12} /> Order date
          </label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className={`${modalField()} font-mono font-semibold`}
          />
        </div>
        <div>
          <label className={`${MODAL_LABEL} flex items-center gap-1.5`}>
            <User size={12} /> Customer (optional)
          </label>
          <input
            type="text"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Name"
            className={modalField()}
          />
        </div>
        <div>
          <label className={`${MODAL_LABEL} flex items-center gap-1.5`}>
            <Phone size={12} /> Phone (optional)
          </label>
          <input
            type="text"
            value={customerPhone}
            onChange={e => setCustomerPhone(e.target.value)}
            placeholder="Phone"
            className={modalField()}
          />
        </div>
      </div>

      <div>
        <div className={MODAL_LABEL}>Payment</div>
        <div role="radiogroup" aria-label="Payment" className="inline-flex p-1 bg-stone-100 rounded-xl">
          {([['paid', 'Paid now'], ['later', 'Pay later']] as const).map(([value, label]) => {
            const selected = (value === 'later') === payLater;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPayLater(value === 'later')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${selected ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {payLater && (
          <p className="text-xs text-muted mt-1.5">
            This order will be listed under pending payments, so you can send the customer one consolidated bill later.
          </p>
        )}
      </div>

      {lineItems.length > 1 && (
        <div className="text-xs text-muted">
          ℹ️ Delivery details can be added per item afterward from the Orders tab.
        </div>
      )}

      {/* Total Preview */}
      <div className="bg-primary/5 rounded-2xl p-4 flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] font-semibold text-primary uppercase tracking-wider">Total Order Value</div>
          <div className="text-2xl font-mono font-semibold text-ink mt-0.5">
            {currency.symbol}{totalValue.toFixed(2)}
          </div>
        </div>
        <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-primary">
          <ShoppingBag size={22} />
        </div>
      </div>
    </ModalShell>
  );
}
