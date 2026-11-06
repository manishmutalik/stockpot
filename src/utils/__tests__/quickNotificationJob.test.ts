import { describe, it, expect } from 'vitest';
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from '../quickNotifications';
import { emptyNotificationState, planNotifications, readNotificationState, whatIsDue, type NotificationState } from '../quickNotificationJob';
import type { TodayView } from '../quickViews';

const settings = (over: Partial<NotificationSettings> = {}): NotificationSettings => ({ ...DEFAULT_NOTIFICATION_SETTINGS, ...over });
const today = (over: Partial<TodayView> = {}): TodayView => ({
  date: '2026-10-06', businessName: 'Anita Bakes', currency: { code: 'INR', symbol: '₹' }, statusLines: [],
  dueToday: null, dueTomorrow: null, overdue: null, pendingPayments: { customers: 0, orders: 0, total: 0, top: [] }, lowStock: [], useBySoon: [],
  today: { revenue: 0, trueProfit: 0, orderCount: 0 }, ...over,
});
const at = (localTime: string, state: NotificationState = emptyNotificationState(), s = settings()) => ({ settings: s, state, localDate: '2026-10-06', localTime });
const butter = { id: 'butter', name: 'Butter', remaining: 200, unit: 'g', threshold: 500 };

describe('whatIsDue', () => {
  it('sends the morning summary once its time has come, and not before', () => {
    expect(whatIsDue(at('07:59')).morning).toBe(false);
    expect(whatIsDue(at('08:00')).morning).toBe(true);
    expect(whatIsDue(at('08:14')).morning).toBe(true);
  });

  it('gives up on it after three hours, so a late job does not say good morning at noon', () => {
    expect(whatIsDue(at('11:00')).morning).toBe(true);
    expect(whatIsDue(at('11:01')).morning).toBe(false);
  });

  it('sends it once a day', () => {
    expect(whatIsDue(at('08:15', { ...emptyNotificationState(), sent: { morning: '2026-10-06' } })).morning).toBe(false);
    expect(whatIsDue(at('08:15', { ...emptyNotificationState(), sent: { morning: '2026-10-05' } })).morning).toBe(true);
  });

  it('respects an off switch and the chosen time', () => {
    expect(whatIsDue(at('08:15', undefined, settings({ morningSummary: { enabled: false, time: '08:00' } }))).morning).toBe(false);
    expect(whatIsDue(at('08:15', undefined, settings({ morningSummary: { enabled: true, time: '06:30' } }))).morning).toBe(true);
    expect(whatIsDue(at('19:00', undefined, settings({ dueTomorrow: { enabled: true, time: '19:00' } }))).dueTomorrow).toBe(true);
    expect(whatIsDue(at('19:00')).dueTomorrow).toBe(false);
  });

  it('looks at stock in the first quarter-hour of each daytime hour only', () => {
    expect(whatIsDue(at('09:00')).stock).toBe(true);
    expect(whatIsDue(at('09:14')).stock).toBe(true);
    expect(whatIsDue(at('09:15')).stock).toBe(false);
    expect(whatIsDue(at('06:00')).stock).toBe(false);
    expect(whatIsDue(at('21:00')).stock).toBe(false);
    expect(whatIsDue(at('02:00')).stock).toBe(false);
  });

  it('does not look at stock when both stock switches are off or both were sent today', () => {
    expect(whatIsDue(at('09:00', undefined, settings({ lowStock: false, useBy: false }))).stock).toBe(false);
    expect(whatIsDue(at('09:00', { ...emptyNotificationState(), sent: { lowStock: '2026-10-06', useBy: '2026-10-06' } })).stock).toBe(false);
  });

  it('keeps looking while a material is on the announced list, so it can be cleared when it recovers', () => {
    const state = { ...emptyNotificationState(), sent: { lowStock: '2026-10-06', useBy: '2026-10-06' }, lowNotified: { butter: true as const } };
    expect(whatIsDue(at('10:00', state)).stock).toBe(true);
  });
});

describe('the morning summary', () => {
  it('lists what needs attention, leaving out the good-news profit line', () => {
    const t = today({ statusLines: [
      { kind: 'orders_due', tone: 'coral', label: '2 orders due today' },
      { kind: 'payments_pending', tone: 'amber', label: '3 payments pending · ₹4,200' },
      { kind: 'profit', tone: 'green', label: "Today's profit ₹900" },
    ] });
    const { notifications, state } = planNotifications({ ...at('08:05'), today: t });
    expect(notifications).toEqual([{
      kind: 'morning', title: 'Today at Anita Bakes', body: '2 orders due today · 3 payments pending · ₹4,200',
      data: { type: 'morning', screen: 'today' },
    }]);
    expect(state.sent.morning).toBe('2026-10-06');
  });

  it('says nothing when all is clear, and is not looked at again that day', () => {
    const { notifications, state } = planNotifications({ ...at('08:05'), today: today() });
    expect(notifications).toEqual([]);
    expect(state.sent.morning).toBe('2026-10-06');
  });
});

