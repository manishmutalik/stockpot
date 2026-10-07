/**
 * quickParseRoutes.ts
 *
 * POST /api/mobile/parse: reads what the owner said (typed or spoken, as text)
 * into a draft they can confirm, and the questions the message leaves open.
 * Nothing is saved here; the draft is the body of the matching save endpoint.
 *
 * Four kinds of message: an order, stock bought, something made, a payment. Each
 * is read by a model whose answer is checked against the message (every number
 * and name must be written in it, every id must be one that was sent), then
 * turned into a draft by code, which asks about anything the message left open.
 * The text is prepared on the server first, as the web does in the browser:
 * phone numbers are removed and known customers' names become labels.
 *
 * One call costs one `quick` use (its own daily limit, not the web's). To answer a
 * question the app sends the same text back with the `reading` it was given and
 * the answers: the reading is checked against the text again and no model call
 * is made, so answering is free and cannot change what the message said.
 */
import type { Response } from 'express';
import type { AuthedRequest } from './auth';
import { aiErrorResponse } from './anthropic';
import { checkAiEntitlement, reserveAiFeature, type AiGuardDeps } from './aiGuard';
import type { ModelResult } from './briefingModel';
import type { OrderParseModel } from './orderParseModel';
import type { MenuEntry } from './orderParsePrompt';
import type { ProductionParseModel } from './productionParseModel';
import type { QuickReaderModel } from './quickReaders';
import type { QuickDb, QuickTx } from './quickDb';
import { currencyOf, loadSettings, materialsFor, readOrderBody, readPaymentBody, readProductionBody, readRestockBody } from './quickRoutes';
import { ORDER_MAX_MENU_ITEMS, buildOrderForm, prepareOrderText, validateParsedOrder } from '../src/utils/orderParse';
import { buildProductionForm, prepareProductionText, validateParsedProduction } from '../src/utils/productionParse';
import { RESTOCK_MAX_MATERIALS, buildRestockDraft, prepareRestockText, previewRestock, validateParsedRestock } from '../src/utils/restockParse';
import { buildPaymentDraft, previewPayment, validateParsedPayment } from '../src/utils/paymentParse';
import { customerDues } from '../src/utils/quickPayments';
import {
  answerMap, asKind, buildOrderDraft, buildProductionDraft, customerDirectory, detectKind, kindQuestion, previewOrder, previewProduction, readAnswers,
  type Answer, type Question, type QuickKind,
} from '../src/utils/quickParse';
import { addDays, todayInZone } from '../src/utils/localDate';
import type { BakerySettings, MenuItem, Order, RawMaterial } from '../src/types';

export interface QuickParseDeps extends Pick<AiGuardDeps, 'config' | 'billingDisabled' | 'hasActiveAccess' | 'usageDay' | 'globalDay' | 'reserve'> {
  db: QuickDb;
  now: () => number;
  orderModel: OrderParseModel;
  productionModel: ProductionParseModel;
  restockModel: QuickReaderModel;
  paymentModel: QuickReaderModel;
}

/** The longest spoken message accepted; each reader trims what it sends on to its own limit. */
export const QUICK_TEXT_MAX_CHARS = 2000;
const READING_MAX_JSON_CHARS = 8000;
/** How far back customers are looked up (and how far ahead, for pre-orders already booked). */
const CUSTOMER_LOOKBACK_DAYS = 365;
const CUSTOMER_LOOKAHEAD_DAYS = 400;

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

export interface QuickParseRequest { text: string; kind: QuickKind | null; reading: unknown; answers: Answer[] }

export function readParseRequest(body: unknown): QuickParseRequest | null {
  if (!isObject(body)) return null;
  const { text } = body;
  if (typeof text !== 'string' || text.trim() === '' || text.length > QUICK_TEXT_MAX_CHARS) return null;
  const kind = body.kind === undefined ? null : asKind(body.kind);
  if (body.kind !== undefined && kind === null) return null;
  const answers = readAnswers(body.answers);
  if (answers === null) return null;
  if (body.reading !== undefined && (!isObject(body.reading) || JSON.stringify(body.reading).length > READING_MAX_JSON_CHARS)) return null;
  return { text: text.trim(), kind, reading: body.reading, answers };
}

