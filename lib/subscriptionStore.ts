/**
 * subscriptionStore.ts
 *
 * Server-side subscription status, written only by billing routes (checkout
 * completion, Stripe webhooks) via the Firebase Admin SDK. Stored at
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
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: number | null; // unix seconds
  updatedAt: number;
}

const DEFAULT_BILLING: BillingInfo = {
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  status: 'none',
  currentPeriodEnd: null,
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
 * Looks up which Firebase uid a Stripe customer ID belongs to. Needed
 * because Stripe webhook events carry a Stripe customer/subscription ID,
 * not a Firebase uid — we store the mapping on the user doc at checkout
 * time and reverse-look-it-up here for events that arrive later
 * (subscription updated/canceled, invoice payment failed, etc.).
 */
export async function findUidByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
  const snap = await getFirestore()
    .collection('users')
    .where('billing.stripeCustomerId', '==', stripeCustomerId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}
