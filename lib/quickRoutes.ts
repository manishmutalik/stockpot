/**
 * quickRoutes.ts
 *
 * Express handlers for the phone app's save endpoints (`/api/mobile/*`), with
 * their data layer injected so they are tested without Firebase. Wired up in
 * server.ts behind `requireAuth` and the same plan check as the web app.
 *
 * Every write here goes through the plans in `src/utils/plans`, the same code
 * the web hooks run, inside one Firestore transaction that reads the live
 * documents first. So a stock cap is checked against what is on the shelf now,
 * not against whatever the phone loaded earlier.
 *
 * Every POST needs an `Idempotency-Key` header (a fresh UUID per confirm tap): a
 * phone on a poor connection retries, and a retried "save order" must never
 * create a second order. These routes take no CSRF token: that check exists
 * because a browser attaches cookies by itself, and the app authenticates with a
 * Bearer token it holds, which another site cannot make it send.
 */
import type { NextFunction, Response } from 'express';
import type { AuthedRequest } from './auth';
import { parseIdempotencyKey, withIdempotency, type QuickDb, type QuickDoc, type QuickTx, type StoredResult } from './quickDb';
import { planOrderGroup, planRestock, planProductionSession, planHandOver, planMarkPaid, collapseWrites, productionRunCost } from '../src/utils/plans';
import type { OrderGroupCommon, OrderLineItem, PlanError, ProductionRunInput } from '../src/utils/plans';
import { enterableUnits } from '../src/utils/conversions';
import { speechPhrases } from '../src/utils/speechPhrases';
import { customerDirectory } from '../src/utils/quickParse';
import { saleAmounts } from '../src/utils/profit';
import { buildBill, billBalance, buildBillMessage, buildInvoiceMessage, buildWhatsAppUrl, withBillLink } from '../src/utils/billing';
import { formatAmount } from '../src/utils/money';
import { isUnpaid } from '../src/utils/payments';
import { customerDues, matchingOption } from '../src/utils/quickPayments';
import { billSettingsOf, buildToday, buildUpcoming, USE_BY_SOON_DAYS } from '../src/utils/quickViews';
import { EXPO_PUSH_TOKEN, readNotificationSettings, withNotificationDefaults } from '../src/utils/quickNotifications';
import { clusterOrdersByGroup } from '../src/utils/orderClustering';
import { addDays, todayInZone } from '../src/utils/localDate';
import type { BakerySettings, MenuItem, Order, PaymentMethod, RawMaterial } from '../src/types';

export interface QuickRouteDeps {
  db: QuickDb;
  now: () => number;
  newId: () => string;
  /** Makes (or refreshes) the public bill for an order, once it is saved. Absent: answers carry no bill link. */
  bills?: (uid: string, orderId: string) => Promise<{ token: string } | null>;
  /** The app's public address, for the "view bill online" link. */
  publicUrl?: string;
}

// ─── Access ─────────────────────────────────────────────────────────────────

/** The same rule the web paywall uses: an account the server puts behind the paywall needs an active plan. */
export function createAccessGate(deps: {
  paywall: (account: { email?: string; emailVerified?: boolean }) => boolean;
  hasActiveAccess: (uid: string) => Promise<boolean>;
}) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (deps.paywall({ email: req.email, emailVerified: req.emailVerified }) && !(await deps.hasActiveAccess(req.uid!))) {
        return res.status(402).json({ error: 'A plan is needed to use Stockpot Quick.', code: 'subscription_required' });
      }
      return next();
    } catch (err: any) {
      console.error('Quick access check failed:', err?.message);
      return res.status(500).json({ error: 'Could not check your plan.' });
    }
  };
}

// ─── Request reading ────────────────────────────────────────────────────────

type Read<T> = { ok: true; value: T } | { ok: false; error: string };
const bad = (error: string): { ok: false; error: string } => ({ ok: false, error });
const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

const ID = /^[A-Za-z0-9_.-]{1,80}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const METHODS: PaymentMethod[] = ['upi', 'cash', 'card', 'other'];

const isDate = (v: unknown): v is string => typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(v));
const isPositive = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max;
const text = (v: unknown, max: number): string | undefined | null => {
  if (v === undefined || v === null || v === '') return undefined;
  return typeof v === 'string' && v.trim().length <= max ? v.trim() : null; // null = not acceptable
};
const method = (v: unknown): PaymentMethod | null => (typeof v === 'string' && (METHODS as string[]).includes(v) ? (v as PaymentMethod) : null);

