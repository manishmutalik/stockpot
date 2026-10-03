import { describe, it, expect, vi } from 'vitest';
import { checkAiAccess, checkAiEntitlement, requireAiAccess, type AiGuardDeps } from '../aiGuard';
import { readAiConfig, type AiConfig } from '../aiConfig';

const configured = (over: Record<string, string> = {}): AiConfig => readAiConfig({ AI_FEATURES_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-x', ...over });

function deps(over: Partial<AiGuardDeps> & { env?: Record<string, string> } = {}): AiGuardDeps & { reserve: ReturnType<typeof vi.fn> } {
  const { env, ...rest } = over;
  return {
    config: () => configured(env),
    billingDisabled: () => false,
    hasActiveAccess: vi.fn().mockResolvedValue(true),
    usageDay: vi.fn().mockResolvedValue('2026-06-30'),
    globalDay: () => '2026-06-30',
    reserve: vi.fn().mockResolvedValue({ ok: true, used: 1, limit: 30 }),
    ...rest,
  } as any;
}
const owner = { uid: 'u1', email: 'asha@example.com', emailVerified: true };

describe('checkAiAccess: switched on', () => {
  it('is refused, and nothing is counted, when AI is not enabled', async () => {
    const d = deps({ config: () => readAiConfig({ ANTHROPIC_API_KEY: 'sk-x' }) });
    const r = await checkAiAccess(owner, 'chat', d);
    expect(r).toMatchObject({ ok: false, status: 503, code: 'not_configured' });
    expect(d.reserve).not.toHaveBeenCalled();
    expect(d.hasActiveAccess).not.toHaveBeenCalled();
  });

  it('is refused when there is no key, however everything else is set', async () => {
    const d = deps({ config: () => readAiConfig({ AI_FEATURES_ENABLED: 'true' }), billingDisabled: () => true });
    expect(await checkAiAccess(owner, 'chat', d)).toMatchObject({ ok: false, code: 'not_configured' });
  });

  it('says only that AI is not configured, without naming the key', async () => {
    const r = await checkAiAccess(owner, 'chat', deps({ config: () => readAiConfig({}) }));
    expect(r.ok === false && r.message).toBe('AI features are not configured on this server.');
  });
});

describe('checkAiAccess: demo accounts', () => {
  const demo = { uid: 'd1', email: 'demo_1790918984956_4821@bettereat.com' };

  it('are refused even with an allow-list that names them, an active subscription or trial mode', async () => {
    for (const env of [{}, { AI_ALLOWED_UIDS: 'd1' }, { AI_ALLOWED_EMAILS: demo.email }]) {
      const d = deps({ env, billingDisabled: () => true });
      expect(await checkAiAccess(demo, 'chat', d), JSON.stringify(env)).toMatchObject({ ok: false, status: 403, code: 'demo_account' });
      expect(d.reserve).not.toHaveBeenCalled();
    }
  });
});

describe('checkAiAccess: the trial allow-list', () => {
  it('lets in only listed accounts, whatever their billing, and nobody else', async () => {
    const env = { AI_ALLOWED_EMAILS: 'Asha@Example.com', AI_ALLOWED_UIDS: 'u9' };
    const noBilling = { hasActiveAccess: vi.fn().mockResolvedValue(false) };
    expect(await checkAiAccess(owner, 'chat', deps({ env, ...noBilling }))).toMatchObject({ ok: true }); // by email, any case
    expect(await checkAiAccess({ uid: 'u9', email: 'x@y.com' }, 'chat', deps({ env, ...noBilling }))).toMatchObject({ ok: true }); // by uid, verified or not
    expect(await checkAiAccess({ uid: 'u2', email: 'other@example.com' }, 'chat', deps({ env, ...noBilling }))).toMatchObject({ ok: false, status: 403, code: 'not_allowed' });
    expect(await checkAiAccess({ uid: 'u2' }, 'chat', deps({ env, ...noBilling }))).toMatchObject({ ok: false, code: 'not_allowed' });
  });

  it('does not accept a listed email that has not been verified: anyone can sign up with someone else\'s address', async () => {
    const env = { AI_ALLOWED_EMAILS: 'asha@example.com' };
    const impostor = { uid: 'x9', email: 'asha@example.com', emailVerified: false };
    expect(await checkAiAccess(impostor, 'chat', deps({ env }))).toMatchObject({ ok: false, status: 403, code: 'not_allowed' });
    expect(await checkAiAccess({ uid: 'x9', email: 'asha@example.com' }, 'chat', deps({ env }))).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await checkAiAccess(impostor, 'chat', deps({ env: { ...env, AI_ALLOWED_UIDS: 'x9' } }))).toMatchObject({ ok: true }); // a uid needs no email
  });

  it('keeps out an unlisted account even with an active subscription or trial mode', async () => {
    const env = { AI_ALLOWED_EMAILS: 'someone@else.com' };
    expect(await checkAiAccess(owner, 'chat', deps({ env }))).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await checkAiAccess(owner, 'chat', deps({ env, billingDisabled: () => true }))).toMatchObject({ ok: false, code: 'not_allowed' });
  });

  it('still applies the daily caps to a listed account', async () => {
    const d = deps({ env: { AI_ALLOWED_UIDS: 'u1' }, reserve: vi.fn().mockResolvedValue({ ok: false, reason: 'user_limit', used: 30, limit: 30 }) as any });
    expect(await checkAiAccess(owner, 'chat', d)).toMatchObject({ ok: false, status: 429, code: 'daily_limit' });
  });
});

