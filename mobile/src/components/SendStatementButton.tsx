import React from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import type { PaymentDueSummary } from '../../../src/utils/quickApiTypes';
import { sendLabel } from '../lib/paymentsDue';
import { useSendStatement } from '../lib/useSendStatement';
import { colors } from '../theme';
import { Button } from './Button';

/**
 * Sends what one customer owes (see useSendStatement): an invoice for one order, a single statement for several. `reminder`
 * labels it "Send reminder", for a bill still unpaid two days after it went.
 */
export function SendStatementButton({ customer, variant = 'soft', reminder = false, onSent }: {
  customer: Pick<PaymentDueSummary, 'key' | 'orderCount'>; variant?: 'soft' | 'quiet' | 'outline'; reminder?: boolean; onSent?: () => void;
}) {
  const { send, busy } = useSendStatement(customer.key, onSent);
  return <Button variant={variant} label={reminder ? 'Send reminder' : sendLabel(customer)} onPress={send} busy={busy} icon={<MaterialIcons name={reminder ? 'notifications-active' : 'receipt-long'} size={20} color={colors.primary} />} />;
}
