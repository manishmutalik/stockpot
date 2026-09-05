import React, { useState, useMemo } from 'react';
import { X, Search, CheckCircle2 } from 'lucide-react';
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-8 pt-8 pb-6 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-serif font-bold text-stone-800">Quick Select Ingredients</h2>
            <p className="text-stone-500 text-sm italic font-serif">Enter quantities to select items automatically.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-400">
            <X size={24} />
          </button>
        </div>

        <div className="px-8 py-4 bg-stone-50/50 border-b border-stone-100">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
            <input
              type="text"
              placeholder="Search materials..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-stone-200 rounded-2xl pl-12 pr-4 py-3 text-sm font-bold text-stone-700 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {categories.filter(c => c !== 'Packaging Materials').map(cat => {
            const catMaterials = filteredMaterials.filter(m => m.category === cat);
            if (catMaterials.length === 0) return null;

            return (
              <div key={cat} className="space-y-3">
                <h3 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-2">{cat}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {catMaterials.map(mat => {
                    const isSelected = !!selectedItems[mat.id];
                    return (
                      <div 
                        key={mat.id}
                        className={`flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                          isSelected ? 'border-primary/50 bg-primary/5 shadow-sm' : 'border-stone-100 bg-white hover:border-stone-200'
                        }`}
                        onClick={() => !isSelected && handleToggleCheck(mat.id)}
                      >
                        <div 
                          className="flex-1 flex items-center gap-3"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleCheck(mat.id);
                          }}
                        >
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                            isSelected ? 'bg-primary border-primary text-white' : 'border-stone-300 bg-white'
                          }`}>
                            {isSelected && <CheckCircle2 size={14} />}
                          </div>
                          <span className={`text-sm font-bold ${isSelected ? 'text-stone-800' : 'text-stone-600'}`}>
                            {mat.name}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            placeholder="0"
                            value={selectedItems[mat.id] || ''}
                            onChange={(e) => handleAmountChange(mat.id, e.target.value)}
                            className="w-16 bg-white border border-stone-200 rounded-xl px-2 py-1.5 text-sm font-mono font-bold text-stone-700 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-right shadow-sm"
                          />
                          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest w-6">
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
        </div>

        <div className="px-8 py-6 border-t border-stone-100 bg-stone-50/50 flex justify-between items-center">
          <span className="text-sm font-bold text-stone-500">
            {Object.keys(selectedItems).length} items selected
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-stone-500 hover:bg-stone-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={Object.keys(selectedItems).length === 0}
              className={`px-8 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg transform active:scale-95 ${
                Object.keys(selectedItems).length > 0 
                  ? 'bg-primary hover:bg-primary-dark text-white shadow-primary/20' 
                  : 'bg-stone-200 text-stone-400 cursor-not-allowed'
              }`}
            >
              Add Selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
