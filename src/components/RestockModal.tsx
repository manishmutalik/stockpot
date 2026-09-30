import React from 'react';
import { Check, Plus } from 'lucide-react';
import { ModalShell, MODAL_LABEL, modalField } from './ModalShell';

interface RestockModalProps {
  material: { name: string; unit: string; initialStock: number; gstRate?: number };
  currency: { symbol: string };
  qty: string;
  onQtyChange: (v: string) => void;
  baseTotal: string;
  onBaseTotalChange: (v: string) => void;
  expiryDate: string;
  onExpiryDateChange: (v: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}

/** Default GST on a purchase when the material has none set (matches the restock handler). */
const DEFAULT_GST_RATE = 5;

/**
 * Restock form: how much arrived, what was paid before tax, and when the batch
 * expires. Shows the GST and total paid as you type, plus the resulting cost
 * per unit. State and the submit handler live in App (see handleRestock).
 */
export function RestockModal({
  material, currency, qty, onQtyChange, baseTotal, onBaseTotalChange, expiryDate, onExpiryDateChange, onSubmit, onClose,
}: RestockModalProps) {
  const gstRate = material.gstRate ?? DEFAULT_GST_RATE;
  const base = Number(baseTotal) || 0;
  const gst = base * (gstRate / 100);
  const quantity = Number(qty) || 0;
  const perUnit = quantity > 0 ? base / quantity : null;
  const money = (n: number) => `${currency.symbol}${n.toFixed(2)}`;

  return (
    <ModalShell
      title={`Restock ${material.name}`}
      subtitle={`Current stock ${+material.initialStock.toFixed(3)} ${material.unit}`}
      icon={Plus}
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
            disabled={!qty || !baseTotal}
            className="flex-1 h-12 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md shadow-primary/20 flex items-center justify-center gap-2"
          >
            <Check size={18} />
            Confirm Restock
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="restock-qty" className={MODAL_LABEL}>Quantity added ({material.unit})</label>
          <input
            id="restock-qty"
            type="number"
            step="0.01"
            required
            autoFocus
            value={qty}
            onChange={(e) => onQtyChange(e.target.value)}
            className={`${modalField()} font-mono font-semibold`}
          />
        </div>
        <div>
          <label htmlFor="restock-base" className={MODAL_LABEL}>Total base price paid</label>
          <input
            id="restock-base"
            type="number"
            step="0.01"
            required
            value={baseTotal}
            onChange={(e) => onBaseTotalChange(e.target.value)}
            placeholder="0.00"
            className={`${modalField()} font-mono font-semibold`}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="restock-expiry" className={MODAL_LABEL}>Expiry date of this batch</label>
          <input
            id="restock-expiry"
            type="date"
            value={expiryDate}
            onChange={(e) => onExpiryDateChange(e.target.value)}
            className={`${modalField()} font-mono font-semibold sm:max-w-xs`}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="bg-stone-50 rounded-xl px-4 py-3 flex justify-between items-center">
          <span className="font-mono text-[10px] font-semibold text-muted uppercase tracking-wider">GST ({gstRate}%)</span>
          <span className="font-mono text-sm font-semibold text-ink">{money(gst)}</span>
        </div>
        <div className="bg-primary/5 rounded-xl px-4 py-3 flex justify-between items-center">
          <span className="font-mono text-[10px] font-semibold text-primary uppercase tracking-wider">Total paid</span>
          <span className="font-mono text-xl font-semibold text-ink">{money(base + gst)}</span>
        </div>
        {perUnit !== null && (
          <p className="font-mono text-[11px] text-muted px-1">
            Cost per unit: <span className="font-semibold text-ink">{currency.symbol}{perUnit.toFixed(2)}</span> / {material.unit} before GST
          </p>
        )}
      </div>
    </ModalShell>
  );
}
