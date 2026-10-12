import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { Currency, PaymentDueSummary, TodayView } from '../../../src/utils/quickApiTypes';
import { formatAmount } from '../../../src/utils/money';
import { ordersLabel, sendLabel, waitingLabel, waitingTone } from '../lib/paymentsDue';
import { useSendStatement } from '../lib/useSendStatement';
import { billState } from '../lib/billSent';
import { Card } from './Card';
import { colors, fonts, radius, toneColor } from '../theme';

function Row({ customer, currency, last, onOpen, onSent }: { customer: PaymentDueSummary; currency: Currency; last: boolean; onOpen: () => void; onSent?: () => void }) {
  const { send, busy } = useSendStatement(customer.key, onSent);
  // Sent in the last two days: no Send (tapping the row opens the list, with Mark as paid). Two days on, still unpaid: Remind.
  const bill = billState(customer.billSentAt, Date.now());
  const tone = waitingTone(customer.daysOutstanding);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.inputFill }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${customer.name} owes ${formatAmount(customer.dueTotal, currency)}. See the list`} onPress={onOpen} style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{customer.name}</Text>
          {!!customer.claim && (
            <View style={{ backgroundColor: `${colors.green}1F`, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.5, color: colors.green }}>SAYS PAID</Text>
            </View>
          )}
        </View>
        <Text numberOfLines={1} style={{ fontFamily: fonts.regular, fontSize: 13, color: tone === 'grey' ? colors.grey : toneColor[tone] }}>
          {`${formatAmount(customer.dueTotal, currency)} · ${ordersLabel(customer.orderCount)} · ${waitingLabel(customer.daysOutstanding)}`}
        </Text>
      </Pressable>
      {bill === 'sent' ? (
        <View accessibilityLabel={`Bill sent to ${customer.name}`} style={{ minHeight: 44, minWidth: 88, borderRadius: radius.md, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.canvas }}>
          <MaterialIcons name="done-all" size={18} color={colors.grey} />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.grey }}>Sent</Text>
        </View>
      ) : (
      <Pressable
        accessibilityRole="button" accessibilityLabel={`${bill === 'unpaid_after_bill' ? 'Send a reminder' : sendLabel(customer)} to ${customer.name}`} accessibilityState={{ busy }} disabled={busy} onPress={send}
        style={({ pressed }) => ({ minHeight: 44, minWidth: 88, borderRadius: radius.md, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: pressed ? colors.canvas : colors.inputFill })}
      >
        {busy ? <ActivityIndicator color={colors.primary} /> : (
          <>
            <MaterialIcons name={bill === 'unpaid_after_bill' ? 'notifications-active' : 'receipt-long'} size={18} color={colors.primary} />
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.primary }}>{bill === 'unpaid_after_bill' ? 'Remind' : 'Send'}</Text>
          </>
        )}
      </Pressable>
      )}
    </View>
  );
}

/** The three who owe most, on the main screen, each with a Send button; "See all" opens the whole Payments due list. */
export function ToCollectCard({ pending, currency, onOpen, onSent }: { pending: TodayView['pendingPayments']; currency: Currency; onOpen: () => void; onSent?: () => void }) {
  if (pending.total <= 0 || pending.top.length === 0) return null;
  const more = pending.customers - pending.top.length;
  return (
    <Card style={{ paddingBottom: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: colors.grey }}>TO COLLECT</Text>
        <Text style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.coral }}>{formatAmount(pending.total, currency)}</Text>
      </View>
      {pending.top.map((c, i) => <Row key={c.key} customer={c} currency={currency} last={i === pending.top.length - 1 && more <= 0} onOpen={onOpen} onSent={onSent} />)}
      {more > 0 && (
        <Pressable accessibilityRole="button" onPress={onOpen} style={{ paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.primary }}>{`See all ${pending.customers} who owe`}</Text>
          <MaterialIcons name="chevron-right" size={18} color={colors.primary} />
        </Pressable>
      )}
    </Card>
  );
}
