/**
 * savedSummary.ts
 *
 * The short confirmation shown after a save ("Order saved — balance ₹1,300"), built from what the server answered. The
 * amounts are the server's; they are only written out here, with the same formatter the server's own labels use.
 */
import type { Currency, OrderSaved, ParseResponse, PaymentSaved, ProductionSaved, QuickKind, RestockSaved } from '../../../src/utils/quickApiTypes';
import { formatAmount } from '../../../src/utils/money';

export interface SavedSummary {
  kind: QuickKind;
  title: string;
  lines: string[];
  /** Something to look at after saving (a production run that used more than was in stock). */
  warning?: string;
  /** For an order: its id, so the invoice can be sent from the saved screen. */
  orderId?: string;
}

const DEFAULT_CURRENCY: Currency = { code: 'INR', symbol: '₹' };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function summarizeSaved(kind: QuickKind, saved: unknown, response: ParseResponse): SavedSummary {
  const currency = response.currency ?? DEFAULT_CURRENCY;
  const money = (n: number) => formatAmount(n, currency);

  if (kind === 'order') {
    const s = saved as OrderSaved;
    const lines = [s.balanceDue > 0 ? `${money(s.total)} · balance ${money(s.balanceDue)}` : `${money(s.total)} · paid in full`];
    if (s.advance > 0) lines.push(`Advance received: ${money(s.advance)}`);
    return { kind, title: s.preorder ? 'Pre-order booked' : 'Order saved', lines, ...(s.orderIds[0] && { orderId: s.orderIds[0] }) };
  }

  if (kind === 'restock') {
    const s = saved as RestockSaved;
    return { kind, title: 'Stock recorded', lines: s.lines.map(l => `${l.name}: ${Math.round(l.newStock * 100) / 100} ${l.unit} in stock`) };
  }

  if (kind === 'production') {
    const s = saved as ProductionSaved;
    const lines = [`${plural(s.runIds.length, 'run')} logged`];
    const warning = s.shortages.length > 0 ? `${s.shortages.map(x => `${x.name} is short by ${x.short} ${x.unit}`).join(', ')}. Check your stock.` : undefined;
    return { kind, title: 'Production logged', lines, ...(warning && { warning }) };
  }

  const s = saved as PaymentSaved;
  return {
    kind, title: 'Payment saved',
    lines: [`${s.customerName} paid ${money(s.amount)}`, s.remainingDue > 0.005 ? `Still owes ${money(s.remainingDue)}` : 'Fully settled'],
  };
}
