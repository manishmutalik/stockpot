/**
 * secretBox.ts
 *
 * Encrypts the payment gateway keys an owner saves, so a copy of the database (a backup, a leaked export) does not hold them in
 * the clear. AES-256-GCM with a fresh random nonce each time. The owner's uid is bound in as additional authenticated data, so a
 * stored secret copied into another owner's document does not decrypt. The key is the PAYMENT_SECRETS_KEY environment variable
 * (32 random bytes, base64); without it nothing can be saved or read, and the settings say why.
 *
 * Stored form: "v1.<nonce>.<tag>.<ciphertext>", each part base64url.
 */
import crypto from 'node:crypto';

const VERSION = 'v1';

/** The key from the environment: 32 bytes in base64. Null when it is missing or the wrong size. */
export function readSecretKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const raw = env.PAYMENT_SECRETS_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  return key.length === 32 ? key : null;
}

export function encryptSecret(plain: string, key: Buffer, uid: string): string {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(uid, 'utf8'));
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

/** The secret, or null if it was tampered with, belongs to another owner, was made with another key or is not in this form. */
export function decryptSecret(stored: unknown, key: Buffer, uid: string): string | null {
  if (typeof stored !== 'string') return null;
  const [version, nonce, tag, data] = stored.split('.');
  if (version !== VERSION || !nonce || !tag || !data) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64url'));
    decipher.setAAD(Buffer.from(uid, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
