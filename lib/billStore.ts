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

export async function createOrRefreshBill(uid: string, orderId: string): Promise<{ token: string; bill: Bill } | null> {
  const db = getFirestore();
  const user = db.collection('users').doc(uid);
  const ordersCol = user.collection('orders');

  const orderSnap = await ordersCol.doc(orderId).get();
  if (!orderSnap.exists) return null;
  const order = { id: orderSnap.id, ...orderSnap.data() } as Order;

  // A multi-item order is one bill: every item that shares its group.
  const members: Order[] = order.orderGroupId
    ? (await ordersCol.where('orderGroupId', '==', order.orderGroupId).get()).docs.map(d => ({ id: d.id, ...d.data() }) as Order)
    : [order];

  const menuIds = [...new Set(members.map(o => o.menuItemId).filter(Boolean))];
  const menuSnaps = menuIds.length ? await db.getAll(...menuIds.map(id => user.collection('menu').doc(id))) : [];
  const menu = menuSnaps.filter(s => s.exists).map(s => ({ id: s.id, ...s.data() }) as MenuItem);

  const settingsData = (await user.collection('settings').doc('bakery').get()).data() || {};
  const settings = settingsData as Partial<BakerySettings> & { currency?: { code: string; symbol: string } };

  const { token } = resolveBillToken(members);
  const bill = buildBill({
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
  batch.set(db.collection('bills').doc(token), { uid, orderIds: members.map(o => o.id), bill, updatedAt: now }, { merge: true });
  for (const m of members) {
    if (m.billToken !== token) batch.update(ordersCol.doc(m.id), { billToken: token });
  }
  await batch.commit();

  return { token, bill };
}

/** The stored bill for a token, or null when there isn't one. */
export async function getPublicBill(token: string): Promise<Bill | null> {
  const snap = await getFirestore().collection('bills').doc(token).get();
  return snap.exists ? ((snap.data()?.bill as Bill | undefined) ?? null) : null;
}
