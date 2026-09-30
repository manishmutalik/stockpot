import React from 'react';
import { Check, Loader2, Salad, Search } from 'lucide-react';
import type { NutritionSearchResult } from '../../lib/nutritionSearch';
import { ALLERGEN_TAGS } from '../utils/nutritionCalculations';
import { ModalShell, MODAL_LABEL, modalField } from './ModalShell';

export type NutritionField = 'calories' | 'protein' | 'carbs' | 'fat';

interface NutritionModalProps {
  material: { name: string; unit: string };
  search: {
    query: string;
    onQueryChange: (v: string) => void;
    onSearch: () => void;
    isSearching: boolean;
    usdaResults: NutritionSearchResult[];
    usdaError: string | null;
    offResults: NutritionSearchResult[];
    offError: string | null;
    onApply: (result: NutritionSearchResult) => void;
  };
  values: Record<NutritionField, string>;
  onValueChange: (field: NutritionField, value: string) => void;
  allergens: string[];
  onToggleAllergen: (tag: (typeof ALLERGEN_TAGS)[number]) => void;
  source: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}

const FIELDS: { key: NutritionField; label: string }[] = [
  { key: 'calories', label: 'Calories' },
  { key: 'protein', label: 'Protein (g)' },
  { key: 'carbs', label: 'Carbs (g)' },
  { key: 'fat', label: 'Fat (g)' },
];

const perLabel = (unit: string) => (unit === 'kg' ? 'g' : unit === 'l' ? 'ml' : unit === 'pcs' ? ' pcs' : unit);

const ResultCard: React.FC<{ result: NutritionSearchResult; onApply: (r: NutritionSearchResult) => void }> = ({ result, onApply }) => (
  <button
    type="button"
    onClick={() => onApply(result)}
    className="w-full text-left p-2.5 bg-white rounded-lg hover:bg-primary/5 hover:ring-1 hover:ring-primary/30 transition-colors"
  >
    <div className="text-sm font-semibold text-ink">{result.name}</div>
    {result.brand && <div className="text-[11px] text-muted">{result.brand}</div>}
    {result.nutrition && (
      <div className="font-mono text-[10px] text-muted mt-0.5">
        {result.nutrition.calories.toFixed(0)} kcal · P {result.nutrition.protein.toFixed(1)}g · C {result.nutrition.carbs.toFixed(1)}g · F {result.nutrition.fat.toFixed(1)}g
      </div>
    )}
    {result.allergens.length > 0 && (
      <div className="flex flex-wrap gap-1 mt-1">
        {result.allergens.map(tag => (
          <span key={tag} className="text-[8px] font-bold uppercase tracking-wide bg-coral/10 text-coral px-1.5 py-0.5 rounded-full">{tag.replace(/_/g, ' ')}</span>
        ))}
      </div>
    )}
  </button>
);

const ResultColumn: React.FC<{
  title: string;
  results: NutritionSearchResult[];
  error: string | null;
  onApply: (r: NutritionSearchResult) => void;
}> = ({ title, results, error, onApply }) => (
  <div>
    <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">{title}</div>
    {error && <p className="text-xs text-coral">{error}</p>}
    {!error && results.length === 0 && <p className="text-xs text-muted">No results</p>}
    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
      {results.map(r => <ResultCard key={r.id} result={r} onApply={onApply} />)}
    </div>
  </div>
);

/**
 * Edit a material's nutrition (per 100 g/ml) and allergens, optionally filling
 * the form from a USDA / Open Food Facts search. State, the lookup and the
 * save handler live in useInventoryActions; this only renders them.
 */
export function NutritionModal({ material, search, values, onValueChange, allergens, onToggleAllergen, source, onSubmit, onClose }: NutritionModalProps) {
  const hasResults = search.usdaResults.length > 0 || search.offResults.length > 0 || !!search.usdaError || !!search.offError;
  return (
    <ModalShell
      title="Nutrition & Allergens"
      subtitle={`Per 100${perLabel(material.unit)} of ${material.name}`}
      icon={Salad}
      onClose={onClose}
      closeOnBackdrop
      widthClass="sm:max-w-xl"
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
            className="flex-1 h-12 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors shadow-md shadow-primary/20 flex items-center justify-center gap-2"
          >
            <Check size={18} />
            Save
          </button>
        </div>
      }
    >
      <div className="p-4 bg-stone-50 rounded-2xl">
        <label htmlFor="nutrition-lookup" className={MODAL_LABEL}>Look up</label>
        <div className="flex gap-2">
          <input
            id="nutrition-lookup"
            type="text"
            value={search.query}
            onChange={(e) => search.onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                search.onSearch();
              }
            }}
            placeholder="e.g. all-purpose flour"
            className={`${modalField()} bg-white !py-2.5`}
          />
          <button
            type="button"
            onClick={search.onSearch}
            disabled={!search.query.trim() || search.isSearching}
            className="flex items-center gap-1.5 bg-ink hover:bg-ink/90 text-white px-4 rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors shrink-0"
          >
            {search.isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </button>
        </div>

        {hasResults && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <ResultColumn title="USDA FoodData Central" results={search.usdaResults} error={search.usdaError} onApply={search.onApply} />
            <ResultColumn title="Open Food Facts" results={search.offResults} error={search.offError} onApply={search.onApply} />
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <span className={`${MODAL_LABEL} !mb-0`}>Nutrition</span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
            Source: {source === 'usda' ? 'USDA FoodData Central' : source === 'openfoodfacts' ? 'Open Food Facts' : 'Manual'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label htmlFor={`nutrition-${key}`} className={MODAL_LABEL}>{label}</label>
              <input
                id={`nutrition-${key}`}
                type="number"
                step="0.01"
                min="0"
                value={values[key]}
                onChange={(e) => onValueChange(key, e.target.value)}
                placeholder="0"
                className={`${modalField()} font-mono font-semibold`}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <span className={`${MODAL_LABEL} mb-2.5`}>Allergens</span>
        <div className="flex flex-wrap gap-2">
          {ALLERGEN_TAGS.map((tag) => {
            const selected = allergens.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => onToggleAllergen(tag)}
                aria-pressed={selected}
                className={`px-3.5 py-2 rounded-full text-sm font-semibold capitalize transition-colors ${
                  selected ? 'bg-coral text-white shadow-sm' : 'bg-stone-50 text-muted hover:bg-coral/10 hover:text-coral'
                }`}
              >
                {tag.replace(/_/g, ' ')}
              </button>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
}
