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
 *   AI_RECIPE_DAILY_LIMIT        recipes read per user per day (default 15; a page of 4 recipes counts 4)
 *   AI_RECIPE_MONTHLY_LIMIT      recipes read per user per calendar month (default 75)
 *   AI_PROMOTE_DAILY_LIMIT       photos made into posts (Promote) per user per day (default 15)
 *   AI_GLOBAL_DAILY_LIMIT        model calls across everyone per day (default 1500; a recipe reading counts RECIPE_GLOBAL_WEIGHT)
 */

export type AiFeature = 'briefing' | 'chat' | 'parse' | 'quick' | 'recipe' | 'promote';
export const AI_FEATURES: AiFeature[] = ['briefing', 'chat', 'parse', 'quick', 'recipe', 'promote'];

export interface AiConfig {
  enabled: boolean;
  keyConfigured: boolean;
  allowedEmails: string[];
  allowedUids: string[];
  /** Per user per day, by feature. */
  limits: Record<AiFeature, number>;
  /** Recipes read per user per calendar month (the recipe reader also has its daily limit in `limits`). */
  recipeMonthlyLimit: number;
  /** Across all users per day. */
  globalLimit: number;
}

export const AI_MODEL = 'claude-haiku-4-5';

/**
 * The recipe reader alone uses a stronger model: it reads handwriting from photos, and a misread amount puts a wrong
 * cost on every order of that item. Recipes are read a few times while an account is set up, not every day, so the
 * dearer model costs little in total (docs/developer-guide/06-ai.md). Every other feature stays on AI_MODEL.
 */
export const RECIPE_AI_MODEL = 'claude-opus-5-5';
/**
 * Promote writes captions customers read, so it uses a model that writes well; it looks at one 1024 px photo and writes
 * a few lines, about 1.5 US cents a post (docs/developer-guide/06-ai.md).
 */
export const PROMOTE_AI_MODEL = 'claude-sonnet-5-5';
/** A recipe reading costs about four ordinary readings, so it uses up four of the global daily count. */
export const RECIPE_GLOBAL_WEIGHT = 4;

export const DEFAULT_LIMITS: Record<AiFeature, number> = { chat: 30, briefing: 4, parse: 30, quick: 60, recipe: 15, promote: 15 };
export const DEFAULT_RECIPE_MONTHLY_LIMIT = 75;
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
      recipe: parseLimit(env.AI_RECIPE_DAILY_LIMIT, DEFAULT_LIMITS.recipe),
      promote: parseLimit(env.AI_PROMOTE_DAILY_LIMIT, DEFAULT_LIMITS.promote),
    },
    recipeMonthlyLimit: parseLimit(env.AI_RECIPE_MONTHLY_LIMIT, DEFAULT_RECIPE_MONTHLY_LIMIT),
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
