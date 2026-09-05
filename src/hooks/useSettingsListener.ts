/**
 * useSettingsListener.ts
 *
 * Subscribes to the single `users/{uid}/settings/bakery` document and keeps
 * `settings`/`categories`/`currency` in sync. Extracted separately from
 * useFirestoreCollection.ts because it's a single-document listener (not a
 * collection) and populates three pieces of state from one document, rather
 * than one collection mapping to one array.
 *
 * Skips updates where `docSnap.metadata.hasPendingWrites` is true, so a
 * local optimistic write doesn't cause input fields to jump while the write
 * is still in flight — this exactly preserves the original inline behavior.
 */
import { useState, useEffect } from 'react';
import { auth, db, doc, onSnapshot } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { AppUser, BakerySettings } from '../types';
import { CURRENCIES } from '../utils/conversions';

const DEFAULT_SETTINGS: BakerySettings = {
  name: 'My Food Business',
  logo: '',
  primaryColor: '#10b981',
  address: '',
  phone: '',
  email: '',
};

export function useSettingsListener(authReady: boolean, user: AppUser | null) {
  const [settings, setSettings] = useState<BakerySettings>(DEFAULT_SETTINGS);
  const [categories, setCategories] = useState<string[]>(['Raw Materials', 'Packaging Materials']);
  const [currency, setCurrency] = useState(CURRENCIES[0]);

  useEffect(() => {
    if (!authReady || !auth.currentUser) return;
    const userId = auth.currentUser.uid;

    const unsubscribe = onSnapshot(
      doc(db, 'users', userId, 'settings', 'bakery'),
      (docSnap) => {
        // Skip if the change is local and still pending, to avoid jumpy inputs.
        if (docSnap.metadata.hasPendingWrites) return;

        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings({
            name: data.name ?? DEFAULT_SETTINGS.name,
            logo: data.logo ?? DEFAULT_SETTINGS.logo,
            primaryColor: data.primaryColor ?? DEFAULT_SETTINGS.primaryColor,
            address: data.address ?? DEFAULT_SETTINGS.address,
            phone: data.phone ?? DEFAULT_SETTINGS.phone,
            email: data.email ?? DEFAULT_SETTINGS.email,
          });
          if (data.categories) setCategories(data.categories);
          if (data.currency) setCurrency(data.currency);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${userId}/settings/bakery`)
    );

    return () => unsubscribe();
  }, [authReady, user]);

  return { settings, setSettings, categories, setCategories, currency, setCurrency };
}