// ─── What each kind needs ───────────────────────────────────────────────────

interface World {
  settings: Partial<BakerySettings> & { currency?: { code: string; symbol: string } };
  today: string;
  menu: MenuItem[];
  materials: RawMaterial[];
  orders: Order[];
  unpaid: Order[];
}

/** Reads only what this kind of message needs, in one transaction. */
async function loadWorld(tx: QuickTx, kind: QuickKind, nowMs: number): Promise<World> {
  const settings = (await loadSettings(tx)) as World['settings'];
  const today = todayInZone(settings.timezone, new Date(nowMs));
  const menu = (await tx.all('menu')) as unknown as MenuItem[];
  const wantsOrders = kind === 'order' || kind === 'payment';
  const orders = wantsOrders ? (await tx.range('orders', 'date', addDays(today, -CUSTOMER_LOOKBACK_DAYS), addDays(today, CUSTOMER_LOOKAHEAD_DAYS))) as unknown as Order[] : [];
  const unpaid = kind === 'payment' ? (await tx.where('orders', 'paymentStatus', 'unpaid')) as unknown as Order[] : [];
  const materials = kind === 'restock' ? (await tx.all('materials')) as unknown as RawMaterial[] : kind === 'payment' ? [] : await materialsFor(tx, menu);
  return { settings, today, menu, materials, orders, unpaid };
}

type Checked<P> = { ok: true; parsed: P } | { ok: false; problems: string[] };

/** What a kind provides: the text to send, the model, the check, and the turning of a reading into a draft. */
interface Reader<P> {
  text: string;
  options: MenuEntry[];
  model: (input: { text: string; menu: MenuEntry[]; problems?: string[] }) => Promise<ModelResult>;
  check: (raw: unknown) => Checked<P>;
  build: (parsed: P, answers: Map<string, string>) => Built;
  /** Nothing to read: answered without the model or a count. */
  early?: { code: string; error: string; status?: number };
}

interface Built {
  draft: unknown | null;
  questions: Question[];
  notes: string[];
  preview?: unknown;
  /** The reading cannot become a draft: said instead of one. */
  fail?: { code: string; error: string };
  /** The draft, as its save endpoint will read it; checked once nothing is left to ask. */
  saveCheck?: (draft: any) => { ok: boolean; error?: string };
}

const bad = (code: string, error: string): Built => ({ draft: null, questions: [], notes: [], fail: { code, error } });

function orderReader(deps: QuickParseDeps, w: World, raw: string): Reader<any> {
  const customers = customerDirectory(w.orders);
  const prepared = prepareOrderText(raw, customers);
  const options = w.menu.slice(0, ORDER_MAX_MENU_ITEMS).map(m => ({ id: m.id, name: m.name.slice(0, 80) }));
  return {
    text: prepared.text, options, model: deps.orderModel,
    check: r => validateParsedOrder(r, { text: prepared.text, menuIds: options.map(m => m.id) }),
    build: (parsed, answers) => {
      const fill = buildOrderForm({
        parsed, menu: w.menu.map(m => ({ id: m.id, name: m.name, sellingPrice: m.sellingPrice })), today: w.today, phones: prepared.phones,
        customers: customers.map(c => ({ label: c.label, name: c.name, phone: c.phone })),
      });
      const built = buildOrderDraft({ fill, menu: w.menu, today: w.today, answers });
      const questions = [...built.questions];
      if (built.draft.lineItems.length === 0 && !questions.some(q => q.id.startsWith('item:'))) {
        return { ...bad('no_items', 'I could not find anything from your menu in that. Please say it again.'), notes: built.notes };
      }
      let preview: unknown = null;
      if (built.draft.lineItems.length > 0) {
        const previewed = previewOrder({ draft: built.draft, menu: w.menu, materials: w.materials, settings: w.settings, currency: currencyOf(w.settings), today: w.today });
        if (previewed.ok === true) preview = previewed.preview;
        else if (previewed.question) questions.push(previewed.question);
        else return { ...bad('unverified', previewed.message), notes: built.notes };
      }
      return { draft: built.draft, questions, notes: built.notes, preview, saveCheck: readOrderBody };
    },
  };
}

