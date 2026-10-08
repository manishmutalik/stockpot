import { useState } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeApiError } from './api';
import { requestStatement } from './paymentsDue';
import { shareMessage } from './share';

/**
 * Sends what one customer owes: asks the server for it (an invoice for one order, a single statement for several), then opens
 * WhatsApp straight to them when there is a phone number, or the phone's share sheet when there is not. Nothing is changed on
 * any order. If it cannot be made (no connection, nothing owed any more) it says why.
 */
export function useSendStatement(customerKey: string) {
  const { api } = useAuth();
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const statement = await requestStatement(api, customerKey);
      await shareMessage({ message: statement.shareMessage, whatsappUrl: statement.whatsappUrl });
    } catch (err) {
      Alert.alert('Could not send it', describeApiError(err));
    } finally {
      setBusy(false);
    }
  };
  return { send, busy };
}
