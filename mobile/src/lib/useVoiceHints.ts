/**
 * useVoiceHints.ts
 *
 * The voice hints for the signed-in owner, and the one voice setting (whether customers' names are included). The setting
 * lives on this phone only.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Api } from './api';
import { DEFAULT_VOICE_PREFS, VOICE_PREFS_KEY, loadVoiceHints, newVoiceHintsCache, parseVoicePrefs, type VoicePrefs } from './voiceHints';

/** Shared by every screen; emptied on sign-out so one person's names are never offered to the next. */
export const voiceHintsCache = newVoiceHintsCache();

export function useVoicePrefs() {
  const [prefs, setPrefs] = useState<VoicePrefs>(DEFAULT_VOICE_PREFS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(VOICE_PREFS_KEY).then(raw => { if (alive) setPrefs(parseVoicePrefs(raw)); }).catch(() => {}).finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);
  const setCustomerNames = useCallback((customerNames: boolean) => {
    const next = { customerNames };
    setPrefs(next);
    AsyncStorage.setItem(VOICE_PREFS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);
  return { prefs, loaded, setCustomerNames };
}

/** The phrases to give the recogniser: fetched once the setting is known, kept for a few minutes. Empty until then, and if it fails. */
export function useVoiceHints(api: Api, owner: string | undefined, enabled: boolean): string[] {
  const { prefs, loaded } = useVoicePrefs();
  const [hints, setHints] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled || !owner || !loaded) return;
    let alive = true;
    loadVoiceHints(api, { owner, customerNames: prefs.customerNames }, voiceHintsCache).then(h => { if (alive) setHints(h); });
    return () => { alive = false; };
  }, [api, owner, enabled, loaded, prefs.customerNames]);
  return hints;
}
