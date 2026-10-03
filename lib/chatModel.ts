/**
 * chatModel.ts
 *
 * The one place "Ask your business" calls the model. Returns the parsed JSON the
 * model wrote (still unvalidated: chatRoutes validates it) and the token usage,
 * which is logged so what a question really costs can be measured.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { CHAT_SCHEMA, type ChatTurn } from '../src/utils/aiChat';
import type { AiSnapshot } from '../src/utils/aiSnapshot';
import { AI_MODEL } from './aiConfig';
import { getAnthropic } from './anthropic';
import { CHAT_SYSTEM_PROMPT, buildChatMessages } from './chatPrompt';
import type { ModelResult } from './briefingModel';

export type ChatModel = (input: { snapshot: AiSnapshot; question: string; history: ChatTurn[]; problems?: string[] }) => Promise<ModelResult>;

export function createChatModel(getClient: () => Pick<Anthropic, 'messages'> = getAnthropic): ChatModel {
  return async ({ snapshot, question, history, problems }) => {
    const response = await getClient().messages.create({
      model: AI_MODEL,
      max_tokens: 700,
      system: CHAT_SYSTEM_PROMPT,
      messages: buildChatMessages(snapshot, question, history, problems),
      output_config: { format: { type: 'json_schema', schema: CHAT_SCHEMA as unknown as Record<string, unknown> } },
    });
    const usage = { input: response.usage?.input_tokens ?? 0, output: response.usage?.output_tokens ?? 0 };
    console.log('[ai] chat', { model: AI_MODEL, ...usage, stop: response.stop_reason, retry: !!problems });
    if (response.stop_reason !== 'end_turn') return { raw: undefined, usage };
    const text = response.content.find(b => b.type === 'text');
    if (!text || text.type !== 'text') return { raw: undefined, usage };
    try {
      return { raw: JSON.parse(text.text), usage };
    } catch {
      return { raw: undefined, usage };
    }
  };
}
