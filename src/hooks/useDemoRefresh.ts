/**
 * useDemoRefresh.ts
 *
 * Sets the demo kitchen up afresh when it is opened on a later day than it was set up (utils/demoData
 * demoKitchenIsStale), so its dates (yesterday's sales, what is due) are current. The server does it (POST /api/demo/seed,
 * lib/demoSeedRoutes): the price history is append-only to the apps, so a refresh written from here would be refused
 * whole. Asked at most once a day, only for a demo account; the app's listeners show the fresh kitchen when it lands.
 */
import { useEffect, useRef } from 'react';
import { apiFetch } from '../utils/apiClient';
import { demoKitchenIsStale } from '../utils/demoData';
import { todayInZone } from '../utils/localDate';

export function useDemoRefresh(input: {
  isDemo: boolean;
  settingsLoaded: boolean;
  userId: string | null | undefined;
  settings: { demoSeededOn?: string; email?: string; name?: string } | null | undefined;
}): void {
  const askedOn = useRef<string | null>(null);
  const { isDemo, settingsLoaded, userId, settings } = input;
  useEffect(() => {
    if (!isDemo || !settingsLoaded || !userId) return;
    const today = todayInZone(undefined);
    if (askedOn.current === today || !demoKitchenIsStale(settings, userId, today)) return;
    askedOn.current = today;
    apiFetch('/api/demo/seed', { method: 'POST' })
      .then(res => { if (!res.ok) console.error('Demo kitchen refresh failed', res.status); })
      .catch(err => console.error('Demo kitchen refresh failed', err));
  }, [isDemo, settingsLoaded, userId, settings]);
}
