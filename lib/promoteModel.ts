/**
 * promoteModel.ts
 *
 * The one place Promote calls the model. Returns the JSON the model wrote (still unvalidated: promoteRoutes
 * validates it) and the token usage.
 *
 * It uses PROMOTE_AI_MODEL (Claude Sonnet 5.5): a caption is read by customers, so it is worth a model that writes
 * well, and it looks at a 1024 px copy of the photo (about 1,400 image tokens) rather than the full one. Effort is low,
 * since this is quick writing, not reasoning. If the model declines, another answers instead (`fallbacks: "default"`).
 */
import type Anthropic from '@anthropic-ai/sdk';
import { PROMOTE_SCHEMA, type PromoteLanguage } from '../src/utils/promote';
import { PROMOTE_AI_MODEL } from './aiConfig';
import { getAnthropic } from './anthropic';
import type { ModelResult } from './briefingModel';
import { PROMOTE_SYSTEM_PROMPT, buildPromoteUserMessage, type PromoteBusiness, type PromoteMenuEntry } from './promotePrompt';

export type PromoteModel = (input: { photo: Buffer; business: PromoteBusiness; menu: PromoteMenuEntry[]; language: PromoteLanguage; problems?: string[] }) => Promise<ModelResult>;

export const PROMOTE_TIMEOUT_MS = 60_000;

export function createPromoteModel(getClient: () => Pick<Anthropic, 'beta'> = getAnthropic): PromoteModel {
  return async ({ photo, business, menu, language, problems }) => {
    const response = await getClient().beta.messages.create({
      model: PROMOTE_AI_MODEL,
      max_tokens: 4000,
      system: PROMOTE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photo.toString('base64') } },
          { type: 'text', text: buildPromoteUserMessage({ business, menu, language, problems }) },
        ],
      }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: PROMOTE_SCHEMA as unknown as Record<string, unknown> } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    }, { timeout: PROMOTE_TIMEOUT_MS });
    const usage = { input: response.usage?.input_tokens ?? 0, output: response.usage?.output_tokens ?? 0 };
    console.log('[ai] promote', { model: response.model, ...usage, stop: response.stop_reason, retry: !!problems });
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
