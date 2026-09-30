import React from 'react';
import { Check, Gift, Home, Trash2 } from 'lucide-react';
import { ModalShell, MODAL_LABEL, modalField } from './ModalShell';

export interface DiscardModalTarget {
  name: string;
  unit: string;
  maxQty: number;
  costPerUnit?: number;
  /** Set by Market Stock's Personal Use / Sampling actions; plain wastage has none. */
  presetReason?: string;
}

interface DiscardModalProps {
  target: DiscardModalTarget;
  currency: { symbol: string };
  qty: string;
  onQtyChange: (v: string) => void;
  reason: string;
  onReasonChange: (v: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}

/**
 * Logs stock leaving inventory: wasted/discarded, or kept back as Personal
 * Use / Sampling (which reuse the same wastage log with a preset reason and
 * are excluded from income). Shows the cost that will be recorded.
 */
export function DiscardModal({ target, currency, qty, onQtyChange, reason, onReasonChange, onSubmit, onClose }: DiscardModalProps) {
  const preset = target.presetReason;
  const isWaste = !preset;
  const Icon = preset === 'Personal Use' ? Home : preset === 'Sampling' ? Gift : Trash2;
  const cost = (Number(qty) || 0) * (target.costPerUnit || 0);
  const maxLabel = `${+target.maxQty.toFixed(3)} ${target.unit}`;

  return (
    <ModalShell
      title={preset ? `${preset}: ${target.name}` : `Discard ${target.name}`}
      subtitle={preset ? `Log as ${preset.toLowerCase()} · excluded from income` : 'Log wasted stock and track cost'}
      icon={Icon}
      tone={isWaste ? 'coral' : preset === 'Personal Use' ? 'amber' : 'primary'}
      onClose={onClose}
      closeOnBackdrop
      widthClass="sm:max-w-lg"
      onSubmit={onSubmit}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-none w-24 sm:w-32 h-12 rounded-xl bg-stone-100 text-ink text-sm font-semibold hover:bg-stone-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`flex-1 h-12 rounded-xl text-white text-sm font-semibold transition-colors shadow-md flex items-center justify-center gap-2 ${
              isWaste ? 'bg-coral hover:opacity-90 shadow-coral/20' : 'bg-primary hover:bg-primary-dark shadow-primary/20'
            }`}
          >
            <Check size={18} />
            {preset ? `Confirm ${preset}` : 'Confirm Discard'}
          </button>
        </div>
      }
    >
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="discard-qty" className={MODAL_LABEL}>Quantity to discard ({target.unit})</label>
          <button
            type="button"
            onClick={() => onQtyChange(String(target.maxQty))}
            className="font-mono text-[10px] font-semibold uppercase tracking-wider text-primary hover:text-primary-dark mb-1.5"
          >
            Use max ({maxLabel})
          </button>
        </div>
        <input
          id="discard-qty"
          type="number"
          step="0.01"
          max={target.maxQty}
          required
          autoFocus
          value={qty}
          onChange={(e) => onQtyChange(e.target.value)}
          className={`${modalField()} font-mono font-semibold`}
        />
      </div>
      <div>
        <label htmlFor="discard-reason" className={MODAL_LABEL}>Reason</label>
        <input
          id="discard-reason"
          type="text"
          required
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="e.g. Expired, Spilled, Burnt"
          className={modalField()}
        />
      </div>

      {(target.costPerUnit ?? 0) > 0 && (
        <div className={`rounded-2xl px-4 py-3 flex items-center justify-between ${isWaste ? 'bg-coral/5' : 'bg-stone-50'}`}>
          <span className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${isWaste ? 'text-coral' : 'text-muted'}`}>
            Cost recorded
          </span>
          <span className="font-mono text-xl font-semibold text-ink">{currency.symbol}{cost.toFixed(2)}</span>
        </div>
      )}
    </ModalShell>
  );
}
