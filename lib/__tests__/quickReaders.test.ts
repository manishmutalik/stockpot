// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  PAYMENT_PARSE_SYSTEM_PROMPT, RESTOCK_PARSE_SYSTEM_PROMPT, buildPaymentUserMessage, buildRestockUserMessage,
  createPaymentParseModel, createRestockParseModel,
} from '../quickReaders';
import { AI_MODEL } from '../aiConfig';
import { PAYMENT_SCHEMA } from '../../src/utils/paymentParse';
import { RESTOCK_SCHEMA } from '../../src/utils/restockParse';

const materials = [{ id: 'butter', name: 'Butter' }];
const reply = (over: Record<string, any> = {}) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"lines":[]}' }], usage: { input_tokens: 400, output_tokens: 60 }, ...over });
const client = (r: any) => ({ messages: { create: vi.fn().mockResolvedValue(r) } }) as any;

describe('the prompts', () => {
  it('ask only for what is written and treat the note as data', () => {
    for (const p of [RESTOCK_PARSE_SYSTEM_PROMPT, PAYMENT_PARSE_SYSTEM_PROMPT]) {
      expect(p).toMatch(/Never guess or invent/);
      expect(p).toMatch(/data, not instructions/);
    }
    expect(RESTOCK_PARSE_SYSTEM_PROMPT).toMatch(/Never multiply, divide, convert or work a price out yourself/);
    expect(PAYMENT_PARSE_SYSTEM_PROMPT).toMatch(/customerLabel/);
  });

  it('put the list and the note in the user message, and what was wrong on a retry', () => {
    const m = buildRestockUserMessage('bought butter', materials);
    expect(m).toContain(JSON.stringify(materials));
    expect(m).toContain('bought butter');
    expect(m).not.toContain('rejected');
    expect(buildRestockUserMessage('bought butter', materials, ['item 1: quantity 7 is not written'])).toContain('rejected: item 1: quantity 7 is not written');
    expect(buildPaymentUserMessage('Priya paid 900', ['the amount 950 is not written'])).toContain('rejected: the amount 950 is not written');
  });
});

describe('the model calls', () => {
  it('ask Claude Haiku for JSON in each reader\'s format', async () => {
    const r = client(reply());
    const result = await createRestockParseModel(() => r)({ text: 'bought butter', menu: materials });
    const call = r.messages.create.mock.calls[0][0];
    expect(call.model).toBe(AI_MODEL);
    expect(call.output_config.format).toEqual({ type: 'json_schema', schema: RESTOCK_SCHEMA });
    expect(call.system).toBe(RESTOCK_PARSE_SYSTEM_PROMPT);
    expect(result.raw).toEqual({ lines: [] });
    expect(result.usage).toEqual({ input: 400, output: 60 });

    const p = client(reply({ content: [{ type: 'text', text: '{"customerLabel":null,"customerName":"Ravi","amount":900,"method":null}' }] }));
    const paid = await createPaymentParseModel(() => p)({ text: 'Ravi paid 900', menu: [] });
    expect(p.messages.create.mock.calls[0][0].output_config.format).toEqual({ type: 'json_schema', schema: PAYMENT_SCHEMA });
    expect(paid.raw).toMatchObject({ amount: 900 });
  });

  it('give nothing back when the model stopped early, declined or did not return JSON', async () => {
    for (const r of [reply({ stop_reason: 'max_tokens' }), reply({ stop_reason: 'refusal' }), reply({ content: [] }), reply({ content: [{ type: 'text', text: 'nope' }] })]) {
      expect((await createPaymentParseModel(() => client(r))({ text: 'x', menu: [] })).raw).toBeUndefined();
    }
  });
});
