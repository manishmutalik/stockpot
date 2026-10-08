/**
 * billStore.ts
 *
 * Server side of "view bill online". When the owner generates a bill, the
 * server (not the browser) reads the order from Firestore, builds the bill
 * with the same code the app uses, and stores a read-only snapshot at the
 * top-level `bills/{token}` document. The public page serves only that
 * snapshot, so:
 *  - orders live under users/{uid}/orders and are never exposed or queried by
 *    a public request;
 *  - Firestore security rules stay exactly as strict as before (the `bills`
 *    collection is denied to every client; only the Admin SDK touches it);
 *  - the page cannot show anything but what the bill shows: no customer phone,
 *    no other orders, no inventory or financials.
 *
 * The token is generated once per order (stored on it as `billToken`) and
 * reused, so links and QR codes already sent to a customer keep working. The
 * snapshot is refreshed each time the owner generates the bill again.
 */
import { getFirestore } from 'firebase-admin/firestore';
import type { BakerySettings, MenuItem, Order } from '../src/types';
import { buildBill, resolveBillToken, type Bill } from '../src/utils/billing';

const DEFAULT_CURRENCY = { code: 'INR', symbol: '₹' };

/**
 * A bill has optional fields that are simply left undefined (no logo, no UPI ID, no customer name). Firestore's Admin SDK refuses
 * a document with an `undefined` anywhere in it, so the snapshot is stored without them.
 */
const withoutUndefined = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export async function createOrRefreshBill(uid: string, orderId: string): Promise<{ token: string; bill: Bill } | null> {
  return writeBill(uid, [orderId], false);
}

/**
 * A consolidated bill (statement) for several of one owner's orders: one
 * token, stored as `statementToken` on each, reused on later calls (even when
 * the set of orders has changed) so a link already sent keeps working.
 */
export async function createOrRefreshStatement(uid: string, orderIds: string[]): Promise<{ token: string; bill: Bill } | null> {
  return writeBill(uid, orderIds, true);
}

async function writeBill(uid: string, orderIds: string[], statement: boolean): Promise<{ token: string; bill: Bill } | null> {
  const db = getFirestore();
  const user = db.collection('users').doc(uid);
  const ordersCol = user.collection('orders');

  // Every order must be this owner's (they are looked up under their own uid).
  const snaps = await Promise.all(orderIds.map(id => ordersCol.doc(id).get()));
  if (snaps.some(s => !s.exists)) return null;
  const picked = snaps.map(s => ({ id: s.id, ...s.data() }) as Order);

  // A multi-item order is always whole: every item that shares its group.
  const groupIds = [...new Set(picked.map(o => o.orderGroupId).filter((g): g is string => !!g))];
  const groupMembers = (await Promise.all(groupIds.map(g => ordersCol.where('orderGroupId', '==', g).get())))
    .flatMap(q => q.docs.map(d => ({ id: d.id, ...d.data() }) as Order));
  const byId = new Map<string, Order>();
  for (const o of [...picked, ...groupMembers]) byId.set(o.id, o);
  const members = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  if (!statement && members.length === 0) return null;

  const menuIds = [...new Set(members.map(o => o.menuItemId).filter(Boolean))];
  const menuSnaps = menuIds.length ? await db.getAll(...menuIds.map(id => user.collection('menu').doc(id))) : [];
  const menu = menuSnaps.filter(s => s.exists).map(s => ({ id: s.id, ...s.data() }) as MenuItem);

  const settingsData = (await user.collection('settings').doc('bakery').get()).data() || {};
  const settings = settingsData as Partial<BakerySettings> & { currency?: { code: string; symbol: string } };

  const tokenField = statement ? 'statementToken' : 'billToken';
  const { token } = resolveBillToken(members, tokenField);
  const bill = buildBill({
    statement,
    orders: members,
    menu,
    settings: {
      name: settings.name || '',
      address: settings.address || '',
      phone: settings.phone || '',
      logo: settings.logo || '',
      gstApplicable: settings.gstApplicable,
      gstRate: settings.gstRate,
      gstPricingMode: settings.gstPricingMode,
      upiId: settings.upiId,
    },
    currency: settings.currency || DEFAULT_CURRENCY,
  });

  const now = Date.now();
  const batch = db.batch();
  batch.set(db.collection('bills').doc(token), { uid, orderIds: members.map(o => o.id), bill: withoutUndefined(bill), updatedAt: now }, { merge: true });
  for (const m of members) {
    if (m[tokenField] !== token) batch.update(ordersCol.doc(m.id), { [tokenField]: token });
  }
  await batch.commit();

  return { token, bill };
}

/** The stored bill for a token, or null when there isn't one. */
export async function getPublicBill(token: string): Promise<Bill | null> {
  const snap = await getFirestore().collection('bills').doc(token).get();
  return snap.exists ? ((snap.data()?.bill as Bill | undefined) ?? null) : null;
}

/** A card or online payment started for a bill. The link is asked about afterwards; nothing on the customer's return is trusted. */
export interface PaymentAttempt {
  provider: 'razorpay' | 'cashfree';
  linkId: string;
  /** Where the customer pays. */
  url: string;
  /** What the link asks for, in rupees. */
  amount: number;
  /** The orders it settles. */
  orderIds: string[];
  createdAt: number;
  status: 'created' | 'settled';
  /** When the gateway was last asked, so a page that is opened again and again does not ask each time. */
  checkedAt?: number;
  settledAt?: number;
  paymentId?: string;
  /** The customer paid but the orders had already been marked paid (by hand), so nothing was marked: the owner has been paid twice. */
  note?: 'orders_already_paid';
}

/** The stored bill for a token with whose it is and any payment started. */
export interface BillRecord {
  uid: string;
  orderIds: string[];
  bill: Bill;
  payment?: PaymentAttempt;
}

export interface BillRecords {
  get(token: string): Promise<BillRecord | null>;
  savePayment(token: string, payment: PaymentAttempt): Promise<void>;
}

export function createAdminBillRecords(): BillRecords {
  const ref = (token: string) => getFirestore().collection('bills').doc(token);
  return {
    async get(token) {
      const snap = await ref(token).get();
      if (!snap.exists) return null;
      const d = snap.data() as Partial<BillRecord>;
      if (!d.bill) return null;
      // A bill made before these were stored still opens; it just has no payment side.
      return { uid: typeof d.uid === 'string' ? d.uid : '', orderIds: Array.isArray(d.orderIds) ? d.orderIds : [], bill: d.bill, ...(d.payment && { payment: d.payment }) };
    },
    async savePayment(token, payment) {
      await ref(token).set({ payment: withoutUndefined(payment) }, { merge: true });
    },
  };
}
