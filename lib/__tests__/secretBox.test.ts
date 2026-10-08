import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { decryptSecret, encryptSecret, readSecretKey } from '../secretBox';

const key = crypto.randomBytes(32);

describe('secretBox', () => {
  it('round-trips a secret, and never stores it in the clear', () => {
    const stored = encryptSecret('s3cr3t-key-value', key, 'u1');
    expect(stored).not.toContain('s3cr3t');
    expect(stored.startsWith('v1.')).toBe(true);
    expect(decryptSecret(stored, key, 'u1')).toBe('s3cr3t-key-value');
  });

  it('makes a different ciphertext each time for the same secret', () => {
    expect(encryptSecret('same', key, 'u1')).not.toBe(encryptSecret('same', key, 'u1'));
  });

  it('refuses a secret copied to another owner, made with another key, or changed', () => {
    const stored = encryptSecret('secret', key, 'u1');
    expect(decryptSecret(stored, key, 'u2')).toBeNull();
    expect(decryptSecret(stored, crypto.randomBytes(32), 'u1')).toBeNull();
    const parts = stored.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(decryptSecret(parts.join('.'), key, 'u1')).toBeNull();
    parts[3] = stored.split('.')[3];
    parts[2] = crypto.randomBytes(16).toString('base64url');
    expect(decryptSecret(parts.join('.'), key, 'u1')).toBeNull();
  });

  it('answers null, not an error, for anything that is not a stored secret', () => {
    for (const bad of [undefined, null, 5, '', 'v1', 'v2.a.b.c', 'v1.a.b', 'plain text']) expect(decryptSecret(bad, key, 'u1')).toBeNull();
  });

  it('reads the key from the environment: 32 bytes in base64, or nothing', () => {
    expect(readSecretKey({ PAYMENT_SECRETS_KEY: key.toString('base64') })!.equals(key)).toBe(true);
    for (const bad of [undefined, '', '   ', 'tooshort', crypto.randomBytes(16).toString('base64'), crypto.randomBytes(40).toString('base64')]) {
      expect(readSecretKey({ PAYMENT_SECRETS_KEY: bad })).toBeNull();
    }
  });
});
