import { describe, it, expect, vi } from 'vitest';
import { answerValidated, createChatHandler, parseChatRequest, type ChatDeps } from '../chatRoutes';
import { readAiConfig } from '../aiConfig';
import { CHAT_MAX_ANSWER_CHARS, CHAT_MAX_HISTORY_TURNS, CHAT_MAX_QUESTION_CHARS } from '../../src/utils/aiChat';
import { sampleSnapshot, TODAY } from './briefingFixtures';

const { promptSnapshot: snapshot } = sampleSnapshot({ start: '2026-06-01', end: TODAY });
const goodAnswer = { answer: 'Profit moved {{fig:true_profit_change}} as {{name:item_cake}} sold less.' };
const question = 'Why did my profit change?';

const res = () => { const r: any = { code: 200 }; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };

function deps(over: Partial<ChatDeps> & { env?: Record<string, string> } = {}) {
  const { env, ...rest } = over;
  const d = {
    config: () => readAiConfig({ AI_FEATURES_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-x', ...env }),
    billingDisabled: () => false,
    hasActiveAccess: vi.fn().mockResolvedValue(true),
    usageDay: vi.fn().mockResolvedValue(TODAY),
    globalDay: () => TODAY,
    reserve: vi.fn().mockResolvedValue({ ok: true, used: 1, limit: 30 }),
    model: vi.fn().mockResolvedValue({ raw: goodAnswer }),
    ...rest,
  };
  return d as unknown as ChatDeps & { reserve: any; hasActiveAccess: any; model: any };
}
const owner = { uid: 'u1', email: 'asha@example.com', emailVerified: true };
const call = async (d: ChatDeps, body: any = { question, snapshot }, user: Record<string, any> = owner) => {
  const r = res();
  await createChatHandler(d)({ ...user, body } as any, r);
  return r;
};

describe('answering a question', () => {
  it('asks the model once, returns the validated answer and what is left of the allowance, counted as a chat use', async () => {
    const d = deps();
    const r = await call(d);
    expect(r.code).toBe(200);
    expect(r.body).toEqual({ answer: goodAnswer.answer, remaining: 29 });
    expect(d.model).toHaveBeenCalledTimes(1);
    expect(d.model.mock.calls[0][0]).toMatchObject({ question, history: [] });
    expect(d.reserve).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1', feature: 'chat', perUserLimit: 30, userDay: TODAY }));
  });

  it('uses the limit set on the server', async () => {
    const d = deps({ env: { AI_CHAT_DAILY_LIMIT: '5' } });
    await call(d);
    expect(d.reserve).toHaveBeenCalledWith(expect.objectContaining({ perUserLimit: 5 }));
  });

  it('passes on the earlier turns', async () => {
    const d = deps();
    const history = [{ question: 'What sold best?', answer: '{{name:item_cake}} led.' }];
    await call(d, { question, snapshot, history });
    expect(d.model.mock.calls[0][0].history).toEqual(history);
  });

  it('answers a question about a period of any length, unlike the briefing', async () => {
    const week = sampleSnapshot({ start: '2026-06-20', end: '2026-06-26' }).promptSnapshot;
    expect((await call(deps(), { question, snapshot: week })).code).toBe(200);
  });
});

describe('a what-if', () => {
  const scenarioReply = { answer: null, scenario: { products: ['ALL'], changePercent: 8, newPrice: null, salesChangePercent: null } };
  const whatIf = 'If I increase prices by 8%, what happens to monthly profit?';

  it('returns the request for the app to calculate, counted as one use', async () => {
    const d = deps({ model: vi.fn().mockResolvedValue({ raw: scenarioReply }) as any });
    const r = await call(d, { question: whatIf, snapshot });
    expect(r.code).toBe(200);
    expect(r.body).toEqual({ scenario: scenarioReply.scenario, remaining: 29 });
    expect(r.body.answer).toBeUndefined();
    expect(d.model).toHaveBeenCalledTimes(1);
    expect(d.reserve).toHaveBeenCalledTimes(1);
  });

  it('refuses a request with a number the owner did not write, asks again, and then shows nothing', async () => {
    const d = deps({ model: vi.fn().mockResolvedValue({ raw: scenarioReply }) as any });
    const r = await call(d, { question: 'What if I raise prices a little?', snapshot });
    expect(d.model).toHaveBeenCalledTimes(2);
    expect(d.model.mock.calls[1][0].problems).toEqual(expect.arrayContaining([expect.stringMatching(/changePercent is not a number written/)]));
    expect(r.body).toMatchObject({ answer: null, code: 'unverified' });
  });

  it('answers from the calculation on the second request, and does not accept another request for one', async () => {
    const withScenario = JSON.parse(JSON.stringify(snapshot));
    withScenario.pricing = { repricing: [], materialMoves: [], scenario: { assumed: { products: 'all items', basedOnDays: 'scn_days' }, items: [], noRecentSales: [], monthlyNow: 'true_profit_now', monthlyAfter: 'true_profit_now', monthlyChange: 'true_profit_change', breakEven: { type: 'unchanged' } } };
    const answered = deps({ model: vi.fn().mockResolvedValue({ raw: { answer: 'Profit would move {{fig:true_profit_change}}.', scenario: null } }) as any });
    expect((await call(answered, { question: whatIf, snapshot: withScenario })).body.answer).toBe('Profit would move {{fig:true_profit_change}}.');
    const again = deps({ model: vi.fn().mockResolvedValue({ raw: scenarioReply }) as any });
    expect((await call(again, { question: whatIf, snapshot: withScenario })).body).toMatchObject({ answer: null, code: 'unverified' });
  });
});

describe('validation and the one retry', () => {
  it('asks again, saying what was wrong, when the first answer has a number in it', async () => {
    const model = vi.fn()
      .mockResolvedValueOnce({ raw: { answer: 'Profit fell 12 percent.' } })
      .mockResolvedValueOnce({ raw: goodAnswer });
    const d = deps({ model: model as any });
    const r = await call(d);
    expect(model).toHaveBeenCalledTimes(2);
    expect(model.mock.calls[1][0].problems).toEqual(expect.arrayContaining([expect.stringMatching(/digit|spelled/)]));
    expect(r.body.answer).toBe(goodAnswer.answer);
    expect(d.reserve).toHaveBeenCalledTimes(1); // one use, however many tries
  });

  it('shows nothing, rather than an unchecked answer, when both answers fail, and the question stays counted', async () => {
    const d = deps({ model: vi.fn().mockResolvedValue({ raw: { answer: 'Down 12%.' } }) as any });
    const r = await call(d);
    expect(d.model).toHaveBeenCalledTimes(2);
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({ answer: null, code: 'unverified', remaining: 29 });
    expect(JSON.stringify(r.body)).not.toContain('12%');
  });

  it('treats an answer that is not JSON, or an invented id, as a failure to retry', async () => {
    const model = vi.fn()
      .mockResolvedValueOnce({ raw: undefined })
      .mockResolvedValueOnce({ raw: { answer: 'Fell by {{fig:invented}}.' } });
    const r = await call(deps({ model: model as any }));
    expect(r.body.answer).toBeNull();
    expect(model.mock.calls[1][0].problems).toEqual(['the answer was not valid JSON in the required format']);
  });

  it('answerValidated succeeds on the second try and gives up after two', async () => {
    const input = { snapshot, question, history: [] };
    const ok = vi.fn().mockResolvedValueOnce({ raw: {} }).mockResolvedValueOnce({ raw: goodAnswer });
    expect(await answerValidated(input, ok as any)).toEqual({ answer: goodAnswer.answer });
    const never = vi.fn().mockResolvedValue({ raw: {} });
    expect(await answerValidated(input, never as any)).toBeNull();
    expect(never).toHaveBeenCalledTimes(2);
  });
});

describe('when the model fails', () => {
  it('maps a provider error to a message for the owner, and never forwards its text', async () => {
    const err = Object.assign(new Error('secret provider detail sk-ant-123'), { status: 529 });
    const r = await call(deps({ model: vi.fn().mockRejectedValue(err) as any }));
    expect(r.code).toBeGreaterThanOrEqual(500);
    expect(r.body.code).toBe('model_error');
    expect(JSON.stringify(r.body)).not.toContain('sk-ant');
  });
});

describe('who may ask', () => {
  it('turns away an account that may not use AI, counting nothing', async () => {
    const d = deps({ hasActiveAccess: vi.fn().mockResolvedValue(false) as any });
    const r = await call(d);
    expect(r.code).toBe(402);
    expect(r.body.code).toBe('subscription_required');
    expect(d.reserve).not.toHaveBeenCalled();
    expect(d.model).not.toHaveBeenCalled();
  });

  it('never serves a demo account', async () => {
    const d = deps();
    const r = await call(d, { question, snapshot }, { uid: 'd1', email: 'demo_1_2@bettereat.com' });
    expect(r.code).toBe(403);
    expect(r.body.code).toBe('demo_account');
    expect(d.model).not.toHaveBeenCalled();
  });

  it('is unavailable when AI is off', async () => {
    const d = deps({ config: () => readAiConfig({}) });
    expect((await call(d)).code).toBe(503);
    expect(d.model).not.toHaveBeenCalled();
  });

  it('refuses once the day\'s questions are used, without calling the model', async () => {
    const d = deps({ reserve: vi.fn().mockResolvedValue({ ok: false, reason: 'user_limit', used: 30, limit: 30 }) as any });
    const r = await call(d);
    expect(r.code).toBe(429);
    expect(r.body.code).toBe('daily_limit');
    expect(d.model).not.toHaveBeenCalled();
  });

  it('refuses when the whole service is at its daily ceiling', async () => {
    const d = deps({ reserve: vi.fn().mockResolvedValue({ ok: false, reason: 'global_limit', used: 1500, limit: 1500 }) as any });
    const r = await call(d);
    expect(r.code).toBe(503);
    expect(r.body.code).toBe('busy');
  });
});

describe('the request', () => {
  const longText = (n: number) => 'x'.repeat(n);
  const bad: [string, any][] = [
    ['no body', null],
    ['a string body', 'x'],
    ['no question', { snapshot }],
    ['an empty question', { question: '   ', snapshot }],
    ['a question that is not text', { question: 5, snapshot }],
    ['a question that is too long', { question: longText(CHAT_MAX_QUESTION_CHARS + 1), snapshot }],
    ['no snapshot', { question }],
    ['a snapshot that is not one', { question, snapshot: {} }],
    ['history that is not a list', { question, snapshot, history: 'x' }],
    ['too much history', { question, snapshot, history: Array.from({ length: CHAT_MAX_HISTORY_TURNS + 1 }, () => ({ question: 'q', answer: 'a' })) }],
    ['a history turn of the wrong shape', { question, snapshot, history: [{ question: 'q' }] }],
    ['a history answer that is too long', { question, snapshot, history: [{ question: 'q', answer: longText(CHAT_MAX_ANSWER_CHARS + 1) }] }],
    ['mentioned customers that are not a list', { question, snapshot: { ...snapshot, customers: { ...snapshot.customers, mentioned: 'x' } } }],
    ['unsold items that are not text', { question, snapshot: { ...snapshot, unsoldItems: [1] } }],
  ];
  it.each(bad)('refuses %s, before checking the account or counting a use', async (_name, body) => {
    const d = deps();
    const r = await call(d, body);
    expect(r.code).toBe(400);
    expect(r.body.code).toBe('bad_request');
    expect(d.hasActiveAccess).not.toHaveBeenCalled();
    expect(d.reserve).not.toHaveBeenCalled();
    expect(d.model).not.toHaveBeenCalled();
  });

  it('accepts a question at the limit and a snapshot from an older client with no chat fields', () => {
    const { mentioned: _m, ...customers } = snapshot.customers as any;
    const { unsoldItems: _u, ...older } = snapshot as any;
    expect(parseChatRequest({ question: longText(CHAT_MAX_QUESTION_CHARS), snapshot })).not.toBeNull();
    expect(parseChatRequest({ question, snapshot: { ...older, customers } })).not.toBeNull();
  });

  it('trims the question', () => {
    expect(parseChatRequest({ question: '  hello  ', snapshot })?.question).toBe('hello');
  });
});
