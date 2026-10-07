import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { Currency, UpcomingOrder } from '../../../src/utils/quickApiTypes';
import { formatAmount } from '../../../src/utils/money';
import { slotLabel } from '../lib/dates';
import { overdueLabel, paymentPill } from '../lib/upcoming';
import { stockProblem } from '../lib/handOver';
import { Card } from './Card';
import { colors, fonts, radius, toneColor } from '../theme';

const tiny = { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: colors.grey } as const;

function Chip({ text, tone }: { text: string; tone: 'teal' | 'coral' | 'green' | 'amber' | 'grey' }) {
  const c = tone === 'teal' ? colors.primary : tone === 'grey' ? colors.grey : toneColor[tone];
  return (
    <View style={{ backgroundColor: `${c}1F`, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 5 }}>
      <Text style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.5, color: c }}>{text.toUpperCase()}</Text>
    </View>
  );
}

function ActionButton({ label, icon, primary, grow = 1, onPress }: { label: string; icon: React.ComponentProps<typeof MaterialIcons>['name']; primary?: boolean; grow?: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({ flex: grow, minHeight: 46, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 8,
        backgroundColor: primary ? (pressed ? colors.primaryPressed : colors.primary) : colors.inputFill })}
    >
      <MaterialIcons name={icon} size={20} color={primary ? colors.white : colors.primary} />
      <Text numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: 13, color: primary ? colors.white : colors.primary, flexShrink: 1 }}>{label}</Text>
    </Pressable>
  );
}

/** One pre-order: who, what, when, how much is paid and what is left, with Hand over and Send confirmation. */
export function UpcomingCard({ order, today, currency, overdue, onHandOver, onConfirm }: {
  order: UpcomingOrder; today: string; currency: Currency; overdue: boolean; onHandOver: () => void; onConfirm: () => void;
}) {
  const money = (n: number) => formatAmount(n, currency);
  const pill = paymentPill(order);
  const slot = slotLabel(order.dueSlot);
  const short = stockProblem(order);
  return (
    <Card style={{ gap: 12, ...(overdue && { borderWidth: 1, borderColor: `${colors.coral}40` }) }}>
      {overdue && <Chip text={overdueLabel(order.date, today)} tone="coral" />}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: colors.ink }}>{order.customerName ?? 'No name given'}</Text>
          {!!order.customerPhone && <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey }}>{order.customerPhone}</Text>}
        </View>
        {!!slot && <Chip text={slot} tone="teal" />}
      </View>

      <View style={{ backgroundColor: colors.inputFill, borderRadius: radius.md, padding: 12, gap: 6 }}>
        {order.items.map(i => (
          <View key={`${i.menuItemId}-${i.name}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, flexShrink: 1 }}>{i.name}</Text>
            <Text style={{ fontFamily: fonts.mono, fontSize: 15, color: colors.ink }}>× {i.quantity}</Text>
          </View>
        ))}
      </View>

      {!!order.notes && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <MaterialIcons name="sticky-note-2" size={18} color={colors.grey} />
          <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey, flex: 1 }}>{order.notes}</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 20 }}>
          {!!order.advance && (
            <View>
              <Text style={tiny}>ADVANCE</Text>
              <Text style={{ fontFamily: fonts.mono, fontSize: 16, color: colors.ink }}>{money(order.advance.amount)}</Text>
            </View>
          )}
          <View>
            <Text style={tiny}>{order.balanceDue > 0.005 ? 'BALANCE DUE' : 'TOTAL'}</Text>
            <Text style={{ fontFamily: fonts.mono, fontSize: 16, color: order.balanceDue > 0.005 ? colors.coral : colors.ink }}>{money(order.balanceDue > 0.005 ? order.balanceDue : order.total)}</Text>
          </View>
        </View>
        <Chip text={pill.text} tone={pill.tone} />
      </View>

      {!!short && (
        <View style={{ flexDirection: 'row', gap: 8, backgroundColor: '#FFF4E0', borderRadius: radius.md, padding: 10 }}>
          <MaterialIcons name="warning-amber" size={18} color={colors.amber} />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.amber, flex: 1 }}>{short}</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <ActionButton label="Hand over" icon="inventory-2" primary onPress={onHandOver} />
        <ActionButton label="Send confirmation" icon="send" grow={1.6} onPress={onConfirm} />
      </View>
    </Card>
  );
}
