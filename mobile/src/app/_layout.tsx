import React, { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, useFonts as useManrope } from '@expo-google-fonts/manrope';
import { JetBrainsMono_600SemiBold, useFonts as useMono } from '@expo-google-fonts/jetbrains-mono';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { configureNotifications, registerForPush, useTappedNotification } from '../lib/push';
import { routeForNotification } from '../lib/notifications';
import { colors } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => {});
configureNotifications();

/** Keeps this phone registered while someone is signed in (only if they have already allowed notifications), and opens the screen a tapped notification is about. */
function useNotifications(ready: boolean) {
  const { user, isDemo, api } = useAuth();
  const router = useRouter();
  const last = useTappedNotification();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (user && !isDemo) registerForPush(api, { ask: false }).catch(() => {});
  }, [user, isDemo, api]);

  useEffect(() => {
    if (!ready || !user || !last) return;
    const id = `${last.notification.request.identifier}:${last.actionIdentifier}`;
    if (handled.current === id) return;
    handled.current = id;
    const route = routeForNotification(last.notification.request.content.data);
    if (route) router.push(route.params ? { pathname: route.pathname, params: route.params } : route.pathname);
  }, [ready, user, last, router]);
}

function Routes() {
  const { user } = useAuth();
  const [manrope] = useManrope({ Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold });
  const [mono] = useMono({ JetBrainsMono_600SemiBold });
  const ready = (manrope && mono) && user !== undefined;
  useNotifications(ready);
  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);
  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="capture" options={{ animation: 'slide_from_bottom' }} />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Routes />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
