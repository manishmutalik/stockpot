import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationSettings } from '../../../src/utils/quickApiTypes';
import { describeApiError, type Api } from './api';

/**
 * The owner's notification choices: loaded once, and every change is shown at once and sent to the server as the whole set
 * (the server takes all of it, so a half-sent update can never switch something off by accident). A change the server does
 * not accept is put back, with the reason.
 */
export function useNotificationSettings(api: Api, enabled: boolean) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const latest = useRef<NotificationSettings | null>(null);
  latest.current = settings;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const loaded = await api.get<NotificationSettings>('/api/mobile/notification-settings');
      if (alive.current) setSettings(loaded);
    } catch (err) {
      if (alive.current) setError(describeApiError(err));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => { if (enabled) load(); else setLoading(false); }, [enabled, load]);

  const change = useCallback(async (next: NotificationSettings) => {
    const before = latest.current;
    setSettings(next); setError(null);
    try {
      const saved = await api.put<NotificationSettings>('/api/mobile/notification-settings', next);
      if (alive.current) setSettings(saved);
    } catch (err) {
      if (alive.current) { setSettings(before); setError(`${describeApiError(err)} Your change was not saved.`); }
    }
  }, [api]);

  return { settings, loading, error, change, reload: load };
}
