import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Calendar, Check, CirclePlus, Clock, Loader2, MapPin, MessageCircle, Phone, ShoppingBag, Sparkles, StickyNote, Trash2, User } from 'lucide-react';
import { ModalShell, MODAL_LABEL, modalField, QuantityStepper } from './ModalShell';
import { PAYMENT_METHODS, type PaymentMethod } from '../types';
import type { OrderParser } from '../hooks/useOrderParser';
import { CustomerCombobox } from './CustomerCombobox';
import type { CustomerSuggestion } from '../utils/customers';
import type { NotFoundItem } from '../utils/orderParse';
import { buildPreorderConfirmation, buildWhatsAppUrl } from '../utils/billing';

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
  /** The agreed price of one unit, when it is not the menu price. */
  unitPrice?: number;
}

/** A line as it is edited: `priceText` is set only once the owner has typed a price; until then the menu price shows. */
interface OrderRow {
  menuItemId: string;
  quantity: number;
  priceText?: string;
}

type OrderMode = 'stock' | 'preorder';

const DUE_SLOTS = [
  { value: '', label: 'Any time' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'time', label: 'At a time…' },
];

/** What the customer owes for a sale: GST on top in exclusive pricing (an estimate here; the saved order is checked with the exact rules). */
const amountOwed = (sale: number, gst?: { gstApplicable?: boolean; gstRate?: number; gstPricingMode?: string }) =>
  gst?.gstApplicable && (gst.gstRate ?? 0) > 0 && (gst.gstPricingMode ?? 'exclusive') === 'exclusive' ? sale * (1 + (gst.gstRate ?? 0) / 100) : sale;

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
    common: {
      date: string; customerName?: string; customerPhone?: string; deliveryAddress?: string; paymentStatus?: 'paid' | 'unpaid'; paymentMethod?: PaymentMethod; discount?: number;
      preorder?: boolean; dueSlot?: string; notes?: string; advance?: { amount: number; method: PaymentMethod };
    },
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
  /** Today in the business's time zone ("last order 12 days ago", and a later date means a pre-order). Defaults to the UTC date. */
  today?: string;
  /** GST settings, so an advance can be compared with what the customer will owe. */
  gst?: { gstApplicable?: boolean; gstRate?: number; gstPricingMode?: string };
}