describe('due tomorrow', () => {
  const on = settings({ dueTomorrow: { enabled: true, time: '19:00' } });
  it('lists tomorrow\'s items and quantities', () => {
    const t = today({ dueTomorrow: { orderCount: 3, items: [{ menuItemId: 'a', name: 'Croissant', quantity: 12 }, { menuItemId: 'b', name: 'Cake', quantity: 2 }] } });
    const { notifications } = planNotifications({ ...at('19:00', undefined, on), today: t });
    expect(notifications).toEqual([{ kind: 'dueTomorrow', title: '3 orders due tomorrow', body: '12 × Croissant, 2 × Cake', data: { type: 'dueTomorrow', screen: 'upcoming' } }]);
  });
  it('says nothing when nothing is due, and counts a single order', () => {
    expect(planNotifications({ ...at('19:00', undefined, on), today: today() }).notifications).toEqual([]);
    const one = today({ dueTomorrow: { orderCount: 1, items: [{ menuItemId: 'a', name: 'Cake', quantity: 1 }] } });
    expect(planNotifications({ ...at('19:00', undefined, on), today: one }).notifications[0].title).toBe('1 order due tomorrow');
  });
});

describe('running low', () => {
  it('names a material once, and not again the next day while it stays low', () => {
    const first = planNotifications({ ...at('09:00'), today: today({ lowStock: [butter] }) });
    expect(first.notifications).toEqual([{ kind: 'lowStock', title: 'Butter is running low', body: '200 g left', data: { type: 'lowStock', screen: 'stock-in' } }]);
    expect(first.state.lowNotified).toEqual({ butter: true });
    const nextDay = planNotifications({ settings: settings(), state: first.state, localDate: '2026-10-07', localTime: '09:00', today: today({ lowStock: [butter] }) });
    expect(nextDay.notifications).toEqual([]);
  });

  it('announces it again after it has recovered and run low a second time', () => {
    const first = planNotifications({ ...at('09:00'), today: today({ lowStock: [butter] }) });
    const recovered = planNotifications({ settings: settings(), state: first.state, localDate: '2026-10-07', localTime: '09:00', today: today() });
    expect(recovered.state.lowNotified).toEqual({});
    const again = planNotifications({ settings: settings(), state: recovered.state, localDate: '2026-10-08', localTime: '09:00', today: today({ lowStock: [butter] }) });
    expect(again.notifications).toHaveLength(1);
  });

  it('puts several newly low materials in one notification, and never more than one a day', () => {
    const many = [butter, { ...butter, id: 'flour', name: 'Flour' }, { ...butter, id: 'sugar', name: 'Sugar' }, { ...butter, id: 'eggs', name: 'Eggs' }];
    const first = planNotifications({ ...at('09:00'), today: today({ lowStock: many }) });
    expect(first.notifications).toHaveLength(1);
    expect(first.notifications[0].body).toBe('Butter (200 g), Flour (200 g), Sugar (200 g) and 1 more');
    // Another runs low later the same day: it waits for tomorrow.
    const later = planNotifications({ settings: settings(), state: first.state, localDate: '2026-10-06', localTime: '15:00', today: today({ lowStock: [...many, { ...butter, id: 'ghee', name: 'Ghee' }] }) });
    expect(later.notifications).toEqual([]);
    expect(later.state.lowNotified.ghee).toBeUndefined();
  });

  it('is silent when the owner has switched it off', () => {
    const r = planNotifications({ ...at('09:00', undefined, settings({ lowStock: false })), today: today({ lowStock: [butter] }) });
    expect(r.notifications).toEqual([]);
    expect(r.state.lowNotified).toEqual({});
  });
});

describe('use by soon', () => {
  const milk = { kind: 'material' as const, id: 'milk', name: 'Milk', date: '2026-10-07', daysLeft: 1 };
  const batch = { kind: 'batch' as const, id: 'run1', name: 'Croissant', date: '2026-10-06', daysLeft: 0 };
  it('says which is due, in words', () => {
    const one = planNotifications({ ...at('09:00'), today: today({ useBySoon: [milk] }) });
    expect(one.notifications[0]).toMatchObject({ kind: 'useBy', title: 'Use by soon', body: 'Milk: use by tomorrow', data: { screen: 'items' } });
    const two = planNotifications({ ...at('09:00'), today: today({ useBySoon: [batch, milk] }) });
    expect(two.notifications[0].body).toBe('Croissant (use by today), Milk (use by tomorrow)');
  });
  it('announces each item once, and a new one the next day', () => {
    const first = planNotifications({ ...at('09:00'), today: today({ useBySoon: [milk] }) });
    const same = planNotifications({ settings: settings(), state: first.state, localDate: '2026-10-07', localTime: '09:00', today: today({ useBySoon: [{ ...milk, daysLeft: 0 }] }) });
    expect(same.notifications).toEqual([]);
    const fresh = planNotifications({ settings: settings(), state: first.state, localDate: '2026-10-07', localTime: '09:00', today: today({ useBySoon: [{ ...milk, daysLeft: 0 }, batch] }) });
    expect(fresh.notifications[0].body).toBe('Croissant: use by today');
  });
  it('says so when it is past its date', () => {
    const r = planNotifications({ ...at('09:00'), today: today({ useBySoon: [{ ...milk, daysLeft: -1 }] }) });
    expect(r.notifications[0].body).toBe('Milk: past its use-by date');
  });
});