describe('checkAiAccess: billing', () => {
  it('lets in an active or trialing subscriber', async () => {
    const d = deps();
    expect(await checkAiAccess(owner, 'chat', d)).toEqual({ ok: true, used: 1, limit: 30 });
    expect(d.hasActiveAccess).toHaveBeenCalledWith('u1');
  });

  it('asks for a subscription otherwise, and counts nothing', async () => {
    const d = deps({ hasActiveAccess: vi.fn().mockResolvedValue(false) });
    expect(await checkAiAccess(owner, 'chat', d)).toMatchObject({ ok: false, status: 402, code: 'subscription_required' });
    expect(d.reserve).not.toHaveBeenCalled();
  });

  it('in trial mode (billing disabled) lets in any real signed-in account without looking at billing', async () => {
    const d = deps({ billingDisabled: () => true, hasActiveAccess: vi.fn().mockResolvedValue(false) });
    expect(await checkAiAccess(owner, 'chat', d)).toMatchObject({ ok: true });
    expect(d.hasActiveAccess).not.toHaveBeenCalled();
  });
});

describe('checkAiAccess: daily caps', () => {
  it('reserves one use of the right feature with that feature\'s limits and days', async () => {
    const d = deps({ env: { AI_CHAT_DAILY_LIMIT: '12', AI_GLOBAL_DAILY_LIMIT: '99' } });
    await checkAiAccess(owner, 'chat', d);
    expect(d.reserve).toHaveBeenCalledWith({ uid: 'u1', feature: 'chat', perUserLimit: 12, globalLimit: 99, userDay: '2026-06-30', globalDayKey: '2026-06-30' });
    await checkAiAccess(owner, 'parse', d);
    expect(d.reserve).toHaveBeenLastCalledWith(expect.objectContaining({ feature: 'parse', perUserLimit: 30 }));
  });

  it('refuses when the user\'s allowance is used up, telling them it resets', async () => {
    const d = deps({ reserve: vi.fn().mockResolvedValue({ ok: false, reason: 'user_limit', used: 30, limit: 30 }) as any });
    const r = await checkAiAccess(owner, 'chat', d);
    expect(r).toMatchObject({ ok: false, status: 429, code: 'daily_limit' });
    expect(r.ok === false && r.message).toMatch(/resets tomorrow/);
  });

  it('refuses everyone, with a different message, when the global ceiling is reached', async () => {
    const d = deps({ reserve: vi.fn().mockResolvedValue({ ok: false, reason: 'global_limit', used: 1500, limit: 1500 }) as any });
    expect(await checkAiAccess(owner, 'chat', d)).toMatchObject({ ok: false, status: 503, code: 'busy' });
  });

  it('refuses an unknown feature without counting anything', async () => {
    const d = deps();
    expect(await checkAiAccess(owner, 'something' as any, d)).toMatchObject({ ok: false });
    expect(d.reserve).not.toHaveBeenCalled();
  });
});

describe('checkAiEntitlement', () => {
  it('counts no use', async () => {
    const d = deps();
    expect(await checkAiEntitlement(owner, d)).toEqual({ ok: true });
    expect(d.reserve).not.toHaveBeenCalled();
  });
});

describe('requireAiAccess middleware', () => {
  const res = () => { const r: any = { code: 200 }; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };

  it('calls next when allowed', async () => {
    const next = vi.fn(); const r = res();
    await requireAiAccess('chat', deps())({ uid: 'u1', email: 'asha@example.com', emailVerified: true } as any, r, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('answers with the refusal and its code, and does not call next', async () => {
    const next = vi.fn(); const r = res();
    await requireAiAccess('chat', deps({ hasActiveAccess: vi.fn().mockResolvedValue(false) }))({ uid: 'u1', email: 'asha@example.com' } as any, r, next);
    expect(next).not.toHaveBeenCalled();
    expect(r.code).toBe(402);
    expect(r.body).toEqual({ error: 'AI features need an active subscription.', code: 'subscription_required' });
  });

  it('fails closed with a 500, never open, if a dependency throws, without leaking the error', async () => {
    const next = vi.fn(); const r = res();
    await requireAiAccess('chat', deps({ hasActiveAccess: vi.fn().mockRejectedValue(new Error('firestore secret detail')) }))({ uid: 'u1' } as any, r, next);
    expect(next).not.toHaveBeenCalled();
    expect(r.code).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('secret');
  });
});
