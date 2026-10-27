/**
 * promote.ts
 *
 * Promote on the phone: the same as the website's (POST /api/mobile/promote is its handler, with the same daily limit,
 * and src/utils/promote is shared), so a photo is improved and written about exactly as on the web. The phone takes or
 * chooses the photo, shrinks it, sends it, crops what comes back to a post or a story, and hands it to the share sheet
 * with the caption copied (promotePhoto.ts does the parts that need the phone).
 *
 * Plain logic over `Api`, so it is tested without a phone.
 */
import type { RecipePhoto } from '../../../src/utils/recipeParse';
import { PROMOTE_LABEL, type PromoteLanguage, type PromoteResult } from '../../../src/utils/promote';
import type { BackgroundResult } from '../../../src/utils/promoteBackdrops';
import { ApiError, describeApiError, type Api } from './api';
import { AI_STATUS_PATH } from './recipeReader';

export const PROMOTE_PATH = '/api/mobile/promote';
export const PROMOTE_BACKGROUND_PATH = '/api/mobile/promote/background';
/** The server gives the model a minute; a photo takes a while to send, and to come back, on a slow connection too. */
export const PROMOTE_TIMEOUT_MS = 120_000;

export type PromoteAvailability =
  /** `backgrounds` is null when the server has none; otherwise how many AI scenes are left this month. */
  | { available: true; remaining: number | null; backgrounds: { scenesLeft: number | null } | null }
  | { available: false; message: string };

/** Whether this account can promote photos (GET /api/ai/status), and how many more today. */
export function promoteAvailability(status: unknown): PromoteAvailability {
  const s = status as { available?: boolean; reason?: string; limits?: { promote?: { remaining?: number }; cutout?: object; scene?: { remaining?: number } } } | null;
  if (s?.available === true && s.limits?.promote) {
    const scene = s.limits.scene;
    return {
      available: true,
      remaining: typeof s.limits.promote.remaining === 'number' ? s.limits.promote.remaining : null,
      backgrounds: scene && s.limits.cutout ? { scenesLeft: typeof scene.remaining === 'number' ? scene.remaining : null } : null,
    };
  }
  const reason = s?.reason;
  if (reason === 'demo_account') return { available: false, message: `${PROMOTE_LABEL} is not available in the demo kitchen. Sign in with your own account to use it.` };
  if (reason === 'subscription_required') return { available: false, message: `${PROMOTE_LABEL} needs an active Stockpot plan.` };
  if (reason === 'not_allowed') return { available: false, message: `${PROMOTE_LABEL} is not switched on for your account yet.` };
  return { available: false, message: `${PROMOTE_LABEL} is not available right now.` };
}

export async function loadPromoteAvailability(api: Pick<Api, 'get'>): Promise<PromoteAvailability> {
  try {
    return promoteAvailability(await api.get(AI_STATUS_PATH));
  } catch (err) {
    return { available: false, message: describeApiError(err) };
  }
}

export type PromoteOutcome =
  | { ok: true; result: PromoteResult; remaining?: number }
  | { ok: false; message: string; remaining?: number };

/** Sends the photo. Never throws: every failure becomes something to show the owner. */
export async function promotePhoto(api: Pick<Api, 'post'>, photo: RecipePhoto, language: PromoteLanguage): Promise<PromoteOutcome> {
  try {
    const res = await api.post<{ result: PromoteResult | null; remaining?: number; error?: string }>(PROMOTE_PATH, { photo, language }, { timeoutMs: PROMOTE_TIMEOUT_MS });
    const remaining = typeof res.remaining === 'number' ? res.remaining : res.result?.remaining;
    if (!res.result) return { ok: false, message: res.error || 'I could not write a post for that photo. Please try again, or try another photo.', remaining };
    return { ok: true, result: res.result, remaining };
  } catch (err) {
    if (err instanceof ApiError && err.status === 0 && err.code === 'timeout') return { ok: false, message: 'That took too long. Please try again.' };
    if (err instanceof ApiError && err.status === 429) return { ok: false, message: err.message, remaining: 0 };
    if (err instanceof ApiError && err.status === 413) return { ok: false, message: 'That photo is too large to send. Please try another.' };
    return { ok: false, message: describeApiError(err) };
  }
}

export type BackgroundOutcome = { ok: true; result: BackgroundResult } | { ok: false; message: string; scenesLeft?: number };

/** Puts the food on a backdrop (`mask`: the one the first background of this photo sent back). Never throws. */
export async function placeBackground(api: Pick<Api, 'post'>, image: string, mask: string | null, backdrop: string): Promise<BackgroundOutcome> {
  try {
    const res = await api.post<{ result?: BackgroundResult; error?: string }>(
      PROMOTE_BACKGROUND_PATH,
      { image: { mediaType: 'image/jpeg', data: image }, ...(mask && { mask: { mediaType: 'image/png', data: mask } }), backdrop },
      { timeoutMs: PROMOTE_TIMEOUT_MS },
    );
    return res.result ? { ok: true, result: res.result } : { ok: false, message: res.error || 'The background could not be made. Please try again.' };
  } catch (err) {
    if (err instanceof ApiError && err.status === 0 && err.code === 'timeout') return { ok: false, message: 'That took too long. Please try again.' };
    if (err instanceof ApiError && err.status === 429 && err.code === 'monthly_limit') return { ok: false, message: err.message, scenesLeft: 0 };
    // This route's own messages say what happened (no food found, Photoroom busy); others are said the usual way.
    if (err instanceof ApiError && ['no_subject', 'background_failed', 'backgrounds_unavailable', 'daily_limit'].includes(err.code)) return { ok: false, message: err.message };
    return { ok: false, message: describeApiError(err) };
  }
}

/** What the button says while the photo is being worked on: it can take a little while. */
export function promoteWorkingLabel(elapsedMs: number): string {
  if (elapsedMs < 6_000) return 'Sending the photo…';
  if (elapsedMs < 20_000) return 'Making it look its best…';
  return 'Writing the caption…';
}