export function readOrderBody(body: unknown): Read<{ common: Omit<OrderGroupCommon, 'date'> & { date?: string }; lineItems: OrderLineItem[] }> {
  if (!isObject(body) || !isObject(body.common) || !Array.isArray(body.lineItems)) return bad('Send { common, lineItems }.');
  const c = body.common;
  if (body.lineItems.length < 1 || body.lineItems.length > 30) return bad('An order needs between 1 and 30 items.');

  const lineItems: OrderLineItem[] = [];
  for (const li of body.lineItems) {
    if (!isObject(li) || typeof li.menuItemId !== 'string' || !ID.test(li.menuItemId)) return bad('Each item needs a menuItemId.');
    if (!isPositive(li.quantity, 100_000)) return bad('Each item needs a quantity above nothing.');
    if (li.unitPrice !== undefined && !isPositive(li.unitPrice, 10_000_000)) return bad('An agreed price must be above nothing.');
    lineItems.push({ menuItemId: li.menuItemId, quantity: li.quantity, ...(li.unitPrice !== undefined && { unitPrice: li.unitPrice }) });
  }

  if (c.date !== undefined && !isDate(c.date)) return bad('The date must be YYYY-MM-DD.');
  const customerName = text(c.customerName, 100), customerPhone = text(c.customerPhone, 20), deliveryAddress = text(c.deliveryAddress, 300);
  const dueSlot = text(c.dueSlot, 40), notes = text(c.notes, 500);
  if ([customerName, customerPhone, deliveryAddress, dueSlot, notes].includes(null as any)) return bad('A text field is too long.');
  if (c.paymentStatus !== undefined && c.paymentStatus !== 'paid' && c.paymentStatus !== 'unpaid') return bad('paymentStatus must be paid or unpaid.');
  if (c.paymentMethod !== undefined && !method(c.paymentMethod)) return bad('Unknown payment method.');
  if (c.discount !== undefined && !(typeof c.discount === 'number' && Number.isFinite(c.discount) && c.discount >= 0 && c.discount <= 10_000_000)) return bad('The discount must be zero or more.');
  if (c.preorder !== undefined && typeof c.preorder !== 'boolean') return bad('preorder must be true or false.');
  let advance: OrderGroupCommon['advance'];
  if (c.advance !== undefined) {
    if (!isObject(c.advance) || !isPositive(c.advance.amount, 10_000_000) || !method(c.advance.method)) return bad('An advance needs an amount and a payment method.');
    advance = { amount: c.advance.amount, method: c.advance.method };
  }

  return { ok: true, value: {
    lineItems,
    common: {
      ...(c.date && { date: c.date }),
      ...(customerName && { customerName }), ...(customerPhone && { customerPhone }), ...(deliveryAddress && { deliveryAddress }),
      ...(c.paymentStatus && { paymentStatus: c.paymentStatus }), ...(c.paymentMethod && { paymentMethod: c.paymentMethod }),
      ...(c.discount !== undefined && { discount: c.discount }),
      ...(c.preorder !== undefined && { preorder: c.preorder }),
      ...(dueSlot && { dueSlot }), ...(notes && { notes }), ...(advance && { advance }),
    },
  } };
}

interface RestockLine { materialId: string; quantity: number; unit?: string; total: number; expiryDate?: string }

export function readRestockBody(body: unknown): Read<{ lines: RestockLine[] }> {
  if (!isObject(body) || !Array.isArray(body.lines)) return bad('Send { lines }.');
  if (body.lines.length < 1 || body.lines.length > 30) return bad('A restock needs between 1 and 30 lines.');
  const lines: RestockLine[] = [];
  for (const l of body.lines) {
    if (!isObject(l) || typeof l.materialId !== 'string' || !ID.test(l.materialId)) return bad('Each line needs a materialId.');
    if (!isPositive(l.quantity, 10_000_000)) return bad('Each line needs a quantity above nothing.');
    if (!isPositive(l.total, 1_000_000_000)) return bad('Each line needs the price paid, above nothing.');
    if (l.unit !== undefined && (typeof l.unit !== 'string' || l.unit.length > 12)) return bad('Unknown unit.');
    if (l.expiryDate !== undefined && !isDate(l.expiryDate)) return bad('The expiry date must be YYYY-MM-DD.');
    lines.push({ materialId: l.materialId, quantity: l.quantity, total: l.total, ...(l.unit && { unit: l.unit }), ...(l.expiryDate && { expiryDate: l.expiryDate }) });
  }
  return { ok: true, value: { lines } };
}

interface ProductionRow { recipeId: string; quantityProduced: number; quantityYield?: number; notes?: string }

