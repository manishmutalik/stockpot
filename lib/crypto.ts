/**
 * crypto.ts
 *
 * Small helper for encrypting integration credentials (Odoo password, Shopify
 * token, etc.) before they're written to disk. Uses AES-256-GCM with a key
 * derived from SESSION_ENC_KEY. This is NOT a replacement for a proper secrets
 * manager in a larger deployment, but it's a meaningful improvement over
 * storing plaintext credentials in client-readable cookies.
 */
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const secret = process.env.SESSION_ENC_KEY;
  if (!secret) {
    throw new Error(
      'SESSION_ENC_KEY environment variable is required. Generate one with: ' +
      "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  // Derive a fixed-length 32-byte key regardless of the input string's length.
  return crypto.createHash('sha256').update(secret).digest();
}

/** Encrypts a UTF-8 string, returning a single base64 payload (iv + authTag + ciphertext). */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/** Reverses encrypt(). Throws if the payload was tampered with or the key is wrong. */
export function decrypt(payload: string): string {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
