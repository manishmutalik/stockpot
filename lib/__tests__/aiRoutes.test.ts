import { describe, it, expect, vi } from 'vitest';
import { createAiStatusHandler, type AiStatusDeps } from '../aiRoutes';
import { readAiConfig } from '../aiConfig';

const res = () => { const r: any = { code: 200 }; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };
const deps = (over: Partial<AiStatusDeps> & { env?: Record<string, string> } = {}): AiStatusDeps => {
  const { env, ...rest } = over;
  return {
    config: () => readAiConfig({ AI_FEATURES_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-x', ...env }),
    billingDisabled: () => false,
    hasActiveAccess: vi.fn().mockResolvedValue(true),
    usageDay: vi.fn().mockResolvedValue('2026-06-30'),
    globalDay: () => '2026-06-30',
    peek: vi.fn().mockResolvedValue({ byFeature: { chat: 12, briefing: 1, parse: 0 }, global: 40 }),
    ...rest,
  } as any;
};
const call = async (d: AiStatusDeps, req: Record<string, any> = { uid: 'u1', email: 'asha@example.com', emailVerified: true }) => { const r = res(); await createAiStatusHandler(d)(req as any, r); return r; };

describe('GET /ai/status', () => {
  it('says what is left of today\'s allowance, and uses none of it', async () => {
    const d = deps();
    const r = await call(d);
    expect(r.body).toEqual({
      available: true,
      limits: { briefing: { used: 1, limit: 4, remaining: 3 }, chat: { used: 12, limit: 30, remaining: 18 }, parse: { used: 0, limit: 30, remaining: 30 }, quick: { used: 0, limit: 60, remaining: 60 } },
    });
    expect(d.peek).toHaveBeenCalledWith('u1', '2026-06-30', '2026-06-30');
  });

  it('never shows a negative remaining after a limit was lowered', async () => {
    const r = await call(deps({ env: { AI_CHAT_DAILY_LIMIT: '10' } }));
    expect((r.body as any).limits.chat).toEqual({ used: 12, limit: 10, remaining: 0 });
  });

  it('says AI is unavailable, without saying why the server cannot, when it is not set up', async () => {
    const r = await call(deps({ config: () => readAiConfig({}) }));
    expect(r.body).toEqual({ available: false, reason: 'unavailable' });
  });

  it('tells the demo it is the demo, so the app can show the canned sample', async () => {
    const r = await call(deps(), { uid: 'd', email: 'demo_1_2@bettereat.com' });
    expect(r.body).toEqual({ available: false, reason: 'demo_account' });
  });

  it('asks an unsubscribed account to subscribe', async () => {
    const r = await call(deps({ hasActiveAccess: vi.fn().mockResolvedValue(false) }));
    expect(r.body).toEqual({ available: false, reason: 'subscription_required' });
  });

  it('is unavailable to an account not on the trial allow-list', async () => {
    const r = await call(deps({ env: { AI_ALLOWED_EMAILS: 'owner@example.com' } }));
    expect(r.body).toEqual({ available: false, reason: 'not_allowed' });
  });

  it('does not read usage for an account that is refused', async () => {
    const d = deps({ hasActiveAccess: vi.fn().mockResolvedValue(false) });
    await call(d);
    expect(d.peek).not.toHaveBeenCalled();
  });

  it('answers 500 without leaking the error when something fails', async () => {
    const r = await call(deps({ peek: vi.fn().mockRejectedValue(new Error('secret detail')) }));
    expect(r.code).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('secret');
  });
});
