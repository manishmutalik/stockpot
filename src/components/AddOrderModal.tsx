import React, { useState, useMemo, useEffect } from 'react';
import { Calendar, Check, CirclePlus, Loader2, MapPin, Phone, ShoppingBag, Sparkles, Trash2, User } from 'lucide-react';
import { ModalShell, MODAL_LABEL, modalField, QuantityStepper } from './ModalShell';
import { PAYMENT_METHODS, type PaymentMethod } from '../types';
import type { OrderParser } from '../hooks/useOrderParser';
import { CustomerCombobox } from './CustomerCombobox';
import type { CustomerSuggestion } from '../utils/customers';
import type { NotFoundItem } from '../utils/orderParse';

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
    common: { date: string; customerName?: string; customerPhone?: string; deliveryAddress?: string; paymentStatus?: 'paid' | 'unpaid'; paymentMethod?: PaymentMethod; discount?: number },
    lineItems: OrderLineItem[]
  ) => Promise<void>;
  /** When set, the modal opens with a single line item pre-filled to this
   * menu item instead of defaulting to the first one — used by Market
   * Stock's "Add to Order" action. */
  presetMenuItemId?: string | null;
  /** When set, the form offers to fill itself from a pasted message (only for accounts AI is available to). */
  orderParser?: OrderParser | null;
  /** Past customers, suggested while the name or phone number is typed. Empty or absent: the fields are plain inputs. */
  customers?: CustomerSuggestion[];
  /** Today in the business's time zone ("last order 12 days ago"). Defaults to the UTC date. */
  today?: string;
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
export function AddOrderModal({ isOpen, onClose, menu, onSave, currency, presetMenuItemId, orderParser, customers = [], today: todayProp }: AddOrderModalProps) {
  const today = todayProp ?? new Date().toISOString().split('T')[0];
  const [date,          setDate]          = useState(today);
  const [customerName,  setCustomerName]  = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [payLater,      setPayLater]      = useState(false);
  const [method,        setMethod]        = useState<PaymentMethod | ''>('');
  const [discountText,  setDiscountText]  = useState('');
  const [lineItems,     setLineItems]     = useState<OrderLineItem[]>([EMPTY_LINE_ITEM(menu)]);
  const [isSaving,      setIsSaving]      = useState(false);
  const [error,         setError]         = useState('');
  const [invalidRowIndex, setInvalidRowIndex] = useState<number | null>(null);
  // Filling the form from a pasted message.
  const [message,       setMessage]       = useState('');
  const [isReading,     setIsReading]     = useState(false);
  const [readError,     setReadError]     = useState('');
  const [filled,        setFilled]        = useState(false);
  const [readNotes,     setReadNotes]     = useState<string[]>([]);
  const [notFound,      setNotFound]      = useState<NotFoundItem[]>([]);

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

  const subtotal = useMemo(() => lineItems.reduce((sum, li) => {
    const item = menu.find(m => m.id === li.menuItemId);
    return sum + (item ? item.sellingPrice * li.quantity : 0);
  }, 0), [lineItems, menu]);
  const discount = Math.max(parseFloat(discountText) || 0, 0);
  const totalValue = Math.max(subtotal - discount, 0);

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
    setDeliveryAddress('');
    setPayLater(false);
    setMethod('');
    setDiscountText('');
    setLineItems([EMPTY_LINE_ITEM(menu)]);
    setInvalidRowIndex(null);
    setMessage('');
    setReadError('');
    setFilled(false);
    setReadNotes([]);
    setNotFound([]);
  };

  // Pre-fills the form from the message. Nothing is saved: the owner checks it and presses Add Order.
  const readMessage = async () => {
    if (!orderParser || isReading) return;
    setIsReading(true);
    setReadError('');
    setFilled(false);
    setReadNotes([]);
    setNotFound([]);
    try {
      const outcome = await orderParser.parse(message);
      if (outcome.ok === false) { setReadError(outcome.message); return; }
      const f = outcome.form;
      const notes: string[] = [];
      if (f.lineItems.length > 0) {
        setLineItems(f.lineItems);
      } else {
        // Nothing matched: leave an empty row to choose from, not the first menu item standing in for the customer's.
        setLineItems([{ menuItemId: '', quantity: 1 }]);
        if (f.notFound.length === 0) notes.push('No items were found in the message.');
      }
      if (f.customerName !== undefined) setCustomerName(f.customerName);
      if (f.customerPhone !== undefined) setCustomerPhone(f.customerPhone);
      if (f.knownCustomer) notes.push('This looks like an existing customer; their details were filled in.');
      if (f.date) setDate(f.date);
      if (f.dateNotUnderstood) notes.push(`Couldn't tell the date from "${f.dateNotUnderstood}". Please check the order date.`);
      if (f.payLater !== undefined) setPayLater(f.payLater);
      if (f.method) setMethod(f.method);
      if (f.discountAmount !== undefined) setDiscountText(String(f.discountAmount));
      if (f.deliveryAddress !== undefined) setDeliveryAddress(f.deliveryAddress);
      setNotFound(f.notFound);
      setReadNotes(notes);
      setFilled(true);
      setError('');
      setInvalidRowIndex(null);
    } finally {
      setIsReading(false);
    }
  };
  const applySuggestion = (missing: NotFoundItem) => {
    if (!missing.suggestion) return;
    const id = missing.suggestion.id;
    setLineItems(prev => {
      const existing = prev.find(li => li.menuItemId === id);
      if (existing) return prev.map(li => (li.menuItemId === id ? { ...li, quantity: li.quantity + missing.quantity } : li));
      // The empty row left when nothing matched is replaced rather than kept beside it.
      if (prev.length === 1 && prev[0].menuItemId === '') return [{ menuItemId: id, quantity: missing.quantity }];
      return [...prev, { menuItemId: id, quantity: missing.quantity }];
    });
    setNotFound(prev => prev.filter(n => n !== missing));
  };
  // Picking a past customer fills both fields (replacing whatever was in them: the owner just chose them), then moves on to the items.
  const pickCustomer = (customer: CustomerSuggestion) => {
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone ?? '');
    document.getElementById('order-item-0')?.focus();
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

    if ((parseFloat(discountText) || 0) < 0) {
      setError("A discount can't be negative.");
      return;
    }
    if (discount > subtotal) {
      setError(`The discount (${currency.symbol}${discount.toFixed(2)}) is more than the order total (${currency.symbol}${subtotal.toFixed(2)}).`);
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
        { date, customerName: customerName.trim() || undefined, customerPhone: customerPhone.trim() || undefined,
          deliveryAddress: deliveryAddress.trim() || undefined, paymentStatus: payLater ? 'unpaid' : 'paid',
          paymentMethod: !payLater && method ? method : undefined, discount: discount > 0 ? discount : undefined },
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
      {/* Fill the form from a pasted message (only when AI is available) */}
      {orderParser && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <label htmlFor="order-message" className={`${MODAL_LABEL} flex items-center gap-1.5 !mb-0 text-primary`}>
            <Sparkles size={12} /> Fill from a message
          </label>
          <textarea
            id="order-message"
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={3}
            maxLength={1500}
            placeholder="Paste the customer's WhatsApp message here"
            className={`${modalField()} resize-none bg-white`}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={readMessage}
              disabled={isReading || message.trim() === ''}
              className="h-10 px-4 shrink-0 whitespace-nowrap rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isReading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {isReading ? 'Reading…' : 'Fill the form'}
            </button>
            <p className="text-[11px] text-muted leading-snug">Phone numbers and the names of your existing customers are not sent. You check everything before the order is added.</p>
          </div>
          {readError && <p role="alert" className="text-xs font-semibold text-coral">{readError}</p>}
          {filled && (
            <div className="space-y-1.5 text-xs text-ink">
              <p className="font-semibold">Filled from your message. Please check it.</p>
              {readNotes.map(n => <p key={n} className="text-muted">{n}</p>)}
              {notFound.map((n, i) => (
                <div key={`${n.nameAsWritten}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                  <span>Couldn&apos;t find &ldquo;{n.nameAsWritten}&rdquo; on the menu (×{n.quantity}).</span>
                  {n.suggestion ? (
                    <button type="button" onClick={() => applySuggestion(n)} className="font-semibold text-primary hover:text-primary-dark underline">
                      Use {n.suggestion.name}?
                    </button>
                  ) : (
                    <span>Pick it from the list below.</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
                    id={`order-item-${i}`}
                    aria-label={lineItems.length > 1 ? `Item ${i + 1}` : 'Item'}
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
          <label htmlFor="order-date" className={`${MODAL_LABEL} flex items-center gap-1.5`}>
            <Calendar size={12} /> Order date
          </label>
          <input
            id="order-date"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className={`${modalField()} font-mono font-semibold`}
          />
        </div>
        <div>
          <label htmlFor="order-customer" className={`${MODAL_LABEL} flex items-center gap-1.5`}>
            <User size={12} /> Customer (optional)
          </label>
          <CustomerCombobox
            id="order-customer"
            value={customerName}
            onChange={setCustomerName}
            onPick={pickCustomer}
            directory={customers}
            today={today}
            placeholder="Name"
            className={modalField()}
          />
        </div>
        <div>
          <label htmlFor="order-phone" className={`${MODAL_LABEL} flex items-center gap-1.5`}>
            <Phone size={12} /> Phone (optional)
          </label>
          <CustomerCombobox
            id="order-phone"
            value={customerPhone}
            onChange={setCustomerPhone}
            onPick={pickCustomer}
            directory={customers}
            today={today}
            placeholder="Phone"
            className={modalField()}
            align="right"
          />
        </div>
      </div>

      <div>
        <label htmlFor="order-address" className={`${MODAL_LABEL} flex items-center gap-1.5`}>
          <MapPin size={12} /> Delivery address (optional)
        </label>
        <input
          id="order-address"
          type="text"
          value={deliveryAddress}
          onChange={e => setDeliveryAddress(e.target.value)}
          placeholder="Leave empty for pick-up"
          className={modalField()}
        />
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
            This order will be listed under pending payments, so you can send the customer one consolidated bill later. You can record how it was paid when you mark it paid.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {!payLater && (
          <div>
            <label htmlFor="order-method" className={MODAL_LABEL}>Paid by (optional)</label>
            <select
              id="order-method"
              value={method}
              onChange={e => setMethod(e.target.value as PaymentMethod | '')}
              className={modalField()}
            >
              <option value="">Not recorded</option>
              {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="order-discount" className={MODAL_LABEL}>Discount (optional)</label>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted">{currency.symbol}</span>
            <input
              id="order-discount"
              type="number"
              min="0"
              step="0.01"
              value={discountText}
              onChange={e => setDiscountText(e.target.value)}
              placeholder="0"
              className={`${modalField()} font-mono`}
            />
          </div>
        </div>
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
          {discount > 0 && <div className="font-mono text-[11px] text-muted mt-0.5">after {currency.symbol}{discount.toFixed(2)} discount</div>}
        </div>
        <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-primary">
          <ShoppingBag size={22} />
        </div>
      </div>
    </ModalShell>
  );
}
