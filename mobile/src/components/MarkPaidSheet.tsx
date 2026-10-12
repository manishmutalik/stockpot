import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import type { Currency, PaymentDueSummary, PaymentMethodId } from '../../../src/utils/quickApiTypes';
import { formatAmount } from '../../../src/utils/money';
import { ApiError, describeApiError, type Api } from '../lib/api';
import { markPaidRequest } from '../lib/billSent';
import { METHOD_LABEL } from '../lib/handOver';
import { colors, fonts, radius } from '../theme';

const QUICK_METHODS: PaymentMethodId[] = ['upi', 'cash', 'card'];

/**
 * Mark as paid: everything this customer owes, paid in full, by the method tapped. One tap and it is saved (POST
 * /api/mobile/payments, with one idempotency key per opening, so a retry cannot record it twice). A part payment, or anything
 * else, goes through "Paid a different amount", which opens the usual Payment screen.
 */
export function MarkPaidSheet({ customer, currency, api, onClose, onDone, onDifferent }: {
  customer: PaymentDueSummary | null; currency: Currency; api: Api; onClose: () => void; onDone: () => void; onDifferent: (c: PaymentDueSummary) => void;
}) {
  return (
    <Modal visible={!!customer} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(43,49,61,0.4)', justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
        {customer && <Sheet key={customer.key} customer={customer} currency={currency} api={api} onClose={onClose} onDone={onDone} onDifferent={onDifferent} />}
      </View>
    </Modal>
  );
}

function Sheet({ customer, currency, api, onClose, onDone, onDifferent }: {
  customer: PaymentDueSummary; currency: Currency; api: Api; onClose: () => void; onDone: () => void; onDifferent: (c: PaymentDueSummary) => void;
}) {
  const key = useMemo(() => randomUUID(), []);
  const [busy, setBusy] = useState<PaymentMethodId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const amount = formatAmount(customer.dueTotal, currency);

  const save = async (method: PaymentMethodId) => {
    if (busy) return;
    setBusy(method); setError(null);
    try {
      const request = markPaidRequest(customer.key, customer.dueTotal, method);
      await api.post(request.path, request.body, { idempotencyKey: key });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? 'No connection. Nothing was saved; try again when you are back online.' : describeApiError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32, gap: 16 }}>
      <View style={{ alignItems: 'center' }}><View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.outline }} /></View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flexShrink: 1, gap: 4 }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 20, color: colors.ink }}>Mark as paid</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 15, color: colors.grey }}>{amount} from {customer.name}, paid in full. How did they pay?</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.inputFill, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialIcons name="close" size={22} color={colors.ink} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {QUICK_METHODS.map(m => (
          <Pressable key={m} accessibilityRole="button" accessibilityLabel={`Paid by ${METHOD_LABEL[m]}`} disabled={!!busy} onPress={() => save(m)}
            style={({ pressed }) => ({ flex: 1, minHeight: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.primaryPressed : colors.primary, opacity: busy && busy !== m ? 0.5 : 1 })}>
            {busy === m ? <ActivityIndicator color={colors.white} /> : <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.white }}>{METHOD_LABEL[m]}</Text>}
          </Pressable>
        ))}
      </View>
      {!!error && <Text accessibilityRole="alert" style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.coral }}>{error}</Text>}
      <Pressable accessibilityRole="button" onPress={() => onDifferent(customer)} disabled={!!busy} hitSlop={6} style={{ alignSelf: 'center' }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.primary }}>Paid a different amount?</Text>
      </Pressable>
    </View>
  );
}
