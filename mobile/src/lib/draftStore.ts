/**
 * draftStore.ts
 *
 * Keeps an unsaved entry on the device, so closing the app or losing the connection before Save does not lose what the
 * owner said: it is offered again the next time the app opens. Nothing is ever sent in the background. The storage is
 * passed in (AsyncStorage in the app), so this is tested without a phone.
 */
import type { Answer, QuickKind } from '../../../src/utils/quickApiTypes';

export interface PersistedDraft {
  text: string;
  kind: QuickKind | null;
  reading?: unknown;
  answers: Answer[];
  idempotencyKey: string;
  savedAt: number;
}

export interface DraftStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const DRAFT_KEY = 'stockpot.quick.draft';
/** An old unsaved entry is dropped rather than offered: what was true last week may not be now. */
export const DRAFT_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const KINDS = ['order', 'restock', 'production', 'payment'];

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Whatever is stored, as a draft, or null if it is not one (or is too old, or has no words). */
export function readPersistedDraft(raw: string | null, now: number): PersistedDraft | null {
  if (!raw) return null;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!isObject(v) || typeof v.text !== 'string' || v.text.trim() === '' || typeof v.savedAt !== 'number') return null;
  if (now - v.savedAt > DRAFT_MAX_AGE_MS || v.savedAt > now + 60_000) return null;
  if (v.kind !== null && !KINDS.includes(v.kind)) return null;
  if (typeof v.idempotencyKey !== 'string' || v.idempotencyKey.length < 16 || v.idempotencyKey.length > 64) return null;
  const answers: Answer[] = Array.isArray(v.answers)
    ? v.answers.filter((a: any) => isObject(a) && typeof a.questionId === 'string' && typeof a.value === 'string').map((a: any) => ({ questionId: a.questionId, value: a.value }))
    : [];
  return { text: v.text, kind: v.kind, ...(isObject(v.reading) && { reading: v.reading }), answers, idempotencyKey: v.idempotencyKey, savedAt: v.savedAt };
}

export function createDraftStore(storage: DraftStorage, now: () => number = Date.now) {
  return {
    /** The unsaved entry waiting to be offered, if any. Never throws: a storage that fails is the same as nothing kept. */
    async load(): Promise<PersistedDraft | null> {
      try { return readPersistedDraft(await storage.getItem(DRAFT_KEY), now()); } catch { return null; }
    },
    async save(draft: Omit<PersistedDraft, 'savedAt'>): Promise<void> {
      try { await storage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: now() })); } catch { /* the entry just is not kept */ }
    },
    async clear(): Promise<void> {
      try { await storage.removeItem(DRAFT_KEY); } catch { /* nothing to clear */ }
    },
  };
}
