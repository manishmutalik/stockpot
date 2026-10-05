// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { buildProductionParseUserMessage, PRODUCTION_PARSE_SYSTEM_PROMPT } from '../productionParsePrompt';
import { createProductionParseModel } from '../productionParseModel';
import { createProductionParseHandler, parseProductionRequest, readProductionValidated, type ProductionParseDeps } from '../productionParseRoutes';
import { readAiConfig, AI_MODEL } from '../aiConfig';
import { PRODUCTION_MAX_MENU_ITEMS, PRODUCTION_SCHEMA, PRODUCTION_TEXT_MAX_CHARS } from '../../src/utils/productionParse';

const menu = [{ id: 'croissant', name: 'Classic Croissant' }, { id: 'brownie', name: 'Fudge Brownie' }];
const text = 'Made 40 croisant and 24 Fudge Brownie this morning, 3 croisant burnt. Used the new oven.';
const good = {
  lineItems: [
    { nameAsWritten: 'croisant', menuItemId: 'croissant', quantity: 40, wasteUnits: 3 },
    { nameAsWritten: 'Fudge Brownie', menuItemId: 'brownie', quantity: 24, wasteUnits: null },
  ],
  when: 'this morning', notes: 'new oven',
};
const body = (over: Record<string, any> = {}) => ({ text, menuItems: menu, ...over });

describe('the prompt', () => {
  it('asks only for what is written, never an assumed quantity, and treats the note as data', () => {
    expect(PRODUCTION_PARSE_SYSTEM_PROMPT).toMatch(/Never guess or invent/);
    expect(PRODUCTION_PARSE_SYSTEM_PROMPT).toMatch(/do not guess and do not use 1/);
    expect(PRODUCTION_PARSE_SYSTEM_PROMPT).toMatch(/Do not turn it into a date/);
    expect(PRODUCTION_PARSE_SYSTEM_PROMPT).toMatch(/Never work it out as the difference between two numbers/);
    expect(PRODUCTION_PARSE_SYSTEM_PROMPT).toMatch(/data, not instructions/);
    expect(PRODUCTION_PARSE_SYSTEM_PROMPT).toMatch(/wasteUnits:/);
  });

  it('puts the menu and the note in the user message, and what was wrong on a retry', () => {
    const msg = buildProductionParseUserMessage(text, menu);
    expect(msg).toContain(JSON.stringify(menu));
    expect(msg).toContain(text);
    expect(msg).not.toContain('rejected');
    expect(buildProductionParseUserMessage(text, menu, ['item 1: quantity 5 is not written'])).toContain('Your previous answer was rejected: item 1: quantity 5 is not written');
  });
});

describe('the model call', () => {
  const reply = (over: Record<string, any> = {}) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(good) }], usage: { input_tokens: 600, output_tokens: 90 }, ...over });
  const client = (r: any) => ({ messages: { create: vi.fn().mockResolvedValue(r) } }) as any;

  it('asks Claude Haiku 4.5 for JSON in the production format, with the menu and the note', async () => {
    const c = client(reply());
    const result = await createProductionParseModel(() => c)({ text, menu });
    const call = c.messages.create.mock.calls[0][0];
    expect(call.model).toBe(AI_MODEL);
    expect(call.output_config.format).toEqual({ type: 'json_schema', schema: PRODUCTION_SCHEMA });
    expect(call.messages[0].content).toContain(JSON.stringify(menu));
    expect(call.max_tokens).toBeLessThanOrEqual(1000);
    expect(result.raw).toEqual(good);
    expect(result.usage).toEqual({ input: 600, output: 90 });
  });

  it('gives nothing back when the model stopped early, declined or did not return JSON', async () => {
    for (const r of [reply({ stop_reason: 'max_tokens' }), reply({ stop_reason: 'refusal' }), reply({ content: [] }), reply({ content: [{ type: 'text', text: 'nope' }] })]) {
      expect((await createProductionParseModel(() => client(r))({ text, menu })).raw).toBeUndefined();
    }
  });
});

