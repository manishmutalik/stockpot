import React from 'react';
import { Check, Plus } from 'lucide-react';
import { ModalShell, MODAL_LABEL, modalField } from './ModalShell';
import { convertAmount, enterableUnits } from '../utils/conversions';
import { formatUnitCost } from './PriceHistoryModal';

interface RestockModalProps {
  material: { name: string; unit: string; initialStock: number; gstRate?: number };
  currency: { symbol: string };
  qty: string;
  onQtyChange: (v: string) => void;
  baseTotal: string;
  onBaseTotalChange: (v: string) => void;
  /** The unit the quantity is typed in; blank means the material's own unit. */
  qtyUnit: string;
  onQtyUnitChange: (v: string) => void;
  /** Whether the business charges and pays GST. When it does not, no GST is shown or assumed. */
  gstApplicable: boolean;
  expiryDate: string;
  onExpiryDateChange: (v: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}

/**
 * Restock form: how much arrived, what was paid, and when the batch expires.
 * The quantity can be typed in another unit of the same kind (500 g for an item
 * kept in kg) and the price paid is for that whole quantity, so the cost per
 * unit shown is what it works out to in the material's own unit. When the
 * business uses GST, the GST on the purchase and the total paid are shown too;
 * when it does not, nothing about GST appears. State and the submit handler
 * live in the inventory hook (see handleRestock).
 */
export function RestockModal({
  material, currency, qty, onQtyChange, baseTotal, onBaseTotalChange, qtyUnit, onQtyUnitChange, gstApplicable,
  expiryDate, onExpiryDateChange, onSubmit, onClose,
}: RestockModalProps) {
  const gstRate = gstApplicable ? material.gstRate ?? 0 : 0;
  const base = Number(baseTotal) || 0;
  const gst = base * (gstRate / 100);
  const unitOptions = enterableUnits(material.unit);
  const enteredUnit = unitOptions.includes(qtyUnit) ? qtyUnit : material.unit;
  // Stock and cost are held in the material's own unit, so what was typed is converted to it.
  const quantity = convertAmount(Number(qty) || 0, enteredUnit, material.unit);
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
          <label htmlFor="restock-qty" className={MODAL_LABEL}>Quantity added</label>
          <div className="flex gap-2">
            <input
              id="restock-qty"
              type="number"
              step="0.01"
              required
              autoFocus
              value={qty}
              onChange={(e) => onQtyChange(e.target.value)}
              className={`${modalField()} font-mono font-semibold min-w-0`}
            />
            {unitOptions.length > 1 ? (
              <select
                aria-label="Unit of the quantity added"
                value={enteredUnit}
                onChange={(e) => onQtyUnitChange(e.target.value)}
                className="w-20 shrink-0 bg-stone-50 border border-transparent rounded-xl px-3 py-3 text-sm text-ink font-mono font-semibold outline-none transition-colors focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
              >
                {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            ) : (
              <span className="flex items-center px-1 font-mono text-sm font-semibold text-muted shrink-0">{material.unit}</span>
            )}
          </div>
        </div>
        <div>
          <label htmlFor="restock-base" className={MODAL_LABEL}>
            {gstApplicable ? 'Total price paid, before GST' : 'Total price paid'}
          </label>
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
          <p className="text-[11px] text-muted mt-1">For the whole quantity above{qty ? `, ${+Number(qty).toPrecision(6)} ${enteredUnit}` : ''}.</p>
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
        {gstApplicable && gstRate > 0 && (
          <>
            <div className="bg-stone-50 rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="font-mono text-[10px] font-semibold text-muted uppercase tracking-wider">GST ({gstRate}%)</span>
              <span className="font-mono text-sm font-semibold text-ink">{money(gst)}</span>
            </div>
            <div className="bg-primary/5 rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="font-mono text-[10px] font-semibold text-primary uppercase tracking-wider">Total paid</span>
              <span className="font-mono text-xl font-semibold text-ink">{money(base + gst)}</span>
            </div>
          </>
        )}
        {gstApplicable && gstRate === 0 && (
          <p className="text-[11px] text-muted px-1">No GST rate is set for this item, so none is shown. Set it in the Inventory table to see the tax on purchases.</p>
        )}
        {quantity > 0 && enteredUnit !== material.unit && (
          <p className="font-mono text-[11px] text-muted px-1">
            Adds <span className="font-semibold text-ink">{+quantity.toPrecision(6)} {material.unit}</span> to stock
          </p>
        )}
        {perUnit !== null && (
          <p className="font-mono text-[11px] text-muted px-1">
            Cost per unit: <span className="font-semibold text-ink">{formatUnitCost(perUnit, currency.symbol)}</span> / {material.unit}{gstApplicable ? ' before GST' : ''}
          </p>
        )}
      </div>
    </ModalShell>
  );
}
