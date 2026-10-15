import { describe, it, expect } from 'vitest';
import { aiBlockedMessage, isDemoEmail, needsEmailVerification } from '../aiAccess';

describe('needsEmailVerification', () => {
  it('is true only for an email-and-password account whose address is not verified', () => {
    expect(needsEmailVerification({ email: 'asha@example.com', usesPassword: true, emailVerified: false })).toBe(true);
    expect(needsEmailVerification({ email: 'asha@example.com', usesPassword: true, emailVerified: true })).toBe(false);
    // Google sign-in: the address comes verified.
    expect(needsEmailVerification({ email: 'asha@example.com', usesPassword: false, emailVerified: false })).toBe(false);
    // Not known yet (an older sign-in record), or signed out.
    expect(needsEmailVerification({ email: 'asha@example.com' })).toBe(false);
    expect(needsEmailVerification(null)).toBe(false);
  });

  it('never asks the demo kitchen, which has no inbox', () => {
    expect(isDemoEmail('demo_1760000000000_42@bettereat.com')).toBe(true);
    expect(isDemoEmail('demo@bettereat.com')).toBe(false);
    expect(needsEmailVerification({ email: 'demo_1760000000000_42@bettereat.com', usesPassword: true, emailVerified: false })).toBe(false);
  });
});

describe('aiBlockedMessage', () => {
  it('tells an unverified account to verify its email', () => {
    expect(aiBlockedMessage('not_allowed', { unverified: true })).toMatch(/^Verify your email to use AI features/);
  });

  it('says why where the owner can act on it', () => {
    expect(aiBlockedMessage('subscription_required', { unverified: false })).toMatch(/active plan/);
    expect(aiBlockedMessage('demo_account', { unverified: false })).toMatch(/demo kitchen/);
  });

  it('keeps the features hidden where the owner cannot do anything', () => {
    // A verified account not let in yet, a server without AI, or no answer.
    expect(aiBlockedMessage('not_allowed', { unverified: false })).toBeNull();
    expect(aiBlockedMessage('unavailable', { unverified: true })).toBeNull();
    expect(aiBlockedMessage(null, { unverified: true })).toBeNull();
  });
});
