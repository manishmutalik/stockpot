export type AuthAction = 'signIn' | 'reset' | 'demo';

const FALLBACK: Record<AuthAction, string> = {
  signIn: 'Could not sign in. Please try again.',
  reset: 'Could not send the reset email. Please try again.',
  demo: 'Could not open the demo kitchen. Please try again.',
};

/** A plain-words reason for a Firebase sign-in failure. */
export function describeAuthError(error: any, action: AuthAction): string {
  switch (error?.code) {
    case 'auth/network-request-failed': return 'Could not reach the sign-in service. Check your connection and try again.';
    case 'auth/too-many-requests':
    case 'auth/quota-exceeded': return 'Too many attempts right now. Please wait a few minutes and try again.';
    case 'auth/invalid-email': return 'That email address does not look right.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return action === 'reset' ? 'If that address has an account, a reset email is on its way.' : 'Invalid email or password.';
    case 'auth/operation-not-allowed': return 'Email sign-in is switched off for this app.';
    default: return FALLBACK[action];
  }
}

/** The sign-in screen makes demo accounts with an email like this; the server recognises them the same way. */
export const isDemoEmail = (email: string | null | undefined): boolean => !!email && /^demo_\d+_\d+@bettereat\.com$/i.test(email);
