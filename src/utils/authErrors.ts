export type AuthAction = 'google' | 'email' | 'demo';

const FALLBACK: Record<AuthAction, string> = {
  google: 'Google login failed. Please try again.',
  email: 'Authentication failed. Please check your credentials.',
  demo: 'Failed to initialize demo sandbox. Please try again.',
};

/**
 * Turns a Firebase Auth / Firestore error into a message worth showing on the
 * sign-in screen. Firebase reports most problems with a `code` — including
 * project-side settings problems (a sign-in method switched off, an
 * unauthorised domain) that the user can't fix by retrying — so those are
 * called out instead of hiding behind a generic "try again".
 */
export function describeAuthError(error: any, action: AuthAction): string {
  const code: string = error?.code || '';
  switch (code) {
    case 'auth/operation-not-allowed':
      return action === 'google'
        ? 'Google sign-in is turned off for this app. Enable the Google provider in Firebase Authentication.'
        : action === 'demo'
        ? "The demo sandbox is unavailable: email/password sign-in is turned off for this app. Enable the Email/Password provider in Firebase Authentication (Sign-in method)."
        : 'Email/password sign-in is turned off for this app. Enable the Email/Password provider in Firebase Authentication (Sign-in method).';
    case 'auth/unauthorized-domain':
      return "This website's domain isn't authorised for sign-in. Add it under Firebase Authentication > Settings > Authorized domains.";
    case 'auth/network-request-failed':
      return "Couldn't reach the sign-in service. Check your connection and try again.";
    case 'auth/too-many-requests':
    case 'auth/quota-exceeded':
      return 'Too many attempts right now. Please wait a few minutes and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'The sign-in window was closed before finishing. Please try again.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
    case 'permission-denied':
    case 'firestore/permission-denied':
      return action === 'demo'
        ? "The demo sandbox couldn't save its sample data (the database refused the write). Please contact support."
        : FALLBACK[action];
    case 'auth/email-already-in-use': return 'Email already in use.';
    case 'auth/invalid-email': return 'Invalid email address.';
    case 'auth/weak-password': return 'Password is too weak.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Invalid email or password.';
    default:
      return FALLBACK[action];
  }
}
