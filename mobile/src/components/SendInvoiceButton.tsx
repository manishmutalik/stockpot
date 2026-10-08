import React, { useState } from 'react';
import { Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthContext';
import { describeApiError } from '../lib/api';
import { requestInvoice } from '../lib/invoice';
import { shareMessage } from '../lib/share';
import { colors } from '../theme';
import { Button } from './Button';

/**
 * Sends the invoice for one order: asks the server for it, then opens WhatsApp straight to the customer when the order has
 * a phone number, or the phone's share sheet when it has not, so the owner picks the app and the person. Nothing is changed
 * on the order. If it cannot be made (no connection, a cancelled order) it says why.
 */
export function SendInvoiceButton({ orderId, variant = 'soft' }: { orderId: string; variant?: 'soft' | 'quiet' | 'outline' }) {
  const { api } = useAuth();
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const invoice = await requestInvoice(api, orderId);
      await shareMessage({ message: invoice.shareMessage, whatsappUrl: invoice.whatsappUrl });
    } catch (err) {
      Alert.alert('Could not send the invoice', describeApiError(err));
    } finally {
      setBusy(false);
    }
  };
  return <Button variant={variant} label="Send invoice" onPress={send} busy={busy} icon={<MaterialIcons name="receipt-long" size={20} color={colors.primary} />} />;
}
