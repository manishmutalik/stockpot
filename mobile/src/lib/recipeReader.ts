/**
 * recipeReader.ts
 *
 * Reading a recipe on the phone: the same recipe reader as the web (POST /api/mobile/recipes/read is its handler, with the
 * same daily and monthly limits), and the same check screen logic (src/utils/recipeDraft), so a recipe read on the phone
 * is matched, worked out and saved exactly as on the web. The server answers with what it read; the phone builds the
 * draft from the owner's materials and menu (GET /api/mobile/recipes/setup), the owner settles it, and Save sends
 * `draftToImport`'s answer (POST /api/mobile/recipes), which the server checks again against what is there now.
 *
 * Plain logic over `Api`, so it is tested without a phone. Taking and shrinking photos is in recipePhotos.ts.
 */
import type { RecipeSetupView, RecipesSaved } from '../../../src/utils/quickApiTypes';
import { prepareRecipeText, RECIPE_MAX_MATERIALS, RECIPE_MAX_PHOTOS, type ParsedRecipes, type RecipePhoto } from '../../../src/utils/recipeParse';
import type { DraftImport, RecipeDraft } from '../../../src/utils/recipeDraft';
import { ApiError, describeApiError, type Api } from './api';

export const AI_STATUS_PATH = '/api/ai/status';
export const RECIPE_SETUP_PATH = '/api/mobile/recipes/setup';
export const RECIPE_READ_PATH = '/api/mobile/recipes/read';
export const RECIPE_SAVE_PATH = '/api/mobile/recipes';
/** The server gives the model 90 seconds; photos take a while to send on a slow connection too. */
export const RECIPE_READ_TIMEOUT_MS = 120_000;

export type RecipeAvailability =
  | { available: true; remaining: number | null }
  | { available: false; message: string };

/** Whether this account can read recipes (GET /api/ai/status), and how many more today. */
export function recipeAvailability(status: unknown): RecipeAvailability {
  const s = status as { available?: boolean; reason?: string; limits?: { recipe?: { remaining?: number } } } | null;
  if (s?.available === true && s.limits?.recipe) {
    return { available: true, remaining: typeof s.limits.recipe.remaining === 'number' ? s.limits.recipe.remaining : null };
  }
  const reason = s?.reason;
  if (reason === 'demo_account') return { available: false, message: 'Reading recipes is not available in the demo kitchen. Sign in with your own account to use it.' };
  if (reason === 'subscription_required') return { available: false, message: 'Reading recipes needs an active Stockpot plan.' };
  if (reason === 'not_allowed') return { available: false, message: 'Reading recipes is not switched on for your account yet.' };
  return { available: false, message: 'Reading recipes is not available right now.' };
}

export async function loadRecipeAvailability(api: Pick<Api, 'get'>): Promise<RecipeAvailability> {
  try {
    return recipeAvailability(await api.get(AI_STATUS_PATH));
  } catch (err) {
    return { available: false, message: describeApiError(err) };
  }
}

export const loadRecipeSetup = (api: Pick<Api, 'get'>) => api.get<RecipeSetupView>(RECIPE_SETUP_PATH);

export type RecipeSource = { text: string } | { photos: RecipePhoto[] };

export type RecipeReadOutcome =
  | { ok: true; parsed: ParsedRecipes; remaining?: number }
  | { ok: false; message: string; remaining?: number };

/** What is sent: the recipe (text or photos) and the owner's materials, which the reader matches ingredients to. */
export function recipeReadBody(source: RecipeSource, materials: RecipeSetupView['materials']): Record<string, unknown> | { error: string } {
  const list = materials.slice(0, RECIPE_MAX_MATERIALS).map(m => ({ id: m.id, name: (m.name || '').slice(0, 80) || 'Material', unit: m.unit || 'g' }));
  if ('text' in source) {
    const text = prepareRecipeText(source.text);
    if (text.trim() === '') return { error: 'Type or paste a recipe first.' };
    return { text, materials: list };
  }
  if (source.photos.length === 0) return { error: 'Add a photo of the recipe first.' };
  if (source.photos.length > RECIPE_MAX_PHOTOS) return { error: `Up to ${RECIPE_MAX_PHOTOS} photos at a time.` };
  return { photos: source.photos, materials: list };
}

