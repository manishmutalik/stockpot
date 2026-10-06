/**
 * aiConfig.ts
 *
 * Everything about whether and how much the AI features may be used, read from
 * the server's environment (nothing here reaches the browser). The app is in
 * trial mode, so the default is OFF: AI is opened up on purpose, first to a
 * short allow-list, then to subscribers. See docs/AI_CFO_DESIGN.md.
 *
 *   AI_FEATURES_ENABLED          "true" to switch AI on (default off)
 *   ANTHROPIC_API_KEY            the Anthropic API key
 *   ANTHROPIC_WORKSPACE_ID       only for a key not tied to a workspace (see lib/anthropic.ts)
 *   AI_ALLOWED_EMAILS            comma-separated; if set, only these accounts may use AI
 *   AI_ALLOWED_UIDS              comma-separated Firebase uids, the same
 *   AI_CHAT_DAILY_LIMIT          questions per user per day (default 30)
 *   AI_BRIEFING_DAILY_LIMIT      briefing generations per user per day (default 4: the first plus refreshes)
 *   AI_PARSE_DAILY_LIMIT         order-parsing requests per user per day (default 30)
 *   AI_QUICK_DAILY_LIMIT         phone-app voice/text readings per user per day (default 60)
 *   AI_GLOBAL_DAILY_LIMIT        model calls across everyone per day (default 1500)
 */

export type AiFeature = 'briefing' | 'chat' | 'parse' | 'quick';
export const AI_FEATURES: AiFeature[] = ['briefing', 'chat', 'parse', 'quick'];

export interface AiConfig {
  enabled: boolean;
  keyConfigured: boolean;
  allowedEmails: string[];
  allowedUids: string[];
  /** Per user per day, by feature. */
  limits: Record<AiFeature, number>;
  /** Across all users per day. */
  globalLimit: number;
}

export const AI_MODEL = 'claude-haiku-4-5';

export const DEFAULT_LIMITS: Record<AiFeature, number> = { chat: 30, briefing: 4, parse: 30, quick: 60 };
export const DEFAULT_GLOBAL_LIMIT = 1500;
const MAX_LIMIT = 100_000;

/** A whole number of 0 or more; anything else (blank, negative, text, 1.5) gives the default. 0 switches that limit to "none allowed". */
export function parseLimit(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^\d+$/.test(value.trim())) return fallback;
  return Math.min(Number(value.trim()), MAX_LIMIT);
}

const list = (value: string | undefined) => (value ?? '').split(',').map(s => s.trim()).filter(Boolean);

export function readAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  return {
    enabled: env.AI_FEATURES_ENABLED === 'true',
    keyConfigured: !!env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.trim() !== '',
    allowedEmails: list(env.AI_ALLOWED_EMAILS).map(e => e.toLowerCase()),
    allowedUids: list(env.AI_ALLOWED_UIDS),
    limits: {
      chat: parseLimit(env.AI_CHAT_DAILY_LIMIT, DEFAULT_LIMITS.chat),
      briefing: parseLimit(env.AI_BRIEFING_DAILY_LIMIT, DEFAULT_LIMITS.briefing),
      parse: parseLimit(env.AI_PARSE_DAILY_LIMIT, DEFAULT_LIMITS.parse),
      quick: parseLimit(env.AI_QUICK_DAILY_LIMIT, DEFAULT_LIMITS.quick),
    },
    globalLimit: parseLimit(env.AI_GLOBAL_DAILY_LIMIT, DEFAULT_GLOBAL_LIMIT),
  };
}

/**
 * Demo accounts are ordinary Firebase accounts that anyone can create from the
 * sign-in screen ("Explore Demo Sandbox"), so they are recognised by the email
 * the app gives them. They never reach the model; the client shows a canned
 * sample instead.
 */
export const isDemoAccountEmail = (email: string | undefined | null): boolean =>
  !!email && /^demo_\d+_\d+@bettereat\.com$/i.test(email);
