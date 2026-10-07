export type AuthAction = 'signIn' | 'reset' | 'demo' | 'google';

const FALLBACK: Record<AuthAction, string> = {
  signIn: 'Could not sign in. Please try again.',
  reset: 'Could not send the reset email. Please try again.',
  demo: 'Could not open the demo kitchen. Please try again.',
  google: 'Could not sign in with Google. Please try again.',
};

export type GoogleProblemKind = 'not_available' | 'no_token' | 'in_progress' | 'play_services' | 'developer';

/** What went wrong with Google's own sign-in sheet (as opposed to Firebase, which has `auth/...` codes). */
export class GoogleSignInProblem extends Error {
  readonly googleProblem: GoogleProblemKind;
  constructor(kind: GoogleProblemKind) { super(`google sign-in: ${kind}`); this.googleProblem = kind; }
}

const GOOGLE_PROBLEMS: Record<GoogleProblemKind, string> = {
  not_available: 'Google sign-in is not switched on in this version of the app.',
  no_token: 'Google did not send back a sign-in. Please try again.',
  in_progress: 'Google sign-in is already open. Finish or close it first.',
  play_services: 'Google Play services are missing or out of date on this phone. Update them and try again.',
  developer: 'Google sign-in is not set up for this build yet: this app\'s signing key is not registered with Google.',
};

/** A plain-words reason for a Firebase sign-in failure. */
export function describeAuthError(error: any, action: AuthAction): string {
  const problem = error?.googleProblem as GoogleProblemKind | undefined;
  if (problem && problem in GOOGLE_PROBLEMS) return GOOGLE_PROBLEMS[problem];
  switch (error?.code) {
    case 'auth/network-request-failed': return 'Could not reach the sign-in service. Check your connection and try again.';
    case 'auth/too-many-requests':
    case 'auth/quota-exceeded': return 'Too many attempts right now. Please wait a few minutes and try again.';
    case 'auth/invalid-email': return 'That email address does not look right.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return action === 'reset' ? 'If that address has an account, a reset email is on its way.' : 'Invalid email or password.';
    case 'auth/operation-not-allowed': return action === 'google' ? 'Google sign-in is switched off for this app.' : 'Email sign-in is switched off for this app.';
    case 'auth/account-exists-with-different-credential': return 'This email already has an account that uses a password. Sign in with your email and password.';
    case 'auth/user-disabled': return 'This account has been switched off. Please contact support.';
    default: return FALLBACK[action];
  }
}

/** The sign-in screen makes demo accounts with an email like this; the server recognises them the same way. */
export const isDemoEmail = (email: string | null | undefined): boolean => !!email && /^demo_\d+_\d+@bettereat\.com$/i.test(email);
