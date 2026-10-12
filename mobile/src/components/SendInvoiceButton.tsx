import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { useAuth } from '../auth/AuthContext';
import { describeApiError } from '../lib/api';
import { billLine, billState, markBillSent } from '../lib/billSent';
import { requestInvoice } from '../lib/invoice';
import { shareMessage } from '../lib/share';
import { colors, fonts, radius } from '../theme';
import { Button } from './Button';

/**
 * Sends the invoice for one order: asks the server for it, then opens WhatsApp straight to the customer when the order has
 * a phone number, or the phone's share sheet when it has not, and records that it went (lib/billSent). Once sent, and for two
 * days, it shows "Invoice sent" instead (with a small "Send again" in case it did not go); after two days still unpaid it is
 * "Send reminder". `sentAt` is the server's record; a send from this button shows at once without waiting for a refresh.
 */
export function SendInvoiceButton({ orderId, variant = 'soft', sentAt, onSent }: {
  orderId: string; variant?: 'soft' | 'quiet' | 'outline'; sentAt?: number | null; onSent?: () => void;
}) {
  const { api } = useAuth();
  const [busy, setBusy] = useState(false);
  const [sentHere, setSentHere] = useState<number | null>(null);
  const send = async () => {
    setBusy(true);
    try {
      const invoice = await requestInvoice(api, orderId);
      await shareMessage({ message: invoice.shareMessage, whatsappUrl: invoice.whatsappUrl });
      if (invoice.balanceDue > 0) {
        const marked = await markBillSent(api, invoice.orderIds, randomUUID());
        setSentHere(marked?.at ?? Date.now());
      }
      onSent?.();
    } catch (err) {
      Alert.alert('Could not send the invoice', describeApiError(err));
    } finally {
      setBusy(false);
    }
  };
  const now = Date.now();
  const at = Math.max(sentHere ?? 0, sentAt ?? 0) || null;
  const state = billState(at, now);
  const icon = <MaterialIcons name="receipt-long" size={20} color={colors.primary} />;

  if (state === 'sent') {
    return (
      <View style={{ gap: 6 }}>
        <View accessibilityRole="text" style={{ minHeight: 48, borderRadius: radius.md, backgroundColor: colors.inputFill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <MaterialIcons name="done-all" size={18} color={colors.grey} />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.grey }}>{billLine(state, at, now, 'Invoice')}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Send the invoice again" onPress={send} disabled={busy} hitSlop={6} style={{ alignSelf: 'center' }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.primary }}>{busy ? 'Opening…' : 'Send again'}</Text>
        </Pressable>
      </View>
    );
  }
  return <Button variant={variant} label={state === 'unpaid_after_bill' ? 'Send reminder' : 'Send invoice'} onPress={send} busy={busy} icon={icon} />;
}
