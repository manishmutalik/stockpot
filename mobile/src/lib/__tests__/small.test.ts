import { describe, it, expect } from 'vitest';
import { greeting } from '../greeting';
import { describeAuthError, isDemoEmail } from '../authErrors';
import { statusTarget } from '../statusLines';

describe('greeting', () => {
  it('goes by the hour and uses the first name', () => {
    expect(greeting(6, 'Anita Rao')).toBe('Good morning, Anita');
    expect(greeting(11, '  Anita ')).toBe('Good morning, Anita');
    expect(greeting(12, 'Anita')).toBe('Good afternoon, Anita');
    expect(greeting(16, 'Anita')).toBe('Good afternoon, Anita');
    expect(greeting(17, 'Anita')).toBe('Good evening, Anita');
    expect(greeting(23, 'Anita')).toBe('Good evening, Anita');
  });
  it('leaves the name out when there is none', () => {
    expect(greeting(8, null)).toBe('Good morning');
    expect(greeting(8, '   ')).toBe('Good morning');
    expect(greeting(8)).toBe('Good morning');
  });
});

describe('describeAuthError', () => {
  it('speaks plainly and does not reveal whether an account exists when resetting', () => {
    expect(describeAuthError({ code: 'auth/invalid-credential' }, 'signIn')).toBe('Invalid email or password.');
    expect(describeAuthError({ code: 'auth/wrong-password' }, 'signIn')).toBe('Invalid email or password.');
    expect(describeAuthError({ code: 'auth/user-not-found' }, 'reset')).toMatch(/If that address has an account/);
    expect(describeAuthError({ code: 'auth/network-request-failed' }, 'signIn')).toMatch(/connection/);
    expect(describeAuthError({ code: 'auth/too-many-requests' }, 'signIn')).toMatch(/Too many attempts/);
    expect(describeAuthError({ code: 'auth/invalid-email' }, 'signIn')).toMatch(/email address/);
  });
  it('falls back by what was being tried', () => {
    expect(describeAuthError({}, 'signIn')).toMatch(/sign in/);
    expect(describeAuthError(null, 'reset')).toMatch(/reset/);
    expect(describeAuthError(undefined, 'demo')).toMatch(/demo kitchen/);
  });
});

describe('isDemoEmail', () => {
  it('recognises only the accounts the sign-in screen makes', () => {
    expect(isDemoEmail('demo_1759_42@bettereat.com')).toBe(true);
    expect(isDemoEmail('DEMO_1759_42@BETTEREAT.COM')).toBe(true);
    for (const e of ['asha@example.com', 'demo@bettereat.com', 'demo_1_2@bettereat.com.evil.com', '', null, undefined]) expect(isDemoEmail(e as any), String(e)).toBe(false);
  });
});

describe('statusTarget', () => {
  it('opens Upcoming for orders due, Payments due for pending payments, and nothing else yet', () => {
    expect(statusTarget('orders_due')).toBe('upcoming');
    expect(statusTarget('payments_pending')).toBe('payments');
    for (const k of ['running_low', 'use_by_soon', 'profit'] as const) expect(statusTarget(k)).toBeNull();
  });
});
