/**
 * notifications.ts
 *
 * The plain logic behind the notification settings and what a tapped notification does. No React Native here, so it is tested.
 */
import type { NotificationSettings } from '../../../src/utils/quickApiTypes';

/** The times offered for the morning summary and the evening reminder (the server takes any HH:MM, these are the sensible ones). */
export const MORNING_TIMES = ['06:00', '07:00', '08:00', '09:00', '10:00'];
export const EVENING_TIMES = ['17:00', '18:00', '19:00', '20:00', '21:00'];

/** "08:00" → "8:00 am", "19:30" → "7:30 pm". */
export function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

type Switch = 'morningSummary' | 'lowStock' | 'useBy' | 'dueTomorrow';

/** The settings with one switch turned on or off. The server takes the whole set, so this always returns the whole set. */
export function withSwitch(s: NotificationSettings, which: Switch, on: boolean): NotificationSettings {
  if (which === 'morningSummary' || which === 'dueTomorrow') return { ...s, [which]: { ...s[which], enabled: on } };
  return { ...s, [which]: on };
}

/** The settings with the time of the morning summary or the evening reminder changed. */
export function withTime(s: NotificationSettings, which: 'morningSummary' | 'dueTomorrow', time: string): NotificationSettings {
  return { ...s, [which]: { ...s[which], time } };
}

export interface AppRoute { pathname: '/' | '/upcoming' | '/capture'; params?: Record<string, string> }

/**
 * Where tapping a notification goes, from the `data.screen` the server put in it. Nothing for something unknown (a newer
 * server may send a screen this version does not have): the app just opens.
 */
export function routeForNotification(data: unknown): AppRoute | null {
  const screen = data && typeof data === 'object' ? (data as Record<string, unknown>).screen : undefined;
  switch (screen) {
    case 'today': return { pathname: '/' };
    case 'items': return { pathname: '/' };
    case 'upcoming': return { pathname: '/upcoming' };
    case 'payments-due': return { pathname: '/upcoming', params: { tab: 'payments' } };
    case 'stock-in': return { pathname: '/capture', params: { kind: 'restock' } };
    default: return null;
  }
}
