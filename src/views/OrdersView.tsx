import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import {
  Calendar, CheckCircle2, ClipboardList, Clock, Database, Globe, MapPin, Plus, Receipt, Search,
  ShoppingBag, Trash2, Truck, Wallet
} from 'lucide-react';
import { AppViewProps, Order, MenuItem } from '../types';
import { clusterOrdersByGroup, OrderCluster } from '../utils/orderClustering';
import { orderLineTotal, summarizeOrders } from '../utils/orderStats';
import { MetricCard } from '../components/MetricCard';
import { BillModal } from '../components/BillModal';
import { PendingPayments } from '../components/PendingPayments';
import { groupPendingPayments, isUnpaid } from '../utils/payments';

type StatusFilter = 'all' | 'pending' | 'fulfilled';

const TH = 'font-mono text-[10px] font-semibold uppercase tracking-wider text-muted';

const FIELD =
  'w-full bg-stone-50 border border-transparent hover:border-stone-200 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors';

const DELIVERY_LABEL: Record<NonNullable<Order['deliveryMethod']>, string> = {
  pickup: 'Pickup',
  self_delivery: 'Self-delivery',
  third_party: 'Courier',
};

const membersOf = (c: OrderCluster): Order[] => (c.type === 'single' ? [c.order] : c.orders);

const clusterMatchesSearch = (c: OrderCluster, menu: MenuItem[], q: string) =>
  membersOf(c).some(o => {
    const item = menu.find(m => m.id === o.menuItemId);
    return [o.customerName, o.customerPhone, o.deliveryAddress, item?.name]
      .some(v => (v || '').toLowerCase().includes(q));
  });

/**
 * Expandable delivery details for one order: method, address, what the
 * customer is charged, and (only for third-party couriers) what's paid out
 * to the courier, with the resulting margin on the delivery.
 */
