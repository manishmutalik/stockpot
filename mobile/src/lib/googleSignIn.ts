/**
 * googleSignIn.ts
 *
 * "Continue with Google" on the phone: Google's own account sheet gives an ID token, and Firebase signs in with it, so it is
 * the same account (and the same kitchen) as signing in with that Google account on the website. The native library is only
 * loaded when the button is pressed (it does not exist on the web build or in tests), and the button only shows on Android
 * when a Web client ID is set (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, the "Web client ID" of Firebase's Google sign-in method).
 */
import { Platform } from 'react-native';
import { GoogleAuthProvider, signInWithCredential, type Auth } from 'firebase/auth';
import { GoogleSignInProblem } from './authErrors';

export const GOOGLE_WEB_CLIENT_ID = (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '').trim();

/** Whether this build can offer Google sign-in. */
export const googleSignInAvailable = Platform.OS === 'android' && GOOGLE_WEB_CLIENT_ID !== '';

type GoogleModule = typeof import('@react-native-google-signin/google-signin');
let configured = false;

function nativeGoogle(): GoogleModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@react-native-google-signin/google-signin') as GoogleModule;
  if (!configured) { mod.GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID }); configured = true; }
  return mod;
}

/** Signs in with a Google account. 'cancelled' when the person closed the sheet (not an error). Failures throw a message `describeAuthError(err, 'google')` can put in words. */
export async function signInWithGoogle(auth: Auth): Promise<'signed_in' | 'cancelled'> {
  if (!googleSignInAvailable) throw new GoogleSignInProblem('not_available');
  const { GoogleSignin, statusCodes } = nativeGoogle();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();
    if (result.type !== 'success') return 'cancelled';
    const idToken = result.data.idToken;
    if (!idToken) throw new GoogleSignInProblem('no_token');
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    return 'signed_in';
  } catch (err: any) {
    if (err instanceof GoogleSignInProblem || (typeof err?.code === 'string' && err.code.startsWith('auth/'))) throw err;
    if (err?.code === statusCodes.IN_PROGRESS) throw new GoogleSignInProblem('in_progress');
    if (err?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new GoogleSignInProblem('play_services');
    // Android's "developer error" (code 10): the app's package name and signing key are not registered for this client.
    if (/developer_error|\b10\b/i.test(`${err?.code ?? ''} ${err?.message ?? ''}`)) throw new GoogleSignInProblem('developer');
    throw err;
  }
}

/** Forgets the chosen Google account on this phone, so the next sign-in asks which one (best effort). */
export async function signOutGoogle(): Promise<void> {
  if (!googleSignInAvailable) return;
  try { await nativeGoogle().GoogleSignin.signOut(); } catch { /* nothing to forget */ }
}