export function readProductionBody(body: unknown): Read<{ date?: string; rows: ProductionRow[] }> {
  if (!isObject(body) || !Array.isArray(body.rows)) return bad('Send { rows }.');
  if (body.rows.length < 1 || body.rows.length > 20) return bad('A production run needs between 1 and 20 items.');
  if (body.date !== undefined && !isDate(body.date)) return bad('The date must be YYYY-MM-DD.');
  const rows: ProductionRow[] = [];
  for (const r of body.rows) {
    if (!isObject(r) || typeof r.recipeId !== 'string' || !ID.test(r.recipeId)) return bad('Each item needs a recipeId.');
    if (!isPositive(r.quantityProduced, 1_000_000)) return bad('Each item needs a quantity above nothing.');
    if (r.quantityYield !== undefined && !(typeof r.quantityYield === 'number' && Number.isFinite(r.quantityYield) && r.quantityYield >= 0 && r.quantityYield <= r.quantityProduced)) {
      return bad('The yield must be between nothing and the quantity made.');
    }
    const notes = text(r.notes, 500);
    if (notes === null) return bad('The notes are too long.');
    rows.push({ recipeId: r.recipeId, quantityProduced: r.quantityProduced, ...(r.quantityYield !== undefined && { quantityYield: r.quantityYield }), ...(notes && { notes }) });
  }
  return { ok: true, value: { ...(body.date && { date: body.date }), rows } };
}

// ─── Answering ──────────────────────────────────────────────────────────────

const failure = (status: number, error: string, extra: Record<string, unknown> = {}): StoredResult => ({ status, body: { error, ...extra } });

/** A plan that said no: out of stock is a conflict with what is on the shelf; the rest is something the owner can correct. */
const planFailure = (e: PlanError): StoredResult =>
  failure(e.code === 'insufficient_stock' ? 409 : 422, e.message, { code: e.code, title: e.title });

/** Reads, validates and runs a save under its idempotency key, then sends the answer. */
function writeHandler<T>(
  deps: QuickRouteDeps,
  scope: string,
  read: (body: unknown) => Read<T>,
  run: (tx: QuickTx, input: T, req: AuthedRequest) => Promise<StoredResult>,
  /** Adds to a successful answer after it is saved (not remembered with it), e.g. a link made outside the transaction. */
  decorate?: (body: any, req: AuthedRequest) => Promise<Record<string, unknown>>
) {
  return async (req: AuthedRequest, res: Response) => {
    const key = parseIdempotencyKey(req.headers['idempotency-key']);
    if (!key) return res.status(400).json({ error: 'Send an Idempotency-Key header: a fresh unique id for each save.', code: 'idempotency_key_required' });
    const parsed = read(req.body);
    if (parsed.ok === false) return res.status(400).json({ error: parsed.error, code: 'bad_request' });

    try {
      const result = await withIdempotency(deps.db, { uid: req.uid!, scope, key, now: deps.now }, tx => run(tx, parsed.value, req));
      if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
      let body = result.body;
      if (decorate && result.status >= 200 && result.status < 300) {
        try { body = { ...(result.body as object), ...(await decorate(result.body, req)) }; }
        catch (err: any) { console.error(`Quick ${scope} could not add to its answer:`, err?.message); }
      }
      return res.status(result.status).json(body);
    } catch (err: any) {
      console.error(`Quick ${scope} failed:`, err?.message);
      return res.status(500).json({ error: 'Could not save that. Nothing was saved; please try again.', code: 'save_failed' });
    }
  };
}

export const asMenu = (docs: Map<string, any>) => [...docs.values()] as MenuItem[];

/** The business settings, or an empty object for an account that has not saved any. */
export const loadSettings = async (tx: QuickTx): Promise<Partial<BakerySettings>> => ((await tx.get('settings', 'bakery')) ?? {}) as Partial<BakerySettings>;

/** The materials the recipes of these menu items use, loaded together. */
export async function materialsFor(tx: QuickTx, items: MenuItem[]): Promise<RawMaterial[]> {
  const ids = items.flatMap(m => (m.recipe ?? []).map(r => r.materialId));
  return [...(await tx.getMany('materials', ids)).values()] as RawMaterial[];
}

// ─── POST /mobile/orders ────────────────────────────────────────────────────