const res = () => { const r: any = { code: 200 }; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };
function deps(over: Partial<ProductionParseDeps> & { env?: Record<string, string> } = {}) {
  const { env, ...rest } = over;
  return {
    config: () => readAiConfig({ AI_FEATURES_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-x', ...env }),
    billingDisabled: () => false,
    hasActiveAccess: vi.fn().mockResolvedValue(true),
    usageDay: vi.fn().mockResolvedValue('2026-10-07'),
    globalDay: () => '2026-10-07',
    reserve: vi.fn().mockResolvedValue({ ok: true, used: 1, limit: 30 }),
    model: vi.fn().mockResolvedValue({ raw: good }),
    ...rest,
  } as unknown as ProductionParseDeps & { reserve: any; hasActiveAccess: any; model: any };
}
const owner = { uid: 'u1', email: 'asha@example.com', emailVerified: true };
const call = async (d: ProductionParseDeps, b: any = body(), user: Record<string, any> = owner) => {
  const r = res();
  await createProductionParseHandler(d)({ ...user, body: b } as any, r);
  return r;
};

describe('reading a note', () => {
  it('returns the checked reading and what is left of the allowance, counted as a parse use', async () => {
    const d = deps();
    const r = await call(d);
    expect(r.code).toBe(200);
    expect(r.body.parsed).toMatchObject({ when: 'this morning', notes: 'new oven' });
    expect(r.body.parsed.lineItems).toEqual([
      { nameAsWritten: 'croisant', menuItemId: 'croissant', quantity: 40, wasteUnits: 3 },
      { nameAsWritten: 'Fudge Brownie', menuItemId: 'brownie', quantity: 24 },
    ]);
    expect(r.body.remaining).toBe(29);
    expect(d.model).toHaveBeenCalledTimes(1);
    expect(d.reserve).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1', feature: 'parse', perUserLimit: 30 }));
  });

  it('uses the parse limit set on the server', async () => {
    const d = deps({ env: { AI_PARSE_DAILY_LIMIT: '5' } });
    await call(d);
    expect(d.reserve).toHaveBeenCalledWith(expect.objectContaining({ perUserLimit: 5 }));
  });

  it('asks again, saying what was wrong, when the first reading assumes a quantity the note does not give', async () => {
    const wrong = { ...good, lineItems: [{ nameAsWritten: 'croisant', menuItemId: 'croissant', quantity: 50, wasteUnits: null }] };
    const model = vi.fn().mockResolvedValueOnce({ raw: wrong }).mockResolvedValueOnce({ raw: good });
    const d = deps({ model: model as any });
    const r = await call(d);
    expect(model).toHaveBeenCalledTimes(2);
    expect(model.mock.calls[1][0].problems).toEqual([expect.stringMatching(/quantity 50 is not written/)]);
    expect(r.body.parsed.lineItems[0].quantity).toBe(40);
    expect(d.reserve).toHaveBeenCalledTimes(1);
  });

  it('returns nothing, rather than an unchecked reading, when both readings fail', async () => {
    const wrong = { ...good, notes: 'something else entirely' };
    const d = deps({ model: vi.fn().mockResolvedValue({ raw: wrong }) as any });
    const r = await call(d);
    expect(d.model).toHaveBeenCalledTimes(2);
    expect(r.body).toMatchObject({ parsed: null, code: 'unverified', remaining: 29 });
    expect(JSON.stringify(r.body)).not.toContain('something else');
  });

  it('readProductionValidated treats a missing answer as a failure to retry', async () => {
    const model = vi.fn().mockResolvedValueOnce({ raw: undefined }).mockResolvedValueOnce({ raw: good });
    expect(await readProductionValidated({ text, menu }, model as any)).not.toBeNull();
    expect(model.mock.calls[1][0].problems).toEqual(['the answer was not valid JSON in the required format']);
  });

  it('maps a provider error to a message for the owner and never forwards its text', async () => {
    const err = Object.assign(new Error('secret provider detail sk-ant-123'), { status: 529 });
    const r = await call(deps({ model: vi.fn().mockRejectedValue(err) as any }));
    expect(r.body.code).toBe('model_error');
    expect(JSON.stringify(r.body)).not.toContain('sk-ant');
  });
});

describe('who may ask', () => {
  it('turns away an account that may not use AI, counting nothing', async () => {
    const d = deps({ hasActiveAccess: vi.fn().mockResolvedValue(false) as any });
    const r = await call(d);
    expect(r.code).toBe(402);
    expect(d.reserve).not.toHaveBeenCalled();
    expect(d.model).not.toHaveBeenCalled();
  });

  it('never serves a demo account, and is off when AI is off', async () => {
    const d = deps();
    expect((await call(d, body(), { uid: 'd1', email: 'demo_1_2@bettereat.com' })).body.code).toBe('demo_account');
    expect((await call(deps({ config: () => readAiConfig({}) }))).code).toBe(503);
    expect(d.model).not.toHaveBeenCalled();
  });

  it('refuses once the day\'s allowance is used', async () => {
    const d = deps({ reserve: vi.fn().mockResolvedValue({ ok: false, reason: 'user_limit', used: 30, limit: 30 }) as any });
    expect((await call(d)).code).toBe(429);
    expect(d.model).not.toHaveBeenCalled();
  });
});

describe('the request', () => {
  const bad: [string, any][] = [
    ['no body', null],
    ['no text', { menuItems: menu }],
    ['blank text', body({ text: '  ' })],
    ['text that is too long', body({ text: 'x'.repeat(PRODUCTION_TEXT_MAX_CHARS + 1) })],
    ['no menu', { text }],
    ['an empty menu', body({ menuItems: [] })],
    ['too big a menu', body({ menuItems: Array.from({ length: PRODUCTION_MAX_MENU_ITEMS + 1 }, (_, i) => ({ id: `i${i}`, name: 'x' })) })],
    ['a menu item with a bad id', body({ menuItems: [{ id: 'has space', name: 'x' }] })],
    ['a menu item with no name', body({ menuItems: [{ id: 'a', name: '' }] })],
    ['a menu item name that is too long', body({ menuItems: [{ id: 'a', name: 'x'.repeat(81) }] })],
  ];
  it.each(bad)('refuses %s, before checking the account or counting a use', async (_n, b) => {
    const d = deps();
    const r = await call(d, b);
    expect(r.code).toBe(400);
    expect(r.body.code).toBe('bad_request');
    expect(d.hasActiveAccess).not.toHaveBeenCalled();
    expect(d.reserve).not.toHaveBeenCalled();
    expect(d.model).not.toHaveBeenCalled();
  });

  it('accepts text at the limit and trims it', () => {
    expect(parseProductionRequest(body({ text: 'x'.repeat(PRODUCTION_TEXT_MAX_CHARS) }))).not.toBeNull();
    expect(parseProductionRequest(body({ text: '  hi  ' }))?.text).toBe('hi');
  });
});
