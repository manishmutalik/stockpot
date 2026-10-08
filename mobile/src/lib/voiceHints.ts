/**
 * voiceHints.ts
 *
 * What the speech recogniser is told to expect (the owner's menu and materials, and customers' names if they asked for them),
 * fetched from the server and kept for a few minutes so opening the capture screen is not slowed down. Failing to get them
 * is not an error: voice just listens without the hints. The storage and the clock are passed in, so it is tested without a phone.
 */
import type { SpeechPhrasesResponse } from '../../../src/utils/quickApiTypes';
import type { Api } from './api';

export const VOICE_HINTS_TTL_MS = 10 * 60 * 1000;
export const VOICE_PREFS_KEY = 'stockpot.quick.voicePrefs';

export interface VoicePrefs { customerNames: boolean }
export const DEFAULT_VOICE_PREFS: VoicePrefs = { customerNames: false };

/** What was stored, or the defaults when it is missing or not what we wrote. Customers' names stay off unless explicitly on. */
export function parseVoicePrefs(raw: string | null | undefined): VoicePrefs {
  if (!raw) return DEFAULT_VOICE_PREFS;
  try {
    const v = JSON.parse(raw);
    return { customerNames: v?.customerNames === true };
  } catch {
    return DEFAULT_VOICE_PREFS;
  }
}

export interface VoiceHintsCache { entries: Map<string, { at: number; phrases: string[] }> }
export const newVoiceHintsCache = (): VoiceHintsCache => ({ entries: new Map() });

/**
 * The phrases for this owner (`owner` keeps one person's names from being offered to the next person on a shared phone),
 * from the cache when they are recent. Never throws.
 */
export async function loadVoiceHints(
  api: Pick<Api, 'get'>, input: { owner: string; customerNames: boolean }, cache: VoiceHintsCache, now: () => number = Date.now,
): Promise<string[]> {
  const key = `${input.owner}:${input.customerNames ? 'c' : '-'}`;
  const hit = cache.entries.get(key);
  if (hit && now() - hit.at < VOICE_HINTS_TTL_MS) return hit.phrases;
  try {
    const res = await api.get<SpeechPhrasesResponse>(`/api/mobile/speech-phrases${input.customerNames ? '?customers=1' : ''}`);
    const phrases = Array.isArray(res?.phrases) ? res.phrases.filter((p): p is string => typeof p === 'string') : [];
    cache.entries.set(key, { at: now(), phrases });
    return phrases;
  } catch {
    return hit?.phrases ?? [];
  }
}

/** Forgets everything fetched (on sign-out). */
export const clearVoiceHints = (cache: VoiceHintsCache) => cache.entries.clear();