/** Adds an order (or a pre-order), exactly as Add Order would. */
export function createQuickOrderHandler(deps: QuickRouteDeps) {
  return writeHandler(deps, 'orders', readOrderBody, async (tx, { common, lineItems }) => {
    const settings = await loadSettings(tx);
    const menu = asMenu(await tx.getMany('menu', lineItems.map(l => l.menuItemId)));
    const materials = await materialsFor(tx, menu);
    const today = todayInZone(settings.timezone, new Date(deps.now()));

    const plan = planOrderGroup({
      common: { ...common, date: common.date ?? today }, lineItems, menu, materials,
      feeRates: settings.paymentFeeRates, gst: settings, today, ctx: { newId: deps.newId },
    });
    if (plan.ok === false) return planFailure(plan.error);

    tx.apply(plan.writes);
    const total = Math.round(saleAmounts(plan.orders, menu, settings).customerPays * 100) / 100;
    const advance = plan.orders.find(o => o.advance)?.advance?.amount ?? 0;
    return { status: 201, body: {
      orderIds: plan.orders.map(o => o.id),
      orderGroupId: plan.orders[0].orderGroupId ?? null,
      preorder: plan.preorder,
      // Nothing is owed on an order that was paid in full (the plan marks only an order with a balance unpaid).
      total, advance, balanceDue: plan.orders.some(o => o.paymentStatus === 'unpaid') ? Math.round(Math.max(total - advance, 0) * 100) / 100 : 0,
    } };
  });
}

// ─── POST /mobile/restocks ──────────────────────────────────────────────────

/** Records stock bought: the stock, moving-average cost and price history of each material, together. */
export function createQuickRestockHandler(deps: QuickRouteDeps) {
  return writeHandler(deps, 'restocks', readRestockBody, async (tx, { lines }) => {
    const found = await tx.getMany('materials', lines.map(l => l.materialId));
    const working = new Map<string, RawMaterial>([...found].map(([id, m]) => [id, m as unknown as RawMaterial]));
    const writes = [];
    const results = [];

    for (const line of lines) {
      const material = working.get(line.materialId);
      if (!material) {
        return failure(422, `That item isn't in your materials. Add it in the web app first.`, { code: 'unknown_material', materialId: line.materialId });
      }
      if (line.unit && !enterableUnits(material.unit || 'g').includes(line.unit)) {
        return failure(422, `${line.unit} can't be converted to ${material.unit || 'g'} for ${material.name}.`, { code: 'unit_mismatch', materialId: line.materialId });
      }
      const plan = planRestock({ material, quantity: line.quantity, quantityUnit: line.unit, total: line.total, expiryDate: line.expiryDate, ctx: { newId: deps.newId, now: deps.now } });
      if (plan.ok === false) return failure(422, 'Each line needs a quantity above nothing.', { code: 'invalid_quantity', materialId: line.materialId });
      writes.push(...plan.writes);
      // A material bought twice in one go: the second line starts from the first's result.
      working.set(material.id, { ...material, initialStock: plan.newStock, costPerUnit: plan.newCostPerUnit });
      results.push({ materialId: material.id, name: material.name, unit: material.unit || 'g', newStock: plan.newStock, previousCostPerUnit: plan.previousCostPerUnit, newCostPerUnit: plan.newCostPerUnit });
    }

    tx.apply(collapseWrites(writes));
    return { status: 201, body: { lines: results } };
  });
}

// ─── POST /mobile/production-runs ───────────────────────────────────────────

/** Logs what was made: ingredients deducted, finished stock added. Several items are saved together, all or nothing. */
export function createQuickProductionHandler(deps: QuickRouteDeps) {
  return writeHandler(deps, 'production-runs', readProductionBody, async (tx, { date, rows }) => {
    const settings = await loadSettings(tx);
    const menu = asMenu(await tx.getMany('menu', rows.map(r => r.recipeId)));
    const materials = await materialsFor(tx, menu);
    const day = date ?? todayInZone(settings.timezone, new Date(deps.now()));

    const inputs: ProductionRunInput[] = rows.map(r => {
      const recipe = menu.find(m => m.id === r.recipeId)?.recipe ?? [];
      return {
        recipeId: r.recipeId,
        quantityProduced: r.quantityProduced,
        quantityYield: r.quantityYield ?? r.quantityProduced,
        date: day,
        notes: r.notes,
        // The material cost now, kept on the run, rounded to two decimals, as the web form does.
        costTotal: parseFloat(productionRunCost(recipe, materials, r.quantityProduced).toFixed(2)),
      };
    });

    const plan = planProductionSession(inputs, { materials, menu }, { newId: deps.newId, now: deps.now });
    if (plan.ok === false) return planFailure(plan.error);

    tx.apply(plan.writes);
    // The web lets stock go below nothing; say so, so the owner can correct it.
    const shortages = plan.state.materials
      .filter(m => m.initialStock < 0)
      .map(m => ({ materialId: m.id, name: m.name, unit: m.unit, short: Math.round(-m.initialStock * 10000) / 10000 }));
    return { status: 201, body: { runIds: plan.runIds, sessionId: plan.sessionId ?? null, shortages } };
  });
}

