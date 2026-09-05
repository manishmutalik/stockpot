/**
 * integrationStore.ts
 *
 * Server-side storage for third-party integration credentials (Shopify access
 * tokens, Odoo username/password, etc.), keyed by the authenticated Firebase
 * uid and encrypted at rest.
 *
 * Stored in Firestore (via firebase-admin, which bypasses client security
 * rules) at `users/{uid}/integrationCredentials/{provider}` — NOT in a local
 * SQLite file. A local file only lives on one server instance's disk, which
 * breaks the moment you deploy to a platform that redeploys onto fresh disk,
 * runs more than one instance, or uses ephemeral/serverless compute — all
 * realistic scenarios once this app has paying customers depending on
 * uptime. Firestore has no such constraint: it works identically regardless
 * of how many server instances are running or which platform hosts them.
 *
 * `firestore.rules` explicitly denies client-side read/write access to the
 * `integrationCredentials` subcollection — only this server-side Admin SDK
 * code (which bypasses rules entirely) is meant to touch it, and defense in
 * depth means it should stay unreachable to end users even if a route were
 * ever mistakenly exposed.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { encrypt, decrypt } from './crypto';

export type Provider = 'shopify' | 'odoo';

function credentialDoc(uid: string, provider: Provider) {
  return getFirestore()
    .collection('users').doc(uid)
    .collection('integrationCredentials').doc(provider);
}

export async function saveCredentials(uid: string, provider: Provider, data: object): Promise<void> {
  const enc = encrypt(JSON.stringify(data));
  await credentialDoc(uid, provider).set({ data: enc, updatedAt: Date.now() });
}

export async function getCredentials<T = Record<string, unknown>>(uid: string, provider: Provider): Promise<T | null> {
  const snap = await credentialDoc(uid, provider).get();
  if (!snap.exists) return null;
  const stored = snap.data() as { data: string } | undefined;
  if (!stored?.data) return null;
  return JSON.parse(decrypt(stored.data)) as T;
}

export async function deleteCredentials(uid: string, provider: Provider): Promise<void> {
  await credentialDoc(uid, provider).delete();
}
