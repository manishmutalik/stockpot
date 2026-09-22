import React from 'react';
import { Salad } from 'lucide-react';
import { NUTRITION_DISCLAIMER, type NutritionRollup } from '../utils/nutritionCalculations';

interface NutritionCardProps {
  itemName: string;
  emoji?: string;
  businessName: string;
  logo?: string;
  primaryColor: string;
  rollup: NutritionRollup;
}

/**
 * The visual nutrition card shared with a customer, captured to a PNG by
 * MenuView via html2canvas. Kept as a plain presentational component (no
 * hooks, no data fetching) so it renders identically whether it's on
 * screen or off-screen waiting to be captured.
 *
 * Every copy of this card — regardless of how complete the underlying
 * data is — carries the disclaimer verbatim: this is an estimate for a
 * customer conversation, not a certified nutrition label.
 */
export const NutritionCard: React.FC<NutritionCardProps> = ({
  itemName,
  emoji,
  businessName,
  logo,
  primaryColor,
  rollup,
}) => {
  return (
    <div
      style={{ width: 480, fontFamily: 'system-ui, -apple-system, sans-serif' }}
      className="bg-white p-8 flex flex-col gap-6"
    >
      <div className="flex items-center gap-3 pb-4 border-b-2" style={{ borderColor: primaryColor }}>
        {logo ? (
          <img src={logo} alt="" className="w-10 h-10 rounded-lg object-cover" />
        ) : (
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
            style={{ backgroundColor: primaryColor }}
          >
            {businessName.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="font-bold text-stone-800 text-lg">{businessName}</span>
      </div>

      <div className="flex items-center gap-2">
        {emoji && <span className="text-3xl">{emoji}</span>}
        <h2 className="text-2xl font-bold text-stone-800">{itemName}</h2>
      </div>

      <div className="border-2 border-stone-800 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-stone-800 text-white">
          <div className="text-xs font-bold uppercase tracking-widest">Nutrition Facts (Estimated)</div>
          <div className="text-[10px] text-stone-300">Per serving</div>
        </div>
        <div className="p-4">
          <div className="flex items-baseline justify-between border-b-4 border-stone-800 pb-2 mb-2">
            <span className="text-base font-bold text-stone-800">Calories</span>
            <span className="text-3xl font-bold text-stone-800">{Math.round(rollup.perServing.calories)}</span>
          </div>
          <div className="space-y-1.5">
            {[
              ['Protein', rollup.perServing.protein],
              ['Carbohydrates', rollup.perServing.carbs],
              ['Fat', rollup.perServing.fat],
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-center justify-between text-sm border-b border-stone-200 py-1.5">
                <span className="font-semibold text-stone-700">{label}</span>
                <span className="font-mono text-stone-600">{(value as number).toFixed(1)}g</span>
              </div>
            ))}
          </div>
          {rollup.hasIncompleteData && (
            <p className="text-[11px] text-amber-600 font-semibold mt-3 italic">
              Partial estimate — some ingredients don't have nutrition data on file yet.
            </p>
          )}
        </div>
      </div>

      {rollup.allergens.length > 0 && (
        <div className="p-4 bg-rose-50 rounded-lg border border-rose-100">
          <div className="text-[10px] font-bold text-rose-600 uppercase tracking-widest mb-2">Contains</div>
          <div className="flex flex-wrap gap-2">
            {rollup.allergens.map((tag) => (
              <span
                key={tag}
                className="text-xs font-bold text-rose-700 bg-white px-2.5 py-1 rounded-full border border-rose-200 capitalize"
              >
                {tag.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {rollup.allergens.length === 0 && !rollup.hasIncompleteData && (
        <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold">
          <Salad size={16} />
          No flagged allergens on file
        </div>
      )}

      <p className="text-[10px] text-stone-400 italic leading-relaxed border-t border-stone-100 pt-4">
        {NUTRITION_DISCLAIMER}
      </p>
    </div>
  );
};
