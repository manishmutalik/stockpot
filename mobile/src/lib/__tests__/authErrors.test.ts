import { describe, it, expect } from 'vitest';
import { GoogleSignInProblem, describeAuthError, isDemoEmail } from '../authErrors';

describe('describeAuthError', () => {
  it('puts the usual sign-in failures in plain words', () => {
    expect(describeAuthError({ code: 'auth/wrong-password' }, 'signIn')).toBe('Invalid email or password.');
    expect(describeAuthError({ code: 'auth/network-request-failed' }, 'signIn')).toMatch(/connection/);
    expect(describeAuthError({ code: 'auth/too-many-requests' }, 'signIn')).toMatch(/wait a few minutes/);
    expect(describeAuthError(new Error('x'), 'signIn')).toBe('Could not sign in. Please try again.');
  });

  it('says what went wrong with Google\'s own sheet', () => {
    expect(describeAuthError(new GoogleSignInProblem('play_services'), 'google')).toMatch(/Play services/);
    expect(describeAuthError(new GoogleSignInProblem('in_progress'), 'google')).toMatch(/already open/);
    expect(describeAuthError(new GoogleSignInProblem('no_token'), 'google')).toMatch(/did not send back/);
    expect(describeAuthError(new GoogleSignInProblem('developer'), 'google')).toMatch(/signing key/);
    expect(describeAuthError(new GoogleSignInProblem('not_available'), 'google')).toMatch(/not switched on/);
  });

  it('explains a Google account whose email already has a password account, and a switched-off account', () => {
    expect(describeAuthError({ code: 'auth/account-exists-with-different-credential' }, 'google')).toMatch(/email and password/);
    expect(describeAuthError({ code: 'auth/user-disabled' }, 'google')).toMatch(/switched off/);
  });

  it('names Google, not email, when the provider is switched off, and falls back to a Google message', () => {
    expect(describeAuthError({ code: 'auth/operation-not-allowed' }, 'google')).toBe('Google sign-in is switched off for this app.');
    expect(describeAuthError({ code: 'auth/operation-not-allowed' }, 'signIn')).toBe('Email sign-in is switched off for this app.');
    expect(describeAuthError(new Error('boom'), 'google')).toBe('Could not sign in with Google. Please try again.');
  });
});

describe('isDemoEmail', () => {
  it('knows the demo kitchen\'s accounts and no others', () => {
    expect(isDemoEmail('demo_1_2@bettereat.com')).toBe(true);
    expect(isDemoEmail('priya@gmail.com')).toBe(false);
    expect(isDemoEmail(null)).toBe(false);
  });
});
