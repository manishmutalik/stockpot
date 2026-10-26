/**
 * promoteRoutes.ts
 *
 * POST /api/ai/promote (website, behind requireCsrf) and POST /api/mobile/promote (phone, behind the access gate): one
 * handler, the same limits. A photo of food comes in; the improved photo, a caption and hashtags go back. Dependencies
 * are injected so it is tested without Firebase, sharp or the model.
 *
 * In order: check the request (the photo is the image type it claims, and not too large), check the account may use
 * AI (counts nothing), improve the photo (a photo that cannot be opened is refused before anything is counted), count
 * one `promote` use, load the business's name, address, phone and menu, ask the model, and check what it wrote. The
 * model is asked again once if its answer fails the check. Nothing is saved, and the photo is not kept: it is improved,
 * read and sent back.
 */
import type { Response } from 'express';
import { checkRecipePhoto, type RecipePhoto } from '../src/utils/recipeParse';
import {
  orderLine, PROMOTE_LANGUAGES, PROMOTE_MAX_MENU, validatePromoteReading,
  type PromoteLanguage, type PromoteReading, type PromoteResult,
} from '../src/utils/promote';
import type { AuthedRequest } from './auth';
import { aiErrorResponse } from './anthropic';
import { checkAiEntitlement, reserveAiFeature, type AiGuardDeps } from './aiGuard';
import type { ImprovedPhoto } from './promoteImage';
import type { PromoteModel } from './promoteModel';
import type { PromoteBusiness, PromoteMenuEntry } from './promotePrompt';

/** What the post is written from: the business's name and address, its phone (for how to order), and what it sells. */
export interface PromoteContext { business: PromoteBusiness; phone: string | null; menu: PromoteMenuEntry[] }

export interface PromoteDeps extends Pick<AiGuardDeps, 'config' | 'billingDisabled' | 'hasActiveAccess' | 'usageDay' | 'globalDay' | 'reserve'> {
  model: PromoteModel;
  improve: (photo: Buffer) => Promise<ImprovedPhoto>;
  context: (uid: string) => Promise<PromoteContext>;
}

const ID = /^[A-Za-z0-9_.-]{1,80}$/;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null);

/** The request body: one photo (JPEG, PNG or WebP, as base64) and the language to write in (English unless asked). */
export function parsePromoteRequest(body: unknown): { photo: RecipePhoto; language: PromoteLanguage } | null {
  if (!isObject(body)) return null;
  const photo = checkRecipePhoto(body.photo);
  if (!photo) return null;
  const language = body.language === undefined ? 'en' : body.language;
  if (!PROMOTE_LANGUAGES.some(l => l.value === language)) return null;
  return { photo, language: language as PromoteLanguage };
}

/** The business details and the items it sells (not its bases and fillings), from its settings and menu documents. */
export function promoteContextFrom(settings: Record<string, unknown>, menu: Record<string, unknown>[]): PromoteContext {
  const entries: PromoteMenuEntry[] = [];
  for (const m of menu) {
    if (m.notForSale === true || typeof m.id !== 'string' || !ID.test(m.id)) continue;
    const name = text(m.name, 80);
    if (!name) continue;
    const category = text(m.category, 40);
    entries.push({ id: m.id, name, ...(category && { category }) });
    if (entries.length >= PROMOTE_MAX_MENU) break;
  }
  return { business: { name: text(settings.name, 80), address: text(settings.address, 200) }, phone: text(settings.phone, 30), menu: entries };
}

/** The model's answer, checked; asked a second time with what was wrong if the first fails. Null if neither passes. */
export async function readPromoteValidated(input: Omit<Parameters<PromoteModel>[0], 'problems'>, model: PromoteModel): Promise<PromoteReading | null> {
  let problems: string[] | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { raw } = await model({ ...input, problems });
    if (raw === undefined) { problems = ['the answer was not valid JSON in the required format']; continue; }
    const checked = validatePromoteReading(raw, { menuIds: input.menu.map(m => m.id) });
    if (checked.ok === true) return checked.reading;
    problems = checked.problems;
  }
  return null;
}

export function createPromoteHandler(deps: PromoteDeps) {
  return async (req: AuthedRequest, res: Response) => {
    const uid = req.uid!;
    const who = { uid, email: req.email, emailVerified: req.emailVerified };
    try {
      const parsed = parsePromoteRequest(req.body);
      if (!parsed) return res.status(400).json({ error: 'Send one photo (JPEG, PNG or WebP, up to 2.5 MB).', code: 'bad_request' });

      const entitled = await checkAiEntitlement(who, deps);
      if (entitled.ok === false) return res.status(entitled.status).json({ error: entitled.message, code: entitled.code });

      let improved: ImprovedPhoto;
      try {
        improved = await deps.improve(Buffer.from(parsed.photo.data, 'base64'));
      } catch (err: unknown) {
        console.error('Promote could not open a photo:', (err as Error)?.message);
        return res.status(400).json({ error: 'That photo could not be opened. Please try another.', code: 'bad_photo' });
      }

      const access = await reserveAiFeature(who, 'promote', deps);
      if (access.ok === false) return res.status(access.status).json({ error: access.message, code: access.code });
      const remaining = Math.max(access.limit - access.used, 0);

      try {
        const context = await deps.context(uid);
        const reading = await readPromoteValidated({ photo: improved.forModel, business: context.business, menu: context.menu, language: parsed.language }, deps.model);
        if (reading === null) {
          return res.json({ result: null, code: 'unverified', error: 'I could not write a post for that photo. Please try again, or try another photo.', remaining });
        }
        const result: PromoteResult = {
          image: improved.image.toString('base64'), width: improved.width, height: improved.height,
          reading, orderLine: orderLine(context.phone), remaining,
        };
        return res.json({ result });
      } catch (err: unknown) {
        console.error('Promote failed:', (err as Error)?.message);
        const mapped = aiErrorResponse(err);
        return res.status(mapped.status).json({ error: mapped.message, code: 'model_error' });
      }
    } catch (err: unknown) {
      console.error('Promote request failed:', (err as Error)?.message);
      return res.status(500).json({ error: 'Could not make that post.' });
    }
  };
}
