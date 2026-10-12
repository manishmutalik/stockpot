/**
 * notificationJob.ts
 *
 * The scheduled job behind the phone app's notifications. Called every 15 minutes (see lib/notificationRoutes.ts for how
 * it is triggered), it visits every owner with a registered phone and sends what src/utils/quickNotificationJob decides.
 *
 * Per owner, in order:
 *  1. a cheap look (their settings, what was already sent, their phones): if nothing could be due, nothing more is read;
 *     (unpaid bills are a look at the unpaid orders, once an hour in the daytime: utils/billReminders)
 *  2. one transaction that reads the business data, decides, and writes the new state ("claims" what it will send), so a
 *     second run overlapping this one finds it already claimed and sends nothing twice;
 *  3. the push itself, outside the transaction;
 *  4. a phone Expo says is gone is switched off, and if no phone at all accepted a notification the claim is given back,
 *     so the next run tries again instead of the notification being lost.
 * One owner failing never stops the others.
 */
import type { QuickDb, QuickWrite } from './quickDb';
import type { PushSender, PushMessage } from './expoPush';
import { asMenu, currencyOf, loadSettings, loadTodayView } from './quickRoutes';
import { customerDues } from '../src/utils/quickPayments';
import { ordersToRemind } from '../src/utils/billReminders';
import { planBillReminded } from '../src/utils/plans';
import { formatAmount } from '../src/utils/money';
import type { Order } from '../src/types';
import { withNotificationDefaults } from '../src/utils/quickNotifications';
import {
  NOTIFICATION_KINDS, planNotifications, readNotificationState, whatIsDue,
  type NotificationKind, type NotificationState,
} from '../src/utils/quickNotificationJob';
import { timeInZone, todayInZone } from '../src/utils/localDate';
import type { BakerySettings } from '../src/types';

export const NOTIFICATIONS_DOC = 'notifications';
export const STATE_DOC = 'notificationState';

export interface NotificationJobDeps {
  db: QuickDb;
  now: () => number;
  /** Every owner who has registered a phone. */
  listUsers: () => Promise<string[]>;
  send: PushSender;
  /** Whether this owner's plan still covers the app. Called only when something is about to be sent. Absent: everyone. */
  isEntitled?: (uid: string) => Promise<boolean>;
}

export interface JobSummary { users: number; notifications: number; delivered: number; released: number; errors: number }

interface Device { id: string; token: string }

const activeDevices = (docs: { id: string; token?: unknown; disabled?: unknown }[]): Device[] =>
  docs.filter(d => typeof d.token === 'string' && d.disabled !== true).map(d => ({ id: d.id, token: d.token as string }));

