import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PaymentDueSummary, PaymentsDueView, UpcomingOrder, UpcomingView } from '../../../../src/utils/quickApiTypes';
import { formatAmount } from '../../../../src/utils/money';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/Button';
import { HandOverSheet } from '../../components/HandOverSheet';
import { PaymentDueCard } from '../../components/PaymentDueCard';
import { UpcomingCard } from '../../components/UpcomingCard';
import { ordersLabel, recordPaymentText, reviewClaim } from '../../lib/paymentsDue';
import { randomUUID } from 'expo-crypto';
import { countOrders, groupUpcoming } from '../../lib/upcoming';
import { shareMessage } from '../../lib/share';
import { useApiView } from '../../lib/useApiView';
import { colors, fonts, radius } from '../../theme';

type Tab = 'orders' | 'payments';

function Segment({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress}
      style={{ flex: 1, minHeight: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: active ? colors.card : 'transparent' }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: active ? colors.primary : colors.grey }}>{label}</Text>
      {count > 0 && (
        <View style={{ minWidth: 20, paddingHorizontal: 6, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.primary : colors.outline }}>
          <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.white }}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function Upcoming() {
  const { api, isDemo } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const view = useApiView<UpcomingView>(api, '/api/mobile/upcoming');
  const owed = useApiView<PaymentsDueView>(api, '/api/mobile/payments-due');
  const [handing, setHanding] = useState<UpcomingOrder | null>(null);
  const [tab, setTab] = useState<Tab>('orders');

  // Fresh figures each time the tab is opened (an order may have been booked, handed over or paid since).
  const { refresh } = view;
  const refreshOwed = owed.refresh;
  const first = useRef(true);
  useFocusEffect(useCallback(() => {
    if (first.current) first.current = false; // the first load is already under way
    else { refresh(); refreshOwed(); }
  }, [refresh, refreshOwed]));

  // Today opens this on Payments due with a parameter; it is used once, so choosing Pre-orders afterwards sticks.
  const wanted = params.tab;
  useFocusEffect(useCallback(() => {
    if (wanted === 'payments') { setTab('payments'); router.setParams({ tab: undefined }); }
  }, [wanted, router]));

  // A customer said on the bill page that they have paid by UPI: the owner confirms it, or says it did not come.
  const [reviewing, setReviewing] = useState<string | null>(null);
  const review = (c: PaymentDueSummary, action: 'confirm' | 'dismiss') => {
    if (!c.claim || reviewing) return;
    if (isDemo) { Alert.alert('Not available in the demo', 'Sign in with your own account to confirm payments.'); return; }
    const amount = formatAmount(c.claim.amount, owed.data?.currency ?? { code: 'INR', symbol: '₹' });
    const go = async () => {
      setReviewing(c.key);
      try {
        await reviewClaim(api, c.key, action, randomUUID());
        refreshOwed();
        refresh();
      } catch (e: any) {
        Alert.alert('Could not save that', e?.message ?? 'Please try again.');
      } finally {
        setReviewing(null);
      }
    };
    if (action === 'confirm') {
      Alert.alert(`${amount} from ${c.name}?`, `This marks it paid by UPI. Check that it reached your UPI app first.`, [
        { text: 'Cancel', style: 'cancel' }, { text: 'Confirm received', onPress: go },
      ]);
    } else {
      Alert.alert('Not received?', `${c.name} stays on the list as owing ${formatAmount(c.dueTotal, owed.data?.currency ?? { code: 'INR', symbol: '₹' })}. They can tell you again from the bill.`, [
        { text: 'Cancel', style: 'cancel' }, { text: 'Not received', style: 'destructive', onPress: go },
      ]);
    }
  };

  const recordPayment = (c: PaymentDueSummary) => {
    if (isDemo) { Alert.alert('Not available in the demo', 'Recording a payment is not available in the demo kitchen. Sign in with your own account to use it.'); return; }
    const text = recordPaymentText(c);
    router.push({ pathname: '/capture', params: { kind: 'payment', ...(text && { text }) } });
  };

  const sections = view.data ? groupUpcoming(view.data) : [];
  const confirm = (o: UpcomingOrder) => shareMessage({ message: o.confirmationMessage, whatsappUrl: o.whatsappUrl })
    .catch(() => Alert.alert('Could not open sharing', 'Try again, or copy the message from the order in the web app.'));

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32, paddingHorizontal: 16, gap: 16 }}
        refreshControl={<RefreshControl refreshing={view.refreshing || owed.refreshing} onRefresh={() => { view.refresh(); owed.refresh(); }} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 24, color: colors.ink }}>{tab === 'payments' ? 'Payments due' : 'Upcoming'}</Text>
          {tab === 'orders' && !!view.data && countOrders(view.data) > 0 && <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.primary }}>{countOrders(view.data)} SCHEDULED</Text>}
          {tab === 'payments' && !!owed.data && owed.data.total > 0 && <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.coral }}>{formatAmount(owed.data.total, owed.data.currency)} TO COLLECT</Text>}
        </View>

        <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: colors.inputFill, borderRadius: radius.md, padding: 4, gap: 4 }}>
          <Segment label="Pre-orders" count={view.data ? countOrders(view.data) : 0} active={tab === 'orders'} onPress={() => setTab('orders')} />
          <Segment label="Payments due" count={owed.data?.customers.length ?? 0} active={tab === 'payments'} onPress={() => setTab('payments')} />
        </View>

        {tab === 'payments' ? (
          owed.loading ? (
            <View style={{ paddingVertical: 32 }}><ActivityIndicator color={colors.primary} /></View>
          ) : owed.error && !owed.data ? (
            <View style={{ gap: 12 }}>
              <Text accessibilityRole="alert" style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.coral }}>{owed.error}</Text>
              <Button label="Try again" onPress={owed.refresh} busy={owed.refreshing} />
            </View>
          ) : (
            <>
              {owed.error && <Text accessibilityRole="alert" style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.coral }}>{owed.error} Showing the last list.</Text>}
              {owed.data && owed.data.customers.length === 0 && (
                <View style={{ alignItems: 'center', gap: 8, paddingVertical: 48 }}>
                  <MaterialIcons name="check-circle" size={48} color={colors.primarySoft} />
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>Nobody owes you anything</Text>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.grey, textAlign: 'center' }}>Orders left unpaid will appear here, with a button to send the customer what they owe.</Text>
                </View>
              )}
              {owed.data?.customers.map(c => (
                <PaymentDueCard key={c.key} customer={c} currency={owed.data!.currency} onRecord={() => recordPayment(c)}
                  onConfirmClaim={() => review(c, 'confirm')} onDismissClaim={() => review(c, 'dismiss')} claimBusy={reviewing === c.key} />
              ))}
              {!!owed.data && owed.data.customers.length > 0 && (
                <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.grey, textAlign: 'center' }}>
                  {ordersLabel(owed.data.customers.reduce((n, c) => n + c.orderCount, 0))} · pre-orders are listed here once they fall due
                </Text>
              )}
            </>
          )
        ) : null}

        {tab !== 'orders' ? null : view.loading ? (
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
        onClose={() => { setHanding(null); view.refresh(); }} onDone={() => { setHanding(null); view.refresh(); owed.refresh(); }} />
    </>
  );
}