// ─── Bills and balances ─────────────────────────────────────────────────────

const DEFAULT_CURRENCY = { code: 'INR', symbol: '₹' };
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const currencyOf = (s: Partial<BakerySettings> & { currency?: { code: string; symbol: string } }) => s.currency ?? DEFAULT_CURRENCY;

// ─── POST /mobile/orders/:id/hand-over ──────────────────────────────────────

function readHandOverBody(body: unknown): Read<{ method?: PaymentMethod }> {
  if (body === undefined || body === null || (isObject(body) && Object.keys(body).length === 0)) return { ok: true, value: {} };
  if (!isObject(body)) return bad('Send { balanceReceived: { method } } or nothing.');
  if (body.balanceReceived === undefined) return { ok: true, value: {} };
  const m = isObject(body.balanceReceived) ? method(body.balanceReceived.method) : null;
  return m ? { ok: true, value: { method: m } } : bad('balanceReceived needs a payment method.');
}

/**
 * Hands an order over (a pre-order takes its stock now, all or nothing) and, when asked, records the balance as received
 * in the same save, by the method given. Answers with the balance that was due and a link to the bill.
 */
export function createQuickHandOverHandler(deps: QuickRouteDeps) {
  return writeHandler(deps, 'hand-over', readHandOverBody, async (tx, { method: paidBy }, req) => {
    const id = req.params.id;
    if (typeof id !== 'string' || !ID.test(id)) return failure(400, 'That is not an order id.', { code: 'bad_request' });

    const order = (await tx.get('orders', id)) as Order | null;
    if (!order) return failure(404, 'Order not found.', { code: 'not_found' });
    // A multi-item order is always handed over whole.
    const orders = order.orderGroupId ? ((await tx.where('orders', 'orderGroupId', order.orderGroupId)) as Order[]) : [order];
    const menu = asMenu(await tx.getMany('menu', orders.map(o => o.menuItemId)));
    const materials = await materialsFor(tx, menu);
    const settings = await loadSettings(tx);

    const plan = planHandOver({ order, orders, menu, materials });
    if (plan.kind === 'noop') return { status: 200, body: { handedOver: false, reason: 'already_handed_over', orderIds: orders.map(o => o.id) } };
    if (plan.kind === 'error') return failure(409, plan.message, { code: plan.code, title: plan.title });

    // What the customer still owes: the total less any advance, unless it is already paid.
    const unpaid = orders.filter(isUnpaid);
    const currency = currencyOf(settings);
    const bill = buildBill({ orders, menu, settings: billSettingsOf(settings), currency });
    const balanceDue = unpaid.length > 0 ? round2(billBalance(bill)) : 0;

    let writes = plan.writes;
    const received = !!paidBy && balanceDue > 0;
    if (received) writes = collapseWrites([...writes, ...planMarkPaid({ ids: unpaid.map(o => o.id), paid: true, method: paidBy, feeRates: settings.paymentFeeRates })]);
    tx.apply(writes);

    // The text to share with the bill: what is still owed if anything is, otherwise that it is paid (a bill alone does
    // not know an advance has since been settled).
    const settled = balanceDue === 0 || received;
    const billMessage = settled ? `${buildBillMessage({ ...bill, advance: undefined }, undefined)} Paid in full, thank you!` : buildBillMessage(bill, undefined);

    return { status: 200, body: {
      handedOver: true, orderIds: orders.map(o => o.id), balanceDue, balanceReceived: received ? balanceDue : 0, ...(received && { method: paidBy }),
      billMessage, customerPhone: orders.find(o => o.customerPhone)?.customerPhone ?? null,
    } };
  }, async (body, req) => {
    if (!deps.bills || !body?.orderIds?.length) return {};
    const made = await deps.bills(req.uid!, body.orderIds[0]);
    if (!made || !deps.publicUrl) return {};
    const billUrl = `${deps.publicUrl.replace(/\/$/, '')}/bill/${made.token}`;
    const shareMessage = withBillLink(body.billMessage, billUrl);
    return { billUrl, shareMessage, whatsappUrl: buildWhatsAppUrl(body.customerPhone ?? undefined, shareMessage) };
  });
}

// ─── POST /mobile/orders/:id/invoice ────────────────────────────────────────

/**
 * The bill for an order (all of a multi-item order), ready to send: the text, the link to the bill online, and a WhatsApp
 * link to the customer when the order has a phone number. Nothing about the order changes; the only write is the public bill
 * link itself (made or refreshed, as the hand-over does), so it is safe to ask again. A cancelled order has no invoice.
 */
