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
import { parseIdempotencyKey, withIdempotency, type QuickDb, type QuickTx, type StoredResult } from './quickDb';
import { planOrderGroup, planRestock, planProductionSession, collapseWrites, productionRunCost } from '../src/utils/plans';
import type { OrderGroupCommon, OrderLineItem, PlanError, ProductionRunInput } from '../src/utils/plans';
import { enterableUnits } from '../src/utils/conversions';
import { saleAmounts } from '../src/utils/profit';
import { todayInZone } from '../src/utils/localDate';
import type { BakerySettings, MenuItem, PaymentMethod, RawMaterial } from '../src/types';

export interface QuickRouteDeps {
  db: QuickDb;
  now: () => number;
  newId: () => string;
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
  run: (tx: QuickTx, input: T, req: AuthedRequest) => Promise<StoredResult>
) {
  return async (req: AuthedRequest, res: Response) => {
    const key = parseIdempotencyKey(req.headers['idempotency-key']);
    if (!key) return res.status(400).json({ error: 'Send an Idempotency-Key header: a fresh unique id for each save.', code: 'idempotency_key_required' });
    const parsed = read(req.body);
    if (parsed.ok === false) return res.status(400).json({ error: parsed.error, code: 'bad_request' });

    try {
      const result = await withIdempotency(deps.db, { uid: req.uid!, scope, key, now: deps.now }, tx => run(tx, parsed.value, req));
      if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
      return res.status(result.status).json(result.body);
    } catch (err: any) {
      console.error(`Quick ${scope} failed:`, err?.message);
      return res.status(500).json({ error: 'Could not save that. Nothing was saved; please try again.', code: 'save_failed' });
    }
  };
}

const asMenu = (docs: Map<string, any>) => [...docs.values()] as MenuItem[];

/** The business settings, or an empty object for an account that has not saved any. */
const loadSettings = async (tx: QuickTx): Promise<Partial<BakerySettings>> => ((await tx.get('settings', 'bakery')) ?? {}) as Partial<BakerySettings>;

/** The materials the recipes of these menu items use, loaded together. */
async function materialsFor(tx: QuickTx, items: MenuItem[]): Promise<RawMaterial[]> {
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
      total, advance, balanceDue: Math.round(Math.max(total - advance, 0) * 100) / 100,
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
