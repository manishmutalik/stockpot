/**
 * quickViews.ts
 *
 * What the phone app's Today and Upcoming screens show, worked out without
 * touching Firebase. Everything is built from the same functions the web
 * dashboard and Orders tab use (financialsForRange, summarizeDue, the pending-
 * payments grouping, the stock status), so a figure on the phone is the figure
 * on the web. The app never computes money itself: it only shows what is here.
 *
 * Amounts in `label` strings are already formatted in the business's currency.
 */
import type { BakerySettings, MenuItem, Order, RawMaterial, RecipeExperiment, WastageLog } from '../types';
import type { ProductionRun } from '../components/ProductionRunModal';
import { financialsForRange } from './profit';
import { buildBill, billBalance, formatMoney } from './billing';
import { groupPendingPayments } from './payments';
import { clusterOrdersByGroup } from './orderClustering';
import { isOpenPreorder, summarizeDue } from './preorders';
import type { Currency, StatusLine, TodayView, UpcomingOrder, UpcomingView } from './quickApiTypes';

export type { Currency, DueSummary, StatusKind, StatusLine, TodayView, UpcomingOrder, UpcomingView } from './quickApiTypes';
import { getExperimentMaterialUsage } from './experimentMaterialUsage';
import { getStockStatus } from './inventoryStatus';
import { getBatchesNeedingAttention } from './stockAging';
import { addDays, daysBetween } from './localDate';

/** A raw material or finished batch is "use by soon" when its date is this many days away or fewer. */
export const USE_BY_SOON_DAYS = 2;

