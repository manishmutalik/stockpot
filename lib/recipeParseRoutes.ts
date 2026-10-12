/**
 * recipeParseRoutes.ts
 *
 * POST /api/ai/parse-recipe: reads recipes from text or from up to three photos into what the recipe check screen
 * shows, with its dependencies injected so it is tested without Firebase or the model. Wired up in server.ts behind
 * requireAuth and requireCsrf, with a larger body limit than other routes so photos fit (see server.ts).
 *
 * In order: check the request (photos are checked to be the image type they claim and not too large), check the
 * account may use AI (counts nothing), reserve one recipe against the day and the month (and RECIPE_GLOBAL_WEIGHT
 * calls against everyone's day), ask the model, and check what it read. The model is asked again once if its reading
 * fails the check; if that fails too nothing is returned (`parsed: null`). A page often holds several recipes: the
 * rest are counted once they are known, even past the limit, since the reading is already paid for. Nothing is saved
 * here, and photos are not kept: they are read and dropped.
 */
import type { Response } from 'express';
import {
  checkRecipePhoto, RECIPE_MAX_MATERIALS, RECIPE_MAX_PHOTOS, RECIPE_TEXT_MAX_CHARS, validateParsedRecipes,
  type ParsedRecipes, type RecipePhoto,
} from '../src/utils/recipeParse';
import type { AuthedRequest } from './auth';
import { aiErrorResponse } from './anthropic';
import { RECIPE_GLOBAL_WEIGHT } from './aiConfig';
import { checkAiEntitlement, type AiGuardDeps } from './aiGuard';
import type { addRecipeUse, reserveRecipeUse } from './aiUsage';
import type { RecipeParseModel } from './recipeParseModel';
import type { MaterialEntry } from './recipeParsePrompt';

export interface RecipeParseDeps extends Pick<AiGuardDeps, 'config' | 'billingDisabled' | 'hasActiveAccess' | 'usageDay' | 'globalDay'> {
  model: RecipeParseModel;
  reserveRecipe: typeof reserveRecipeUse;
  addRecipes: typeof addRecipeUse;
}

const ID = /^[A-Za-z0-9_.-]{1,80}$/;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export interface RecipeParseRequest { text: string | null; photos: RecipePhoto[]; materials: MaterialEntry[] }

/** The request body: either the recipe text or one to three photos, and the owner's materials (ids, names, units). */
export function parseRecipeRequest(body: unknown): RecipeParseRequest | null {
  if (!isObject(body)) return null;
  const { text, photos, materials } = body;
  const hasText = typeof text === 'string' && text.trim() !== '';
  const hasPhotos = Array.isArray(photos) && photos.length > 0;
  if (hasText === hasPhotos) return null; // one or the other
  if (hasText && (text as string).length > RECIPE_TEXT_MAX_CHARS) return null;
  let checkedPhotos: RecipePhoto[] = [];
  if (hasPhotos) {
    if ((photos as unknown[]).length > RECIPE_MAX_PHOTOS) return null;
    const checked = (photos as unknown[]).map(checkRecipePhoto);
    if (checked.some(p => p === null)) return null;
    checkedPhotos = checked as RecipePhoto[];
  }
  if (materials !== undefined && (!Array.isArray(materials) || materials.length > RECIPE_MAX_MATERIALS)) return null;
  const list: MaterialEntry[] = [];
  for (const m of (materials as unknown[] | undefined) ?? []) {
    if (!isObject(m) || typeof m.id !== 'string' || !ID.test(m.id) || typeof m.name !== 'string' || m.name.trim() === '' || m.name.length > 80) return null;
    const unit = typeof m.unit === 'string' && m.unit.length <= 12 ? m.unit : 'g';
    list.push({ id: m.id, name: m.name.trim(), unit });
  }
  return { text: hasText ? (text as string).trim() : null, photos: checkedPhotos, materials: list };
}

/** The model's reading, checked; asked a second time with what was wrong if the first fails. Null if neither passes. */
export async function readRecipesValidated(input: RecipeParseRequest, model: RecipeParseModel): Promise<ParsedRecipes | null> {
  let problems: string[] | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { raw } = await model({ ...input, problems });
    if (raw === undefined) { problems = ['the answer was not valid JSON in the required format']; continue; }
    const checked = validateParsedRecipes(raw, { text: input.text, materialIds: input.materials.map(m => m.id) });
    if (checked.ok === true) return checked.parsed;
    problems = checked.problems;
  }
  return null;
}

export function createRecipeParseHandler(deps: RecipeParseDeps) {
  return async (req: AuthedRequest, res: Response) => {
    const uid = req.uid!;
    const who = { uid, email: req.email, emailVerified: req.emailVerified };
    try {
      const parsed = parseRecipeRequest(req.body);
      if (!parsed) return res.status(400).json({ error: 'The request was not understood. Send the recipe as text, or as one to three photos (JPEG, PNG or WebP).', code: 'bad_request' });

      const entitled = await checkAiEntitlement(who, deps);
      if (entitled.ok === false) return res.status(entitled.status).json({ error: entitled.message, code: entitled.code });

      const config = deps.config();
      const userDay = await deps.usageDay(uid);
      const reserved = await deps.reserveRecipe({
        uid, userDay, globalDayKey: deps.globalDay(),
        dailyLimit: config.limits.recipe, monthlyLimit: config.recipeMonthlyLimit, globalLimit: config.globalLimit, globalWeight: RECIPE_GLOBAL_WEIGHT,
      });
      if (reserved.ok === false) {
        if (reserved.reason === 'user_limit') return res.status(429).json({ error: `You have read ${config.limits.recipe} recipes today. You can read more tomorrow.`, code: 'daily_limit' });
        if (reserved.reason === 'month_limit') return res.status(429).json({ error: `You have read ${config.recipeMonthlyLimit} recipes this month. You can read more next month.`, code: 'monthly_limit' });
        return res.status(503).json({ error: 'AI features are very busy today. Please try again tomorrow.', code: 'busy' });
      }

      try {
        const recipes = await readRecipesValidated(parsed, deps.model);
        let { day, month } = reserved;
        if (recipes && recipes.recipes.length > 1) ({ day, month } = await deps.addRecipes({ uid, userDay, count: recipes.recipes.length - 1 }));
        const remaining = Math.max(Math.min(config.limits.recipe - day, config.recipeMonthlyLimit - month), 0);
        if (recipes === null) {
          return res.json({ parsed: null, code: 'unverified', error: 'I could not read that reliably. Try a clearer photo, or type the recipe.', remaining });
        }
        return res.json({ parsed: recipes, remaining });
      } catch (err: unknown) {
        console.error('Recipe reading failed:', (err as Error)?.message);
        const mapped = aiErrorResponse(err);
        return res.status(mapped.status).json({ error: mapped.message, code: 'model_error' });
      }
    } catch (err: unknown) {
      console.error('Recipe reading request failed:', (err as Error)?.message);
      return res.status(500).json({ error: 'Could not read that recipe.' });
    }
  };
}
