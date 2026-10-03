import { describe, it, expect, vi } from 'vitest';
import { createBriefingHandler, generateValidated, validateSnapshotShape, type BriefingDeps } from '../briefingRoutes';
import { readAiConfig } from '../aiConfig';
import { GENERATION_LOCK_MS } from '../briefingStore';
import { sampleSnapshot, TODAY, YESTERDAY } from './briefingFixtures';
import type { StoredBriefing } from '../../src/utils/aiBriefing';

const { promptSnapshot: snapshot } = sampleSnapshot();
const goodAnswer = { why: 'Profit fell by {{fig:true_profit_change}} as {{name:item_cake}} sold less.', attention: [{ kind: 'low_stock', text: '{{name:mat_butter}} is running low.' }] };
const NOW = 1_800_000_000_000;

const res = () => { const r: any = { code: 200 }; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };

function deps(over: Partial<BriefingDeps> & { env?: Record<string, string>; stored?: any } = {}) {
  const { env, stored, ...rest } = over;
  const d = {
    config: () => readAiConfig({ AI_FEATURES_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-x', ...env }),
    billingDisabled: () => false,
    hasActiveAccess: vi.fn().mockResolvedValue(true),
    usageDay: vi.fn().mockResolvedValue(TODAY),
    globalDay: () => TODAY,
    reserve: vi.fn().mockResolvedValue({ ok: true, used: 1, limit: 4 }),
    store: {
      get: vi.fn().mockResolvedValue(stored ?? {}),
      begin: vi.fn().mockResolvedValue(true),
      save: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    },
    model: vi.fn().mockResolvedValue({ raw: goodAnswer }),
    now: () => NOW,
    ...rest,
  };
  return d as unknown as BriefingDeps & { reserve: any; hasActiveAccess: any; store: any; model: any };
}
const owner = { uid: 'u1', email: 'asha@example.com', emailVerified: true };
const call = async (d: BriefingDeps, body: any = { snapshot }, user: Record<string, any> = owner) => {
  const r = res();
  await createBriefingHandler(d)({ ...user, body } as any, r);
  return r;
};

describe('generating the briefing', () => {
  it('asks the model, keeps its validated answer for the day and returns it with what is left of the allowance', async () => {
    const d = deps();
    const r = await call(d);
    expect(r.code).toBe(200);
    expect(r.body.cached).toBe(false);
    expect(r.body.briefing).toEqual({ date: TODAY, source: 'ai', content: goodAnswer, createdAt: NOW, refreshes: 0 });
    expect(r.body.remaining).toBe(3);
    expect(d.model).toHaveBeenCalledTimes(1);
    expect(d.reserve).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1', feature: 'briefing', userDay: TODAY }));
    expect(d.store.save).toHaveBeenCalledWith('u1', TODAY, r.body.briefing);
  });

  it('claims the day first and releases the claim when it saves', async () => {
    const d = deps();
    await call(d);
    expect(d.store.begin).toHaveBeenCalledWith('u1', TODAY, NOW);
    expect(d.store.begin.mock.invocationCallOrder[0]).toBeLessThan(d.model.mock.invocationCallOrder[0]);
  });
});

describe('serving the stored briefing', () => {
  const stored: StoredBriefing = { date: TODAY, source: 'ai', content: goodAnswer as any, createdAt: 5, refreshes: 0 };

  it('returns today\'s briefing without calling the model or counting a use', async () => {
    const d = deps({ stored: { briefing: stored } });
    const r = await call(d);
    expect(r.body).toEqual({ briefing: stored, cached: true });
    expect(d.model).not.toHaveBeenCalled();
    expect(d.reserve).not.toHaveBeenCalled();
    expect(d.store.begin).not.toHaveBeenCalled();
  });

  it('regenerates on request, counts it, and counts the refresh', async () => {
    const d = deps({ stored: { briefing: { ...stored, refreshes: 1 } } });
    const r = await call(d, { snapshot, refresh: true });
    expect(d.model).toHaveBeenCalledTimes(1);
    expect(d.reserve).toHaveBeenCalledTimes(1);
    expect(r.body.briefing.refreshes).toBe(2);
    expect(r.body.cached).toBe(false);
  });

  it('refuses a refresh once the day\'s allowance is used, and keeps the briefing it has', async () => {
    const d = deps({ stored: { briefing: stored }, reserve: vi.fn().mockResolvedValue({ ok: false, reason: 'user_limit', used: 4, limit: 4 }) as any });
    const r = await call(d, { snapshot, refresh: true });
    expect(r.code).toBe(429);
    expect(r.body.code).toBe('daily_limit');
    expect(d.model).not.toHaveBeenCalled();
    expect(d.store.save).not.toHaveBeenCalled();
    expect(d.store.clear).toHaveBeenCalled(); // the claim is released
  });
});

describe('validation and the one retry', () => {
  it('asks again, saying what was wrong, when the first answer has a number in it', async () => {
    const model = vi.fn()
      .mockResolvedValueOnce({ raw: { why: 'Profit fell 12 percent.', attention: [] } })
      .mockResolvedValueOnce({ raw: goodAnswer });
    const d = deps({ model: model as any });
    const r = await call(d);
    expect(model).toHaveBeenCalledTimes(2);
    expect(model.mock.calls[1][1]).toEqual(expect.arrayContaining([expect.stringMatching(/digit|spelled/)]));
    expect(r.body.briefing.source).toBe('ai');
    expect(d.reserve).toHaveBeenCalledTimes(1); // one use, however many tries
  });

  it('stores a fallback, never the unchecked answer, when both answers fail', async () => {
    const bad = { raw: { why: 'Down 12%.', attention: [] } };
    const d = deps({ model: vi.fn().mockResolvedValue(bad) as any });
    const r = await call(d);
    expect(d.model).toHaveBeenCalledTimes(2);
    expect(r.code).toBe(200);
    expect(r.body.briefing).toEqual({ date: TODAY, source: 'fallback', createdAt: NOW, refreshes: 0 });
    expect(JSON.stringify(d.store.save.mock.calls)).not.toContain('12%');
  });

  it('treats an answer that is not JSON, or an invented id, as a failure to retry', async () => {
    const model = vi.fn()
      .mockResolvedValueOnce({ raw: undefined })
      .mockResolvedValueOnce({ raw: { why: 'Fell by {{fig:invented}}.', attention: [] } });
    const r = await call(deps({ model: model as any }));
    expect(r.body.briefing.source).toBe('fallback');
    expect(model.mock.calls[1][1]).toEqual(['the answer was not valid JSON in the required format']);
  });

  it('generateValidated succeeds on the second try and gives up after two', async () => {
    const ok = vi.fn().mockResolvedValueOnce({ raw: {} }).mockResolvedValueOnce({ raw: goodAnswer });
    expect((await generateValidated(snapshot, ok as any)).source).toBe('ai');
    const never = vi.fn().mockResolvedValue({ raw: {} });
    expect((await generateValidated(snapshot, never as any)).source).toBe('fallback');
    expect(never).toHaveBeenCalledTimes(2);
  });
});

describe('who may ask', () => {
  it('turns away an account that may not use AI, without reading or claiming anything', async () => {
    const d = deps({ hasActiveAccess: vi.fn().mockResolvedValue(false) as any });
    const r = await call(d);
    expect(r.code).toBe(402);
    expect(r.body.code).toBe('subscription_required');
    expect(d.store.get).not.toHaveBeenCalled();
    expect(d.model).not.toHaveBeenCalled();
  });

  it('never serves a demo account, even a stored briefing', async () => {
    const d = deps({ stored: { briefing: { date: TODAY, source: 'ai', createdAt: 1, refreshes: 0 } } });
    const r = await call(d, { snapshot }, { uid: 'd1', email: 'demo_1_2@bettereat.com' });
    expect(r.code).toBe(403);
    expect(r.body.code).toBe('demo_account');
  });

  it('is unavailable when AI is off', async () => {
    const d = deps({ config: () => readAiConfig({}) });
    expect((await call(d)).code).toBe(503);
    expect(d.model).not.toHaveBeenCalled();
  });
});

describe('the request', () => {
  it('refuses a body that is not a snapshot, before doing anything else', async () => {
    for (const body of [null, 'x', [], {}, { snapshot: 'x' }, { snapshot: {} }, { snapshot, refresh: 'yes' }]) {
      const d = deps();
      const r = await call(d, body);
      expect(r.code, JSON.stringify(body)?.slice(0, 40)).toBe(400);
      expect(r.body.code).toBe('bad_request');
      expect(d.hasActiveAccess).not.toHaveBeenCalled();
      expect(d.model).not.toHaveBeenCalled();
    }
  });

  it('refuses a snapshot for a day other than yesterday in the owner\'s time zone', async () => {
    const stale = sampleSnapshot({ start: TODAY, end: TODAY }).promptSnapshot;
    const d = deps();
    const r = await call(d, { snapshot: stale });
    expect(r.code).toBe(400);
    expect(r.body.code).toBe('out_of_date');
    expect(d.model).not.toHaveBeenCalled();
  });

  it('refuses a snapshot for a range of days', async () => {
    const range = sampleSnapshot({ start: '2026-06-20', end: YESTERDAY }).promptSnapshot;
    expect((await call(deps(), { snapshot: range })).body.code).toBe('out_of_date');
  });
});

describe('overlapping requests', () => {
  it('turns away a second tab while the first is still generating', async () => {
    const d = deps({ stored: { generatingSince: NOW - 1000 } });
    const r = await call(d);
    expect(r.code).toBe(409);
    expect(r.body.code).toBe('generating');
    expect(d.model).not.toHaveBeenCalled();
    expect(d.reserve).not.toHaveBeenCalled();
  });

  it('takes over from a claim that has been abandoned', async () => {
    const d = deps({ stored: { generatingSince: NOW - GENERATION_LOCK_MS - 1 } });
    expect((await call(d)).code).toBe(200);
  });

  it('turns away a request that lost the race to claim the day, without counting a use', async () => {
    const d = deps();
    d.store.begin.mockResolvedValue(false);
    const r = await call(d);
    expect(r.code).toBe(409);
    expect(d.reserve).not.toHaveBeenCalled();
  });

  it('serves a finished briefing even if a refresh is in progress', async () => {
    const stored = { date: TODAY, source: 'ai', content: goodAnswer, createdAt: 5, refreshes: 0 };
    const d = deps({ stored: { briefing: stored, generatingSince: NOW - 1000 } });
    const r = await call(d);
    expect(r.body.cached).toBe(true);
  });
});

describe('when the model fails', () => {
  it('releases the claim and answers with a message for the owner, not the provider\'s', async () => {
    const d = deps({ model: vi.fn().mockRejectedValue(Object.assign(new Error('request id req_9 key sk-ant-secret'), { status: 529 })) as any });
    const r = await call(d);
    expect(r.code).toBe(503);
    expect(r.body.code).toBe('model_error');
    expect(JSON.stringify(r.body)).not.toMatch(/req_9|sk-ant/);
    expect(d.store.clear).toHaveBeenCalledWith('u1', TODAY);
    expect(d.store.save).not.toHaveBeenCalled();
  });

  it('still counts the attempt, since a failed call can still cost money', async () => {
    const d = deps({ model: vi.fn().mockRejectedValue(new Error('boom')) as any });
    await call(d);
    expect(d.reserve).toHaveBeenCalledTimes(1);
  });

  it('answers 500 without leaking if a dependency fails', async () => {
    const d = deps();
    d.store.get.mockRejectedValue(new Error('firestore secret detail'));
    const r = await call(d);
    expect(r.code).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('secret');
  });
});

describe('validateSnapshotShape', () => {
  const clone = () => JSON.parse(JSON.stringify(snapshot));
  it('accepts a real snapshot', () => {
    expect(validateSnapshotShape(snapshot)).toBe(true);
  });

  it('refuses oversized or malformed parts', () => {
    const cases: [string, (s: any) => void][] = [
      ['a huge name', s => { s.names.item_x = 'x'.repeat(500); }],
      ['a bad figure id', s => { s.figures['bad id!'] = { label: 'x', text: 'y' }; }],
      ['a figure without text', s => { s.figures.x = { label: 'x' }; }],
      ['too many figures', s => { for (let i = 0; i < 600; i++) s.figures[`f${i}`] = { label: 'x', text: 'y' }; }],
      ['a bad date', s => { s.period.start = 'yesterday'; }],
      ['a bad driver effect', s => { s.drivers = [{ figure: 'x', label: 'y', effect: 'maybe' }]; }],
      ['too many customers', s => { s.customers.dueList = Array.from({ length: 11 }, () => ({ label: 'C-1' })); }],
      ['a long customer label', s => { s.customers.dueList = [{ label: 'C-' + 'x'.repeat(40) }]; }],
      ['notes that are not text', s => { s.notes = [1]; }],
      ['no business', s => { delete s.business; }],
      ['too big overall', s => { s.notes = Array.from({ length: 10 }, () => 'x'.repeat(150)); s.names = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`n${i}`, 'x'.repeat(160)])); s.figures = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`f${i}`, { label: 'x'.repeat(200), text: 'y' }])); }],
    ];
    for (const [name, mutate] of cases) { const s = clone(); mutate(s); expect(validateSnapshotShape(s), name).toBe(false); }
  });
});
