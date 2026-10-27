/**
 * aiUsage.ts
 *
 * Daily counters that cap AI use, kept in Firestore by the server (Admin SDK).
 * Neither collection is reachable from a client: `users/{uid}/aiUsage` is not in
 * the security rules' allow-list, and `aiUsageGlobal` is a top-level collection
 * the default-deny covers.
 *
 *   users/{uid}/aiUsage/{YYYY-MM-DD}   { chat: n, briefing: n, parse: n, quick: n, recipe: n }   the user's own day
 *   users/{uid}/aiUsage/{YYYY-MM}      { recipe: n, style: n }                             the user's month (recipes and AI-styled photos)
 *   aiUsageGlobal/{YYYY-MM-DD}         { total: n }                                        UTC day, all users
 *
 * A call is reserved *before* the model is called, in one transaction that
 * checks both limits and increments both counters, so two requests arriving
 * together cannot both squeeze under the limit. Failed model calls still count:
 * they can still cost money, and it keeps the cap simple and safe.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { resolveTimeZone, todayInZone } from '../src/utils/localDate';
import type { AiFeature } from './aiConfig';

export type ReserveResult =
  | { ok: true; used: number; limit: number }
  | { ok: false; reason: 'user_limit' | 'global_limit'; used: number; limit: number };

const userUsageDoc = (uid: string, date: string) => getFirestore().collection('users').doc(uid).collection('aiUsage').doc(date);
const globalUsageDoc = (date: string) => getFirestore().collection('aiUsageGlobal').doc(date);

/** The day a user's allowance runs on: their business's own date. Falls back to India if they have not set a zone. */
export async function usageDayFor(uid: string, now: Date = new Date()): Promise<string> {
  const snap = await getFirestore().collection('users').doc(uid).collection('settings').doc('bakery').get();
  return todayInZone(resolveTimeZone(snap.data()?.timezone), now);
}

/** The global day is UTC, so it is one clock for everyone. */
export const globalDay = (now: Date = new Date()): string => now.toISOString().split('T')[0];

export async function reserveAiUse(input: {
  uid: string;
  feature: AiFeature;
  perUserLimit: number;
  globalLimit: number;
  userDay: string;
  globalDayKey: string;
}): Promise<ReserveResult> {
  const db = getFirestore();
  const userRef = userUsageDoc(input.uid, input.userDay);
  const globalRef = globalUsageDoc(input.globalDayKey);
  return db.runTransaction(async tx => {
    const [userSnap, globalSnap] = await Promise.all([tx.get(userRef), tx.get(globalRef)]);
    const used = Number(userSnap.data()?.[input.feature] ?? 0);
    const globalUsed = Number(globalSnap.data()?.total ?? 0);
    if (used >= input.perUserLimit) return { ok: false as const, reason: 'user_limit' as const, used, limit: input.perUserLimit };
    if (globalUsed >= input.globalLimit) return { ok: false as const, reason: 'global_limit' as const, used: globalUsed, limit: input.globalLimit };
    tx.set(userRef, { [input.feature]: used + 1 }, { merge: true });
    tx.set(globalRef, { total: globalUsed + 1 }, { merge: true });
    return { ok: true as const, used: used + 1, limit: input.perUserLimit };
  });
}

/**
 * The recipe reader's reservation: one recipe against the day and the month, and `globalWeight` model calls against
 * the global day (a recipe reading costs several ordinary readings). A page often holds several recipes; they are
 * counted after the reading with `addRecipeUse`, since how many there are is only known then. Promote's AI-styled
 * photos (`feature: 'style'`) have a day and a month too, and are reserved the same way.
 */
export async function reserveRecipeUse(input: {
  uid: string;
  feature?: 'recipe' | 'style';
  userDay: string;
  globalDayKey: string;
  dailyLimit: number;
  monthlyLimit: number;
  globalLimit: number;
  globalWeight: number;
}): Promise<RecipeReserveResult> {
  const db = getFirestore();
  const dayRef = userUsageDoc(input.uid, input.userDay);
  const monthRef = userUsageDoc(input.uid, input.userDay.slice(0, 7));
  const globalRef = globalUsageDoc(input.globalDayKey);
  const feature = input.feature ?? 'recipe';
  return db.runTransaction(async tx => {
    const [daySnap, monthSnap, globalSnap] = await Promise.all([tx.get(dayRef), tx.get(monthRef), tx.get(globalRef)]);
    const day = Number(daySnap.data()?.[feature] ?? 0);
    const month = Number(monthSnap.data()?.[feature] ?? 0);
    const globalUsed = Number(globalSnap.data()?.total ?? 0);
    if (day >= input.dailyLimit) return { ok: false as const, reason: 'user_limit' as const };
    if (month >= input.monthlyLimit) return { ok: false as const, reason: 'month_limit' as const };
    if (globalUsed + input.globalWeight > input.globalLimit) return { ok: false as const, reason: 'global_limit' as const };
    tx.set(dayRef, { [feature]: day + 1 }, { merge: true });
    tx.set(monthRef, { [feature]: month + 1 }, { merge: true });
    tx.set(globalRef, { total: globalUsed + input.globalWeight }, { merge: true });
    return { ok: true as const, day: day + 1, month: month + 1 };
  });
}

/** Counts `count` more recipes read (the rest of a page), past the limits if need be: the reading is already paid for. */
export async function addRecipeUse(input: { uid: string; userDay: string; count: number }): Promise<{ day: number; month: number }> {
  const db = getFirestore();
  const dayRef = userUsageDoc(input.uid, input.userDay);
  const monthRef = userUsageDoc(input.uid, input.userDay.slice(0, 7));
  return db.runTransaction(async tx => {
    const [daySnap, monthSnap] = await Promise.all([tx.get(dayRef), tx.get(monthRef)]);
    const day = Number(daySnap.data()?.recipe ?? 0) + input.count;
    const month = Number(monthSnap.data()?.recipe ?? 0) + input.count;
    tx.set(dayRef, { recipe: day }, { merge: true });
    tx.set(monthRef, { recipe: month }, { merge: true });
    return { day, month };
  });
}

export type RecipeReserveResult = { ok: true; day: number; month: number } | { ok: false; reason: 'user_limit' | 'month_limit' | 'global_limit' };

/** What has been used today, without using any. */
export async function peekAiUsage(uid: string, userDay: string, globalDayKey: string): Promise<{ byFeature: Partial<Record<AiFeature, number>>; recipeMonth: number; styleMonth: number; global: number }> {
  const [userSnap, monthSnap, globalSnap] = await Promise.all([userUsageDoc(uid, userDay).get(), userUsageDoc(uid, userDay.slice(0, 7)).get(), globalUsageDoc(globalDayKey).get()]);
  const data = userSnap.data() ?? {};
  return {
    byFeature: { chat: Number(data.chat ?? 0), briefing: Number(data.briefing ?? 0), parse: Number(data.parse ?? 0), quick: Number(data.quick ?? 0), recipe: Number(data.recipe ?? 0), promote: Number(data.promote ?? 0), style: Number(data.style ?? 0) },
    recipeMonth: Number(monthSnap.data()?.recipe ?? 0),
    styleMonth: Number(monthSnap.data()?.style ?? 0),
    global: Number(globalSnap.data()?.total ?? 0),
  };
}
