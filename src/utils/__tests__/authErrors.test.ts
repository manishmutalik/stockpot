import { describe, it, expect } from 'vitest';
import { describeAuthError } from '../authErrors';

describe('describeAuthError', () => {
  it('names a disabled email/password provider, differently for demo and email sign-in', () => {
    const e = { code: 'auth/operation-not-allowed' };
    expect(describeAuthError(e, 'demo')).toMatch(/demo sandbox is unavailable.*Email\/Password provider/);
    expect(describeAuthError(e, 'email')).toMatch(/Email\/password sign-in is turned off/);
    expect(describeAuthError(e, 'google')).toMatch(/Google sign-in is turned off/);
  });

  it('explains network, rate limit, popup and domain problems', () => {
    expect(describeAuthError({ code: 'auth/network-request-failed' }, 'demo')).toMatch(/Check your connection/);
    expect(describeAuthError({ code: 'auth/too-many-requests' }, 'demo')).toMatch(/Too many attempts/);
    expect(describeAuthError({ code: 'auth/popup-blocked' }, 'google')).toMatch(/blocked/);
    expect(describeAuthError({ code: 'auth/unauthorized-domain' }, 'google')).toMatch(/Authorized domains/);
  });

  it('keeps the existing email messages', () => {
    expect(describeAuthError({ code: 'auth/email-already-in-use' }, 'email')).toBe('Email already in use.');
    expect(describeAuthError({ code: 'auth/invalid-email' }, 'email')).toBe('Invalid email address.');
    expect(describeAuthError({ code: 'auth/weak-password' }, 'email')).toBe('Password is too weak.');
    expect(describeAuthError({ code: 'auth/wrong-password' }, 'email')).toBe('Invalid email or password.');
    expect(describeAuthError({ code: 'auth/user-not-found' }, 'email')).toBe('Invalid email or password.');
  });

  it('flags a refused database write while seeding the demo', () => {
    expect(describeAuthError({ code: 'permission-denied' }, 'demo')).toMatch(/refused the write/);
  });

  it('falls back to a generic message per action', () => {
    expect(describeAuthError(new Error('boom'), 'demo')).toBe('Failed to initialize demo sandbox. Please try again.');
    expect(describeAuthError(undefined, 'google')).toBe('Google login failed. Please try again.');
    expect(describeAuthError({}, 'email')).toBe('Authentication failed. Please check your credentials.');
  });
});