const DeliveryDetailsSection: React.FC<{
  order: Order;
  updateOrder: (id: string, field: keyof Order, value: any) => void;
  currencySymbol: string;
  setPaid: (paid: boolean) => void;
}> = ({ order, updateOrder, currencySymbol, setPaid }) => {
  const method = order.deliveryMethod || 'pickup';
  const showMargin = method === 'third_party' && (order.deliveryCharge != null || order.deliveryFee != null);
  const margin = (order.deliveryCharge || 0) - (order.deliveryFee || 0);
  const label = 'block font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-1';
  return (
    <div className="mt-3 p-3 bg-white rounded-xl border border-stone-100 space-y-3">
      <div className="sm:max-w-xs">
        <label className={label} htmlFor={`payment-${order.id}`}>Payment</label>
        <select
          id={`payment-${order.id}`}
          value={isUnpaid(order) ? 'unpaid' : 'paid'}
          onChange={(e) => setPaid(e.target.value === 'paid')}
          className={FIELD}
        >
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid (pay later)</option>
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Delivery Method</label>
          <select
            value={method}
            onChange={(e) => updateOrder(order.id, 'deliveryMethod', e.target.value)}
            className={FIELD}
          >
            <option value="pickup">Pickup (no delivery)</option>
            <option value="self_delivery">Self-Delivery</option>
            <option value="third_party">Third-Party Courier (Uber, Porter, etc.)</option>
          </select>
        </div>
        {method !== 'pickup' && (
          <div>
            <label className={label}>Delivery Address</label>
            <input
              type="text"
              value={order.deliveryAddress || ''}
              onChange={(e) => updateOrder(order.id, 'deliveryAddress', e.target.value)}
              placeholder="Where is this being delivered?"
              className={FIELD}
            />
          </div>
        )}
      </div>
      {method !== 'pickup' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={label}>Charged to Customer</label>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted">{currencySymbol}</span>
              <input
                type="number" min="0" step="0.01"
                value={order.deliveryCharge ?? ''}
                onChange={(e) => updateOrder(order.id, 'deliveryCharge', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className={`${FIELD} font-mono font-semibold`}
              />
            </div>
          </div>
          {method === 'third_party' && (
            <div>
              <label className={label}>Paid to Courier</label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted">{currencySymbol}</span>
                <input
                  type="number" min="0" step="0.01"
                  value={order.deliveryFee ?? ''}
                  onChange={(e) => updateOrder(order.id, 'deliveryFee', parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className={`${FIELD} font-mono font-semibold`}
                />
              </div>
            </div>
          )}
          {showMargin && (
            <div className={`rounded-lg px-3 py-2 ${margin < 0 ? 'bg-coral/10 text-coral' : 'bg-margin/10 text-[#006143]'}`}>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-wider">Delivery margin</div>
              <div className="font-mono text-base font-semibold">
                {margin < 0 ? '-' : '+'}{currencySymbol}{Math.abs(margin).toFixed(2)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * One order's editable row — item, quantity, status, line total, customer
 * name/phone, and its actions (delivery details, fulfill, delete). One DOM
 * for every screen size: a stacked card grid on small screens that becomes
 * a single table-style row from `xl` up, so the same row renders identically
 * whether it stands alone or sits nested inside a multi-item order.
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
  money: (n: number) => string;
  /** Opens the bill for this order. Omitted for items nested in a multi-item order, whose header has the bill button. */
  onBill?: () => void;
  /** Marks this order's whole purchase (every item of a multi-item order) paid or unpaid. */
  setPaid: (paid: boolean) => void;
  /** Show the "Unpaid" tag on this row; a multi-item order shows it once, in its header. */
  showPaymentTag?: boolean;
}> = ({ order, menu, updateOrder, fulfillOrder, deleteOrder, expandedOrderIds, toggleDeliveryDetails, currencySymbol, money, onBill, setPaid, showPaymentTag }) => {
  // Stock available for a given menu item, from this order's point of view:
  // its own current item gets its already-claimed quantity added back in,
  // since that's this same order's claim being resized, not new stock.
  const availableFor = (item: MenuItem) => (item.finishedGoodsStock ?? 0) + (item.id === order.menuItemId ? order.quantity : 0);
  const currentItem = menu.find(m => m.id === order.menuItemId);
  const maxQty = currentItem ? availableFor(currentItem) : undefined;
  const hasDelivery = !!order.deliveryMethod && order.deliveryMethod !== 'pickup';
  const method = order.deliveryMethod || 'pickup';

  return (
    <div className="p-3 bg-stone-50/60 rounded-xl hover:bg-primary/[0.04] transition-colors">
      <div className="grid grid-cols-6 gap-2 items-center xl:grid-cols-[minmax(0,3fr)_4rem_minmax(0,2fr)_minmax(0,2fr)_8rem_6rem_9.5rem] xl:gap-2">
        <select
          aria-label="Item"
          value={order.menuItemId || ''}
          onChange={(e) => updateOrder(order.id, 'menuItemId', e.target.value)}
          className={`${FIELD} col-span-6 xl:col-span-1 xl:order-1 font-semibold`}
        >
          <option value="" disabled>Select Item</option>
          {menu.map(m => <option key={m.id} value={m.id}>{m.emoji ? `${m.emoji} ` : ''}{m.name} ({availableFor(m)} in stock)</option>)}
        </select>
        <input
          type="number" min="1" max={maxQty}
          aria-label="Quantity"
          value={order.quantity ?? 0}
          onChange={(e) => updateOrder(order.id, 'quantity', parseInt(e.target.value) || 0)}
          className={`${FIELD} col-span-2 xl:col-span-1 xl:order-2 font-mono font-semibold text-center`}
        />
        <div className="col-span-2 xl:col-span-1 xl:order-5 flex flex-wrap items-center gap-1">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full font-mono text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${
              order.fulfilled ? 'bg-margin/10 text-[#006143]' : 'bg-primary/10 text-primary'
            }`}
          >
            {order.fulfilled ? 'Fulfilled' : 'Pending'}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-stone-100 text-muted font-mono text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">
            {DELIVERY_LABEL[method]}
          </span>
          {showPaymentTag && isUnpaid(order) && (
            <button
              type="button"
              onClick={() => setPaid(true)}
              title="Unpaid. Click to mark as paid"
              aria-label="Unpaid, mark as paid"
              className="inline-flex items-center px-2 py-0.5 rounded-full bg-coral/10 text-coral font-mono text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap hover:bg-coral/20 transition-colors"
            >
              Unpaid
            </button>
          )}
        </div>
        <div className="col-span-2 xl:col-span-1 xl:order-6 text-right font-mono text-sm font-semibold text-ink whitespace-nowrap">
          {money(orderLineTotal(order, menu))}
        </div>
        <input
          type="text"
          aria-label="Customer name"
          value={order.customerName || ''}
          onChange={(e) => updateOrder(order.id, 'customerName', e.target.value)}
          placeholder="Customer name"
          className={`${FIELD} col-span-3 xl:col-span-1 xl:order-3`}
        />
        <input
          type="text"
          aria-label="Customer phone"
          value={order.customerPhone || ''}
          onChange={(e) => updateOrder(order.id, 'customerPhone', e.target.value)}
          placeholder="Phone"
          className={`${FIELD} col-span-3 xl:col-span-1 xl:order-4`}
        />
        <div className="col-span-6 xl:col-span-1 xl:order-7 flex justify-end gap-1">
          {onBill && (
            <button
              onClick={onBill}
              className="p-2 rounded-lg text-muted hover:text-primary hover:bg-primary/10 transition-colors"
              title="Generate Bill"
              aria-label="Generate Bill"
            >
              <Receipt size={18} />
            </button>
          )}
          <button
            onClick={() => toggleDeliveryDetails(order.id)}
            className={`p-2 rounded-lg transition-colors ${hasDelivery ? 'text-primary bg-primary/10' : 'text-muted hover:text-primary hover:bg-primary/10'}`}
            title="Delivery details"
            aria-label="Delivery details"
            aria-expanded={expandedOrderIds.has(order.id)}
          >
            <MapPin size={18} fill={hasDelivery ? 'currentColor' : 'none'} />
          </button>
          {!order.fulfilled ? (
            <button
              onClick={() => fulfillOrder(order)}
              className="p-2 rounded-lg text-margin hover:bg-margin/10 transition-colors"
              title="Mark Fulfilled"
              aria-label="Mark Fulfilled"
            >
              <CheckCircle2 size={18} />
            </button>
          ) : (
            <span className="p-2 text-margin" title="Order fulfilled">
              <CheckCircle2 size={18} fill="currentColor" stroke="#fff" />
            </span>
          )}
          <button
            onClick={() => deleteOrder(order.id)}
            className="p-2 rounded-lg text-coral/70 hover:text-coral hover:bg-coral/10 transition-colors"
            title="Delete Order"
            aria-label="Delete Order"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      {expandedOrderIds.has(order.id) && (
        <DeliveryDetailsSection order={order} updateOrder={updateOrder} currencySymbol={currencySymbol} setPaid={setPaid} />
      )}
    </div>
  );
};

export const OrdersView: React.FC<AppViewProps> = (props) => {
  const {
    orders, menu, currency, settings, orderFilterStart, setOrderFilterStart, orderFilterEnd, setOrderFilterEnd,
    setIsAddOrderModalOpen, shopifyStatus, importShopifyOrders, isImportingShopify, odooStatus,
    importOdooOrders, isImportingOdoo, fulfillOrder, markOrdersPaid, updateOrder, deleteOrder
  } = props;

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

  // Orders whose bill is open: one order, or every item of a multi-item order.
  const [billOrders, setBillOrders] = useState<Order[] | null>(null);
  // True when that bill is a consolidated statement of a customer's pending orders.
  const [billIsStatement, setBillIsStatement] = useState(false);
  const openBill = (orders: Order[], statement = false) => { setBillIsStatement(statement); setBillOrders(orders); };

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const money = (n: number) =>
    `${currency.symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const rangeOrders = useMemo(
    () => orders.filter(o => o.date >= orderFilterStart && o.date <= orderFilterEnd),
    [orders, orderFilterStart, orderFilterEnd]
  );
  const stats = useMemo(() => summarizeOrders(rangeOrders, menu), [rangeOrders, menu]);

  // Newest day first; each day's orders clustered into multi-item orders, then
  // narrowed by search and status. A multi-item order stays whole: it shows
  // (with all its items) when any one of its items matches.
  const q = search.trim().toLowerCase();
  const { days, counts } = useMemo(() => {
    const byDate: Record<string, Order[]> = {};
    rangeOrders.forEach(o => { (byDate[o.date] ||= []).push(o); });
    const counts = { all: 0, pending: 0, fulfilled: 0 };
    const days = Object.keys(byDate).sort((a, b) => b.localeCompare(a)).map(date => {
      const searched = clusterOrdersByGroup(byDate[date]).filter(c => !q || clusterMatchesSearch(c, menu, q));
      counts.all += searched.length;
      counts.pending += searched.filter(c => membersOf(c).some(o => !o.fulfilled)).length;
      counts.fulfilled += searched.filter(c => membersOf(c).every(o => o.fulfilled)).length;
      const clusters = searched.filter(c =>
        statusFilter === 'all' ? true
          : statusFilter === 'pending' ? membersOf(c).some(o => !o.fulfilled)
          : membersOf(c).every(o => o.fulfilled));
      return { date, clusters };
    }).filter(d => d.clusters.length > 0);
    return { days, counts };
  }, [rangeOrders, menu, q, statusFilter]);

  const setRange = (daysBack: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - daysBack);
    setOrderFilterStart(start.toISOString().split('T')[0]);
    setOrderFilterEnd(end.toISOString().split('T')[0]);
  };
  const isRangeActive = (daysBack: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - daysBack);
    return orderFilterStart === start.toISOString().split('T')[0] && orderFilterEnd === end.toISOString().split('T')[0];
  };

  const importBtn = 'h-10 flex items-center gap-2 px-4 rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:cursor-not-allowed';
  const deliveryNet = stats.deliveryCharged - stats.courierCost;

  const pendingCustomers = useMemo(
    () => groupPendingPayments({ orders, menu, settings, currency }),
    [orders, menu, settings, currency]
  );

  const rowProps = { menu, updateOrder, fulfillOrder, deleteOrder, expandedOrderIds, toggleDeliveryDetails, currencySymbol: currency.symbol, money };

  return (
    <motion.div
      key="orders"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6 pb-20"
    >
      {/* Heading */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
            <span className="truncate">{settings.name || 'My Bakery'}</span>
            <span className="text-stone-300">/</span>
            <span className="text-primary font-semibold whitespace-nowrap">Orders &amp; Fulfillment</span>
          </div>
          <h2 className="text-2xl md:text-[32px] md:leading-tight font-bold tracking-tight text-ink">Customer &amp; Courier Orders</h2>
          <p className="text-sm text-muted mt-1 max-w-2xl">Browse and manage all customer orders by date range.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {shopifyStatus.connected && (
            <button
              onClick={importShopifyOrders}
              disabled={isImportingShopify}
              className={`${importBtn} ${isImportingShopify ? 'bg-stone-100 text-muted' : 'bg-stone-50 hover:bg-stone-100 text-ink surface-card'}`}
            >
              <Globe size={16} className={isImportingShopify ? 'animate-spin' : ''} />
              {isImportingShopify ? 'Importing...' : 'Shopify Import'}
            </button>
          )}
          {odooStatus.connected && (
            <button
              onClick={importOdooOrders}
              disabled={isImportingOdoo}
              className={`${importBtn} ${isImportingOdoo ? 'bg-stone-100 text-muted' : 'bg-stone-50 hover:bg-stone-100 text-ink surface-card'}`}
            >
              <Database size={16} className={isImportingOdoo ? 'animate-spin' : ''} />
              {isImportingOdoo ? 'Importing...' : 'Odoo Import'}
            </button>
          )}
          {/* Handles both a single item and several at once */}
          <button
            onClick={() => setIsAddOrderModalOpen(true)}
            disabled={menu.length === 0}
            title="Add a customer order — one item or several, with customer details"
            className={`${importBtn} bg-primary hover:bg-primary-dark text-white disabled:opacity-50`}
          >
            <Plus size={18} />
            Add Order
          </button>
        </div>
      </div>

      {/* Headline figures for the selected range */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="Total Orders"
          value={String(stats.orderCount)}
          icon={Receipt}
          tone="teal"
          footLeft={`${stats.itemsSold} item${stats.itemsSold === 1 ? '' : 's'} sold`}
        />
        <MetricCard
          label="Revenue Booked"
          value={money(stats.revenue)}
          icon={Wallet}
          tone="slate"
          footLeft="Items + delivery charged"
          footRight={stats.deliveryCharged > 0 ? money(stats.deliveryCharged) : null}
        />
        <MetricCard
          label="Courier Cost"
          value={money(stats.courierCost)}
          icon={Truck}
          tone={stats.courierCost > stats.deliveryCharged ? 'coral' : 'slate'}
          footLeft={`${stats.courierDeliveries} courier deliver${stats.courierDeliveries === 1 ? 'y' : 'ies'}`}
          footRight={stats.courierCost > 0 || stats.deliveryCharged > 0
            ? `${deliveryNet < 0 ? '-' : '+'}${money(Math.abs(deliveryNet))} net`
            : null}
        />
        <MetricCard
          label="Pending Fulfilment"
          value={String(stats.pendingOrders)}
          icon={Clock}
          tone={stats.pendingOrders > 0 ? 'teal' : 'slate'}
          footLeft={`${stats.pendingItems} item${stats.pendingItems === 1 ? '' : 's'} to hand over`}
        />
      </div>

      {/* Range + search + status */}
      <div className="surface-card p-4 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center gap-3">
          <div className="flex flex-wrap items-center gap-2 bg-stone-50 rounded-lg px-3 h-10">
            <Calendar size={15} className="text-primary shrink-0" />
            <input
              type="date"
              aria-label="From date"
              value={orderFilterStart}
              onChange={(e) => setOrderFilterStart(e.target.value)}
              className="bg-transparent border-none focus:ring-0 font-mono text-xs font-semibold text-ink p-0 cursor-pointer w-28 sm:w-32"
            />
            <span className="text-stone-300 font-bold text-xs">→</span>
            <input
              type="date"
              aria-label="To date"
              value={orderFilterEnd}
              onChange={(e) => setOrderFilterEnd(e.target.value)}
              className="bg-transparent border-none focus:ring-0 font-mono text-xs font-semibold text-ink p-0 cursor-pointer w-28 sm:w-32"
            />
          </div>
          <div className="flex items-center gap-1 bg-stone-50 rounded-lg p-1">
            {[
              { label: 'Today', days: 0 },
              { label: '7 Days', days: 6 },
              { label: '30 Days', days: 29 },
            ].map(({ label, days: d }) => (
              <button
                key={label}
                onClick={() => setRange(d)}
                aria-pressed={isRangeActive(d)}
                className={`px-3 h-8 rounded-md font-mono text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap transition-colors ${
                  isRangeActive(d) ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-0 xl:max-w-sm xl:ml-auto">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, phone, item or address"
              aria-label="Search orders"
              className="w-full h-10 pl-10 pr-3 rounded-lg bg-stone-50 border border-transparent text-sm text-ink placeholder:text-muted focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {([
            ['all', 'All Orders', counts.all],
            ['pending', 'Pending', counts.pending],
            ['fulfilled', 'Fulfilled', counts.fulfilled],
          ] as [StatusFilter, string, number][]).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              aria-pressed={statusFilter === key}
              className={`flex items-center gap-2 px-3.5 h-9 rounded-full text-sm font-semibold transition-colors ${
                statusFilter === key ? 'bg-primary text-white shadow-sm' : 'bg-stone-50 text-muted hover:bg-stone-100'
              }`}
            >
              {label}
              <span className={`font-mono text-[11px] px-1.5 rounded-full ${statusFilter === key ? 'bg-white/20' : 'bg-white'}`}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Customers with unpaid orders (all dates), each with a consolidated bill */}
      <PendingPayments
        customers={pendingCustomers}
        money={money}
        onStatement={orders => openBill(orders, true)}
        onMarkPaid={c => {
          if (window.confirm(`Mark all ${c.orderCount} pending order${c.orderCount === 1 ? '' : 's'} from ${c.name} (${money(c.dueTotal)}) as paid?`)) {
            markOrdersPaid(c.orders.map(o => o.id), true);
          }
        }}
      />

      {/* Orders by day */}
      {days.length === 0 ? (
        <div className="surface-card text-center py-20 px-8">
          <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center mx-auto mb-5 text-stone-300">
            <ClipboardList size={32} />
          </div>
          {rangeOrders.length === 0 ? (
            <>
              <h3 className="text-xl font-bold text-ink mb-2">No orders in this range</h3>
              <p className="text-muted text-sm mb-6">Try changing the date range or add a new order.</p>
              <button
                onClick={() => setIsAddOrderModalOpen(true)}
                disabled={menu.length === 0}
                className="inline-flex items-center gap-2 h-10 bg-primary hover:bg-primary-dark text-white px-6 rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                <Plus size={18} />
                Log First Sale
              </button>
            </>
          ) : (
            <>
              <h3 className="text-xl font-bold text-ink mb-2">No orders match these filters</h3>
              <p className="text-muted text-sm">Clear the search or switch the status tab.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {days.map(({ date, clusters }) => {
            const dayOrders = clusters.flatMap(membersOf);
            const day = summarizeOrders(dayOrders, menu);
            return (
              <div key={date} className="surface-card overflow-hidden">
                <div className="px-4 sm:px-6 py-3 bg-primary/5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-primary" />
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink">
                      {new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-muted">
                    {day.orderCount} order{day.orderCount !== 1 ? 's' : ''} · {day.itemsSold} item{day.itemsSold !== 1 ? 's' : ''} · <b className="text-ink">{money(day.revenue)}</b>
                  </span>
                </div>
                <div className="p-3 sm:p-4 space-y-2">
                  {/* Column headers — table layout only */}
                  <div className={`hidden xl:grid grid-cols-[minmax(0,3fr)_4rem_minmax(0,2fr)_minmax(0,2fr)_8rem_6rem_9.5rem] gap-2 px-3 pb-1 ${TH}`}>
                    <div>Item</div>
                    <div className="text-center">Qty</div>
                    <div>Customer</div>
                    <div>Phone</div>
                    <div>Status</div>
                    <div className="text-right">Total</div>
                    <div className="text-right">Actions</div>
                  </div>
                  {clusters.map(cluster => cluster.type === 'single' ? (
                    <OrderRow key={cluster.order.id} order={cluster.order} {...rowProps} onBill={() => openBill([cluster.order])} setPaid={paid => markOrdersPaid([cluster.order.id], paid)} showPaymentTag />
                  ) : (
                    <div key={cluster.groupId} className="border border-primary/20 rounded-xl overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-primary/5">
                        <div className="flex items-center gap-2 min-w-0">
                          <ShoppingBag size={14} className="text-primary shrink-0" />
                          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-primary truncate">
                            Order ({cluster.orders.length} items){cluster.orders[0].customerName ? ` — ${cluster.orders[0].customerName}` : ''}
                          </span>
                          <span className="font-mono text-[11px] font-semibold text-ink whitespace-nowrap">
                            {money(summarizeOrders(cluster.orders, menu).revenue)}
                          </span>
                          {cluster.orders.some(isUnpaid) && (
                            <button
                              type="button"
                              onClick={() => markOrdersPaid(cluster.orders.map(o => o.id), true)}
                              title="Unpaid. Click to mark the whole order as paid"
                              aria-label="Unpaid, mark whole order as paid"
                              className="inline-flex items-center px-2 py-0.5 rounded-full bg-coral/10 text-coral font-mono text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap hover:bg-coral/20 transition-colors"
                            >
                              Unpaid
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => openBill(cluster.orders)}
                            title="Generate one bill for every item in this order"
                            className="flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-[10px] font-semibold uppercase tracking-wider text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Receipt size={13} /> Generate Bill
                          </button>
                          {cluster.orders.some(o => !o.fulfilled) && (
                            <button
                              onClick={() => cluster.orders.forEach(o => { if (!o.fulfilled) fulfillOrder(o); })}
                              title="Fulfill every item in this order"
                              className="flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-[10px] font-semibold uppercase tracking-wider text-[#006143] hover:bg-margin/10 transition-colors"
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
                            className="flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-[10px] font-semibold uppercase tracking-wider text-coral hover:bg-coral/10 transition-colors"
                          >
                            <Trash2 size={13} /> Delete All
                          </button>
                        </div>
                      </div>
                      <div className="p-2 space-y-2 bg-white">
                        {cluster.orders.map(order => (
                          <OrderRow key={order.id} order={order} {...rowProps} setPaid={paid => markOrdersPaid(cluster.orders.map(o => o.id), paid)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* In a portal: this view animates with a transform, which would otherwise pin the modal inside it. */}
      {billOrders && createPortal(
        <BillModal orders={billOrders} statement={billIsStatement} menu={menu} settings={settings} currency={currency} onClose={() => setBillOrders(null)} />,
        document.body
      )}
    </motion.div>
  );
};
