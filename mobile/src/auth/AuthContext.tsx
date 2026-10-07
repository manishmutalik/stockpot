/**
 * AuthContext.tsx
 *
 * Who is signed in, the API client that speaks as them, and the sign-in actions. `user` is `undefined` until Firebase has
 * said whether anyone is signed in (so the app shows nothing rather than flashing the sign-in screen), then the user or null.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut as fbSignOut,
  updateProfile, type User,
} from 'firebase/auth';
import { auth } from '../firebase';
import { createApi, type Api } from '../lib/api';
import { isDemoEmail } from '../lib/authErrors';
import { googleSignInAvailable, signInWithGoogle as googleSignIn, signOutGoogle } from '../lib/googleSignIn';
import { unregisterPush } from '../lib/push';

/** The server the app talks to, from `EXPO_PUBLIC_API_URL` (see .env.example). */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

interface AuthState {
  user: User | null | undefined;
  isDemo: boolean;
  api: Api;
  signIn: (email: string, password: string) => Promise<void>;
  /** Whether this build offers Google sign-in, and the sign-in itself ('cancelled' when the person closed Google's sheet). */
  googleAvailable: boolean;
  signInWithGoogle: () => Promise<'signed_in' | 'cancelled'>;
  resetPassword: (email: string) => Promise<void>;
  openDemo: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  const api = useMemo(() => createApi({ baseUrl: API_URL, getToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null) }), []);

  const signIn = useCallback(async (email: string, password: string) => { await signInWithEmailAndPassword(auth, email.trim(), password); }, []);
  const signInWithGoogle = useCallback(() => googleSignIn(auth), []);
  const resetPassword = useCallback(async (email: string) => { await sendPasswordResetEmail(auth, email.trim()); }, []);

  /** Signs out. This phone stops buzzing for this owner first (best effort, and never more than three seconds). */
  const signOut = useCallback(async () => {
    await Promise.race([unregisterPush(api), new Promise<void>(resolve => setTimeout(resolve, 3000))]);
    await fbSignOut(auth);
    await signOutGoogle();
  }, [api]);

  /** Makes a demo account, as the web's "Explore Demo Sandbox" does, and has the server fill it with the sample kitchen. */
  const openDemo = useCallback(async () => {
    const email = `demo_${Date.now()}_${Math.floor(Math.random() * 10000)}@bettereat.com`;
    const created = await createUserWithEmailAndPassword(auth, email, 'DemoPassword123!');
    try {
      await updateProfile(created.user, { displayName: 'Demo Owner' });
      await api.post('/api/mobile/demo/seed');
    } catch (err) {
      // Never leave the visitor signed in to an empty kitchen behind an error.
      await fbSignOut(auth).catch(() => {});
      throw err;
    }
  }, [api]);

  const value = useMemo<AuthState>(() => ({ user, isDemo: isDemoEmail(user?.email), api, signIn, googleAvailable: googleSignInAvailable, signInWithGoogle, resetPassword, openDemo, signOut }), [user, api, signIn, signInWithGoogle, resetPassword, openDemo, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
