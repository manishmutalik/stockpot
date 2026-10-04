/**
 * orderParseRoutes.ts
 *
 * POST /api/ai/parse-order: reads a pasted order message into the fields of the
 * Add Order form, with its dependencies injected so it is tested without
 * Firebase or the model. Wired up in server.ts behind requireAuth and requireCsrf.
 *
 * In order: check the request, check the account may use AI (counts nothing),
 * count one `parse` use against the daily caps, ask the model, and check what it
 * read against the message. The model is asked again once if its reading fails
 * the check; if that fails too nothing is returned (`parsed: null`). Nothing is
 * saved here: the browser pre-fills a form from the answer and the owner confirms.
 */
import type { Response } from 'express';
import { ORDER_MAX_MENU_ITEMS, ORDER_TEXT_MAX_CHARS, validateParsedOrder, type ParsedOrder } from '../src/utils/orderParse';
import type { AuthedRequest } from './auth';
import { aiErrorResponse } from './anthropic';
import { checkAiEntitlement, reserveAiFeature, type AiGuardDeps } from './aiGuard';
import type { OrderParseModel } from './orderParseModel';
import type { MenuEntry } from './orderParsePrompt';

export interface OrderParseDeps extends Pick<AiGuardDeps, 'config' | 'billingDisabled' | 'hasActiveAccess' | 'usageDay' | 'globalDay' | 'reserve'> {
  model: OrderParseModel;
}

const ID = /^[A-Za-z0-9_.-]{1,80}$/;
const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The request body: the message and the menu (ids and names only), each bounded in size. */
export function parseOrderRequest(body: unknown): { text: string; menu: MenuEntry[] } | null {
  if (!isObject(body)) return null;
  const { text, menuItems } = body;
  if (typeof text !== 'string' || text.trim() === '' || text.length > ORDER_TEXT_MAX_CHARS) return null;
  if (!Array.isArray(menuItems) || menuItems.length === 0 || menuItems.length > ORDER_MAX_MENU_ITEMS) return null;
  const menu: MenuEntry[] = [];
  for (const m of menuItems) {
    if (!isObject(m) || typeof m.id !== 'string' || !ID.test(m.id) || typeof m.name !== 'string' || m.name.trim() === '' || m.name.length > 80) return null;
    menu.push({ id: m.id, name: m.name.trim() });
  }
  return { text: text.trim(), menu };
}

/** The model's reading, checked; asked a second time with what was wrong if the first fails. Null if neither passes. */
export async function readValidated(input: { text: string; menu: MenuEntry[] }, model: OrderParseModel): Promise<ParsedOrder | null> {
  let problems: string[] | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { raw } = await model({ ...input, problems });
    if (raw === undefined) { problems = ['the answer was not valid JSON in the required format']; continue; }
    const checked = validateParsedOrder(raw, { text: input.text, menuIds: input.menu.map(m => m.id) });
    if (checked.ok === true) return checked.parsed;
    problems = checked.problems;
  }
  return null;
}

export function createOrderParseHandler(deps: OrderParseDeps) {
  return async (req: AuthedRequest, res: Response) => {
    const uid = req.uid!;
    const who = { uid, email: req.email, emailVerified: req.emailVerified };
    try {
      const parsed = parseOrderRequest(req.body);
      if (!parsed) return res.status(400).json({ error: 'The request was not understood.', code: 'bad_request' });

      const entitled = await checkAiEntitlement(who, deps);
      if (entitled.ok === false) return res.status(entitled.status).json({ error: entitled.message, code: entitled.code });

      const access = await reserveAiFeature(who, 'parse', deps);
      if (access.ok === false) return res.status(access.status).json({ error: access.message, code: access.code });
      const remaining = Math.max(access.limit - access.used, 0);

      try {
        const order = await readValidated(parsed, deps.model);
        if (order === null) {
          return res.json({ parsed: null, code: 'unverified', error: 'I could not read that message reliably. Please fill in the order by hand.', remaining });
        }
        return res.json({ parsed: order, remaining });
      } catch (err: any) {
        console.error('Order parsing failed:', err?.message);
        const mapped = aiErrorResponse(err);
        return res.status(mapped.status).json({ error: mapped.message, code: 'model_error' });
      }
    } catch (err: any) {
      console.error('Order parsing request failed:', err?.message);
      return res.status(500).json({ error: 'Could not read that message.' });
    }
  };
}
