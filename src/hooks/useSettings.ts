/**
 * useSettings.ts
 *
 * Owns the persistence logic for business profile settings: the debounced
 * autosave-on-change effect, the theme-color CSS side effect, and the
 * explicit save/currency-update actions used by the Settings view.
 *
 * NOTE: this hook does NOT own the `settings` state itself. `settings` is
 * populated by the combined Firestore listener effect in App.tsx (alongside
 * materials, menu, orders, etc.), which all share one subscribe/cleanup
 * lifecycle — splitting just the settings listener out of that block was
 * judged too risky to do blind in this pass. `settings`/`setSettings` are
 * passed in as parameters instead, so this hook is a "logic hook" rather
 * than a "state + logic hook". Revisit once the combined listener itself
 * is decomposed.
 */
import type React from 'react';
import { useEffect } from 'react';
import { auth, db, doc, setDoc } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { BakerySettings } from '../types';

export function useSettings(
  settings: BakerySettings,
  setSettings: React.Dispatch<React.SetStateAction<BakerySettings>>,
  isAuthReady: boolean,
  categories: string[],
  currency: any,
  setCurrency: (c: any) => void,
  setShowSaveFeedback: (b: boolean) => void
) {
  // Applies the primary theme colour to the CSS custom property so all
  // Tailwind `text-primary` / `bg-primary` classes update instantly.
  useEffect(() => {
    document.documentElement.style.setProperty('--primary-color', settings.primaryColor);
  }, [settings.primaryColor]);

  /**
   * Persists bakery profile settings to Firestore (`users/{userId}/settings/bakery`).
   * Uses `merge: true` so individual fields can be updated without overwriting others.
   */
  const saveBakerySettings = async (newSettings: BakerySettings) => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    try {
      await setDoc(doc(db, 'users', userId, 'settings', 'bakery'), newSettings, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userId}/settings/bakery`);
    }
  };

  // Debounce: waits 1 second after the last settings change before writing to
  // Firestore, preventing excessive writes during rapid typing.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAuthReady && auth.currentUser) {
        saveBakerySettings(settings);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [settings, isAuthReady]);

  /**
   * Patches a single field in the local settings state.
   * The debounced effect above will sync the change to Firestore after 1 s.
   */
  const updateSettingsField = (field: keyof BakerySettings, value: string) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  /**
   * Updates the active display currency both locally and in Firestore, so
   * the choice persists across sessions.
   */
  const updateCurrency = async (newCurrency: any) => {
    setCurrency(newCurrency);
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    try {
      await setDoc(doc(db, 'users', userId, 'settings', 'bakery'), { currency: newCurrency }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userId}/settings/bakery`);
    }
  };

  /**
   * Saves the full settings object (profile, categories, currency) in one
   * Firestore write, then shows a brief success banner via `showSaveFeedback`.
   */
  const saveSettings = async () => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    try {
      await setDoc(doc(db, 'users', userId, 'settings', 'bakery'), {
        ...settings,
        categories,
        currency
      }, { merge: true });
      setShowSaveFeedback(true);
      setTimeout(() => setShowSaveFeedback(false), 2000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userId}/settings/bakery`);
    }
  };

  return { updateSettingsField, updateCurrency, saveSettings };
}
