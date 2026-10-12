/**
 * recipeParseModel.ts
 *
 * The one place recipe reading calls the model. Returns the parsed JSON the model wrote (still unvalidated:
 * recipeParseRoutes validates it) and the token usage.
 *
 * Unlike the other readers it uses RECIPE_AI_MODEL (Claude Opus 5.5), which reads handwriting from photos well: a
 * misread amount would put a wrong cost on every order of the item. It thinks before answering (it always does);
 * effort is kept low, since copying a recipe is not hard reasoning, and that keeps the cost down. A page of several
 * recipes takes a while, so it is given longer than the shared client's 30 seconds. If the model declines, the
 * request is answered by another model instead (`fallbacks: "default"`).
 */
import type Anthropic from '@anthropic-ai/sdk';
import { RECIPE_SCHEMA, type RecipePhoto } from '../src/utils/recipeParse';
import { RECIPE_AI_MODEL } from './aiConfig';
import { getAnthropic } from './anthropic';
import type { ModelResult } from './briefingModel';
import { RECIPE_PARSE_SYSTEM_PROMPT, buildRecipeParseUserMessage, type MaterialEntry } from './recipeParsePrompt';

export type RecipeParseModel = (input: { text: string | null; photos: RecipePhoto[]; materials: MaterialEntry[]; problems?: string[] }) => Promise<ModelResult>;

export const RECIPE_TIMEOUT_MS = 90_000;

export function createRecipeParseModel(getClient: () => Pick<Anthropic, 'beta'> = getAnthropic): RecipeParseModel {
  return async ({ text, photos, materials, problems }) => {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...photos.map(p => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: p.mediaType, data: p.data } })),
      { type: 'text', text: buildRecipeParseUserMessage({ text, photoCount: photos.length, materials, problems }) },
    ];
    const response = await getClient().beta.messages.create({
      model: RECIPE_AI_MODEL,
      max_tokens: 16000,
      system: RECIPE_PARSE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: RECIPE_SCHEMA as unknown as Record<string, unknown> } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    }, { timeout: RECIPE_TIMEOUT_MS });
    const usage = { input: response.usage?.input_tokens ?? 0, output: response.usage?.output_tokens ?? 0 };
    console.log('[ai] parse-recipe', { model: response.model, ...usage, photos: photos.length, stop: response.stop_reason, retry: !!problems });
    if (response.stop_reason !== 'end_turn') return { raw: undefined, usage };
    const block = response.content.find(b => b.type === 'text');
    if (!block || block.type !== 'text') return { raw: undefined, usage };
    try {
      return { raw: JSON.parse(block.text), usage };
    } catch {
      return { raw: undefined, usage };
    }
  };
}
