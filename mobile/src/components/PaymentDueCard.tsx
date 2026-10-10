import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { Currency, PaymentDueCustomer, PaymentDueSummary } from '../../../src/utils/quickApiTypes';
import { formatAmount } from '../../../src/utils/money';
import { formatDay } from '../lib/dates';
import { claimLine, ordersLabel, waitingLabel, waitingTone } from '../lib/paymentsDue';
import { Card } from './Card';
import { SendStatementButton } from './SendStatementButton';
import { colors, fonts, radius, toneColor } from '../theme';

const tiny = { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: colors.grey } as const;

/**
 * The customer said on the bill page that they have paid by UPI. A UPI payment straight to the owner tells Stockpot nothing, so the
 * owner checks their UPI app and confirms it (marked paid by UPI) or says it did not come (the claim goes; they stay unpaid).
 */
function ClaimBanner({ line, busy, onConfirm, onDismiss }: { line: string; busy: boolean; onConfirm: () => void; onDismiss: () => void }) {
  return (
    <View accessibilityRole="summary" style={{ backgroundColor: `${colors.green}1A`, borderRadius: radius.md, padding: 12, gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <MaterialIcons name="mark-email-unread" size={18} color={colors.green} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>{line}</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.grey }}>Check your UPI app before you confirm.</Text>
        </View>
      </View>
      {busy ? <ActivityIndicator color={colors.green} /> : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Confirm the payment was received" onPress={onConfirm}
            style={({ pressed }) => ({ flex: 1.3, minHeight: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: pressed ? colors.greenPressed : colors.green })}>
            <MaterialIcons name="check" size={18} color={colors.white} />
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.white }}>Confirm received</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="The payment was not received" onPress={onDismiss}
            style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.canvas : colors.card, borderWidth: 1, borderColor: colors.outline })}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>Not received</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** One customer who owes: who, how much, how long, what for (on the full list), with Send and Record payment. */
export function PaymentDueCard({ customer, currency, onRecord, onConfirmClaim, onDismissClaim, claimBusy = false }: {
  customer: PaymentDueSummary & Partial<Pick<PaymentDueCustomer, 'orders'>>;
  currency: Currency;
  onRecord: () => void;
  onConfirmClaim?: () => void;
  onDismissClaim?: () => void;
  claimBusy?: boolean;
}) {
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

      {!!customer.claim && !!onConfirmClaim && !!onDismissClaim && (
        <ClaimBanner line={claimLine(customer.claim, customer, currency, Date.now())} busy={claimBusy} onConfirm={onConfirmClaim} onDismiss={onDismissClaim} />
      )}

      {!!customer.orders && customer.orders.length > 0 && (
        <View style={{ backgroundColor: colors.inputFill, borderRadius: radius.md, padding: 12, gap: 8 }}>
          {customer.orders.map(o => (
            <View key={o.orderId} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flexShrink: 1 }}>
                <Text style={tiny}>{formatDay(o.date).toUpperCase()}{o.claimed ? ' · SAYS PAID' : ''}</Text>
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