function productionReader(deps: QuickParseDeps, w: World, raw: string): Reader<any> {
  const text = prepareProductionText(raw);
  const options = w.menu.slice(0, ORDER_MAX_MENU_ITEMS).map(m => ({ id: m.id, name: m.name.slice(0, 80) }));
  return {
    text, options, model: deps.productionModel,
    check: r => validateParsedProduction(r, { text, menuIds: options.map(m => m.id) }),
    build: (parsed, answers) => {
      const fill = buildProductionForm({ parsed, menu: w.menu, today: w.today });
      const built = buildProductionDraft({ fill, menu: w.menu, today: w.today, answers });
      if (built.draft.rows.length === 0 && !built.questions.some(q => q.id.startsWith('item:'))) {
        return { ...bad('no_items', 'I could not find anything from your menu in that. Please say it again.'), notes: built.notes };
      }
      let preview: unknown = null;
      if (built.draft.rows.length > 0) {
        const previewed = previewProduction({ draft: built.draft, menu: w.menu, materials: w.materials, currency: currencyOf(w.settings), today: w.today });
        if (previewed.ok === true) preview = previewed.preview;
        else return { ...bad('unverified', previewed.message), notes: built.notes };
      }
      return { draft: built.draft, questions: built.questions, notes: built.notes, preview, saveCheck: readProductionBody };
    },
  };
}

function restockReader(deps: QuickParseDeps, w: World, raw: string): Reader<any> {
  const text = prepareRestockText(raw);
  const options = w.materials.slice(0, RESTOCK_MAX_MATERIALS).map(m => ({ id: m.id, name: m.name.slice(0, 80) }));
  const currency = currencyOf(w.settings);
  return {
    text, options, model: deps.restockModel,
    early: w.materials.length === 0 ? { code: 'no_materials', error: 'Add your ingredients in the web app first, so there is something to match.', status: 422 } : undefined,
    check: r => validateParsedRestock(r, { text, materialIds: options.map(m => m.id) }),
    build: (parsed, answers) => {
      const built = buildRestockDraft({ parsed, materials: w.materials, answers, currency });
      if (built.draft.lines.length === 0 && built.questions.length === 0) {
        return { ...bad('no_items', 'I could not find any of your materials in that. Please say it again.'), notes: built.notes };
      }
      let preview: unknown = null;
      if (built.draft.lines.length > 0) {
        const previewed = previewRestock({ draft: built.draft, materials: w.materials, menu: w.menu, currency });
        if (previewed.ok === true) preview = { lines: previewed.lines, total: previewed.total, label: previewed.label };
        else return { ...bad('unverified', previewed.message), notes: built.notes };
      }
      return { draft: built.draft, questions: built.questions, notes: built.notes, preview, saveCheck: readRestockBody };
    },
  };
}

function paymentReader(deps: QuickParseDeps, w: World, raw: string): Reader<any> {
  const known = customerDirectory([...new Map([...w.orders, ...w.unpaid].map(o => [o.id, o])).values()]);
  const prepared = prepareOrderText(raw, known);
  const currency = currencyOf(w.settings);
  const owing = customerDues({ unpaid: w.unpaid, menu: w.menu, settings: w.settings, currency, today: w.today });
  return {
    text: prepared.text, options: [], model: deps.paymentModel,
    early: owing.length === 0 ? { code: 'nothing_pending', error: 'Nobody has a payment pending.' } : undefined,
    check: r => validateParsedPayment(r, { text: prepared.text }),
    build: (parsed, answers) => {
      const built = buildPaymentDraft({ parsed, owing, known, answers, currency });
      const complete = built.questions.length === 0 && built.entry && built.draft.amount !== undefined;
      const preview = complete ? previewPayment({ entry: built.entry!, amount: built.draft.amount!, currency }) : null;
      return { draft: built.draft, questions: built.questions, notes: built.notes, preview, saveCheck: readPaymentBody };
    },
  };
}

// ─── The handler ────────────────────────────────────────────────────────────

