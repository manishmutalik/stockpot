import { useState } from 'react';
import { Alert } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useAuth } from '../auth/AuthContext';
import { describeApiError } from './api';
import { requestStatement } from './paymentsDue';
import { shareMessage } from './share';
import { markBillSent } from './billSent';

/**
 * Sends what one customer owes: asks the server for it (an invoice for one order, a single statement for several), then opens
 * WhatsApp straight to them when there is a phone number, or the phone's share sheet when there is not, and records that it
 * went (lib/billSent), so the card shows "Bill sent" and the owner is reminded if it is still unpaid in two days. `onSent`
 * runs after that, to refresh the list. If it cannot be made (no connection, nothing owed any more) it says why.
 */
export function useSendStatement(customerKey: string, onSent?: () => void) {
  const { api } = useAuth();
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const statement = await requestStatement(api, customerKey);
      await shareMessage({ message: statement.shareMessage, whatsappUrl: statement.whatsappUrl });
      await markBillSent(api, statement.orderIds, randomUUID());
      onSent?.();
    } catch (err) {
      Alert.alert('Could not send it', describeApiError(err));
    } finally {
      setBusy(false);
    }
  };
  return { send, busy };
}
