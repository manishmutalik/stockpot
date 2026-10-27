/**
 * promoteBackgroundRoutes.ts
 *
 * POST /api/ai/promote/background (website, behind requireCsrf) and POST /api/mobile/promote/background (phone, behind
 * the access gate): one handler. The improved photo Promote sent back comes in with a backdrop's id (and, after the
 * first time, the mask that was made for it); the photo on that backdrop goes back, the same size. Dependencies are
 * injected so it is tested without Firebase or Photoroom.
 *
 * In order: check the request, check the account may use AI, check the server has a Photoroom key, open the photo, for
 * an AI scene reserve one against the day and the month (before anything else is spent), cut the food out if no mask
 * came (one `cutout` use), make the background, and lay the photo's own food on it (lib/promoteBackground). Nothing is
 * saved.
 */
import type { Response } from 'express';
import sharp from 'sharp';
import { backdropOf, type Backdrop, type BackgroundResult } from '../src/utils/promoteBackdrops';
import { checkRecipePhoto, type RecipePhoto } from '../src/utils/recipeParse';
import type { AuthedRequest } from './auth';
import { checkAiEntitlement, reserveAiFeature, type AiGuardDeps } from './aiGuard';
import type { reserveRecipeUse } from './aiUsage';
import { photoroomErrorMessage, type Photoroom } from './photoroom';
import { maskCoverage, maskToPng, placeOnPlain, placeOnScene, readMask } from './promoteBackground';

export interface PromoteBackgroundDeps extends Pick<AiGuardDeps, 'config' | 'billingDisabled' | 'hasActiveAccess' | 'usageDay' | 'globalDay' | 'reserve'> {
  photoroom: Photoroom;
  /** The day-and-month reservation (aiUsage.reserveRecipeUse, with `feature: 'scene'`). */
  reserveScene: typeof reserveRecipeUse;
}

/** Less of the photo than this is food: the cut-out found nothing to keep. */
export const MIN_COVERAGE = 0.01;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The body: the improved photo (JPEG), the backdrop's id, and the mask made for this photo before (PNG), if any. */
export function parseBackgroundRequest(body: unknown): { photo: RecipePhoto; mask: RecipePhoto | null; backdrop: Backdrop } | null {
  if (!isObject(body)) return null;
  const photo = checkRecipePhoto(body.image);
  const backdrop = backdropOf(body.backdrop);
  if (!photo || photo.mediaType !== 'image/jpeg' || !backdrop) return null;
  if (body.mask === undefined || body.mask === null) return { photo, mask: null, backdrop };
  const mask = checkRecipePhoto(body.mask);
  return mask && mask.mediaType === 'image/png' ? { photo, mask, backdrop } : null;
}

export function createPromoteBackgroundHandler(deps: PromoteBackgroundDeps) {
  return async (req: AuthedRequest, res: Response) => {
    const uid = req.uid!;
    const who = { uid, email: req.email, emailVerified: req.emailVerified };
    try {
      const parsed = parseBackgroundRequest(req.body);
      if (!parsed) return res.status(400).json({ error: 'The request was not understood.', code: 'bad_request' });

      const entitled = await checkAiEntitlement(who, deps);
      if (entitled.ok === false) return res.status(entitled.status).json({ error: entitled.message, code: entitled.code });
      const config = deps.config();
      if (!config.photoroomConfigured) return res.status(503).json({ error: 'Backgrounds are not available yet.', code: 'backgrounds_unavailable' });

      const photo = Buffer.from(parsed.photo.data, 'base64');
      let size: { width: number; height: number };
      try {
        const meta = await sharp(photo).metadata();
        if (!meta.width || !meta.height) throw new Error('no size');
        size = { width: meta.width, height: meta.height };
      } catch {
        return res.status(400).json({ error: 'That photo could not be opened. Please try again.', code: 'bad_photo' });
      }

      // An AI scene is reserved first, so a cut-out is not spent on a scene that is over the allowance.
      let scenesLeft: number | undefined;
      if (parsed.backdrop.kind === 'scene') {
        const reserved = await deps.reserveScene({
          uid, feature: 'scene', userDay: await deps.usageDay(uid), globalDayKey: deps.globalDay(),
          dailyLimit: config.limits.scene, monthlyLimit: config.sceneMonthlyLimit, globalLimit: config.globalLimit, globalWeight: 1,
        });
        if (reserved.ok === false) {
          if (reserved.reason === 'user_limit') return res.status(429).json({ error: `You have made ${config.limits.scene} AI backgrounds today. You can make more tomorrow.`, code: 'daily_limit' });
          if (reserved.reason === 'month_limit') return res.status(429).json({ error: `You have made all ${config.sceneMonthlyLimit} AI backgrounds for this month. The plain backgrounds are still free to use.`, code: 'monthly_limit' });
          return res.status(503).json({ error: 'AI features are very busy today. Please try again tomorrow.', code: 'busy' });
        }
        scenesLeft = Math.max(Math.min(config.limits.scene - reserved.day, config.sceneMonthlyLimit - reserved.month), 0);
      }

      try {
        let mask: Buffer;
        let newMask = false;
        if (parsed.mask) {
          try {
            mask = await readMask(Buffer.from(parsed.mask.data, 'base64'), size);
          } catch {
            return res.status(400).json({ error: 'The request was not understood.', code: 'bad_request' });
          }
        } else {
          const access = await reserveAiFeature(who, 'cutout', deps);
          if (access.ok === false) return res.status(access.status).json({ error: access.message, code: access.code });
          mask = await readMask(await deps.photoroom.cutout(photo), size);
          newMask = true;
        }
        if (maskCoverage(mask) < MIN_COVERAGE) {
          return res.status(422).json({ error: 'The food could not be picked out of this photo. Try a photo with the dish clearly in view.', code: 'no_subject' });
        }

        const backdrop = parsed.backdrop;
        const image = backdrop.kind === 'plain'
          ? await placeOnPlain(photo, mask, size, backdrop.colour)
          : await placeOnScene(photo, mask, size, await deps.photoroom.scene(photo, backdrop.prompt));
        const result: BackgroundResult = {
          image: image.toString('base64'), ...size,
          ...(newMask && { mask: (await maskToPng(mask, size)).toString('base64') }),
          ...(scenesLeft !== undefined && { scenesLeft }),
        };
        return res.json({ result });
      } catch (err: unknown) {
        console.error('Promote background failed:', (err as Error)?.message);
        const mapped = photoroomErrorMessage(err);
        return res.status(mapped.status).json({ error: mapped.message, code: 'background_failed' });
      }
    } catch (err: unknown) {
      console.error('Promote background request failed:', (err as Error)?.message);
      return res.status(500).json({ error: 'Could not make that background.' });
    }
  };
}
