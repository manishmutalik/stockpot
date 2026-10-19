import { MenuItem, RawMaterial, RecipeExperiment } from '../types';
import { convertAmount } from './conversions';
import { costView, partsOf } from './itemParts';
import { recipeCost } from './menuStats';

type Costed = Pick<MenuItem, 'id' | 'recipe' | 'parts'>;

/** What one of a made item costs (a piece, or a kg or litre of one counted by measure): its ingredients, parts included. */
export function madeItemCost(item: Costed, menu: Costed[], materials: RawMaterial[]): number {
  return recipeCost(costView(item, menu).recipe, materials);
}

/** The bases, fillings and other made items an experiment used. */
export const experimentParts = (exp: RecipeExperiment) => partsOf({ id: exp.id, parts: exp.parts });

/**
 * Cost of one experiment at current material prices: its raw materials, and the made items it used at what their
 * ingredients cost. A made item used here is not sold, wasted or counted anywhere else, so this is its one cost.
 */
export function experimentCost(exp: RecipeExperiment, materials: RawMaterial[], menu: Costed[] = []): number {
  const materialCost = exp.materials.reduce((total, req) => {
    const mat = materials.find(m => m.id === req.materialId);
    if (!mat) return total;
    return total + convertAmount(req.amount, req.unit || 'g', mat.unit) * (mat.costPerUnit || 0);
  }, 0);
  return experimentParts(exp).reduce((total, part) => {
    const item = menu.find(m => m.id === part.itemId);
    return item ? total + madeItemCost(item, menu, materials) * part.quantity : total;
  }, materialCost);
}

export interface RndSummary {
  sessions: number;
  totalCost: number;
  /** Cost of sessions dated in `today`'s calendar month. */
  monthCost: number;
  monthSessions: number;
  avgCost: number;
  /** Distinct raw materials tried across all sessions. */
  distinctMaterials: number;
}

export function summarizeExperiments(
  experiments: RecipeExperiment[],
  materials: RawMaterial[],
  today: string,
  menu: Costed[] = []
): RndSummary {
  const month = today.slice(0, 7);
  let totalCost = 0;
  let monthCost = 0;
  let monthSessions = 0;
  const seen = new Set<string>();
  for (const exp of experiments) {
    const cost = experimentCost(exp, materials, menu);
    totalCost += cost;
    if (exp.date.startsWith(month)) { monthCost += cost; monthSessions += 1; }
    exp.materials.forEach(r => seen.add(r.materialId));
  }
  return {
    sessions: experiments.length,
    totalCost,
    monthCost,
    monthSessions,
    avgCost: experiments.length > 0 ? totalCost / experiments.length : 0,
    distinctMaterials: seen.size,
  };
}
