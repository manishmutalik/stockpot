/**
 * briefingModel.ts
 *
 * The one place the briefing calls the model. Returns the parsed JSON the model
 * wrote (still unvalidated: briefingRoutes validates it) and the token usage, which
 * is logged so what a briefing really costs can be measured against the estimate.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { BRIEFING_SCHEMA } from '../src/utils/aiBriefing';
import type { AiSnapshot } from '../src/utils/aiSnapshot';
import { AI_MODEL } from './aiConfig';
import { getAnthropic } from './anthropic';
import { BRIEFING_SYSTEM_PROMPT, buildBriefingUserMessage } from './briefingPrompt';

export interface ModelResult {
  /** The model's JSON answer, or undefined if it declined, ran out of room or did not return JSON. */
  raw: unknown;
  usage?: { input: number; output: number };
}

export type BriefingModel = (snapshot: AiSnapshot, problems?: string[]) => Promise<ModelResult>;

export function createBriefingModel(getClient: () => Pick<Anthropic, 'messages'> = getAnthropic): BriefingModel {
  return async (snapshot, problems) => {
    const response = await getClient().messages.create({
      model: AI_MODEL,
      max_tokens: 800,
      system: BRIEFING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildBriefingUserMessage(snapshot, problems) }],
      output_config: { format: { type: 'json_schema', schema: BRIEFING_SCHEMA as unknown as Record<string, unknown> } },
    });
    const usage = { input: response.usage?.input_tokens ?? 0, output: response.usage?.output_tokens ?? 0 };
    console.log('[ai] briefing', { model: AI_MODEL, ...usage, stop: response.stop_reason, retry: !!problems });
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
