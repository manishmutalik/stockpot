import { RawMaterial, RecipeExperiment } from '../types';
import { convertAmount } from './conversions';

/** Raw-material cost of one experiment at current material prices. */
export function experimentCost(exp: RecipeExperiment, materials: RawMaterial[]): number {
  return exp.materials.reduce((total, req) => {
    const mat = materials.find(m => m.id === req.materialId);
    if (!mat) return total;
    return total + convertAmount(req.amount, req.unit || 'g', mat.unit) * (mat.costPerUnit || 0);
  }, 0);
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
  today: string
): RndSummary {
  const month = today.slice(0, 7);
  let totalCost = 0;
  let monthCost = 0;
  let monthSessions = 0;
  const seen = new Set<string>();
  for (const exp of experiments) {
    const cost = experimentCost(exp, materials);
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
