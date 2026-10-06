/**
 * clientCommit.ts
 *
 * Writes a plan with the browser's Firestore client. Kept apart from the plans
 * themselves so they stay free of Firebase and can run on the server too (which
 * commits the same writes with the Admin SDK, inside a transaction).
 */
import { db, doc, type writeBatch } from '../../firebase';
import type { PlannedWrite } from './types';

/** Adds every planned write to a client batch, under `users/{userId}`. */
export function addWritesToBatch(batch: ReturnType<typeof writeBatch>, userId: string, writes: PlannedWrite[]): void {
  for (const w of writes) {
    const ref = doc(db, 'users', userId, w.collection, w.id);
    if (w.merge) batch.set(ref, w.data, { merge: true });
    else batch.set(ref, w.data);
  }
}
