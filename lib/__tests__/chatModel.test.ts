import { describe, it, expect, vi } from 'vitest';
import { createChatModel } from '../chatModel';
import { AI_MODEL } from '../aiConfig';
import { CHAT_SCHEMA } from '../../src/utils/aiChat';
import { sampleSnapshot } from './briefingFixtures';

const reply = (over: Record<string, any> = {}) => ({
  stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ answer: 'Words.' }) }], usage: { input_tokens: 2600, output_tokens: 80 }, ...over,
});
const client = (r: any) => ({ messages: { create: vi.fn().mockResolvedValue(r) } }) as any;
const { promptSnapshot } = sampleSnapshot();
const input = { snapshot: promptSnapshot, question: 'Why did profit change?', history: [] as any[] };

describe('createChatModel', () => {
  it('asks Claude Haiku 4.5 for JSON in the chat format, with the prompt, the snapshot and the question', async () => {
    const c = client(reply());
    await createChatModel(() => c)(input);
    const call = c.messages.create.mock.calls[0][0];
    expect(call.model).toBe(AI_MODEL);
    expect(call.system).toMatch(/NEVER write a digit/);
    expect(call.messages).toHaveLength(1);
    expect(call.messages[0].content).toContain(JSON.stringify(promptSnapshot));
    expect(call.messages[0].content).toContain('Why did profit change?');
    expect(call.output_config.format).toEqual({ type: 'json_schema', schema: CHAT_SCHEMA });
    expect(call.max_tokens).toBeLessThanOrEqual(1000);
  });

  it('includes earlier turns before the question', async () => {
    const c = client(reply());
    await createChatModel(() => c)({ ...input, history: [{ question: 'Earlier?', answer: 'Before.' }] });
    expect(c.messages.create.mock.calls[0][0].messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('returns what the model wrote and the token usage', async () => {
    const result = await createChatModel(() => client(reply()))(input);
    expect(result.raw).toEqual({ answer: 'Words.' });
    expect(result.usage).toEqual({ input: 2600, output: 80 });
  });

  it('passes on what was wrong when it is asked again', async () => {
    const c = client(reply());
    await createChatModel(() => c)({ ...input, problems: ['a digit outside a token'] });
    expect(c.messages.create.mock.calls[0][0].messages[0].content).toContain('Your previous answer was rejected');
  });

  it('gives nothing back when the model stopped early, declined or did not return JSON', async () => {
    for (const r of [reply({ stop_reason: 'max_tokens' }), reply({ stop_reason: 'refusal' }), reply({ content: [] }), reply({ content: [{ type: 'text', text: 'nope' }] })]) {
      expect((await createChatModel(() => client(r))(input)).raw).toBeUndefined();
    }
  });

  it('lets an API error through, for the route to map', async () => {
    const c = { messages: { create: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { status: 529 })) } } as any;
    await expect(createChatModel(() => c)(input)).rejects.toMatchObject({ status: 529 });
  });
});
