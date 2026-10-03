/**
 * briefingStore.ts
 *
 * One briefing per user per day at `users/{uid}/briefings/{day}`, written only by
 * the server (the security rules let the owner read it and nobody write it). The
 * document also carries a short-lived generation marker so two open tabs do not
 * both call the model for the same day.
 */
import { getFirestore } from 'firebase-admin/firestore';
import type { StoredBriefing } from '../src/utils/aiBriefing';

/** A generation marker older than this is treated as abandoned (a crashed request). */
export const GENERATION_LOCK_MS = 90_000;

const briefingDoc = (uid: string, day: string) => getFirestore().collection('users').doc(uid).collection('briefings').doc(day);

export interface StoredDay {
  briefing?: StoredBriefing;
  /** When another request started generating, if one is in progress. */
  generatingSince?: number;
}

export async function getBriefing(uid: string, day: string): Promise<StoredDay> {
  const data = (await briefingDoc(uid, day).get()).data();
  if (!data) return {};
  const { generating, ...rest } = data as Record<string, any>;
  const briefing = rest.source ? (rest as StoredBriefing) : undefined;
  return { briefing, generatingSince: typeof generating?.startedAt === 'number' ? generating.startedAt : undefined };
}

/** Claims the right to generate today's briefing. False if someone else holds a fresh claim. */
export async function beginGeneration(uid: string, day: string, now: number = Date.now()): Promise<boolean> {
  const ref = briefingDoc(uid, day);
  return getFirestore().runTransaction(async tx => {
    const data = (await tx.get(ref)).data();
    const since = data?.generating?.startedAt;
    if (typeof since === 'number' && now - since < GENERATION_LOCK_MS) return false;
    tx.set(ref, { generating: { startedAt: now } }, { merge: true });
    return true;
  });
}

/** Stores the finished briefing, replacing the day's document and releasing the claim. */
export async function saveBriefing(uid: string, day: string, briefing: StoredBriefing): Promise<void> {
  const clean = JSON.parse(JSON.stringify(briefing)); // drops undefined, which Firestore rejects
  await briefingDoc(uid, day).set({ ...clean, generating: null });
}

/** Releases a claim without storing anything (a failed generation). */
export async function clearGeneration(uid: string, day: string): Promise<void> {
  await briefingDoc(uid, day).set({ generating: null }, { merge: true });
}
