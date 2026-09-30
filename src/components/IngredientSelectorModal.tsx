import React, { useState, useMemo } from 'react';
import { Check, Search, Sparkles } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { getDefaultRecipeUnit } from '../App';

/**
 * A lightweight ingredient entry used when bulk-adding items to a recipe.
 * Produced by `IngredientSelectorModal` and consumed by the recipe editor.
 */
export interface QuickIngredient {
  /** References `RawMaterial.id` in the materials collection. */
  materialId: string;
  /** Quantity in the recipe's default unit for this material. */
  amount: number;
  /** Unit string derived via `getDefaultRecipeUnit` (e.g. 'g', 'ml', 'pcs'). */
  unit: string;
}

interface IngredientSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  materials: any[];
  categories: string[];
  onAddSelected: (ingredients: QuickIngredient[]) => void;
}

/**
 * Full-screen modal for bulk-selecting raw materials and assigning amounts
 * before adding them to a recipe in one action.
 *
 * @param isOpen         - Controls visibility; renders nothing when false.
 * @param onClose        - Dismisses the modal without saving.
 * @param materials      - Full raw-material catalogue to display and search.
 * @param categories     - Ordered list of category labels used to group materials.
 *                         'Packaging Materials' is intentionally excluded from this view.
 * @param onAddSelected  - Callback fired on save; receives the array of `QuickIngredient` entries.
 */
export function IngredientSelectorModal({ isOpen, onClose, materials, categories, onAddSelected }: IngredientSelectorModalProps) {
  // ─── Local State ────────────────────────────────────────────────────────────
  const [searchTerm,     setSearchTerm]     = useState('');
  // selectedItems: materialId → amount (presence in map = selected)
  const [selectedItems,  setSelectedItems]  = useState<Record<string, number>>({});

  // ─── Filtered List ───────────────────────────────────────────────────────────
  // Re-filters whenever the search term or the materials catalogue changes.
  const filteredMaterials = useMemo(() => {
    return materials.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [materials, searchTerm]);

  if (!isOpen) return null;

  // ─── Handlers ────────────────────────────────────────────────────────────────

  /**
   * Updates the stored amount for a material.
   * If the parsed value is ≤ 0 or not a number, the item is removed from the
   * selection map so that zero/empty quantities never make it into the recipe.
   */
  const handleAmountChange = (materialId: string, amountStr: string) => {
    const val = parseFloat(amountStr);
    if (isNaN(val) || val <= 0) {
      // Remove from selection rather than storing an invalid amount
      const newSelected = { ...selectedItems };
      delete newSelected[materialId];
      setSelectedItems(newSelected);
    } else {
      setSelectedItems(prev => ({ ...prev, [materialId]: val }));
    }
  };

  /**
   * Toggles a material in/out of the selection.
   * - If already selected: removes it from the map.
   * - If not selected: adds it with a default amount of 1 (user can adjust inline).
   */
  const handleToggleCheck = (materialId: string) => {
    if (selectedItems[materialId]) {
      // Deselect: remove the entry from the map
      const newSelected = { ...selectedItems };
      delete newSelected[materialId];
      setSelectedItems(newSelected);
    } else {
      // Select with a starter amount of 1; unit is resolved at save time
      setSelectedItems(prev => ({ ...prev, [materialId]: 1 }));
    }
  };

  /**
   * Converts the selection map to `QuickIngredient[]` and hands it to the parent.
   * Uses `getDefaultRecipeUnit` (imported from App.tsx) to normalise units.
   * Resets local state and closes the modal after calling `onAddSelected`.
   */
  const handleSave = () => {
    // Map each [materialId, amount] pair to a full QuickIngredient shape
    const newIngredients: QuickIngredient[] = Object.entries(selectedItems).map(([matId, amt]) => {
      const mat = materials.find(m => m.id === matId);
      return {
        materialId: matId,
        amount: amt as number,
        unit: getDefaultRecipeUnit(mat?.unit) // resolve storage unit → recipe display unit
      };
    });
    onAddSelected(newIngredients);
    // Clear selection and search so the modal is clean on next open
    setSelectedItems({});
    setSearchTerm('');
    onClose();
  };

  const selectedCount = Object.keys(selectedItems).length;

  return (
    <ModalShell
      title="Quick Select Ingredients"
      subtitle="Enter quantities to select items automatically"
      icon={Sparkles}
      onClose={onClose}
      widthClass="sm:max-w-2xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-xs font-semibold text-muted">
            {selectedCount} item{selectedCount === 1 ? '' : 's'} selected
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="h-12 px-5 sm:px-8 rounded-xl bg-stone-100 text-ink text-sm font-semibold hover:bg-stone-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={selectedCount === 0}
              className="h-12 px-5 sm:px-8 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md shadow-primary/20 flex items-center gap-2"
            >
              <Check size={18} />
              Add Selected
            </button>
          </div>
        </div>
      }
    >
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
        <input
          type="text"
          placeholder="Search materials..."
          aria-label="Search materials"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-stone-50 border border-transparent rounded-xl pl-11 pr-4 py-3 text-sm text-ink placeholder:text-muted/70 focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-colors"
        />
      </div>

      {categories.filter(c => c !== 'Packaging Materials').map(cat => {
        const catMaterials = filteredMaterials.filter(m => m.category === cat);
        if (catMaterials.length === 0) return null;

        return (
          <div key={cat} className="space-y-2.5">
            <h3 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">{cat}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {catMaterials.map(mat => {
                const isSelected = !!selectedItems[mat.id];
                return (
                  <div
                    key={mat.id}
                    className={`flex items-center gap-3 p-3 rounded-xl transition-colors cursor-pointer ${
                      isSelected ? 'bg-primary/5 ring-1 ring-primary/30' : 'bg-stone-50 hover:bg-stone-100'
                    }`}
                    onClick={() => !isSelected && handleToggleCheck(mat.id)}
                  >
                    <div
                      className="flex-1 min-w-0 flex items-center gap-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleCheck(mat.id);
                      }}
                    >
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors shrink-0 ${
                        isSelected ? 'bg-primary text-white' : 'bg-white border border-stone-300'
                      }`}>
                        {isSelected && <Check size={14} />}
                      </div>
                      <span className={`text-sm font-semibold truncate ${isSelected ? 'text-ink' : 'text-muted'}`}>
                        {mat.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="0"
                        aria-label={`Amount of ${mat.name}`}
                        value={selectedItems[mat.id] || ''}
                        onChange={(e) => handleAmountChange(mat.id, e.target.value)}
                        className="w-16 bg-white border border-transparent rounded-lg px-2 py-1.5 text-sm font-mono font-semibold text-ink focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-right"
                      />
                      <span className="font-mono text-[10px] font-semibold text-muted uppercase w-6">
                        {getDefaultRecipeUnit(mat.unit)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </ModalShell>
  );
}
