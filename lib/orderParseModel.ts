/**
 * orderParseModel.ts
 *
 * The one place order parsing calls the model. Returns the parsed JSON the model
 * wrote (still unvalidated: orderParseRoutes validates it) and the token usage.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { ORDER_SCHEMA } from '../src/utils/orderParse';
import { AI_MODEL } from './aiConfig';
import { getAnthropic } from './anthropic';
import { ORDER_PARSE_SYSTEM_PROMPT, buildOrderParseUserMessage, type MenuEntry } from './orderParsePrompt';
import type { ModelResult } from './briefingModel';

export type OrderParseModel = (input: { text: string; menu: MenuEntry[]; problems?: string[] }) => Promise<ModelResult>;

export function createOrderParseModel(getClient: () => Pick<Anthropic, 'messages'> = getAnthropic): OrderParseModel {
  return async ({ text, menu, problems }) => {
    const response = await getClient().messages.create({
      model: AI_MODEL,
      max_tokens: 800,
      system: ORDER_PARSE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildOrderParseUserMessage(text, menu, problems) }],
      output_config: { format: { type: 'json_schema', schema: ORDER_SCHEMA as unknown as Record<string, unknown> } },
    });
    const usage = { input: response.usage?.input_tokens ?? 0, output: response.usage?.output_tokens ?? 0 };
    console.log('[ai] parse-order', { model: AI_MODEL, ...usage, stop: response.stop_reason, retry: !!problems });
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
