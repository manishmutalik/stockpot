/**
 * briefingRoutes.ts
 *
 * POST /api/ai/briefing: the daily briefing, with its dependencies injected so it
 * is tested without Firebase or the model. Wired up in server.ts behind
 * requireAuth and requireCsrf.
 *
 * In order: check the request, check the account may use AI (this counts
 * nothing), serve today's stored briefing if there is one (counts nothing, calls
 * nothing), and only otherwise claim the day, count one use against the daily
 * caps, ask the model, validate what it wrote and store it. The model is asked
 * again once if its answer fails validation; if that fails too the day is stored
 * as a `fallback` and the app builds the text itself, so an unchecked answer is
 * never kept or shown.
 */
import type { Response } from 'express';
import { addDays } from '../src/utils/localDate';
import { validateBriefingContent, type StoredBriefing } from '../src/utils/aiBriefing';
import type { AiSnapshot } from '../src/utils/aiSnapshot';
import type { AuthedRequest } from './auth';
import { aiErrorResponse } from './anthropic';
import { checkAiEntitlement, reserveAiFeature, type AiGuardDeps } from './aiGuard';
import type { BriefingModel } from './briefingModel';
import { GENERATION_LOCK_MS, type StoredDay } from './briefingStore';

export interface BriefingStore {
  get: (uid: string, day: string) => Promise<StoredDay>;
  begin: (uid: string, day: string, now: number) => Promise<boolean>;
  save: (uid: string, day: string, briefing: StoredBriefing) => Promise<void>;
  clear: (uid: string, day: string) => Promise<void>;
}

export interface BriefingDeps extends Pick<AiGuardDeps, 'config' | 'billingDisabled' | 'hasActiveAccess' | 'usageDay' | 'globalDay' | 'reserve'> {
  store: BriefingStore;
  model: BriefingModel;
  now: () => number;
}

const MAX_SNAPSHOT_CHARS = 80_000;
const ID = /^[A-Za-z0-9_.-]{1,80}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStringArray = (v: unknown, max: number) => Array.isArray(v) && v.length <= max && v.every(x => typeof x === 'string' && x.length <= 160);

/** A snapshot from a client is checked for shape and size before any of it reaches a prompt. */
export function validateSnapshotShape(s: unknown): s is AiSnapshot {
  if (!isObject(s)) return false;
  if (JSON.stringify(s).length > MAX_SNAPSHOT_CHARS) return false;
  if (!isObject(s.business) || typeof s.business.name !== 'string' || s.business.name.length > 160) return false;
  if (!isObject(s.period) || !DATE.test(s.period.start) || !DATE.test(s.period.end)) return false;
  if (!isObject(s.comparison) || !DATE.test(s.comparison.start) || !DATE.test(s.comparison.end) || typeof s.comparison.label !== 'string' || s.comparison.label.length > 80) return false;

  if (!isObject(s.figures) || Object.keys(s.figures).length > 500) return false;
  for (const [id, f] of Object.entries(s.figures)) {
    if (!ID.test(id) || !isObject(f) || typeof f.label !== 'string' || f.label.length > 200 || typeof f.text !== 'string' || f.text.length > 60) return false;
  }
  if (!isObject(s.names) || Object.keys(s.names).length > 300) return false;
  for (const [id, name] of Object.entries(s.names)) if (!ID.test(id) || typeof name !== 'string' || name.length > 160) return false;

  if (!Array.isArray(s.drivers) || s.drivers.length > 12) return false;
  if (!s.drivers.every((d: any) => isObject(d) && typeof d.figure === 'string' && typeof d.label === 'string' && d.label.length <= 80 && (d.effect === 'raised' || d.effect === 'lowered'))) return false;
  if (!Array.isArray(s.products) || s.products.length > 30 || !Array.isArray(s.trend) || s.trend.length > 7) return false;
  if (!isObject(s.inventory) || !isStringArray(s.inventory.lowStock, 10) || !isStringArray(s.inventory.expiringSoon, 10)) return false;
  // Added with the reorder suggestions: absent from an older client's snapshot, which is still accepted.
  const reorder = s.inventory.reorderSoon;
  if (reorder !== undefined) {
    if (!Array.isArray(reorder) || reorder.length > 5) return false;
    const fields = ['name', 'daysOfCover', 'runOutDate', 'suggestedQty'];
    if (!reorder.every((r: any) => isObject(r) && fields.every(f => typeof r[f] === 'string' && r[f].length <= 90) && (r.flag === 'before_threshold' || r.flag === 'at_threshold') && (r.confidence === 'normal' || r.confidence === 'low'))) return false;
  }
  if (!isObject(s.customers)) return false;
  for (const list of [s.customers.dueList, s.customers.lapsedList]) {
    if (!Array.isArray(list) || list.length > 10 || !list.every((c: any) => isObject(c) && typeof c.label === 'string' && c.label.length <= 20)) return false;
  }
  // Added for the chat: absent from an older client's snapshot, which is still accepted.
  const mentioned = s.customers.mentioned;
  if (mentioned !== undefined && (!Array.isArray(mentioned) || mentioned.length > 5 || !mentioned.every((c: any) => isObject(c) && typeof c.label === 'string' && c.label.length <= 20))) return false;
  if (s.unsoldItems !== undefined && !isStringArray(s.unsoldItems, 15)) return false;
  // Pre-orders to prepare: likewise optional.
  const pre = s.preorders;
  if (pre !== undefined) {
    if (!isObject(pre) || (pre.advancesHeld !== undefined && (typeof pre.advancesHeld !== 'string' || pre.advancesHeld.length > 90))) return false;
    for (const day of [pre.dueToday, pre.dueTomorrow]) {
      if (day === null || day === undefined) continue;
      if (!isObject(day) || typeof day.orders !== 'string' || day.orders.length > 90 || !Array.isArray(day.items) || day.items.length > 5) return false;
      if (!day.items.every((i: any) => isObject(i) && typeof i.name === 'string' && i.name.length <= 90 && typeof i.quantity === 'string' && i.quantity.length <= 90)) return false;
    }
  }
  return isStringArray(s.notes, 10);
}

