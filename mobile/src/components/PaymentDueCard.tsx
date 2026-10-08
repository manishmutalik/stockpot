import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { Currency, PaymentDueCustomer, PaymentDueSummary } from '../../../src/utils/quickApiTypes';
import { formatAmount } from '../../../src/utils/money';
import { formatDay } from '../lib/dates';
import { ordersLabel, waitingLabel, waitingTone } from '../lib/paymentsDue';
import { Card } from './Card';
import { SendStatementButton } from './SendStatementButton';
import { colors, fonts, radius, toneColor } from '../theme';

const tiny = { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: colors.grey } as const;

/** One customer who owes: who, how much, how long, what for (on the full list), with Send and Record payment. */
export function PaymentDueCard({ customer, currency, onRecord }: { customer: PaymentDueSummary & Partial<Pick<PaymentDueCustomer, 'orders'>>; currency: Currency; onRecord: () => void }) {
  const money = (n: number) => formatAmount(n, currency);
  const tone = waitingTone(customer.daysOutstanding);
  const toneHex = tone === 'grey' ? colors.grey : toneColor[tone];
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: colors.ink }}>{customer.name}</Text>
          {!!customer.phone && <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey }}>{customer.phone}</Text>}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={tiny}>DUE</Text>
          <Text style={{ fontFamily: fonts.mono, fontSize: 18, color: colors.coral }}>{money(customer.dueTotal)}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <View style={{ backgroundColor: `${toneHex}1F`, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Text style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.5, color: toneHex }}>{`WAITING ${waitingLabel(customer.daysOutstanding)}`.toUpperCase()}</Text>
        </View>
        <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey }}>{ordersLabel(customer.orderCount)} · since {formatDay(customer.oldestDate)}</Text>
      </View>

      {!!customer.orders && customer.orders.length > 0 && (
        <View style={{ backgroundColor: colors.inputFill, borderRadius: radius.md, padding: 12, gap: 8 }}>
          {customer.orders.map(o => (
            <View key={o.orderId} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flexShrink: 1 }}>
                <Text style={tiny}>{formatDay(o.date).toUpperCase()}</Text>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>{o.items.map(i => `${i.quantity} × ${i.name}`).join(', ')}</Text>
              </View>
              <Text style={{ fontFamily: fonts.mono, fontSize: 14, color: colors.ink }}>{money(o.due)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'stretch' }}>
        <View style={{ flex: 1.4 }}><SendStatementButton customer={customer} /></View>
        <Pressable
          accessibilityRole="button" accessibilityLabel={`Record a payment from ${customer.name}`} onPress={onRecord}
          style={({ pressed }) => ({ flex: 1, minHeight: 52, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: pressed ? colors.primaryPressed : colors.primary })}
        >
          <MaterialIcons name="currency-rupee" size={18} color={colors.white} />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.white }}>Got paid</Text>
        </Pressable>
      </View>
    </Card>
  );
}
