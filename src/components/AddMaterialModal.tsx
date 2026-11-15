import React, { useMemo, useState } from 'react';
import { Check, Plus, TriangleAlert } from 'lucide-react';
import { ModalShell, MODAL_LABEL, modalField } from './ModalShell';
import { isCountedByThePiece } from '../utils/kitchenMeasures';
import { similarItems } from '../utils/duplicates';

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
  /** The items already in the inventory, to say when the name is one of them. */
  existing?: { id: string; name: string; category: string }[];
  /** Restock an item already there instead of adding it again. */
  onRestockExisting?: (id: string) => void;
}

/**
 * Form for adding one raw material to the category being browsed. State and the save handler live in App.
 * Until a unit is chosen here, it follows the name: something counted, not weighed (eggs), is in pieces; anything else
 * keeps the unit the form opened with.
 * As the name is typed it is checked against the inventory (utils/duplicates): an item already there ("Chini" when there
 * is "Sugar") is named, with a button to restock it instead; one that may be the same is asked about. Adding is never
 * blocked: "Salted Butter" and "Unsalted Butter" are two things.
 */
export function AddMaterialModal({ category, currency, fields, onChange, onSubmit, onClose, existing = [], onRestockExisting }: AddMaterialModalProps) {
  const [unitChosen, setUnitChosen] = useState(false);
  const { same, maybe } = useMemo(() => similarItems(fields.name, existing), [fields.name, existing]);
  const twin = same[0] ?? maybe[0];
  const [openedWith] = useState(fields.unit);
  const changeName = (name: string) => {
    onChange('name', name);
    if (!unitChosen) {
      const unit = isCountedByThePiece(name) ? 'pcs' : openedWith;
      if (unit !== fields.unit) onChange('unit', unit);
    }
  };
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
            {same.length > 0 ? 'Add anyway' : 'Add Item'}
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
          onChange={(e) => changeName(e.target.value)}
          placeholder="e.g. All-Purpose Flour"
          aria-describedby={twin ? 'mat-name-twin' : undefined}
          className={`${modalField()} font-semibold`}
        />
        {twin && (
          <div id="mat-name-twin" role="status" className={`mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${same.length > 0 ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-stone-50 text-muted border border-stone-200'}`}>
            <TriangleAlert size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <p>
                {same.length > 0
                  ? <>You already have <strong>{twin.name.trim()}</strong>{twin.category ? ` in ${twin.category}` : ''}.</>
                  : <>Is this the same as <strong>{twin.name.trim()}</strong>{twin.category ? ` in ${twin.category}` : ''}?</>}
              </p>
              {onRestockExisting && (
                <button type="button" onClick={() => onRestockExisting(twin.id)} className="mt-1 font-semibold text-primary hover:underline">
                  Restock {twin.name.trim()} instead
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="mat-unit" className={MODAL_LABEL}>Unit</label>
          <select id="mat-unit" value={fields.unit} onChange={(e) => { setUnitChosen(true); onChange('unit', e.target.value); }} className={`${modalField()} font-semibold`}>
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
