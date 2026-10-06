import React from 'react';
import { Alert, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { colors, fonts } from '../../theme';

export default function Settings() {
  const { user, isDemo, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const confirmSignOut = () => Alert.alert('Sign out?', isDemo ? 'The demo kitchen will be gone once you leave it.' : 'You will need your email and password to sign back in.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => { signOut().catch(() => {}); } },
  ]);

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 12, paddingHorizontal: 16, gap: 20 }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 22, color: colors.ink }}>Settings</Text>
      <Card style={{ gap: 4 }}>
        <Text style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: colors.grey }}>SIGNED IN AS</Text>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{isDemo ? 'Demo kitchen' : (user?.email ?? '')}</Text>
      </Card>
      <Button variant="quiet" label="Sign out" onPress={confirmSignOut} />
      <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.grey, textAlign: 'center' }}>Stockpot Quick {Constants.expoConfig?.version ?? ''}</Text>
    </View>
  );
}
