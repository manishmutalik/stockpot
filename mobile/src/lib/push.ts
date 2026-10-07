/**
 * push.ts
 *
 * Getting this phone ready for notifications and telling the server about it. Expo's push token is how the server's
 * notification job reaches the phone; it is saved against the signed-in owner (POST /api/mobile/push-token) and switched off
 * again when they sign out (DELETE), so a phone shared between two people only ever buzzes for whoever is signed in.
 *
 * Permission is asked for only when the owner turns notifications on from Settings, never at launch.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import type { Api } from './api';

export type PushPermission = 'unsupported' | 'denied' | 'undetermined' | 'granted';
export type PushFailure = 'unsupported' | 'simulator' | 'denied' | 'no_project' | 'failed';
export type PushResult = { ok: true } | { ok: false; reason: PushFailure };

/** The EAS project this build belongs to: Expo's push service needs it to issue a token. Set by `eas init`. */
function projectId(): string | undefined {
  return (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
}

/** The notification the owner last tapped (also the one that opened the app). Not available on the web, where there are none. */
export const useTappedNotification: () => Notifications.NotificationResponse | null | undefined =
  Platform.OS === 'web' ? () => null : Notifications.useLastNotificationResponse;

/** Show a notification that arrives while the app is open, quietly. Called once, at start-up. */
export function configureNotifications(): void {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export async function pushPermission(): Promise<PushPermission> {
  if (Platform.OS === 'web') return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

/**
 * Registers this phone for the signed-in owner. With `ask`, the permission is requested if it has not been (the owner has
 * just tapped "Turn on notifications"); without it, nothing is shown and the phone is only refreshed when already allowed.
 */
export async function registerForPush(api: Api, opts: { ask: boolean }): Promise<PushResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'unsupported' };
  if (!Device.isDevice) return { ok: false, reason: 'simulator' };
  try {
    if (Platform.OS === 'android') {
      // Android 13 and later will not show the permission question until a channel exists.
      await Notifications.setNotificationChannelAsync('default', { name: 'Stockpot Quick', importance: Notifications.AndroidImportance.HIGH });
    }
    let status = (await Notifications.getPermissionsAsync()).status;
    if (status !== 'granted' && opts.ask) status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return { ok: false, reason: 'denied' };

    const id = projectId();
    if (!id) return { ok: false, reason: 'no_project' };
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await api.post('/api/mobile/push-token', { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** Best effort, on sign-out: this phone stops buzzing for this owner. Never throws; signing out must not wait on it. */
export async function unregisterPush(api: Api): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  try {
    const id = projectId();
    if (!id || (await Notifications.getPermissionsAsync()).status !== 'granted') return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await api.delete('/api/mobile/push-token', { token });
  } catch { /* the phone is switched off the next time it is used by another owner, or never reached */ }
}

/** What to tell the owner when registering did not work. */
export function pushFailureMessage(reason: PushFailure): string {
  switch (reason) {
    case 'unsupported': return 'Notifications are not available on this device.';
    case 'simulator': return 'Notifications only work on a real phone, not an emulator.';
    case 'denied': return 'Notifications are blocked for Stockpot Quick. Turn them on in your phone\'s settings.';
    case 'no_project': return 'Notifications are not set up in this build of the app yet.';
    default: return 'Could not turn notifications on. Check your connection and try again.';
  }
}