/** What buildBill needs from the settings, with a blank for anything the owner has not filled in. */
export function billSettingsOf(s: Partial<BakerySettings>) {
  return {
    name: s.name ?? '', address: s.address ?? '', phone: s.phone ?? '', logo: s.logo,
    gstApplicable: s.gstApplicable, gstRate: s.gstRate, gstPricingMode: s.gstPricingMode, upiId: s.upiId,
  };
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ─── Today ──────────────────────────────────────────────────────────────────

export function buildToday(input: {
  today: string;
  settings: Partial<BakerySettings>;
  currency: Currency;
  /** Orders dated today or cancelled today, every unpaid order, and every pre-order: whatever the figures below need. */
  orders: Order[];
  menu: MenuItem[];
  materials: RawMaterial[];
  experiments: RecipeExperiment[];
  /** Today's wastage. */
  wastageLogs: WastageLog[];
  /** Runs whose use-by date is near (and any that passed recently). */
  productionRuns: ProductionRun[];
}): TodayView {
  const { today, settings, currency, orders, menu, materials } = input;
  const money = (n: number) => formatMoney(n, currency);

  // Stock on hand as the Inventory screen shows it: what is recorded, less experiments' pending draw.
  const usage = getExperimentMaterialUsage(input.experiments, materials);
  const remaining = materials.map(m => ({ ...m, remaining: parseFloat((m.initialStock - (usage[m.id] || 0)).toFixed(2)) }));

  const preorders = orders.filter(isOpenPreorder);
  const dueToday = summarizeDue(preorders, menu, d => d === today);
  const dueTomorrow = summarizeDue(preorders, menu, d => d === addDays(today, 1));
  const overdue = summarizeDue(preorders, menu, d => d < today);

  const pending = groupPendingPayments({ orders: orders.filter(o => o.paymentStatus === 'unpaid'), menu, settings: billSettingsOf(settings), currency, today });
  const pendingPayments = {
    customers: pending.length,
    orders: pending.reduce((n, c) => n + c.orderCount, 0),
    total: round2(pending.reduce((sum, c) => sum + c.dueTotal, 0)),
  };

  const lowStock = remaining
    .filter(m => getStockStatus(m.remaining, m.threshold) === 'low')
    .map(m => ({ id: m.id, name: m.name, remaining: m.remaining, unit: m.unit, threshold: m.threshold ?? 0 }));

  const useBySoon: TodayView['useBySoon'] = [
    ...materials.filter(m => !!m.expiryDate && daysBetween(today, m.expiryDate!) <= USE_BY_SOON_DAYS)
      .map(m => ({ kind: 'material' as const, id: m.id, name: m.name, date: m.expiryDate!, daysLeft: daysBetween(today, m.expiryDate!) })),
    ...getBatchesNeedingAttention(input.productionRuns, today)
      .filter(({ run }) => !!run.expiryDate)
      .map(({ run }) => ({ kind: 'batch' as const, id: run.id, name: menu.find(m => m.id === run.recipeId)?.name ?? 'Batch', date: run.expiryDate!, daysLeft: daysBetween(today, run.expiryDate!) })),
  ].sort((a, b) => a.daysLeft - b.daysLeft);

  const fin = financialsForRange({
    orders, menu, materials, experiments: input.experiments, wastageLogs: input.wastageLogs,
    settings: { ...settings, fixedCosts: settings.fixedCosts }, start: today, end: today, today,
  });
  const todayFigures = { revenue: round2(fin.income), trueProfit: round2(fin.trueProfit), orderCount: fin.orderCount };

  // Most urgent first; at most five lines.
  const lines: StatusLine[] = [];
  const dueNow = (overdue?.orderCount ?? 0) + (dueToday?.orderCount ?? 0);
  if (dueNow > 0) {
    lines.push({ kind: 'orders_due', tone: 'coral', label: overdue
      ? `${plural(dueNow, 'order')} due today or overdue`
      : `${plural(dueNow, 'order')} due today` });
  }
  if (pendingPayments.total > 0) {
    lines.push({ kind: 'payments_pending', tone: 'amber', label: `${plural(pendingPayments.customers, 'payment')} pending · ${money(pendingPayments.total)}` });
  }
  for (const m of lowStock.slice(0, 2)) lines.push({ kind: 'running_low', tone: 'amber', label: `${m.name} running low` });
  for (const u of useBySoon.slice(0, 1)) {
    lines.push({ kind: 'use_by_soon', tone: 'amber', label: `${u.name} ${u.daysLeft < 0 ? 'past its use-by date' : u.daysLeft === 0 ? 'use by today' : u.daysLeft === 1 ? 'use by tomorrow' : `use by in ${u.daysLeft} days`}` });
  }
  if (todayFigures.orderCount > 0) lines.push({ kind: 'profit', tone: 'green', label: `Today's profit ${money(todayFigures.trueProfit)}` });

  return {
    date: today, businessName: settings.name ?? '', currency,
    statusLines: lines.slice(0, 5),
    dueToday, dueTomorrow, overdue, pendingPayments, lowStock, useBySoon,
    today: todayFigures,
  };
}

// ─── Upcoming ───────────────────────────────────────────────────────────────

export function buildUpcoming(input: {
  today: string;
  settings: Partial<BakerySettings>;
  currency: Currency;
  /** Every pre-order. */
  orders: Order[];
  menu: MenuItem[];
}): UpcomingView {
  const { today, settings, currency, menu } = input;
  const open = input.orders.filter(isOpenPreorder);

  const entries: UpcomingOrder[] = clusterOrdersByGroup(open).map(c => {
    const members = c.type === 'single' ? [c.order] : c.orders;
    const first = members[0];
    const bill = buildBill({ orders: members, menu, settings: billSettingsOf(settings), currency });
    const named = members.find(o => o.customerName);
    const advance = members.map(o => o.advance).find(a => a && a.amount > 0);
    const wanted = new Map<string, number>();
    for (const o of members) wanted.set(o.menuItemId, (wanted.get(o.menuItemId) ?? 0) + o.quantity);
    const nameOf = (o: Order) => menu.find(m => m.id === o.menuItemId)?.name ?? o.itemNameAtSale ?? 'Item';
    return {
      orderId: first.id,
      orderIds: members.map(o => o.id),
      customerName: named?.customerName ?? null,
      customerPhone: members.find(o => o.customerPhone)?.customerPhone ?? null,
      date: first.date,
      dueSlot: members.find(o => o.dueSlot)?.dueSlot ?? null,
      notes: members.find(o => o.notes)?.notes ?? null,
      items: members.map(o => ({ menuItemId: o.menuItemId, name: nameOf(o), quantity: o.quantity })),
      total: round2(bill.total),
      advance: advance ? { amount: advance.amount, method: advance.method } : null,
      balanceDue: round2(billBalance(bill)),
      stockShort: [...wanted].flatMap(([id, qty]) => {
        const item = menu.find(m => m.id === id);
        const short = qty - (item?.finishedGoodsStock ?? 0);
        return short > 0 ? [{ name: item?.name ?? 'Item', short }] : [];
      }),
    };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.orderId.localeCompare(b.orderId));

  return {
    today, currency,
    overdue: entries.filter(e => e.date < today),
    upcoming: entries.filter(e => e.date >= today),
  };
}
