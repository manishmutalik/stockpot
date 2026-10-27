/**
 * promoteStyleRoutes.ts
 *
 * POST /api/ai/promote/style (website, behind requireCsrf) and POST /api/mobile/promote/style (phone, behind the access
 * gate): one handler. The improved photo Promote sent back comes in with a style and the shape chosen; the photo restyled
 * by Gemini (lib/geminiImage, told the owner's rule in lib/promoteStylePrompt) goes back as JPEG. Dependencies are
 * injected so it is tested without Firebase or Gemini.
 *
 * In order: check the request, check the account may use AI, check the server has a Gemini key, reserve one styled photo
 * against the day and the month (and STYLE_GLOBAL_WEIGHT against everyone's day), send a copy of the photo no larger
 * than STYLE_INPUT_SIDE, and turn the answer into a JPEG with no metadata. A failed call still counts (it can still cost).
 * Nothing is saved.
 */
import type { Response } from 'express';
import sharp from 'sharp';
import { PROMOTE_SHAPES, type PromoteShapeId } from '../src/utils/promote';
import { STYLE_ASPECT, styleOf, type PromoteStyle, type StyleResult } from '../src/utils/promoteStyles';
import { checkRecipePhoto, type RecipePhoto } from '../src/utils/recipeParse';
import type { AuthedRequest } from './auth';
import { checkAiEntitlement, type AiGuardDeps } from './aiGuard';
import type { reserveRecipeUse } from './aiUsage';
import { geminiErrorMessage, type GeminiImage } from './geminiImage';
import { buildStylePrompt } from './promoteStylePrompt';

export interface PromoteStyleDeps extends Pick<AiGuardDeps, 'config' | 'billingDisabled' | 'hasActiveAccess' | 'usageDay' | 'globalDay'> {
  gemini: GeminiImage;
  /** The day-and-month reservation (aiUsage.reserveRecipeUse, with `feature: 'style'`). */
  reserveStyle: typeof reserveRecipeUse;
}

/** A styled photo costs about as much as four ordinary readings, so it uses up four of the global daily count. */
export const STYLE_GLOBAL_WEIGHT = 4;
/** The longest side of the copy sent: plenty for the model, quicker to send. */
export const STYLE_INPUT_SIDE = 1536;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The body: the improved photo (JPEG), the style's id, and the shape (a post unless said). */
export function parseStyleRequest(body: unknown): { photo: RecipePhoto; style: PromoteStyle; shape: PromoteShapeId } | null {
  if (!isObject(body)) return null;
  const photo = checkRecipePhoto(body.image);
  const style = styleOf(body.style);
  const shape = body.shape === undefined ? 'post' : body.shape;
  if (!photo || photo.mediaType !== 'image/jpeg' || !style || !PROMOTE_SHAPES.some(s => s.id === shape)) return null;
  return { photo, style, shape: shape as PromoteShapeId };
}

export function createPromoteStyleHandler(deps: PromoteStyleDeps) {
  return async (req: AuthedRequest, res: Response) => {
    const uid = req.uid!;
    const who = { uid, email: req.email, emailVerified: req.emailVerified };
    try {
      const parsed = parseStyleRequest(req.body);
      if (!parsed) return res.status(400).json({ error: 'The request was not understood.', code: 'bad_request' });

      const entitled = await checkAiEntitlement(who, deps);
      if (entitled.ok === false) return res.status(entitled.status).json({ error: entitled.message, code: entitled.code });
      const config = deps.config();
      if (!config.geminiConfigured) return res.status(503).json({ error: 'Styled photos are not available yet.', code: 'style_unavailable' });

      let input: Buffer;
      try {
        input = await sharp(Buffer.from(parsed.photo.data, 'base64'))
          .resize(STYLE_INPUT_SIDE, STYLE_INPUT_SIDE, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 90 }).toBuffer();
      } catch {
        return res.status(400).json({ error: 'That photo could not be opened. Please try again.', code: 'bad_photo' });
      }

      const reserved = await deps.reserveStyle({
        uid, feature: 'style', userDay: await deps.usageDay(uid), globalDayKey: deps.globalDay(),
        dailyLimit: config.limits.style, monthlyLimit: config.styleMonthlyLimit, globalLimit: config.globalLimit, globalWeight: STYLE_GLOBAL_WEIGHT,
      });
      if (reserved.ok === false) {
        if (reserved.reason === 'user_limit') return res.status(429).json({ error: `You have styled ${config.limits.style} photos today. You can style more tomorrow.`, code: 'daily_limit' });
        if (reserved.reason === 'month_limit') return res.status(429).json({ error: `You have styled all ${config.styleMonthlyLimit} photos for this month. You can still post the photo as it is.`, code: 'monthly_limit' });
        return res.status(503).json({ error: 'AI features are very busy today. Please try again tomorrow.', code: 'busy' });
      }
      const stylesLeft = Math.max(Math.min(config.limits.style - reserved.day, config.styleMonthlyLimit - reserved.month), 0);

      try {
        const edited = await deps.gemini.edit({ photo: input, prompt: buildStylePrompt(parsed.style), aspectRatio: STYLE_ASPECT[parsed.shape] });
        const { data, info } = await sharp(edited.data).removeAlpha().toColourspace('srgb').jpeg({ quality: 90, mozjpeg: true }).toBuffer({ resolveWithObject: true });
        const result: StyleResult = { image: data.toString('base64'), width: info.width, height: info.height, stylesLeft };
        return res.json({ result });
      } catch (err: unknown) {
        console.error('Promote styling failed:', (err as Error)?.message);
        const mapped = geminiErrorMessage(err);
        return res.status(mapped.status).json({ error: mapped.message, code: mapped.code, stylesLeft });
      }
    } catch (err: unknown) {
      console.error('Promote styling request failed:', (err as Error)?.message);
      return res.status(500).json({ error: 'Could not style that photo.' });
    }
  };
}
