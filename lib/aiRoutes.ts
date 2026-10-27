/**
 * aiRoutes.ts
 *
 * Express handlers for the AI features that need no model call, with their
 * dependencies injected so they can be tested without Firebase. Wired up in
 * server.ts. The routes that do call the model arrive with each feature and sit
 * behind `requireAiAccess` (aiGuard.ts).
 */
import type { Response } from 'express';
import type { AuthedRequest } from './auth';
import { AI_FEATURES, type AiFeature } from './aiConfig';
import { checkAiEntitlement, type AiGuardDeps } from './aiGuard';
import type { peekAiUsage } from './aiUsage';

export interface AiStatusDeps extends Pick<AiGuardDeps, 'config' | 'billingDisabled' | 'hasActiveAccess' | 'usageDay' | 'globalDay'> {
  peek: typeof peekAiUsage;
}

/**
 * GET /api/ai/status: whether AI is available to this account and how much of
 * today's allowance is left, so the app can show or hide its AI features. Uses
 * nothing up. A reason is given only for the cases the app can act on; whether
 * the server has a key is not revealed to an ordinary account.
 */
export function createAiStatusHandler(deps: AiStatusDeps) {
  return async (req: AuthedRequest, res: Response) => {
    try {
      const entitlement = await checkAiEntitlement({ uid: req.uid!, email: req.email, emailVerified: req.emailVerified }, deps);
      if (entitlement.ok === false) {
        const reason = entitlement.code === 'not_configured' ? 'unavailable' : entitlement.code;
        return res.json({ available: false, reason });
      }
      const config = deps.config();
      const usage = await deps.peek(req.uid!, await deps.usageDay(req.uid!), deps.globalDay());
      // Promote's Styled photo is listed only when the server has a Gemini key, so the app offers it only then.
      const features = AI_FEATURES.filter(f => config.geminiConfigured || f !== 'style');
      const limits = Object.fromEntries(features.map((f: AiFeature) => {
        const limit = config.limits[f];
        const used = usage.byFeature[f] ?? 0;
        if (f === 'recipe') {
          // Recipes also have a monthly limit; what is left is the smaller of the two.
          const monthLimit = config.recipeMonthlyLimit;
          const monthUsed = usage.recipeMonth ?? 0;
          return [f, { used, limit, monthUsed, monthLimit, remaining: Math.max(Math.min(limit - used, monthLimit - monthUsed), 0) }];
        }
        if (f === 'style') {
          // AI-styled photos too: what is left is the smaller of today's and this month's.
          const monthLimit = config.styleMonthlyLimit;
          const monthUsed = usage.styleMonth ?? 0;
          return [f, { used, limit, monthUsed, monthLimit, remaining: Math.max(Math.min(limit - used, monthLimit - monthUsed), 0) }];
        }
        return [f, { used, limit, remaining: Math.max(limit - used, 0) }];
      }));
      return res.json({ available: true, limits });
    } catch (err: any) {
      console.error('Failed to read AI status:', err?.message);
      return res.status(500).json({ error: 'Could not check AI status.' });
    }
  };
}
