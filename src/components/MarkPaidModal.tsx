import React, { useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { ModalShell, MODAL_LABEL } from './ModalShell';
import { PAYMENT_METHODS, type PaymentMethod } from '../types';

/**
 * Confirms that orders have been paid and records how. The method matters
 * because payment fees (a card or gateway cut) are worked out from it; "Not
 * recorded" simply means no fee is counted. The fee rate in force is shown so
 * the owner can see what will be counted against the payment.
 */
export const MarkPaidModal: React.FC<{
  title: string;
  /** What is being marked paid, e.g. "3 orders from Priya". */
  summary: string;
  amount: number;
  money: (n: number) => string;
  feeRates: Partial<Record<PaymentMethod, number>> | undefined;
  onConfirm: (method: PaymentMethod | undefined) => void;
  onClose: () => void;
}> = ({ title, summary, amount, money, feeRates, onConfirm, onClose }) => {
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const rate = method ? feeRates?.[method] ?? 0 : 0;

  return (
    <ModalShell
      title={title}
      subtitle={summary}
      icon={CheckCheck}
      onClose={onClose}
      widthClass="sm:max-w-md"
      footer={
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="h-12 px-5 rounded-xl bg-stone-100 text-ink text-sm font-semibold hover:bg-stone-200 transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(method || undefined)}
            className="flex-1 h-12 px-5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors shadow-md shadow-primary/20 flex items-center justify-center gap-2"
          >
            <CheckCheck size={18} /> Mark as paid
          </button>
        </div>
      }
    >
      <div className="bg-primary/5 rounded-2xl p-4">
        <div className="font-mono text-[10px] font-semibold text-primary uppercase tracking-wider">Amount</div>
        <div className="text-2xl font-mono font-semibold text-ink mt-0.5">{money(amount)}</div>
      </div>
      <div>
        <label htmlFor="paid-method" className={MODAL_LABEL}>Paid by (optional)</label>
        <select
          id="paid-method"
          value={method}
          onChange={e => setMethod(e.target.value as PaymentMethod | '')}
          className="w-full bg-stone-50 border border-transparent rounded-xl px-4 py-3 text-sm text-ink outline-none transition-colors focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="">Not recorded</option>
          {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        {rate > 0 && (
          <p className="text-xs text-muted mt-1.5">
            A {rate}% payment fee ({money(amount * rate / 100)}) will be counted against this. Change the rates in Settings.
          </p>
        )}
      </div>
    </ModalShell>
  );
};