export function createQuickInvoiceHandler(deps: QuickRouteDeps) {
  return async (req: AuthedRequest, res: Response) => {
    const id = req.params.id;
    if (typeof id !== 'string' || !ID.test(id)) return res.status(400).json({ error: 'That is not an order id.', code: 'bad_request' });
    try {
      const read = await deps.db.run(req.uid!, async tx => {
        const order = (await tx.get('orders', id)) as Order | null;
        if (!order) return { error: 'not_found' as const };
        const all = order.orderGroupId ? ((await tx.where('orders', 'orderGroupId', order.orderGroupId)) as Order[]) : [order];
        const orders = all.filter(o => !o.cancelledOn);
        if (orders.length === 0) return { error: 'cancelled' as const };
        const menu = asMenu(await tx.getMany('menu', orders.map(o => o.menuItemId)));
        const settings = await loadSettings(tx);
        const bill = buildBill({ orders, menu, settings: billSettingsOf(settings), currency: currencyOf(settings) });
        // What is still owed: the total less any advance, unless it is all paid (a bill alone does not know an advance has since been settled).
        const balanceDue = orders.some(isUnpaid) ? round2(billBalance(bill)) : 0;
        return { orderIds: orders.map(o => o.id), balanceDue, bill, customerPhone: orders.find(o => o.customerPhone)?.customerPhone ?? null };
      });
      if ('error' in read) {
        return read.error === 'not_found'
          ? res.status(404).json({ error: 'Order not found.', code: 'not_found' })
          : res.status(409).json({ error: 'That order was cancelled, so there is no invoice to send.', code: 'cancelled' });
      }
      let billUrl: string | undefined;
      if (deps.bills && deps.publicUrl) {
        const made = await deps.bills(req.uid!, read.orderIds[0]);
        if (made) billUrl = `${deps.publicUrl.replace(/\/$/, '')}/bill/${made.token}`;
      }
      const shareMessage = buildInvoiceMessage(read.bill, { settled: read.balanceDue === 0, link: billUrl });
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({ orderIds: read.orderIds, balanceDue: read.balanceDue, ...(billUrl && { billUrl }), shareMessage, whatsappUrl: buildWhatsAppUrl(read.customerPhone ?? undefined, shareMessage) });
    } catch (err: any) {
      console.error('Quick invoice failed:', err?.message);
      return res.status(500).json({ error: 'Could not prepare the invoice. Please try again.', code: 'invoice_failed' });
    }
  };
}

// ─── POST /mobile/payments ──────────────────────────────────────────────────

export function readPaymentBody(body: unknown): Read<{ customerKey: string; amount: number; method: PaymentMethod }> {
  if (!isObject(body)) return bad('Send { customerKey, amount, method }.');
  if (typeof body.customerKey !== 'string' || body.customerKey.length === 0 || body.customerKey.length > 200) return bad('Say whose payment it is.');
  if (!isPositive(body.amount, 1_000_000_000)) return bad('The amount must be above nothing.');
  const m = method(body.method);
  if (!m) return bad('Unknown payment method.');
  return { ok: true, value: { customerKey: body.customerKey, amount: body.amount, method: m } };
}

/**
 * A customer paid what they owe: their unpaid orders are marked paid, oldest first, by the method and with its fee rate,
 * as Mark paid does on the web. There are no part-payments yet (only a pre-order's advance), so the amount must come to
 * exactly what one or more whole orders are owed. Anything else is refused with what is owed, so the app can ask, and
 * nothing is guessed.
 */
export function createQuickPaymentHandler(deps: QuickRouteDeps) {
  return writeHandler(deps, 'payments', readPaymentBody, async (tx, { customerKey, amount, method: paidBy }) => {
    const settings = await loadSettings(tx);
    const unpaid = (await tx.where('orders', 'paymentStatus', 'unpaid')) as Order[];
    const menu = asMenu(await tx.getMany('menu', unpaid.map(o => o.menuItemId)));
    const currency = currencyOf(settings);
    const today = todayInZone(settings.timezone, new Date(deps.now()));

    const entry = customerDues({ unpaid, menu, settings, currency, today }).find(e => e.customer.key === customerKey);
    if (!entry) return failure(404, 'Nothing is pending for that customer.', { code: 'no_pending' });
    const { customer, dues, options } = entry;
    const matched = matchingOption(options, amount);

    if (matched < 0) {
      const owed = round2(customer.dueTotal);
      const orderWord = (n: number) => `${n} order${n === 1 ? '' : 's'}`;
      const why = amount > owed + 0.005
        ? `${formatAmount(amount, currency)} is more than that.`
        : `${formatAmount(amount, currency)} doesn't cover ${dues.length === 1 ? 'it' : `a whole order (the oldest is ${formatAmount(dues[0].due, currency)})`}.`;
      return failure(422, `${customer.name} owes ${formatAmount(owed, currency)} for ${orderWord(customer.orderCount)}. ${why}`, {
        code: 'amount_mismatch', customerName: customer.name, owed, orderCount: customer.orderCount, oldestOrderDue: dues[0].due, amountsThatWork: options,
      });
    }

    const paid = dues.slice(0, matched + 1).flatMap(d => d.orders);
    tx.apply(planMarkPaid({ ids: paid.map(o => o.id), paid: true, method: paidBy, feeRates: settings.paymentFeeRates }));
    return { status: 200, body: {
      customerName: customer.name, amount, method: paidBy, orderIds: paid.map(o => o.id),
      remainingDue: round2(customer.dueTotal - amount),
    } };
  });
}

