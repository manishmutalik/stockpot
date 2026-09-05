/**
 * useFirestoreCollection.ts
 *
 * Generic Firestore collection listener, extracted out of App.tsx's
 * previously-combined listener effect. Each of materials/menu/orders/
 * experiments/productionRuns/wastageLogs subscribed to its own collection
 * independently — they were only combined into one `useEffect` for brevity,
 * not because they depended on each other. Splitting them changes nothing
 * about runtime behavior: each hook call still subscribes on mount/auth-change
 * and unsubscribes on cleanup, exactly as before.
 *
 * `settings` is NOT handled here — it's a single-document listener that also
 * populates `categories`/`currency` from the same document, so it has its own
 * hook (see useSettingsListener.ts).
 */
import { useState, useEffect } from 'react';
import { auth, db, collection, onSnapshot } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { AppUser } from '../types';

/**
 * Subscribes to `users/{uid}/{collectionPath}` and keeps a mapped array of
 * items in state for as long as the hook is mounted and `authReady` is true.
 *
 * @param collectionPath Firestore subcollection name (e.g. 'materials').
 * @param authReady      True once Firebase auth has resolved and a user is signed in.
 * @param user           The current user object — included as an effect
 *                        dependency so the listener re-subscribes on login/logout.
 * @param mapDoc         Maps a raw Firestore doc (id + data) to the typed item shape.
 * @param onUpdate        Optional callback fired after each snapshot update
 *                        (e.g. to update a shared "last synced" timestamp).
 */
export function useFirestoreCollection<T>(
  collectionPath: string,
  authReady: boolean,
  user: AppUser | null,
  mapDoc: (id: string, data: any) => T,
  onUpdate?: () => void,
  initialValue: T[] = []
) {
  const [items, setItems] = useState<T[]>(initialValue);

  useEffect(() => {
    if (!authReady || !auth.currentUser) return;
    const userId = auth.currentUser.uid;

    const unsubscribe = onSnapshot(
      collection(db, 'users', userId, collectionPath),
      (snapshot) => {
        setItems(snapshot.docs.map(d => mapDoc(d.id, d.data())));
        onUpdate?.();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${userId}/${collectionPath}`)
    );

    return () => unsubscribe();
  }, [authReady, user]);

  return [items, setItems] as const;
}
