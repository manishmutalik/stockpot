import { RawMaterial, RecipeExperiment } from '../types';
import { convertAmount } from './conversions';

/**
 * Projected raw-material usage from recipe experiments — the only source of
 * "pending, not yet deducted" material consumption left under the
 * production-run/order redesign. Orders never factor in here: raw
 * materials are deducted exactly once, at production time
 * (logProductionRun/deductIngredients) — an order only ever claims
 * finished-goods stock (a separate field), fulfilled or not, so it never
 * draws on raw materials itself. Experiments are different: logging one
 * never touches `initialStock` for real, so its material list stays a
 * standing projection until the material is restocked/adjusted by hand.
 *
 * Returns a map of materialId -> total amount used, in that material's own
 * stored unit.
 */
export function getExperimentMaterialUsage(
  experiments: RecipeExperiment[],
  materials: RawMaterial[]
): Record<string, number> {
  const usage: Record<string, number> = {};
  for (const exp of experiments) {
    for (const req of exp.materials) {
      const mat = materials.find(m => m.id === req.materialId);
      if (!mat) continue;
      const convertedAmount = convertAmount(req.amount, req.unit || 'g', mat.unit);
      usage[req.materialId] = (usage[req.materialId] || 0) + convertedAmount;
    }
  }
  return usage;
}
