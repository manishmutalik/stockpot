/**
 * quickNotificationJob.ts
 *
 * What the phone app's notifications say and when they are sent, worked out without touching Firebase or the push
 * service. The job (lib/notificationJob.ts) runs every 15 minutes for every owner with a registered phone; this decides,
 * from the owner's choices, what was already sent today and the same Today figures the app shows, what to send now.
 *
 * Rules:
 *  - never more than one notification of each kind per owner per day;
 *  - an off switch is always respected;
 *  - the morning summary and the due-tomorrow reminder go out once their time has come, and are given up on after three
 *    hours (a job that was down all morning should not wake someone at noon with "good morning");
 *  - running low and use-by are looked at once an hour, in the daytime only, so nobody is pinged at night; a material is
 *    announced once, and again only after it has recovered and run low a second time;
 *  - when there is nothing to say, nothing is sent (and the kind is not looked at again that day).
 */
import type { TodayView } from './quickViews';
import type { NotificationSettings } from './quickNotifications';
import { minutesOfDay } from './localDate';

export type NotificationKind = 'morning' | 'lowStock' | 'useBy' | 'dueTomorrow';
export const NOTIFICATION_KINDS: NotificationKind[] = ['morning', 'lowStock', 'useBy', 'dueTomorrow'];

/** How long after its time a scheduled notification may still be sent. */
export const SEND_WINDOW_MINUTES = 180;
/** Stock and use-by are checked only between these local times, in the first quarter-hour of each hour. */
export const DAYTIME_START = '07:00';
export const DAYTIME_END = '21:00';
/** At most this many names in one notification; the rest are counted. */
const MAX_NAMES = 3;

/** What the job remembers per owner, in `mobileSettings/notificationState`. */
export interface NotificationState {
  /** The local date each kind was last sent (or looked at and found empty). */
  sent: Partial<Record<NotificationKind, string>>;
  /** Materials already announced as running low, until they recover. */
  lowNotified: Record<string, true>;
  /** Use-by items already announced, by kind, id and date. */
  useByNotified: Record<string, true>;
}

export const emptyNotificationState = (): NotificationState => ({ sent: {}, lowNotified: {}, useByNotified: {} });

/** Whatever is stored, made into a state (anything missing or malformed is empty). */
export function readNotificationState(stored: unknown): NotificationState {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, any>;
  const flags = (v: unknown): Record<string, true> => {
    const out: Record<string, true> = {};
    if (v && typeof v === 'object') for (const k of Object.keys(v as object)) if ((v as Record<string, unknown>)[k] === true) out[k] = true;
    return out;
  };
  const sent: NotificationState['sent'] = {};
  for (const k of NOTIFICATION_KINDS) if (typeof s.sent?.[k] === 'string') sent[k] = s.sent[k];
  return { sent, lowNotified: flags(s.lowNotified), useByNotified: flags(s.useByNotified) };
}

export interface DueNow { morning: boolean; dueTomorrow: boolean; stock: boolean }

const inWindow = (time: string, nowTime: string) => {
  const since = minutesOfDay(nowTime) - minutesOfDay(time);
  return since >= 0 && since <= SEND_WINDOW_MINUTES;
};

/** Which kinds are worth looking at right now. Cheap: needs no business data, so the job reads nothing more when it is all false. */
export function whatIsDue(input: { settings: NotificationSettings; state: NotificationState; localDate: string; localTime: string }): DueNow {
  const { settings, state, localDate, localTime } = input;
  const minute = Number(localTime.slice(3));
  const daytime = minutesOfDay(localTime) >= minutesOfDay(DAYTIME_START) && minutesOfDay(localTime) < minutesOfDay(DAYTIME_END);
  const wantsStock = (settings.lowStock && state.sent.lowStock !== localDate) || (settings.useBy && state.sent.useBy !== localDate);
  // The recovered-material bookkeeping also needs a look, so low stock is checked while it is on even after today's send.
  const keepsLowList = settings.lowStock && Object.keys(state.lowNotified).length > 0;
  return {
    morning: settings.morningSummary.enabled && state.sent.morning !== localDate && inWindow(settings.morningSummary.time, localTime),
    dueTomorrow: settings.dueTomorrow.enabled && state.sent.dueTomorrow !== localDate && inWindow(settings.dueTomorrow.time, localTime),
    stock: (wantsStock || keepsLowList) && daytime && minute < 15,
  };
}