const EMPTY_LINE_ITEM = (menu: MenuItem[]): OrderRow => ({ menuItemId: menu[0]?.id || '', quantity: 1 });

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
export function AddOrderModal({ isOpen, onClose, menu, onSave, currency, presetMenuItemId, orderParser, customers = [], today: todayProp, gst }: AddOrderModalProps) {
  const today = todayProp ?? new Date().toISOString().split('T')[0];
  const [date,          setDate]          = useState(today);
  const [customerName,  setCustomerName]  = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [payLater,      setPayLater]      = useState(false);
  const [method,        setMethod]        = useState<PaymentMethod | ''>('');
  const [discountText,  setDiscountText]  = useState('');
  const [lineItems,     setLineItems]     = useState<OrderRow[]>([EMPTY_LINE_ITEM(menu)]);
  const [isSaving,      setIsSaving]      = useState(false);
  const [error,         setError]         = useState('');
  const [invalidRowIndex, setInvalidRowIndex] = useState<number | null>(null);
  // Pre-orders: booked ahead of time, taking no stock until they are handed over.
  const [mode,          setMode]          = useState<OrderMode>('stock');
  const [slot,          setSlot]          = useState('');
  const [dueTime,       setDueTime]       = useState('');
  const [notes,         setNotes]         = useState('');
  const [advanceText,   setAdvanceText]   = useState('');
  const [advanceMethod, setAdvanceMethod] = useState<PaymentMethod>('upi');
  // Once the owner picks a mode themselves, choosing a date no longer changes it.
  const modeChosen = useRef(false);
  const payChosen = useRef(false);
  // After a pre-order is booked for a customer with a phone number: offer the confirmation on WhatsApp.
  const [booked, setBooked] = useState<{ message: string; url: string } | null>(null);
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

  /** The price of one unit on a line: the one typed, else the menu price. A blank or invalid entry falls back to the menu price. */
  const priceOf = (li: OrderRow) => {
    const item = menu.find(m => m.id === li.menuItemId);
    const typed = li.priceText === undefined ? NaN : parseFloat(li.priceText);
    return typed > 0 ? typed : item?.sellingPrice ?? 0;
  };
  const subtotal = useMemo(() => lineItems.reduce((sum, li) => sum + priceOf(li) * li.quantity, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lineItems, menu]);
  const discount = Math.max(parseFloat(discountText) || 0, 0);
  const totalValue = Math.max(subtotal - discount, 0);
  const preorder = mode === 'preorder';
  const owed = amountOwed(totalValue, gst);
  const advance = preorder ? Math.max(parseFloat(advanceText) || 0, 0) : 0;
  const balance = Math.max(owed - advance, 0);

  // A date after today means a pre-order, unless the owner has chosen the mode themselves.
  const chooseDate = (d: string) => {
    setDate(d);
    if (!modeChosen.current) {
      const next: OrderMode = d > today ? 'preorder' : 'stock';
      setMode(next);
      if (next === 'preorder' && !payChosen.current) setPayLater(true);
    }
  };
  const chooseMode = (next: OrderMode) => {
    modeChosen.current = true;
    setMode(next);
    // A pre-order is usually paid when it is handed over.
    if (next === 'preorder' && !payChosen.current) setPayLater(true);
  };
  const updateLineItem = (index: number, patch: Partial<OrderRow>) => {
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
    setMode('stock');
    setSlot('');
    setDueTime('');
    setNotes('');
    setAdvanceText('');
    setAdvanceMethod('upi');
    setBooked(null);
    modeChosen.current = false;
    payChosen.current = false;
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
      if (f.date) chooseDate(f.date);
      if (f.dateNotUnderstood) notes.push(`Couldn't tell the date from "${f.dateNotUnderstood}". Please check the order date.`);
      if (f.payLater !== undefined) setPayLater(f.payLater);
      if (f.method) setMethod(f.method);
      if (f.discountAmount !== undefined) setDiscountText(String(f.discountAmount));
      if (f.deliveryAddress !== undefined) setDeliveryAddress(f.deliveryAddress);
      if (f.notes !== undefined) setNotes(f.notes);
      if (f.advanceAmount !== undefined) {
        setAdvanceText(String(f.advanceAmount));
        if (f.advanceMethod) setAdvanceMethod(f.advanceMethod);
      }
      // Notes and an advance belong to a pre-order, unless the owner has already chosen the type.
      if ((f.notes !== undefined || f.advanceAmount !== undefined) && !modeChosen.current) {
        setMode('preorder');
        if (!payChosen.current) setPayLater(true);
        if (f.advanceAmount !== undefined) notes.push('Set as a pre-order because the message mentions an advance.');
      }
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

    // A price typed on a line must be a real price.
    const badPriceIndex = lineItems.findIndex(li => li.priceText !== undefined && li.priceText.trim() !== '' && !(parseFloat(li.priceText) > 0));
    if (badPriceIndex !== -1) {
      setInvalidRowIndex(badPriceIndex);
      setError(lineItems.length > 1 ? `Please enter a price for row ${badPriceIndex + 1}, or clear it to use the menu price.` : 'Please enter a price, or clear it to use the menu price.');
      return;
    }

    // Stock is a hard cap — combine quantities first, since the same item
    // can appear in more than one row and each row passing individually
    // doesn't mean their total fits what's actually available. A pre-order is booked before it is baked, so it has no cap
    // here: its stock is checked when it is handed over.
    if (!preorder) {
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
    }

    if (preorder && advanceText.trim() !== '') {
      if (!(parseFloat(advanceText) > 0)) { setError('The advance must be more than nothing, or leave it empty.'); return; }
      if (advance > owed + 0.005) {
        setError(`The advance (${currency.symbol}${advance.toFixed(2)}) is more than the order comes to (${currency.symbol}${owed.toFixed(2)}).`);
        return;
      }
    }
    if (preorder && slot === 'time' && !/^\d{1,2}:\d{2}$/.test(dueTime)) {
      setError('Please choose the time, or pick another time of day.');
      return;
    }
    const dueSlot = slot === 'time' ? dueTime : slot;

    setIsSaving(true);
    try {
      await onSave(
        { date, customerName: customerName.trim() || undefined, customerPhone: customerPhone.trim() || undefined,
          deliveryAddress: deliveryAddress.trim() || undefined, paymentStatus: payLater ? 'unpaid' : 'paid',
          paymentMethod: !payLater && method ? method : undefined, discount: discount > 0 ? discount : undefined,
          ...(preorder && {
            preorder: true,
            ...(dueSlot && { dueSlot }),
            ...(notes.trim() && { notes: notes.trim() }),
            ...(advance > 0 && { advance: { amount: advance, method: advanceMethod } }),
          }) },
        lineItems.map(li => {
          const custom = priceOf(li);
          const menuPrice = menu.find(m => m.id === li.menuItemId)?.sellingPrice ?? 0;
          return { menuItemId: li.menuItemId, quantity: li.quantity, ...(custom !== menuPrice && { unitPrice: custom }) };
        })
      );
      // A pre-order for a customer with a phone number: offer to confirm it on WhatsApp before closing.
      const phone = customerPhone.trim();
      const message = preorder && phone
        ? buildPreorderConfirmation({
            customerName: customerName.trim() || undefined,
            lines: lineItems.map(li => ({ name: menu.find(m => m.id === li.menuItemId)?.name ?? 'item', quantity: li.quantity })),
            date, dueSlot, currency, total: owed, advance: advance > 0 ? advance : undefined,
          })
        : '';
      const url = message ? buildWhatsAppUrl(phone, message) : null;
      if (url) {
        setBooked({ message, url });
        return;
      }
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
      title={booked ? 'Pre-order Booked' : preorder ? 'Book Pre-order' : 'Add Order'}
      subtitle={booked ? 'Let the customer know' : preorder ? 'Take an order for later' : 'Log a customer order'}
      icon={ShoppingBag}
      onClose={handleClose}
      footer={booked ? (
        <div className="flex gap-3">
          <button
            onClick={handleClose}
            className="flex-1 sm:flex-none sm:w-36 h-12 rounded-xl bg-stone-100 text-ink text-sm font-semibold hover:bg-stone-200 transition-colors"
          >
            Done
          </button>
          <button
            onClick={() => window.open(booked.url, '_blank', 'noopener,noreferrer')}
            className="flex-1 h-12 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors shadow-md shadow-primary/20 flex items-center justify-center gap-2"
          >
            <MessageCircle size={18} /> Send confirmation
          </button>
        </div>
      ) : (
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
              {isSaving ? (preorder ? 'Booking...' : 'Adding...') : preorder
                ? (lineItems.length > 1 ? `Book Pre-order (${lineItems.length} Items)` : 'Book Pre-order')
                : lineItems.length > 1 ? `Add Order (${lineItems.length} Items)` : 'Add Order'}
            </button>
          </div>
          {error && <div className="text-coral text-xs font-semibold mt-2 text-center">{error}</div>}
        </>
      )}
    >
      {booked ? (
        <div className="space-y-3">
          <p className="text-sm text-ink">The pre-order is booked. Send the customer a confirmation on WhatsApp?</p>
          <blockquote className="rounded-xl bg-stone-50 px-4 py-3 text-sm text-ink whitespace-pre-wrap">{booked.message}</blockquote>
        </div>
      ) : (<>
      {/* From stock, or a pre-order booked for later */}
      <div>
        <div className={MODAL_LABEL}>Order type</div>
        <div role="radiogroup" aria-label="Order type" className="inline-flex p-1 bg-stone-100 rounded-xl">
          {([['stock', 'From stock'], ['preorder', 'Pre-order']] as const).map(([value, label]) => {
            const selected = mode === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => chooseMode(value)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${selected ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {preorder && (
          <p className="text-xs text-muted mt-1.5">
            Booked for later: no stock is needed or taken now. It takes stock when you hand it over, and counts as a sale on its due date.
          </p>
        )}
      </div>

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
                    onChange={e => updateLineItem(i, { menuItemId: e.target.value, priceText: undefined })}
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
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 px-1 font-mono text-[11px] text-muted">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold ${
                        preorder && li.quantity > stock ? 'bg-amber-100 text-amber-700' : stock <= 0 ? 'bg-coral/10 text-coral' : 'bg-margin/10 text-[#006143]'
                      }`}
                    >
                      {preorder && li.quantity > stock ? `${stock} on the shelf · not baked yet` : `${stock} available`}
                    </span>
                    <label className="inline-flex items-center gap-1">
                      <span>{currency.symbol}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        aria-label={lineItems.length > 1 ? `Price of item ${i + 1}` : 'Price of item'}
                        value={li.priceText ?? String(item.sellingPrice)}
                        onChange={e => updateLineItem(i, { priceText: e.target.value })}
                        className={`w-20 bg-stone-50 border rounded-md px-1.5 py-0.5 text-right outline-none focus:bg-white focus:border-primary ${
                          invalidRowIndex === i && li.priceText !== undefined && li.priceText.trim() !== '' && !(parseFloat(li.priceText) > 0) ? 'border-coral' : 'border-transparent'
                        } ${li.priceText !== undefined && priceOf(li) !== item.sellingPrice ? 'text-primary font-semibold' : ''}`}
                      />
                      <span>each = {currency.symbol}{(priceOf(li) * li.quantity).toFixed(2)}</span>
                    </label>
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
            <Calendar size={12} /> {preorder ? 'Due date' : 'Order date'}
          </label>
          <input
            id="order-date"
            type="date"
            value={date}
            onChange={e => chooseDate(e.target.value)}
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

      {preorder && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="order-slot" className={`${MODAL_LABEL} flex items-center gap-1.5`}>
              <Clock size={12} /> Time of day (optional)
            </label>
            <div className="flex gap-2">
              <select id="order-slot" value={slot} onChange={e => setSlot(e.target.value)} className={modalField()}>
                {DUE_SLOTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {slot === 'time' && (
                <input type="time" aria-label="Time" value={dueTime} onChange={e => setDueTime(e.target.value)} className={`${modalField()} font-mono w-32 shrink-0`} />
              )}
            </div>
          </div>
          <div>
            <label htmlFor="order-notes" className={`${MODAL_LABEL} flex items-center gap-1.5`}>
              <StickyNote size={12} /> Notes (optional)
            </label>
            <textarea
              id="order-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Cake message, eggless, pick-up instructions"
              className={`${modalField()} resize-none`}
            />
          </div>
        </div>
      )}

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

      {preorder && (
        <div>
          <div className={MODAL_LABEL}>Advance received (optional)</div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted">{currency.symbol}</span>
            <input
              id="order-advance"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              aria-label="Advance amount"
              value={advanceText}
              onChange={e => setAdvanceText(e.target.value)}
              placeholder="0"
              className={`${modalField()} font-mono !w-auto min-w-0 flex-1`}
            />
            <select aria-label="Advance paid by" value={advanceMethod} onChange={e => setAdvanceMethod(e.target.value as PaymentMethod)} className={`${modalField()} !w-32 shrink-0`}>
              {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          {advance > 0 && (
            <p className="text-xs text-muted mt-1.5">
              {balance <= 0.005
                ? 'The advance covers the whole order: it is paid in full.'
                : `Balance at handover: ${currency.symbol}${balance.toFixed(2)}. It stays under pending payments until it is paid.`}
            </p>
          )}
        </div>
      )}

      {!(preorder && advance > 0) && (
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
                onClick={() => { payChosen.current = true; setPayLater(value === 'later'); }}
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
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {!payLater && !(preorder && advance > 0) && (
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
          {preorder && advance > 0 && (
            <div className="font-mono text-[11px] text-muted mt-0.5">advance {currency.symbol}{advance.toFixed(2)} · balance {currency.symbol}{balance.toFixed(2)}</div>
          )}
        </div>
        <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-primary">
          <ShoppingBag size={22} />
        </div>
      </div>
      </>)}
    </ModalShell>
  );
}