// ─── GET /mobile/today and /mobile/upcoming ─────────────────────────────────

/** Whoever reads must be able to read these: they are the owner's own, and nothing here is written. */
function readHandler(deps: QuickRouteDeps, load: (tx: QuickTx, ctx: { today: string; settings: Partial<BakerySettings> & { currency?: { code: string; symbol: string } } }) => Promise<unknown>) {
  return async (req: AuthedRequest, res: Response) => {
    try {
      const body = await deps.db.run(req.uid!, async tx => {
        const settings = (await loadSettings(tx)) as Partial<BakerySettings> & { currency?: { code: string; symbol: string } };
        return load(tx, { today: todayInZone(settings.timezone, new Date(deps.now())), settings });
      });
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json(body);
    } catch (err: any) {
      console.error('Quick read failed:', err?.message);
      return res.status(500).json({ error: 'Could not load that. Pull to refresh to try again.', code: 'read_failed' });
    }
  };
}

const merge = (...lists: QuickDoc[][]) => [...new Map(lists.flat().map(d => [d.id, d])).values()];

/** What the Today screen shows, read inside the caller's transaction. Also what the notification job summarises, so they cannot disagree. */
export async function loadTodayView(tx: QuickTx, { today, settings }: { today: string; settings: Partial<BakerySettings> & { currency?: { code: string; symbol: string } } }) {
  const [dated, cancelled, unpaid, preorders, menu, materials, experiments, wastageLogs, productionRuns] = await Promise.all([
    tx.where('orders', 'date', today),
    tx.where('orders', 'cancelledOn', today),
    tx.where('orders', 'paymentStatus', 'unpaid'),
    tx.where('orders', 'preorder', true),
    tx.all('menu'),
    tx.all('materials'),
    tx.all('experiments'),
    tx.where('wastageLogs', 'date', today),
    // Batches whose use-by date is near or recently passed.
    tx.range('productionRuns', 'expiryDate', addDays(today, -30), addDays(today, USE_BY_SOON_DAYS)),
  ]);
  return buildToday({
    today, settings, currency: currencyOf(settings),
    orders: merge(dated, cancelled, unpaid, preorders) as unknown as Order[],
    menu: menu as unknown as MenuItem[], materials: materials as unknown as RawMaterial[],
    experiments: experiments as any, wastageLogs: wastageLogs as any, productionRuns: productionRuns as any,
  });
}

/** The Today screen: what needs attention, in order, and today's takings. */
export function createQuickTodayHandler(deps: QuickRouteDeps) {
  return readHandler(deps, (tx, ctx) => loadTodayView(tx, ctx));
}

/** The Upcoming screen: open pre-orders, overdue ones apart, soonest first. */
export function createQuickUpcomingHandler(deps: QuickRouteDeps) {
  return readHandler(deps, async (tx, { today, settings }) => {
    const [preorders, menu] = await Promise.all([tx.where('orders', 'preorder', true), tx.all('menu')]);
    return buildUpcoming({ today, settings, currency: currencyOf(settings), orders: preorders as unknown as Order[], menu: menu as unknown as MenuItem[] });
  });
}

/**
 * GET /mobile/speech-phrases[?customers=1]: the owner's menu and materials, as they are spoken, for the phone's speech
 * recogniser to listen for. Customers' names only come when the app asks (the owner switched it on): they go to the speech
 * service with the audio. Read-only.
 */