/** The model's answer, validated; asked a second time with what was wrong if the first fails. */
export async function generateValidated(snapshot: AiSnapshot, model: BriefingModel): Promise<Pick<StoredBriefing, 'source' | 'content'>> {
  let problems: string[] | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { raw } = await model(snapshot, problems);
    if (raw === undefined) { problems = ['the answer was not valid JSON in the required format']; continue; }
    const checked = validateBriefingContent(raw, snapshot);
    if (checked.ok === true) return { source: 'ai', content: checked.content };
    problems = checked.problems;
  }
  return { source: 'fallback' };
}

export function createBriefingHandler(deps: BriefingDeps) {
  return async (req: AuthedRequest, res: Response) => {
    const uid = req.uid!;
    const who = { uid, email: req.email, emailVerified: req.emailVerified };
    try {
      const body = req.body;
      if (!isObject(body) || (body.refresh !== undefined && typeof body.refresh !== 'boolean') || !validateSnapshotShape(body.snapshot)) {
        return res.status(400).json({ error: 'The request was not understood.', code: 'bad_request' });
      }
      const snapshot = body.snapshot as AiSnapshot;
      const refresh = body.refresh === true;

      const entitled = await checkAiEntitlement(who, deps);
      if (entitled.ok === false) return res.status(entitled.status).json({ error: entitled.message, code: entitled.code });

      // The briefing is about yesterday, in the owner's own time zone. A client with a different idea of the date is out of date.
      const today = await deps.usageDay(uid);
      const yesterday = addDays(today, -1);
      if (snapshot.period.start !== yesterday || snapshot.period.end !== yesterday) {
        return res.status(400).json({ error: 'Your app is out of date. Please reload the page.', code: 'out_of_date' });
      }

      const stored = await deps.store.get(uid, today);
      const now = deps.now();
      const inProgress = stored.generatingSince !== undefined && now - stored.generatingSince < GENERATION_LOCK_MS;
      if (stored.briefing && !refresh) return res.json({ briefing: stored.briefing, cached: true });
      if (inProgress) return res.status(409).json({ error: 'Today\'s briefing is being prepared.', code: 'generating' });

      if (!(await deps.store.begin(uid, today, now))) return res.status(409).json({ error: 'Today\'s briefing is being prepared.', code: 'generating' });
      try {
        const access = await reserveAiFeature(who, 'briefing', deps);
        if (access.ok === false) {
          await deps.store.clear(uid, today);
          return res.status(access.status).json({ error: access.message, code: access.code });
        }
        const generated = await generateValidated(snapshot, deps.model);
        const briefing: StoredBriefing = {
          date: today, ...generated, createdAt: now,
          refreshes: stored.briefing ? (stored.briefing.refreshes ?? 0) + 1 : 0,
        };
        await deps.store.save(uid, today, briefing);
        return res.json({ briefing, cached: false, remaining: Math.max(access.limit - access.used, 0) });
      } catch (err: any) {
        await deps.store.clear(uid, today).catch(() => {});
        console.error('Briefing failed:', err?.message);
        const mapped = aiErrorResponse(err);
        return res.status(mapped.status).json({ error: mapped.message, code: 'model_error' });
      }
    } catch (err: any) {
      console.error('Briefing request failed:', err?.message);
      return res.status(500).json({ error: 'Could not prepare the briefing.' });
    }
  };
}
