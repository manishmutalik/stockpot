/**
 * firebase.ts
 *
 * Firebase on the phone is for signing in only: the app reads and writes the business through the Stockpot server, never
 * Firestore directly. The sign-in is kept on the device (AsyncStorage) so the owner is not asked again every time.
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence, type Auth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import firebaseConfig from './firebaseConfig.json';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function makeAuth(): Auth {
  if (Platform.OS === 'web') return getAuth(app);
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // Already initialised (a fast refresh in development).
    return getAuth(app);
  }
}

export const auth = makeAuth();