export function createQuickSpeechPhrasesHandler(deps: QuickRouteDeps) {
  return async (req: AuthedRequest, res: Response) => {
    const withCustomers = req.query?.customers === '1';
    try {
      const phrases = await deps.db.run(req.uid!, async tx => {
        const settings = (await loadSettings(tx)) as Partial<BakerySettings>;
        const today = todayInZone(settings.timezone, new Date(deps.now()));
        const [menu, materials, orders] = await Promise.all([
          tx.all('menu'), tx.all('materials'),
          withCustomers ? tx.range('orders', 'date', addDays(today, -365), addDays(today, 60)) : [],
        ]);
        return speechPhrases({
          menu: menu as { name?: string }[], materials: materials as { name?: string }[],
          customers: withCustomers ? customerDirectory(orders as unknown as Order[]).map(c => c.name) : [],
        });
      });
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({ phrases });
    } catch (err: any) {
      console.error('Quick speech phrases failed:', err?.message);
      return res.status(500).json({ error: 'Could not load that.', code: 'read_failed' });
    }
  };
}

// ─── Push token and notification settings ───────────────────────────────────

/** The settings document: one per owner. */
const NOTIFICATIONS_DOC = 'notifications';

/**
 * POST /mobile/push-token: remembers this phone, so the notification job can reach it. Saving the same phone again only
 * refreshes it, so no idempotency key is needed. One document per token, in a collection only the server reads.
 */
export function createQuickPushTokenHandler(deps: QuickRouteDeps) {
  return async (req: AuthedRequest, res: Response) => {
    const { token, platform } = req.body ?? {};
    if (typeof token !== 'string' || !EXPO_PUSH_TOKEN.test(token)) return res.status(400).json({ error: 'That is not a push token.', code: 'bad_request' });
    if (platform !== 'ios' && platform !== 'android') return res.status(400).json({ error: 'platform must be ios or android.', code: 'bad_request' });
    try {
      const id = token.replace(/[^A-Za-z0-9]/g, '_');
      await deps.db.run(req.uid!, async tx => {
        tx.apply([{ collection: 'devices', id, merge: false, data: { token, platform, updatedAt: deps.now() } }]);
      });
      return res.json({ saved: true });
    } catch (err: any) {
      console.error('Quick push token failed:', err?.message);
      return res.status(500).json({ error: 'Could not save that.', code: 'save_failed' });
    }
  };
}

/**
 * DELETE /mobile/push-token: this phone stops getting this owner's notifications (they signed out of the app on it). The
 * phone is switched off, not deleted, so the job skips it; registering it again (signing back in) switches it on. Never
 * behind the plan check: someone whose plan has lapsed can still sign out.
 */
export function createQuickPushTokenRemoveHandler(deps: QuickRouteDeps) {
  return async (req: AuthedRequest, res: Response) => {
    const { token } = req.body ?? {};
    if (typeof token !== 'string' || !EXPO_PUSH_TOKEN.test(token)) return res.status(400).json({ error: 'That is not a push token.', code: 'bad_request' });
    try {
      const id = token.replace(/[^A-Za-z0-9]/g, '_');
      await deps.db.run(req.uid!, async tx => {
        // Only a phone this owner registered: nothing is created for a token they never saved.
        if (await tx.get('devices', id)) tx.apply([{ collection: 'devices', id, merge: true, data: { disabled: true, disabledAt: deps.now() } }]);
      });
      return res.json({ removed: true });
    } catch (err: any) {
      console.error('Quick push token removal failed:', err?.message);
      return res.status(500).json({ error: 'Could not remove that.', code: 'save_failed' });
    }
  };
}

/** GET /mobile/notification-settings: what the owner chose, with the defaults for anything not chosen yet. */
export function createQuickNotificationSettingsGetHandler(deps: QuickRouteDeps) {
  return async (req: AuthedRequest, res: Response) => {
    try {
      const stored = await deps.db.run(req.uid!, tx => tx.get('mobileSettings', NOTIFICATIONS_DOC));
      return res.json(withNotificationDefaults(stored));
    } catch (err: any) {
      console.error('Quick notification settings read failed:', err?.message);
      return res.status(500).json({ error: 'Could not load that.', code: 'read_failed' });
    }
  };
}

/** PUT /mobile/notification-settings: saves all of them. An off switch is respected by the job that sends. */
export function createQuickNotificationSettingsPutHandler(deps: QuickRouteDeps) {
  return async (req: AuthedRequest, res: Response) => {
    const parsed = readNotificationSettings(req.body);
    if (parsed.ok === false) return res.status(400).json({ error: parsed.error, code: 'bad_request' });
    try {
      await deps.db.run(req.uid!, async tx => {
        tx.apply([{ collection: 'mobileSettings', id: NOTIFICATIONS_DOC, merge: false, data: { ...parsed.value, updatedAt: deps.now() } }]);
      });
      return res.json(parsed.value);
    } catch (err: any) {
      console.error('Quick notification settings save failed:', err?.message);
      return res.status(500).json({ error: 'Could not save that.', code: 'save_failed' });
    }
  };
}
