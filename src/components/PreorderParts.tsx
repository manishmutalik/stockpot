import React from 'react';
import { Ban } from 'lucide-react';
import { ModalShell } from './ModalShell';
import type { Order } from '../types';
import { describeDueSlot } from '../utils/billing';
import { formatShortDate } from '../utils/localDate';
import { advanceOf } from '../utils/preorders';

/**
 * What a pre-order adds to an order's row: the due date and time of day, the
 * notes, and what has been paid in advance and what is left. A multi-item order
 * shares all of it, so it is shown once, from its items together.
 */
export const PreorderInfo: React.FC<{
  members: Order[];
  /** What the customer pays for the whole order (items, delivery and GST less the discount). */
  total: number;
  money: (n: number) => string;
}> = ({ members, total, money }) => {
  const first = members.find(m => m.preorder);
  if (!first) return null;
  const slot = describeDueSlot(members.find(m => m.dueSlot)?.dueSlot);
  const notes = members.find(m => m.notes)?.notes;
  const advance = advanceOf(members);
  const balance = Math.max(total - (advance?.amount ?? 0), 0);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-mono text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">
        Pre-order
      </span>
      <span>Due <b className="text-ink">{formatShortDate(first.date)}</b>{slot ? ` (${slot})` : ''}</span>
      {advance && (
        <span>Advance <b className="text-ink font-mono">{money(advance.amount)}</b> · balance <b className="text-ink font-mono">{money(balance)}</b></span>
      )}
      {notes && <span className="italic">“{notes}”</span>}
    </div>
  );
};

/**
 * Cancels a pre-order. When an advance was paid it has to be settled one way or
 * the other: refunded (it counts as nothing) or kept (it is income today).
 */
export const CancelPreorderModal: React.FC<{
  /** What is being cancelled, e.g. "2 Sourdough for Priya". */
  summary: string;
  /** The advance paid on it, if any. */
  advance?: number;
  money: (n: number) => string;
  onConfirm: (outcome?: 'refunded' | 'kept') => void;
  onClose: () => void;
}> = ({ summary, advance, money, onConfirm, onClose }) => {
  const hasAdvance = (advance ?? 0) > 0;
  return (
    <ModalShell
      title="Cancel pre-order"
      subtitle={summary}
      icon={Ban}
      tone="coral"
      onClose={onClose}
      widthClass="sm:max-w-md"
      footer={
        hasAdvance ? (
          <div className="space-y-2">
            <button type="button" onClick={() => onConfirm('refunded')} className="w-full h-12 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors">
              Refund the {money(advance!)} advance
            </button>
            <button type="button" onClick={() => onConfirm('kept')} className="w-full h-12 rounded-xl bg-stone-100 text-ink text-sm font-semibold hover:bg-stone-200 transition-colors">
              Keep the {money(advance!)} advance
            </button>
            <button type="button" onClick={onClose} className="w-full h-10 text-sm font-semibold text-muted hover:text-ink transition-colors">
              Don&apos;t cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="h-12 px-5 rounded-xl bg-stone-100 text-ink text-sm font-semibold hover:bg-stone-200 transition-colors">
              Don&apos;t cancel
            </button>
            <button type="button" onClick={() => onConfirm()} className="flex-1 h-12 rounded-xl bg-coral text-white text-sm font-semibold hover:opacity-90 transition-opacity">
              Cancel pre-order
            </button>
          </div>
        )
      }
    >
      {hasAdvance ? (
        <div className="space-y-2 text-sm text-ink">
          <p>An advance of <b className="font-mono">{money(advance!)}</b> was paid on this pre-order. What happens to it?</p>
          <p className="text-xs text-muted"><b>Refunded</b>: you give it back, and it counts as nothing. <b>Kept</b>: you keep it, and it counts as income today.</p>
        </div>
      ) : (
        <p className="text-sm text-ink">This takes the pre-order off your sales. No stock is affected, because it never took any.</p>
      )}
    </ModalShell>
  );
};