/** Reads the recipe. Never throws: every failure becomes something to show the owner. */
export async function readRecipe(api: Pick<Api, 'post'>, source: RecipeSource, materials: RecipeSetupView['materials']): Promise<RecipeReadOutcome> {
  const body = recipeReadBody(source, materials);
  if ('error' in body && typeof body.error === 'string') return { ok: false, message: body.error };
  try {
    const res = await api.post<{ parsed: ParsedRecipes | null; remaining?: number; error?: string }>(RECIPE_READ_PATH, body, { timeoutMs: RECIPE_READ_TIMEOUT_MS });
    const remaining = typeof res.remaining === 'number' ? res.remaining : undefined;
    if (!res.parsed) return { ok: false, message: res.error || 'I could not read that reliably. Try a clearer photo, or type the recipe.', remaining };
    if (res.parsed.recipes.length === 0) return { ok: false, message: 'No recipe was found in that. Check the photo shows the ingredients, or type the recipe.', remaining };
    return { ok: true, parsed: res.parsed, remaining };
  } catch (err) {
    if (err instanceof ApiError && err.status === 0 && err.code === 'timeout') {
      return { ok: false, message: 'That took too long. Try again, or with fewer photos.' };
    }
    if (err instanceof ApiError && err.status === 429) return { ok: false, message: err.message, remaining: 0 };
    if (err instanceof ApiError && err.status === 413) return { ok: false, message: 'Those photos are too large to send. Try one page at a time.' };
    return { ok: false, message: describeApiError(err) };
  }
}

/** Saves what the check screen settled (`idempotencyKey`: a fresh id per tap of Save, reused for a retry of it). */
export const saveRecipes = (api: Pick<Api, 'post'>, data: DraftImport, idempotencyKey: string) =>
  api.post<RecipesSaved>(RECIPE_SAVE_PATH, data, { idempotencyKey });

/** "2 recipes saved" and what to do next. */
export function savedSummary(saved: RecipesSaved): { title: string; detail: string } {
  const n = saved.menuItemIds.length;
  const onMenu = n === 1 ? 'It is on your menu now' : 'They are on your menu now';
  return {
    title: n === 1 ? 'Recipe saved' : `${n} recipes saved`,
    detail: saved.newMaterials > 0
      ? `${onMenu}, with ${saved.newMaterials === 1 ? 'one new material' : `${saved.newMaterials} new materials`} in your stock. Add a price for any without one when you buy it, so the costs are complete.`
      : `${onMenu}, with ${n === 1 ? 'its cost' : 'their costs'} worked out from your materials.`,
  };
}

/** How many recipes Save will save: the ticked ones that are sold on their own (a part is folded into its item). */
export const recipesToSave = (draft: RecipeDraft) => draft.recipes.filter(r => r.include && r.use.kind !== 'part').length;

/** "kg", "litre", "piece": how a material's unit is said after "per". */
export const perUnit = (unit: string) => ({ pcs: 'piece', l: 'litre' } as Record<string, string>)[unit] ?? unit;

/** A typed number for a field: positive and finite, or null. Accepts "1,5" as 1.5. */
export function readNumber(text: string): number | null {
  const n = Number(text.replace(',', '.').trim());
  return text.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

/** 1234.5 as "1,234.5", at most two decimals. */
export const fmtAmount = (n: number) => (Math.round(n * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });

/** What the reading screen says while waiting: photos take a while. */
export function recipeReadingLabel(elapsedMs: number): string {
  if (elapsedMs < 4000) return 'Reading the recipe…';
  if (elapsedMs < 15000) return 'Matching ingredients to your materials…';
  if (elapsedMs < 45000) return 'Still working. A photo can take up to a minute…';
  return 'Nearly there…';
}
