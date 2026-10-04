/**
 * anthropic.ts
 *
 * Lazily creates one shared Anthropic client from ANTHROPIC_API_KEY, the same
 * pattern as lib/stripe.ts: the server boots and serves everything else with no
 * key, and only an actual AI request fails, with a clear message. The key is
 * server-side only and never reaches the browser.
 */
import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

/**
 * An API key that is not tied to one workspace must say which workspace a
 * request is for. Set ANTHROPIC_WORKSPACE_ID (from the Anthropic Console) for
 * such a key; a key created inside a workspace needs nothing.
 */
export function workspaceHeaders(env: Record<string, string | undefined> = process.env): Record<string, string> | undefined {
  const id = env.ANTHROPIC_WORKSPACE_ID?.trim();
  return id ? { 'anthropic-workspace-id': id } : undefined;
}

export function getAnthropic(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required for AI features. ' +
      'Get it from https://platform.claude.com (Console, API Keys).'
    );
  }
  // A short timeout: these are small prompts, and an owner is waiting on the answer.
  client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 2, defaultHeaders: workspaceHeaders() });
  return client;
}

/** For tests: forget the cached client. */
export const resetAnthropicForTests = () => { client = null; };

/**
 * What to tell our own client when a model call fails. Never forwards the
 * provider's message, which can carry request details; logs it on the server
 * instead (the caller does that).
 */
export function aiErrorResponse(err: unknown): { status: number; message: string } {
  const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : undefined;
  if (status === 429) return { status: 503, message: 'The AI service is busy. Please try again in a minute.' };
  if (status === 529 || status === 503) return { status: 503, message: 'The AI service is overloaded right now. Please try again shortly.' };
  if (status === 401 || status === 403) return { status: 500, message: 'AI features are not set up correctly on this server.' };
  if (status === 402) return { status: 503, message: 'AI features are paused. Please try again later.' };
  if ((err as { name?: string })?.name === 'APIConnectionTimeoutError') return { status: 504, message: 'The AI service took too long to answer. Please try again.' };
  return { status: 502, message: 'The AI service could not answer. Please try again.' };
}
