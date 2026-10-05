/**
 * subscriptionStore.ts
 *
 * Server-side subscription status, written only by billing routes (payment
 * verification, Razorpay webhooks) via the Firebase Admin SDK. Stored at
 * `users/{uid}` on a `billing` field, readable by the owning client (so the
 * app can gate features / show plan status) but NOT writable by the client —
 * only the trusted server can change subscription status, since it's what
 * decides whether someone has paid.
 */
import { getFirestore } from 'firebase-admin/firestore';

export type SubscriptionStatus =
  | 'none'        // never subscribed
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete';

export interface BillingInfo {
  /** The Razorpay subscription this account is currently on (the latest one started). */
  razorpaySubscriptionId: string | null;
  status: SubscriptionStatus;
  /** Unix seconds: when the trial ends or the current period renews or ends. */
  currentPeriodEnd: number | null;
  /** True once a payment mandate was approved, so cancelling and re-subscribing never gives a second free trial. */
  trialUsed: boolean;
  /** The subscription will end at the end of the period already paid for. */
  cancelScheduled: boolean;
  /** Millisecond time of the newest webhook applied, so a late, older one cannot undo a newer one. */
  lastEventAt: number;
  updatedAt: number;
}

const DEFAULT_BILLING: BillingInfo = {
  razorpaySubscriptionId: null,
  status: 'none',
  currentPeriodEnd: null,
  trialUsed: false,
  cancelScheduled: false,
  lastEventAt: 0,
  updatedAt: 0,
};

function userDoc(uid: string) {
  return getFirestore().collection('users').doc(uid);
}

export async function getBillingInfo(uid: string): Promise<BillingInfo> {
  const snap = await userDoc(uid).get();
  const billing = snap.data()?.billing as Partial<BillingInfo> | undefined;
  return { ...DEFAULT_BILLING, ...billing };
}

export async function setBillingInfo(uid: string, billing: Partial<BillingInfo>): Promise<void> {
  await userDoc(uid).set(
    { billing: { ...billing, updatedAt: Date.now() } },
    { merge: true }
  );
}

/** True for statuses that should be treated as "has app access". */
export function hasActiveAccess(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing';
}

/**
 * Looks up which Firebase uid owns a Razorpay subscription. Webhooks carry the
 * uid in the subscription's notes; this is the fallback for one that does not.
 */
export async function findUidByRazorpaySubscriptionId(subscriptionId: string): Promise<string | null> {
  const snap = await getFirestore()
    .collection('users')
    .where('billing.razorpaySubscriptionId', '==', subscriptionId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}
