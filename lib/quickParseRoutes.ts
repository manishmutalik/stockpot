/**
 * quickParseRoutes.ts
 *
 * POST /api/mobile/parse: reads what the owner said (typed or spoken, as text)
 * into a draft they can confirm, and the questions the message leaves open.
 * Nothing is saved here; the draft is the body of the matching save endpoint.
 *
 * The reading itself is the web's own: the same model, prompt and checks (every
 * quantity, name and amount must be written in the message, every id must be on
 * the menu). The text is prepared on the server first, as the web does in the
 * browser: phone numbers are removed and known customers' names become labels.
 *
 * One call costs one `parse` use, shared with the web's readers. To answer a
 * question the app sends the same text back with the `reading` it was given and
 * the answers: the reading is checked against the text again and no model call
 * is made, so answering is free and cannot change what the message said.
 */
import type { Response } from 'express';
import type { AuthedRequest } from './auth';
import { aiErrorResponse } from './anthropic';
import { checkAiEntitlement, reserveAiFeature, type AiGuardDeps } from './aiGuard';
import type { OrderParseModel } from './orderParseModel';
import type { MenuEntry } from './orderParsePrompt';
import { readValidated } from './orderParseRoutes';
import type { QuickDb } from './quickDb';
import { currencyOf, loadSettings, materialsFor, readOrderBody } from './quickRoutes';
import { ORDER_MAX_MENU_ITEMS, ORDER_TEXT_MAX_CHARS, buildOrderForm, prepareOrderText, validateParsedOrder, type ParsedOrder } from '../src/utils/orderParse';
import {
  answerMap, asKind, buildOrderDraft, customerDirectory, detectKind, kindQuestion, previewOrder, readAnswers,
  type Answer, type Question, type QuickKind,
} from '../src/utils/quickParse';
import { addDays, todayInZone } from '../src/utils/localDate';
import type { MenuItem, Order } from '../src/types';

export interface QuickParseDeps extends Pick<AiGuardDeps, 'config' | 'billingDisabled' | 'hasActiveAccess' | 'usageDay' | 'globalDay' | 'reserve'> {
  db: QuickDb;
  now: () => number;
  orderModel: OrderParseModel;
}

/** The longest spoken message accepted; the order reader trims what it sends on to its own limit. */
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

const notYet = (kind: QuickKind) => ({ status: 501, body: { error: `Reading ${kind} messages is not available yet.`, code: 'kind_not_ready', kind } });

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
      if (kind !== 'order') return res.status(notYet(kind).status).json(notYet(kind).body);

      const entitled = await checkAiEntitlement(who, deps);
      if (entitled.ok === false) return res.status(entitled.status).json({ error: entitled.message, code: entitled.code });

      const world = await deps.db.run(uid, async tx => {
        const settings = await loadSettings(tx);
        const today = todayInZone(settings.timezone, new Date(deps.now()));
        const menu = (await tx.all('menu')) as unknown as MenuItem[];
        const orders = await tx.range('orders', 'date', addDays(today, -CUSTOMER_LOOKBACK_DAYS), addDays(today, CUSTOMER_LOOKAHEAD_DAYS)) as unknown as Order[];
        const materials = await materialsFor(tx, menu);
        return { settings, today, menu, orders, materials };
      });
      const { settings, today, menu, orders, materials } = world;
      if (menu.length === 0) return res.status(422).json({ error: 'Add something to your menu in the web app first, so there is something to match.', code: 'no_menu' });

      const customers = customerDirectory(orders);
      const prepared = prepareOrderText(request.text, customers);
      if (prepared.text.trim() === '') return res.status(400).json({ error: 'The request was not understood.', code: 'bad_request' });
      const menuEntries: MenuEntry[] = menu.slice(0, ORDER_MAX_MENU_ITEMS).map(m => ({ id: m.id, name: m.name.slice(0, 80) }));

      // The reading: the one the app was given before (checked again), or a fresh one (counted).
      let parsed: ParsedOrder | null;
      let remaining: number | undefined;
      if (request.reading !== undefined) {
        const checked = validateParsedOrder(request.reading, { text: prepared.text, menuIds: menuEntries.map(m => m.id) });
        if (checked.ok === false) return res.status(400).json({ error: 'That reading does not match the message. Read it again.', code: 'bad_reading' });
        parsed = checked.parsed;
      } else {
        const access = await reserveAiFeature(who, 'parse', deps);
        if (access.ok === false) return res.status(access.status).json({ error: access.message, code: access.code });
        remaining = Math.max(access.limit - access.used, 0);
        try {
          parsed = await readValidated({ text: prepared.text, menu: menuEntries }, deps.orderModel);
        } catch (err: any) {
          console.error('Quick order reading failed:', err?.message);
          const mapped = aiErrorResponse(err);
          return res.status(mapped.status).json({ error: mapped.message, code: 'model_error' });
        }
        if (parsed === null) {
          return res.json({ kind, draft: null, questions: [], notes: [], code: 'unverified', error: 'I could not read that reliably. Please say it again, or type it.', remaining });
        }
      }

      const fill = buildOrderForm({
        parsed, menu: menu.map(m => ({ id: m.id, name: m.name, sellingPrice: m.sellingPrice })), today, phones: prepared.phones,
        customers: customers.map(c => ({ label: c.label, name: c.name, phone: c.phone })),
      });
      const built = buildOrderDraft({ fill, menu, today, answers });
      const questions: Question[] = [...built.questions];

      if (built.draft.lineItems.length === 0 && !questions.some(q => q.id.startsWith('item:'))) {
        return res.json({ kind, draft: null, questions: [], notes: built.notes, code: 'no_items', error: 'I could not find anything from your menu in that. Please say it again.', reading: parsed, remaining });
      }

      // What the save will do, worked out by the same plan: the figures to confirm, and anything it would refuse.
      let preview: unknown = null;
      if (built.draft.lineItems.length > 0) {
        const previewed = previewOrder({ draft: built.draft, menu, materials, settings, currency: currencyOf(settings), today });
        if (previewed.ok === true) preview = previewed.preview;
        else if (previewed.question) questions.push(previewed.question);
        else return res.json({ kind, draft: null, questions: [], notes: built.notes, code: 'unverified', error: previewed.message, reading: parsed, remaining });
      }

      // A draft the save endpoint would refuse is never handed over as ready.
      const saveable = readOrderBody(built.draft);
      if (saveable.ok === false && questions.length === 0) {
        return res.json({ kind, draft: null, questions: [], notes: built.notes, code: 'unverified', error: saveable.error, reading: parsed, remaining });
      }

      res.setHeader('Cache-Control', 'private, no-store');
      return res.json({ kind, draft: built.draft, questions, notes: built.notes, preview, reading: parsed, ...(remaining !== undefined && { remaining }) });
    } catch (err: any) {
      console.error('Quick parse failed:', err?.message);
      return res.status(500).json({ error: 'Could not read that.', code: 'parse_failed' });
    }
  };
}