describe('nothing due', () => {
  it('sends nothing and changes nothing', () => {
    const state = emptyNotificationState();
    const r = planNotifications({ ...at('15:30'), today: null });
    expect(r.notifications).toEqual([]);
    expect(r.state).toEqual(state);
  });
});

describe('readNotificationState', () => {
  it('fills in an empty state for anything missing or malformed', () => {
    expect(readNotificationState(null)).toEqual(emptyNotificationState());
    expect(readNotificationState({ sent: { morning: 5, lowStock: '2026-10-06' }, lowNotified: { a: true, b: 'yes' }, useByNotified: 'x' }))
      .toEqual({ sent: { lowStock: '2026-10-06' }, lowNotified: { a: true }, useByNotified: {}, marginNotified: {} });
  });

  it('keeps the slipped items and the review already announced', () => {
    expect(readNotificationState({ marginNotified: { cake: true }, priceReviewNotifiedFor: '2027-01-01' }))
      .toMatchObject({ marginNotified: { cake: true }, priceReviewNotifiedFor: '2027-01-01' });
  });
});

describe('margins and the price review', () => {
  const cake = { id: 'cake', name: 'Cake', marginThen: 62, marginNow: 53, driver: { name: 'Butter', pctChange: 30 } };
  const brownie = { id: 'brownie', name: 'Brownie', marginThen: 70, marginNow: 60 };
  const notDue = { nextReviewOn: '2027-01-01', due: false, daysUntil: 30 };
  const due = { nextReviewOn: '2027-01-01', due: true, daysUntil: 0 };
  const plan = (state: NotificationState, slipped: any[], review: any, time = '08:00', localDate = '2026-10-06', s = settings()) =>
    planNotifications({ settings: s, state, localDate, localTime: time, today: today(), pricing: { slipped, review } });
  const about = (r: ReturnType<typeof plan>, kind: string) => r.notifications.filter(n => n.kind === kind);

  it('announces a slipped item with the facts and no price, at the morning summary time', () => {
    const [n] = about(plan(emptyNotificationState(), [cake], notDue), 'marginSlip');
    expect(n.title).toBe("Cake's margin has dropped");
    expect(n.body).toBe('62% → 53%. Butter is up 30%.');
    expect(n.body).not.toMatch(/₹/);
  });

  it('counts several slipped items in one notification', () => {
    const list = about(plan(emptyNotificationState(), [cake, brownie], notDue), 'marginSlip');
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("2 items' margins have dropped");
  });

  it('announces an item once, and again only after it has recovered', () => {
    const first = plan(emptyNotificationState(), [cake], notDue);
    const again = plan({ ...first.state, sent: {} }, [cake], notDue, '08:00', '2026-10-07');
    expect(about(again, 'marginSlip')).toHaveLength(0);
    const recovered = plan({ ...again.state, sent: {} }, [], notDue, '08:00', '2026-10-08');
    expect(recovered.state.marginNotified).toEqual({});
    expect(about(plan({ ...recovered.state, sent: {} }, [cake], notDue, '08:00', '2026-10-09'), 'marginSlip')).toHaveLength(1);
  });

  it('says it is time to raise prices once for each review date, in place of the slipped items', () => {
    const first = plan(emptyNotificationState(), [cake, brownie], due);
    const [n] = about(first, 'priceReview');
    expect(n.title).toBe('Time to raise prices');
    expect(n.body).toBe('Your quarterly price review is due: 2 items to look at.');
    expect(n.data.screen).toBe('price-review');
    expect(about(first, 'marginSlip')).toHaveLength(0);
    expect(about(plan({ ...first.state, sent: {} }, [cake, brownie], due, '08:00', '2026-10-07'), 'priceReview')).toHaveLength(0);
    expect(about(plan({ ...first.state, sent: {} }, [cake], { ...due, nextReviewOn: '2027-04-01' }, '08:00', '2027-04-01'), 'priceReview')).toHaveLength(1);
  });

  it('sends nothing about a due review with no items to look at', () => {
    expect(plan(emptyNotificationState(), [], due).notifications.filter(n => n.kind === 'priceReview')).toHaveLength(0);
  });

  it('respects the morning summary switch and time', () => {
    expect(about(plan(emptyNotificationState(), [cake], notDue, '12:00'), 'marginSlip')).toHaveLength(0);
    const off = settings({ morningSummary: { enabled: false, time: '08:00' } });
    expect(about(plan(emptyNotificationState(), [cake], notDue, '08:00', '2026-10-06', off), 'marginSlip')).toHaveLength(0);
  });
});
