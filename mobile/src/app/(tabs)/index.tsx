import React from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/Button';
import { MicButton } from '../../components/MicButton';
import { ShortcutChip } from '../../components/ShortcutChip';
import { AllClear, StatusRow } from '../../components/StatusRow';
import { greeting } from '../../lib/greeting';
import { statusTarget } from '../../lib/statusLines';
import { useToday } from '../../lib/useToday';
import { colors, fonts } from '../../theme';

export default function Today() {
  const { api, user, isDemo } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = useToday(api);

  // Reading what the owner says arrives with the next update. In the demo kitchen it is never available.
  const capture = () => {
    if (isDemo) Alert.alert('Not available in the demo', 'Voice and typed entry are not available in the demo kitchen. Sign in with your own account to use them.');
    else Alert.alert('Coming soon', 'Telling Stockpot what happened arrives in the next update.');
  };

  const name = today.data?.businessName;
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32, paddingHorizontal: 16, gap: 20 }}
      refreshControl={<RefreshControl refreshing={today.refreshing} onRefresh={today.refresh} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      <View>
        <Text style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.5, color: colors.primary }}>STOCKPOT QUICK</Text>
        <Text accessibilityRole="header" numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 22, color: colors.ink, marginTop: 2 }}>
          {greeting(new Date().getHours(), user?.displayName)}
        </Text>
        {!!name && <Text style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: colors.grey, marginTop: 4 }}>{name.toUpperCase()}</Text>}
      </View>

      {today.loading ? (
        <View style={{ paddingVertical: 32 }}><ActivityIndicator color={colors.primary} /></View>
      ) : today.error && !today.data ? (
        <View style={{ gap: 12 }}>
          <Text accessibilityRole="alert" style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.coral }}>{today.error}</Text>
          <Button label="Try again" onPress={today.refresh} busy={today.refreshing} />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {today.error && <Text accessibilityRole="alert" style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.coral }}>{today.error} Showing the last figures.</Text>}
          {today.data && today.data.statusLines.length === 0 && <AllClear />}
          {today.data?.statusLines.map(line => {
            const target = statusTarget(line.kind);
            return <StatusRow key={line.kind} line={line} onPress={target ? () => router.navigate('/upcoming') : undefined} />;
          })}
        </View>
      )}

      <MicButton onPress={capture} />

      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <ShortcutChip icon="receipt-long" label="New order" onPress={capture} />
          <ShortcutChip icon="inventory-2" label="Stock in" onPress={capture} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <ShortcutChip icon="soup-kitchen" label="Production" onPress={capture} />
          <ShortcutChip icon="currency-rupee" label="Payment" onPress={capture} />
        </View>
      </View>
    </ScrollView>
  );
}
