import React from 'react';
import { Check, Plus } from 'lucide-react';
import { ModalShell, MODAL_LABEL, modalField } from './ModalShell';

export interface AddMaterialFields {
  name: string;
  unit: string;
  stock: string;
  cost: string;
  threshold: string;
  expiry: string;
}

interface AddMaterialModalProps {
  category: string;
  currency: { symbol: string };
  fields: AddMaterialFields;
  onChange: (field: keyof AddMaterialFields, value: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}

/** Form for adding one raw material to the category being browsed. State and the save handler live in App. */
export function AddMaterialModal({ category, currency, fields, onChange, onSubmit, onClose }: AddMaterialModalProps) {
  return (
    <ModalShell
      title="Add New Item"
      subtitle={`Adding to ${category}`}
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
            disabled={!fields.name.trim()}
            className="flex-1 h-12 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md shadow-primary/20 flex items-center justify-center gap-2"
          >
            <Check size={18} />
            Add Item
          </button>
        </div>
      }
    >
      <div>
        <label htmlFor="mat-name" className={MODAL_LABEL}>Item name *</label>
        <input
          id="mat-name"
          type="text"
          required
          autoFocus
          value={fields.name}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="e.g. All-Purpose Flour"
          className={`${modalField()} font-semibold`}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="mat-unit" className={MODAL_LABEL}>Unit</label>
          <select id="mat-unit" value={fields.unit} onChange={(e) => onChange('unit', e.target.value)} className={`${modalField()} font-semibold`}>
            <option value="g">g (grams)</option>
            <option value="kg">kg (kilograms)</option>
            <option value="ml">ml (millilitres)</option>
            <option value="l">l (litres)</option>
            <option value="pcs">pcs (pieces)</option>
          </select>
        </div>
        <div>
          <label htmlFor="mat-stock" className={MODAL_LABEL}>Initial stock</label>
          <input
            id="mat-stock"
            type="number"
            step="0.01"
            min="0"
            value={fields.stock}
            onChange={(e) => onChange('stock', e.target.value)}
            placeholder="0"
            className={`${modalField()} font-mono font-semibold`}
          />
        </div>
        <div>
          <label htmlFor="mat-cost" className={MODAL_LABEL}>Cost per unit ({currency.symbol})</label>
          <input
            id="mat-cost"
            type="number"
            step="0.01"
            min="0"
            value={fields.cost}
            onChange={(e) => onChange('cost', e.target.value)}
            placeholder="0.00"
            className={`${modalField()} font-mono font-semibold`}
          />
        </div>
        <div>
          <label htmlFor="mat-threshold" className={MODAL_LABEL}>Low stock alert ({fields.unit})</label>
          <input
            id="mat-threshold"
            type="number"
            step="0.01"
            min="0"
            value={fields.threshold}
            onChange={(e) => onChange('threshold', e.target.value)}
            placeholder="e.g. 500"
            className={`${modalField()} font-mono font-semibold`}
          />
        </div>
      </div>
      <div>
        <label htmlFor="mat-expiry" className={MODAL_LABEL}>Expiry date (optional)</label>
        <input
          id="mat-expiry"
          type="date"
          value={fields.expiry}
          onChange={(e) => onChange('expiry', e.target.value)}
          className={`${modalField()} font-mono font-semibold sm:max-w-xs`}
        />
      </div>
    </ModalShell>
  );
}
