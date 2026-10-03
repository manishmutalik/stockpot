import { describe, it, expect, vi } from 'vitest';
import { createBriefingModel } from '../briefingModel';
import { AI_MODEL } from '../aiConfig';
import { BRIEFING_SCHEMA } from '../../src/utils/aiBriefing';
import { sampleSnapshot } from './briefingFixtures';

const reply = (over: Record<string, any> = {}) => ({
  stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ why: 'Words.', attention: [] }) }], usage: { input_tokens: 2400, output_tokens: 90 }, ...over,
});
const client = (r: any) => ({ messages: { create: vi.fn().mockResolvedValue(r) } }) as any;
const { promptSnapshot } = sampleSnapshot();

describe('createBriefingModel', () => {
  it('asks Claude Haiku 4.5 for JSON in the briefing format, with the prompt and the snapshot', async () => {
    const c = client(reply());
    await createBriefingModel(() => c)(promptSnapshot);
    const call = c.messages.create.mock.calls[0][0];
    expect(call.model).toBe(AI_MODEL);
    expect(call.system).toMatch(/NEVER write a digit/);
    expect(call.messages).toHaveLength(1);
    expect(call.messages[0].content).toContain(JSON.stringify(promptSnapshot));
    expect(call.output_config.format).toEqual({ type: 'json_schema', schema: BRIEFING_SCHEMA });
    expect(call.max_tokens).toBeLessThanOrEqual(1000);
  });

  it('returns what the model wrote and the token usage', async () => {
    const result = await createBriefingModel(() => client(reply()))(promptSnapshot);
    expect(result.raw).toEqual({ why: 'Words.', attention: [] });
    expect(result.usage).toEqual({ input: 2400, output: 90 });
  });

  it('passes on what was wrong when it is asked again', async () => {
    const c = client(reply());
    await createBriefingModel(() => c)(promptSnapshot, ['why: a digit outside a token']);
    expect(c.messages.create.mock.calls[0][0].messages[0].content).toContain('Your previous answer was rejected');
  });

  it('gives nothing back, rather than a guess, when the model stopped early, declined or did not return JSON', async () => {
    for (const r of [reply({ stop_reason: 'max_tokens' }), reply({ stop_reason: 'refusal' }), reply({ content: [] }), reply({ content: [{ type: 'text', text: 'not json' }] })]) {
      expect((await createBriefingModel(() => client(r))(promptSnapshot)).raw).toBeUndefined();
    }
  });

  it('lets an API error through, for the route to map', async () => {
    const c = { messages: { create: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { status: 529 })) } } as any;
    await expect(createBriefingModel(() => c)(promptSnapshot)).rejects.toMatchObject({ status: 529 });
  });
});
