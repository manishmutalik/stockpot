/**
 * gatewayStore.ts
 *
 * Where an owner's payment gateway settings are kept: `users/{uid}/paymentGateway/active`. Only the server reads or writes it (the
 * Firestore rules match nothing under a user except the business collections, so a signed-in browser or phone is refused), and
 * the secret in it is encrypted (lib/secretBox.ts). The owner can read back which gateway it is and the last four characters of
 * the secret, never the secret.
 */
import { getFirestore } from 'firebase-admin/firestore';
import type { GatewayId } from './gateways/types';

export interface GatewayRecord {
  /** 'link' is a payment link the owner pasted: nothing is made or checked for it. */
  provider: GatewayId | 'link';
  keyId?: string;
  /** The secret, encrypted for this owner. */
  secretEnc?: string;
  secretLast4?: string;
  environment?: 'sandbox' | 'production';
  /** The gateway said these keys are for its test service, so no real money moves. */
  test?: boolean;
  /** For 'link': the https address of the owner's payment link. */
  link?: string;
  updatedAt: number;
}

export interface GatewayStore {
  get(uid: string): Promise<GatewayRecord | null>;
  put(uid: string, record: GatewayRecord): Promise<void>;
  remove(uid: string): Promise<void>;
}

/** Firestore refuses `undefined` anywhere in a document; optional fields are simply left out. */
const withoutUndefined = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function createAdminGatewayStore(): GatewayStore {
  const ref = (uid: string) => getFirestore().collection('users').doc(uid).collection('paymentGateway').doc('active');
  return {
    async get(uid) {
      const snap = await ref(uid).get();
      return snap.exists ? (snap.data() as GatewayRecord) : null;
    },
    async put(uid, record) {
      await ref(uid).set(withoutUndefined(record));
    },
    async remove(uid) {
      await ref(uid).delete();
    },
  };
}
