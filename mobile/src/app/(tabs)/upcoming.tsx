import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { UpcomingOrder, UpcomingView } from '../../../../src/utils/quickApiTypes';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/Button';
import { HandOverSheet } from '../../components/HandOverSheet';
import { UpcomingCard } from '../../components/UpcomingCard';
import { countOrders, groupUpcoming } from '../../lib/upcoming';
import { shareMessage } from '../../lib/share';
import { useApiView } from '../../lib/useApiView';
import { colors, fonts } from '../../theme';

export default function Upcoming() {
  const { api } = useAuth();
  const insets = useSafeAreaInsets();
  const view = useApiView<UpcomingView>(api, '/api/mobile/upcoming');
  const [handing, setHanding] = useState<UpcomingOrder | null>(null);

  // Fresh figures each time the tab is opened (an order may have been booked or handed over since).
  const { refresh } = view;
  const first = useRef(true);
  useFocusEffect(useCallback(() => {
    if (first.current) first.current = false; // the first load is already under way
    else refresh();
  }, [refresh]));

  const sections = view.data ? groupUpcoming(view.data) : [];
  const confirm = (o: UpcomingOrder) => shareMessage({ message: o.confirmationMessage, whatsappUrl: o.whatsappUrl })
    .catch(() => Alert.alert('Could not open sharing', 'Try again, or copy the message from the order in the web app.'));

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32, paddingHorizontal: 16, gap: 16 }}
        refreshControl={<RefreshControl refreshing={view.refreshing} onRefresh={view.refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 24, color: colors.ink }}>Upcoming</Text>
          {!!view.data && countOrders(view.data) > 0 && <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.primary }}>{countOrders(view.data)} SCHEDULED</Text>}
        </View>

        {view.loading ? (
          <View style={{ paddingVertical: 32 }}><ActivityIndicator color={colors.primary} /></View>
        ) : view.error && !view.data ? (
          <View style={{ gap: 12 }}>
            <Text accessibilityRole="alert" style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.coral }}>{view.error}</Text>
            <Button label="Try again" onPress={view.refresh} busy={view.refreshing} />
          </View>
        ) : (
          <>
            {view.error && <Text accessibilityRole="alert" style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.coral }}>{view.error} Showing the last list.</Text>}
            {sections.length === 0 && (
              <View style={{ alignItems: 'center', gap: 8, paddingVertical: 48 }}>
                <MaterialIcons name="event-available" size={48} color={colors.primarySoft} />
                <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>No pre-orders booked</Text>
                <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.grey, textAlign: 'center' }}>Say “Priya wants two cakes for Saturday” on the Today screen to book one.</Text>
              </View>
            )}
            {sections.map(section => (
              <View key={section.key} style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {section.kind === 'overdue' && <MaterialIcons name="warning-amber" size={16} color={colors.coral} />}
                    <Text style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: section.kind === 'overdue' ? colors.coral : colors.grey }}>{section.title}</Text>
                  </View>
                  {!!section.subtitle && <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.grey }}>{section.subtitle}</Text>}
                </View>
                {section.orders.map(o => (
                  <UpcomingCard key={o.orderId} order={o} today={view.data!.today} currency={view.data!.currency} overdue={section.kind === 'overdue'}
                    onHandOver={() => setHanding(o)} onConfirm={() => confirm(o)} />
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <HandOverSheet order={handing} currency={view.data?.currency ?? { code: 'INR', symbol: '₹' }} api={api}
        onClose={() => { setHanding(null); view.refresh(); }} onDone={() => { setHanding(null); view.refresh(); }} />
    </>
  );
}