export interface PlannedNotification {
  kind: NotificationKind;
  title: string;
  body: string;
  /** Where tapping it goes in the app. */
  data: { type: NotificationKind; screen: 'today' | 'stock-in' | 'items' | 'upcoming' };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const names = (list: string[]) => list.length <= MAX_NAMES ? list.join(', ') : `${list.slice(0, MAX_NAMES).join(', ')} and ${list.length - MAX_NAMES} more`;
const dayWords = (daysLeft: number) => daysLeft < 0 ? 'past its use-by date' : daysLeft === 0 ? 'use by today' : daysLeft === 1 ? 'use by tomorrow' : `use by in ${daysLeft} days`;

/**
 * What to send now, and the state afterwards. `today` is the Today view for the owner's local date, needed only when
 * something is due (pass null otherwise). The state returned is what to store before sending ("claimed"), so an overlapping
 * run cannot send the same thing twice.
 */
export function planNotifications(input: {
  settings: NotificationSettings;
  state: NotificationState;
  localDate: string;
  localTime: string;
  today: TodayView | null;
}): { notifications: PlannedNotification[]; state: NotificationState } {
  const { settings, localDate, today } = input;
  const due = whatIsDue(input);
  const state: NotificationState = { sent: { ...input.state.sent }, lowNotified: { ...input.state.lowNotified }, useByNotified: { ...input.state.useByNotified } };
  const notifications: PlannedNotification[] = [];
  if (!today) return { notifications, state };

  if (due.morning) {
    state.sent.morning = localDate;
    // The profit line is good news, not something that needs doing: it is on the Today screen, not in a morning nudge.
    const lines = today.statusLines.filter(l => l.kind !== 'profit').map(l => l.label);
    if (lines.length > 0) {
      notifications.push({ kind: 'morning', title: today.businessName ? `Today at ${today.businessName}` : 'Today in your kitchen', body: lines.join(' · '), data: { type: 'morning', screen: 'today' } });
    }
  }

  if (due.dueTomorrow) {
    state.sent.dueTomorrow = localDate;
    const t = today.dueTomorrow;
    if (t && t.orderCount > 0) {
      const items = t.items.slice(0, MAX_NAMES).map(i => `${i.quantity} × ${i.name}`);
      const more = t.items.length > MAX_NAMES ? ` and ${t.items.length - MAX_NAMES} more` : '';
      notifications.push({ kind: 'dueTomorrow', title: `${plural(t.orderCount, 'order')} due tomorrow`, body: `${items.join(', ')}${more}`, data: { type: 'dueTomorrow', screen: 'upcoming' } });
    }
  }

  if (due.stock) {
    if (settings.lowStock) {
      // A material that has recovered can be announced again the next time it runs low.
      const lowIds = new Set(today.lowStock.map(m => m.id));
      for (const id of Object.keys(state.lowNotified)) if (!lowIds.has(id)) delete state.lowNotified[id];
      const fresh = today.lowStock.filter(m => !state.lowNotified[m.id]);
      if (fresh.length > 0 && state.sent.lowStock !== localDate) {
        for (const m of fresh) state.lowNotified[m.id] = true;
        state.sent.lowStock = localDate;
        notifications.push({
          kind: 'lowStock',
          title: fresh.length === 1 ? `${fresh[0].name} is running low` : 'Running low',
          body: fresh.length === 1 ? `${fresh[0].remaining} ${fresh[0].unit} left` : names(fresh.map(m => `${m.name} (${m.remaining} ${m.unit})`)),
          data: { type: 'lowStock', screen: 'stock-in' },
        });
      }
    }
    if (settings.useBy) {
      const key = (u: TodayView['useBySoon'][number]) => `${u.kind}:${u.id}:${u.date}`;
      const current = new Set(today.useBySoon.map(key));
      for (const k of Object.keys(state.useByNotified)) if (!current.has(k)) delete state.useByNotified[k];
      const fresh = today.useBySoon.filter(u => !state.useByNotified[key(u)]);
      if (fresh.length > 0 && state.sent.useBy !== localDate) {
        for (const u of fresh) state.useByNotified[key(u)] = true;
        state.sent.useBy = localDate;
        notifications.push({
          kind: 'useBy',
          title: 'Use by soon',
          body: fresh.length === 1 ? `${fresh[0].name}: ${dayWords(fresh[0].daysLeft)}` : names(fresh.map(u => `${u.name} (${dayWords(u.daysLeft)})`)),
          data: { type: 'useBy', screen: 'items' },
        });
      }
    }
  }
  return { notifications, state };
}