/** The model's reading, checked; asked a second time with what was wrong if the first fails. Null if neither passes. */
async function readChecked<P>(reader: Reader<P>): Promise<P | null> {
  let problems: string[] | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { raw } = await reader.model({ text: reader.text, menu: reader.options, problems });
    if (raw === undefined) { problems = ['the answer was not valid JSON in the required format']; continue; }
    const checked = reader.check(raw);
    if (checked.ok === true) return checked.parsed;
    problems = checked.problems;
  }
  return null;
}

export function createQuickParseHandler(deps: QuickParseDeps) {
  return async (req: AuthedRequest, res: Response) => {
    const uid = req.uid!;
    const who = { uid, email: req.email, emailVerified: req.emailVerified };
    try {
      const request = readParseRequest(req.body);
      if (!request) return res.status(400).json({ error: 'The request was not understood.', code: 'bad_request' });

      const answers = answerMap(request.answers);
      const kind = request.kind ?? asKind(answers.get('kind')) ?? detectKind(request.text);
      // Not clear what it is about: ask, rather than guess which save to prepare. Costs nothing.
      if (kind === null) return res.json({ kind: null, draft: null, questions: [kindQuestion()], notes: [] });

      const entitled = await checkAiEntitlement(who, deps);
      if (entitled.ok === false) return res.status(entitled.status).json({ error: entitled.message, code: entitled.code });

      const world = await deps.db.run(uid, tx => loadWorld(tx, kind, deps.now()));
      if (kind !== 'restock' && kind !== 'payment' && world.menu.length === 0) {
        return res.status(422).json({ error: 'Add something to your menu in the web app first, so there is something to match.', code: 'no_menu' });
      }

      const reader = { order: orderReader, production: productionReader, restock: restockReader, payment: paymentReader }[kind](deps, world, request.text) as Reader<unknown>;
      if (reader.text.trim() === '') return res.status(400).json({ error: 'The request was not understood.', code: 'bad_request' });
      if (reader.early) return res.status(reader.early.status ?? 200).json({ kind, draft: null, questions: [], notes: [], code: reader.early.code, error: reader.early.error });

      // The reading: the one the app was given before (checked again), or a fresh one (counted).
      let parsed: unknown;
      let remaining: number | undefined;
      if (request.reading !== undefined) {
        const checked = reader.check(request.reading);
        if (checked.ok === false) return res.status(400).json({ error: 'That reading does not match the message. Read it again.', code: 'bad_reading' });
        parsed = checked.parsed;
      } else {
        const access = await reserveAiFeature(who, 'quick', deps);
        if (access.ok === false) return res.status(access.status).json({ error: access.message, code: access.code });
        remaining = Math.max(access.limit - access.used, 0);
        try {
          const read = await readChecked(reader);
          if (read === null) {
            return res.json({ kind, draft: null, questions: [], notes: [], code: 'unverified', error: 'I could not read that reliably. Please say it again, or type it.', remaining });
          }
          parsed = read;
        } catch (err: any) {
          console.error(`Quick ${kind} reading failed:`, err?.message);
          const mapped = aiErrorResponse(err);
          return res.status(mapped.status).json({ error: mapped.message, code: 'model_error' });
        }
      }

      const built = reader.build(parsed, answers);
      const extra = { reading: parsed, currency: currencyOf(world.settings), ...(remaining !== undefined && { remaining }) };
      if (built.fail) return res.json({ kind, draft: null, questions: [], notes: built.notes, code: built.fail.code, error: built.fail.error, ...extra });

      // A draft the save endpoint would refuse is never handed over as ready.
      if (built.questions.length === 0 && built.saveCheck) {
        const saveable = built.saveCheck(built.draft) as { ok: boolean; error?: string };
        if (saveable.ok === false) return res.json({ kind, draft: null, questions: [], notes: built.notes, code: 'unverified', error: saveable.error, ...extra });
      }

      res.setHeader('Cache-Control', 'private, no-store');
      return res.json({ kind, draft: built.draft, questions: built.questions, notes: built.notes, preview: built.preview ?? null, ...extra });
    } catch (err: any) {
      console.error('Quick parse failed:', err?.message);
      return res.status(500).json({ error: 'Could not read that.', code: 'parse_failed' });
    }
  };
}
