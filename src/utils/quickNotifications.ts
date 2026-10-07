/**
 * quickNotifications.ts
 *
 * The phone app's notification choices, shared by the app, the settings endpoint
 * and the job that sends them. A switch per kind and the time of the morning
 * summary; an off switch is always respected.
 */
import type { NotificationSettings } from './quickApiTypes';

export type { NotificationSettings } from './quickApiTypes';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  morningSummary: { enabled: true, time: '08:00' },
  lowStock: true,
  useBy: true,
  dueTomorrow: { enabled: false, time: '19:00' },
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Whatever is stored, with the defaults filled in for anything missing or not valid. */
export function withNotificationDefaults(stored: unknown): NotificationSettings {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, any>;
  const d = DEFAULT_NOTIFICATION_SETTINGS;
  const flag = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const time = (v: unknown, fallback: string) => (typeof v === 'string' && TIME.test(v) ? v : fallback);
  return {
    morningSummary: { enabled: flag(s.morningSummary?.enabled, d.morningSummary.enabled), time: time(s.morningSummary?.time, d.morningSummary.time) },
    lowStock: flag(s.lowStock, d.lowStock),
    useBy: flag(s.useBy, d.useBy),
    dueTomorrow: { enabled: flag(s.dueTomorrow?.enabled, d.dueTomorrow.enabled), time: time(s.dueTomorrow?.time, d.dueTomorrow.time) },
  };
}

/** A request body, checked. Every field is required, so a half-sent update cannot switch something off by accident. */
export function readNotificationSettings(body: unknown): { ok: true; value: NotificationSettings } | { ok: false; error: string } {
  const b = body as Record<string, any> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, error: 'Send all the notification settings.' };
  const flags = typeof b.lowStock === 'boolean' && typeof b.useBy === 'boolean'
    && typeof b.morningSummary?.enabled === 'boolean' && typeof b.dueTomorrow?.enabled === 'boolean';
  if (!flags) return { ok: false, error: 'Each notification needs an on or off setting.' };
  if (!TIME.test(b.morningSummary?.time ?? '') || !TIME.test(b.dueTomorrow?.time ?? '')) return { ok: false, error: 'Times must be HH:MM, for example 08:00.' };
  return { ok: true, value: {
    morningSummary: { enabled: b.morningSummary.enabled, time: b.morningSummary.time },
    lowStock: b.lowStock, useBy: b.useBy,
    dueTomorrow: { enabled: b.dueTomorrow.enabled, time: b.dueTomorrow.time },
  } };
}

/** An Expo push token, as the app gets it from `expo-notifications`. */
export const EXPO_PUSH_TOKEN = /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,120}\]$/;