async function visit(deps: NotificationJobDeps, uid: string, summary: JobSummary): Promise<void> {
  const nowDate = new Date(deps.now());

  // 1. The cheap look.
  const look = await deps.db.run(uid, async tx => {
    const [business, stored, state, devices] = await Promise.all([loadSettings(tx), tx.get('mobileSettings', NOTIFICATIONS_DOC), tx.get('mobileSettings', STATE_DOC), tx.all('devices')]);
    return { business, settings: withNotificationDefaults(stored), state: readNotificationState(state), devices: activeDevices(devices as any) };
  });
  if (look.devices.length === 0) return;
  const zone = (look.business as Partial<BakerySettings>).timezone;
  const when = { localDate: todayInZone(zone, nowDate), localTime: timeInZone(zone, nowDate) };
  const dueNow = whatIsDue({ settings: look.settings, state: look.state, ...when });
  if (!dueNow.morning && !dueNow.dueTomorrow && !dueNow.stock && !dueNow.bills) return;
  if (deps.isEntitled && !(await deps.isEntitled(uid))) return;

  // 2. Decide and claim, in one transaction.
  const claimed = await deps.db.run(uid, async tx => {
    const [business, stored, stateDoc, devices] = await Promise.all([loadSettings(tx), tx.get('mobileSettings', NOTIFICATIONS_DOC), tx.get('mobileSettings', STATE_DOC), tx.all('devices')]);
    const settings = withNotificationDefaults(stored);
    const state = readNotificationState(stateDoc);
    const now = whenFor(business, nowDate);
    // Looked at again with the state as it is now: a run that overlapped this one may have claimed it already.
    const due = whatIsDue({ settings, state, ...now });
    if (!due.morning && !due.dueTomorrow && !due.stock && !due.bills) return null;
    const today = await loadTodayView(tx, { today: now.localDate, settings: business as any });
    // Bills sent two days ago and still unpaid, by customer; their orders are marked as reminded in this same transaction.
    const reminded: { id: string; previous: number | null }[] = [];
    let unpaidBills: { name: string; amount: string }[] | undefined;
    if (due.bills) {
      const unpaid = (await tx.where('orders', 'paymentStatus', 'unpaid')) as Order[];
      const toRemind = new Set(ordersToRemind(unpaid, deps.now()).map(o => o.id));
      if (toRemind.size > 0) {
        const menu = asMenu(await tx.getMany('menu', unpaid.map(o => o.menuItemId)));
        const currency = currencyOf(business);
        const customers = customerDues({ unpaid, menu, settings: business, currency, today: now.localDate })
          .filter(e => e.customer.orders.some(o => toRemind.has(o.id)));
        for (const e of customers) for (const o of e.customer.orders) {
          if (toRemind.has(o.id)) reminded.push({ id: o.id, previous: typeof o.billRemindedAt === 'number' ? o.billRemindedAt : null });
        }
        unpaidBills = customers.map(e => ({ name: e.customer.name, amount: formatAmount(e.customer.dueTotal, currency) }));
      }
    }
    const plan = planNotifications({ settings, state, ...now, today, unpaidBills });
    const sendsBills = plan.notifications.some(n => n.kind === 'unpaidBills');
    tx.apply([
      { collection: 'mobileSettings', id: STATE_DOC, merge: false, data: { ...plan.state, updatedAt: deps.now() } },
      ...(sendsBills ? planBillReminded(reminded.map(r => r.id), deps.now()) : []),
    ]);
    return { previous: state, notifications: plan.notifications, devices: activeDevices(devices as any), reminded: sendsBills ? reminded : [] };
  });
  if (!claimed || claimed.notifications.length === 0 || claimed.devices.length === 0) return;
  summary.notifications += claimed.notifications.length;

  // 3. Send: every notification to every phone.
  const messages: (PushMessage & { kind: NotificationKind; device: Device })[] = claimed.notifications.flatMap(n =>
    claimed.devices.map(device => ({ to: device.token, title: n.title, body: n.body, data: n.data as unknown as Record<string, unknown>, kind: n.kind, device })));
  const results = await deps.send(messages.map(({ to, title, body, data }) => ({ to, title, body, data })));

  // 4. Dead phones off; a notification no phone accepted is given back.
  const dead = new Set<string>();
  const accepted = new Set<NotificationKind>();
  const retry = new Set<NotificationKind>();
  messages.forEach((m, i) => {
    const r = results[i];
    if (r?.ok) { accepted.add(m.kind); return; }
    if (r?.invalidToken) dead.add(m.device.id);
  });
  for (const n of claimed.notifications) {
    const everyoneDead = claimed.devices.every(d => dead.has(d.id));
    if (accepted.has(n.kind)) summary.delivered++;
    else if (!everyoneDead) retry.add(n.kind);
  }
  if (dead.size > 0 || retry.size > 0) {
    await deps.db.run(uid, async tx => {
      const writes: QuickWrite[] = [...dead].map(id => ({ collection: 'devices', id, merge: true, data: { disabled: true, disabledAt: deps.now() } }));
      if (retry.size > 0) {
        const current = readNotificationState(await tx.get('mobileSettings', STATE_DOC));
        writes.push({ collection: 'mobileSettings', id: STATE_DOC, merge: false, data: { ...giveBack(current, claimed.previous, retry), updatedAt: deps.now() } });
        // An unpaid-bill reminder no phone took: the orders go back to not reminded, so the next run tries again.
        if (retry.has('unpaidBills')) {
          for (const r of claimed.reminded) writes.push({ collection: 'orders', id: r.id, merge: true, data: { billRemindedAt: r.previous } });
        }
      }
      tx.apply(writes);
    });
    summary.released += retry.size;
  }
}

const whenFor = (business: unknown, nowDate: Date) => {
  const zone = (business as Partial<BakerySettings>).timezone;
  return { localDate: todayInZone(zone, nowDate), localTime: timeInZone(zone, nowDate) };
};

/** The state with the given kinds put back as they were before this run claimed them. */
export function giveBack(current: NotificationState, previous: NotificationState, kinds: Set<NotificationKind>): NotificationState {
  const next: NotificationState = { sent: { ...current.sent }, lowNotified: { ...current.lowNotified }, useByNotified: { ...current.useByNotified } };
  for (const kind of NOTIFICATION_KINDS) {
    if (!kinds.has(kind)) continue;
    if (previous.sent[kind] === undefined) delete next.sent[kind]; else next.sent[kind] = previous.sent[kind];
    if (kind === 'lowStock') next.lowNotified = { ...previous.lowNotified };
    if (kind === 'useBy') next.useByNotified = { ...previous.useByNotified };
  }
  return next;
}

export async function runNotificationJob(deps: NotificationJobDeps): Promise<JobSummary> {
  const summary: JobSummary = { users: 0, notifications: 0, delivered: 0, released: 0, errors: 0 };
  const users = await deps.listUsers();
  for (const uid of users) {
    summary.users++;
    try {
      await visit(deps, uid, summary);
    } catch (err: any) {
      summary.errors++;
      console.error('Notification job failed for one owner:', err?.message);
    }
  }
  return summary;
}
