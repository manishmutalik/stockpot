import React from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import type { PaymentDueSummary } from '../../../src/utils/quickApiTypes';
import { sendLabel } from '../lib/paymentsDue';
import { useSendStatement } from '../lib/useSendStatement';
import { colors } from '../theme';
import { Button } from './Button';

/** Sends what one customer owes (see useSendStatement): an invoice for one order, a single statement for several. */
export function SendStatementButton({ customer, variant = 'soft' }: { customer: Pick<PaymentDueSummary, 'key' | 'orderCount'>; variant?: 'soft' | 'quiet' | 'outline' }) {
  const { send, busy } = useSendStatement(customer.key);
  return <Button variant={variant} label={sendLabel(customer)} onPress={send} busy={busy} icon={<MaterialIcons name="receipt-long" size={20} color={colors.primary} />} />;
}
