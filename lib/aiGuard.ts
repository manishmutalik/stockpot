/**
 * aiGuard.ts
 *
 * The one server-side check every AI route passes before a model is called.
 * Billing is enforced only by the client-side paywall elsewhere in the app, so
 * this is the first place the server itself decides whether an account may spend
 * money. Its checks run in this order, cheapest and most decisive first:
 *
 *  1. AI is switched on and a key is set (otherwise the rest of the app is
 *     untouched and only AI is unavailable).
 *  2. Not a demo account (open sign-up accounts; they get a canned sample).
 *  3. The allow-list, if one is set: only listed accounts (an email must be
 *     verified to count), whatever their billing status. This is how AI is tried during the trial without opening it.
 *  4. Billing: active or trialing. With no allow-list, an account must have this
 *     unless the server is in trial mode (BILLING_DISABLED=true), where billing
 *     cannot be the gate and the caps are the protection.
 *  5. The daily caps, reserved atomically.
 *
 * Dependencies are injected so the logic is tested without Firebase.
 */
import type { NextFunction, Response } from 'express';
import type { AuthedRequest } from './auth';
import { AI_FEATURES, isDemoAccountEmail, type AiConfig, type AiFeature } from './aiConfig';
import type { ReserveResult } from './aiUsage';

export type AiDenial = {
  ok: false;
  status: number;
  code: 'not_configured' | 'demo_account' | 'not_allowed' | 'subscription_required' | 'daily_limit' | 'busy';
  message: string;
};
export type AiAccess = { ok: true; used: number; limit: number } | AiDenial;

export interface AiGuardDeps {
  config: () => AiConfig;
  billingDisabled: () => boolean;
  hasActiveAccess: (uid: string) => Promise<boolean>;
  usageDay: (uid: string) => Promise<string>;
  globalDay: () => string;
  reserve: (input: { uid: string; feature: AiFeature; perUserLimit: number; globalLimit: number; userDay: string; globalDayKey: string }) => Promise<ReserveResult>;
}

const deny = (status: number, code: AiDenial['code'], message: string): AiDenial => ({ ok: false, status, code, message });

/** The checks before any usage is counted: who may use AI at all. */
export async function checkAiEntitlement(
  who: { uid: string; email?: string | null; emailVerified?: boolean },
  deps: Pick<AiGuardDeps, 'config' | 'billingDisabled' | 'hasActiveAccess'>
): Promise<{ ok: true } | AiDenial> {
  const config = deps.config();
  if (!config.enabled || !config.keyConfigured) return deny(503, 'not_configured', 'AI features are not configured on this server.');
  if (isDemoAccountEmail(who.email)) return deny(403, 'demo_account', 'AI features are not available in the demo.');

  const restricted = config.allowedEmails.length > 0 || config.allowedUids.length > 0;
  if (restricted) {
    // An email counts only once Firebase has verified it: the token carries an email even for an account
    // that merely signed up with someone else's address.
    const listed = config.allowedUids.includes(who.uid)
      || (!!who.email && who.emailVerified === true && config.allowedEmails.includes(who.email.toLowerCase()));
    return listed ? { ok: true } : deny(403, 'not_allowed', 'AI features are not available on this account yet.');
  }

  if (!deps.billingDisabled() && !(await deps.hasActiveAccess(who.uid))) {
    return deny(402, 'subscription_required', 'AI features need an active subscription.');
  }
  return { ok: true };
}

/** The daily caps only: counts one use of `feature` when it allows. Call after `checkAiEntitlement`. */
export async function reserveAiFeature(
  who: { uid: string },
  feature: AiFeature,
  deps: Pick<AiGuardDeps, 'config' | 'usageDay' | 'globalDay' | 'reserve'>
): Promise<AiAccess> {
  if (!AI_FEATURES.includes(feature)) return deny(500, 'not_configured', 'Unknown AI feature.');
  const config = deps.config();
  const result = await deps.reserve({
    uid: who.uid, feature,
    perUserLimit: config.limits[feature], globalLimit: config.globalLimit,
    userDay: await deps.usageDay(who.uid), globalDayKey: deps.globalDay(),
  });
  if (result.ok === true) return { ok: true, used: result.used, limit: result.limit };
  return result.reason === 'user_limit'
    ? deny(429, 'daily_limit', 'You have used all of today\'s AI requests for this feature. It resets tomorrow.')
    : deny(503, 'busy', 'AI features are very busy today. Please try again tomorrow.');
}

/** Entitlement, then the daily caps; counts one use of `feature` when it allows. */
export async function checkAiAccess(
  who: { uid: string; email?: string | null; emailVerified?: boolean },
  feature: AiFeature,
  deps: AiGuardDeps
): Promise<AiAccess> {
  if (!AI_FEATURES.includes(feature)) return deny(500, 'not_configured', 'Unknown AI feature.');
  const entitled = await checkAiEntitlement(who, deps);
  if (entitled.ok === false) return entitled;
  return reserveAiFeature(who, feature, deps);
}

/** Express middleware for a route that calls the model: refuses, or counts one use and carries on. */
export function requireAiAccess(feature: AiFeature, deps: AiGuardDeps) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const access = await checkAiAccess({ uid: req.uid!, email: req.email, emailVerified: req.emailVerified }, feature, deps);
      if (access.ok === false) return res.status(access.status).json({ error: access.message, code: access.code });
      return next();
    } catch (err: any) {
      console.error('AI access check failed:', err?.message);
      return res.status(500).json({ error: 'Could not check AI access.' });
    }
  };
}
