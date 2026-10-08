import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/Button';
import { MicButton } from '../../components/MicButton';
import { ShortcutChip } from '../../components/ShortcutChip';
import { AllClear, StatusRow } from '../../components/StatusRow';
import { Card } from '../../components/Card';
import { ToCollectCard } from '../../components/ToCollectCard';
import { draftStore } from '../../lib/useCapture';
import type { PersistedDraft } from '../../lib/draftStore';
import type { QuickKind } from '../../../../src/utils/quickApiTypes';
import { greeting } from '../../lib/greeting';
import { statusTarget } from '../../lib/statusLines';
import { useToday } from '../../lib/useApiView';
import { colors, fonts } from '../../theme';

export default function Today() {
  const { api, user, isDemo } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = useToday(api);

  // Open the capture screen: with a kind from a shortcut chip, or none to let the server work it out from the words.
  // In the demo kitchen it is never available.
  const capture = (kind?: QuickKind, opts?: { listen?: boolean }) => {
    if (isDemo) { Alert.alert('Not available in the demo', 'Voice and typed entry are not available in the demo kitchen. Sign in with your own account to use them.'); return; }
    router.push(kind || opts?.listen ? { pathname: '/capture', params: { ...(kind && { kind }), ...(opts?.listen && { listen: '1' }) } } : '/capture');
  };

  // Payments due is a view on the Upcoming tab; the parameter opens it there.
  const openPayments = () => router.navigate({ pathname: '/upcoming', params: { tab: 'payments' } });

  // An entry that was not saved is offered again, and the figures are refreshed when coming back from saving one.
  const [kept, setKept] = useState<PersistedDraft | null>(null);
  const { refresh } = today;
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    let live = true;
    draftStore.load().then(d => { if (live) setKept(d); });
    if (firstFocus.current) firstFocus.current = false; // the first load is already under way
    else refresh();
    return () => { live = false; };
  }, [refresh]));
  const discardKept = async () => { await draftStore.clear(); setKept(null); };

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
            return <StatusRow key={line.kind} line={line} onPress={target ? () => (target === 'payments' ? openPayments() : router.navigate('/upcoming')) : undefined} />;
          })}
          {today.data && <ToCollectCard pending={today.data.pendingPayments} currency={today.data.currency} onOpen={openPayments} />}
        </View>
      )}

      {kept && !isDemo && (
        <Card style={{ gap: 8 }}>
          <Text style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: colors.grey }}>PICK UP WHERE YOU LEFT OFF</Text>
          <Text numberOfLines={2} style={{ fontFamily: fonts.regular, fontSize: 15, color: colors.ink }}>“{kept.text}”</Text>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/capture', params: { resume: '1', ...(kept.kind && { kind: kept.kind }) } })}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.primary }}>Continue</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={discardKept}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.grey }}>Discard</Text>
            </Pressable>
          </View>
        </Card>
      )}

      <MicButton onPress={() => capture(undefined, { listen: true })} />

      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <ShortcutChip icon="receipt-long" label="New order" onPress={() => capture('order')} />
          <ShortcutChip icon="inventory-2" label="Stock in" onPress={() => capture('restock')} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <ShortcutChip icon="soup-kitchen" label="Production" onPress={() => capture('production')} />
          <ShortcutChip icon="currency-rupee" label="Payment" onPress={() => capture('payment')} />
        </View>
      </View>
    </ScrollView>
  );
}
