/**
 * productionParseModel.ts
 *
 * The one place production-run parsing calls the model. Returns the parsed JSON
 * the model wrote (still unvalidated: productionParseRoutes validates it) and the
 * token usage.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { PRODUCTION_SCHEMA } from '../src/utils/productionParse';
import { AI_MODEL } from './aiConfig';
import { getAnthropic } from './anthropic';
import type { MenuEntry } from './orderParsePrompt';
import { PRODUCTION_PARSE_SYSTEM_PROMPT, buildProductionParseUserMessage } from './productionParsePrompt';
import type { ModelResult } from './briefingModel';

export type ProductionParseModel = (input: { text: string; menu: MenuEntry[]; problems?: string[] }) => Promise<ModelResult>;

export function createProductionParseModel(getClient: () => Pick<Anthropic, 'messages'> = getAnthropic): ProductionParseModel {
  return async ({ text, menu, problems }) => {
    const response = await getClient().messages.create({
      model: AI_MODEL,
      max_tokens: 600,
      system: PRODUCTION_PARSE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildProductionParseUserMessage(text, menu, problems) }],
      output_config: { format: { type: 'json_schema', schema: PRODUCTION_SCHEMA as unknown as Record<string, unknown> } },
    });
    const usage = { input: response.usage?.input_tokens ?? 0, output: response.usage?.output_tokens ?? 0 };
    console.log('[ai] parse-production-run', { model: AI_MODEL, ...usage, stop: response.stop_reason, retry: !!problems });
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
