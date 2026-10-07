import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import type { Currency, HandOverSaved, PaymentMethodId, UpcomingOrder } from '../../../src/utils/quickApiTypes';
import { formatAmount } from '../../../src/utils/money';
import { ApiError, describeApiError, type Api } from '../lib/api';
import { formatDay, slotLabel } from '../lib/dates';
import { METHODS, METHOD_LABEL, handOverRequest, stockProblem, summarizeHandOver } from '../lib/handOver';
import { shareMessage } from '../lib/share';
import { Button } from './Button';
import { Card } from './Card';
import { colors, fonts, radius } from '../theme';

/**
 * The hand-over sheet: what is being handed over, what is still owed, whether the balance is received now (and how), then
 * Complete. One idempotency key per opening of the sheet, so a retry after a poor connection cannot hand the order over twice.
 */
export function HandOverSheet({ order, currency, api, onClose, onDone }: {
  order: UpcomingOrder | null; currency: Currency; api: Api; onClose: () => void; onDone: () => void;
}) {
  return (
    <Modal visible={!!order} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(43,49,61,0.4)', justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
        {order && <Sheet key={order.orderId} order={order} currency={currency} api={api} onClose={onClose} onDone={onDone} />}
      </View>
    </Modal>
  );
}

function Sheet({ order, currency, api, onClose, onDone }: { order: UpcomingOrder; currency: Currency; api: Api; onClose: () => void; onDone: () => void }) {
  const money = (n: number) => formatAmount(n, currency);
  const key = useMemo(() => randomUUID(), []);
  const [receive, setReceive] = useState(false);
  const [method, setMethod] = useState<PaymentMethodId>('upi');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<HandOverSaved | null>(null);
  const owes = order.balanceDue > 0.005;
  const problem = stockProblem(order);
  const slot = slotLabel(order.dueSlot);

  const complete = async () => {
    setBusy(true); setError(null);
    try {
      const request = handOverRequest(order, { receiveBalance: receive, method });
      setSaved(await api.post<HandOverSaved>(request.path, request.body, { idempotencyKey: key }));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? 'No connection. Nothing was changed; try again when you are back online.' : describeApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const summary = saved ? summarizeHandOver(saved, currency) : null;
  return (
    <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%' }}>
      <View style={{ alignItems: 'center', paddingTop: 10 }}><View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.outline }} /></View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        {summary ? (
          <View style={{ alignItems: 'center', gap: 14, paddingVertical: 8 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: `${colors.green}1F`, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialIcons name="check" size={40} color={colors.green} />
            </View>
            <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 22, color: colors.ink }}>{summary.title}</Text>
            {summary.lines.map(l => <Text key={l} style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }}>{l}</Text>)}
            <View style={{ alignSelf: 'stretch', gap: 10 }}>
              {summary.canShare && saved?.shareMessage && (
                <Button variant="soft" label="Share bill on WhatsApp" icon={<MaterialIcons name="chat" size={20} color={colors.primary} />}
                  onPress={() => { shareMessage({ message: saved.shareMessage!, whatsappUrl: saved.whatsappUrl }).catch(() => {}); }} />
              )}
              <Button label="Done" onPress={onDone} />
            </View>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flexShrink: 1, gap: 4 }}>
                <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 20, color: colors.ink }}>Hand over to {order.customerName ?? 'the customer'}</Text>
                <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.grey }}>{formatDay(order.date)}{slot ? ` · ${slot}` : ''}{order.customerPhone ? ` · ${order.customerPhone}` : ''}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.inputFill, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="close" size={22} color={colors.ink} />
              </Pressable>
            </View>

            <View style={{ backgroundColor: colors.inputFill, borderRadius: radius.md, padding: 14, gap: 6 }}>
              {order.items.map(i => (
                <View key={`${i.menuItemId}-${i.name}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, flexShrink: 1 }}>{i.name}</Text>
                  <Text style={{ fontFamily: fonts.mono, fontSize: 15, color: colors.ink }}>× {i.quantity}</Text>
                </View>
              ))}
              {!!order.notes && <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.grey }}>{order.notes}</Text>}
            </View>

            <Card style={{ gap: 6, backgroundColor: owes ? '#FDEEF1' : '#E6F6F0' }}>
              <Text style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: owes ? colors.coral : colors.green }}>{owes ? 'BALANCE DUE' : 'NOTHING OWED'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ fontFamily: fonts.mono, fontSize: 30, color: colors.ink }}>{money(owes ? order.balanceDue : 0)}</Text>
                {!!order.advance && <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.grey }}>{money(order.advance.amount)} advance paid via {METHOD_LABEL[order.advance.method as PaymentMethodId] ?? order.advance.method}</Text>}
              </View>
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.grey }}>Total {money(order.total)}</Text>
            </Card>

            {owes && (
              <>
                <Text style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: colors.grey }}>RECEIVING MODE</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {METHODS.map(m => {
                    const on = method === m;
                    return (
                      <Pressable key={m} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setMethod(m)}
                        style={{ paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.full, backgroundColor: on ? colors.primary : colors.inputFill }}>
                        <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: on ? colors.white : colors.ink }}>{METHOD_LABEL[m]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: colors.inputFill, borderRadius: radius.md, padding: 14 }}>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>Balance received now</Text>
                    <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.grey }}>{receive ? `Records ${money(order.balanceDue)} as paid by ${METHOD_LABEL[method]}` : 'Leave off if they will pay later'}</Text>
                  </View>
                  <Switch value={receive} onValueChange={setReceive} trackColor={{ true: colors.primary, false: colors.outline }} accessibilityLabel="Balance received now" />
                </View>
              </>
            )}

            {!!problem && (
              <View style={{ backgroundColor: '#FFF4E0', borderRadius: radius.md, padding: 12 }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.amber }}>{problem}</Text>
              </View>
            )}
            {!!error && <Text accessibilityRole="alert" style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.coral }}>{error}</Text>}

            <Button label="Complete hand over" onPress={complete} busy={busy} disabled={!!problem} icon={<MaterialIcons name="check-circle-outline" size={22} color={colors.white} />} />
            {busy && <ActivityIndicator color={colors.primary} />}
          </>
        )}
      </ScrollView>
    </View>
  );
}
