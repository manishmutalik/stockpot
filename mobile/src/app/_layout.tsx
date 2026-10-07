import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, useFonts as useManrope } from '@expo-google-fonts/manrope';
import { JetBrainsMono_600SemiBold, useFonts as useMono } from '@expo-google-fonts/jetbrains-mono';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { colors } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Routes() {
  const { user } = useAuth();
  const [manrope] = useManrope({ Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold });
  const [mono] = useMono({ JetBrainsMono_600SemiBold });
  const ready = (manrope && mono) && user !== undefined;
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
