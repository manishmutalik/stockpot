import { WastageLog } from '../types';
import type { ProductionRun } from '../components/ProductionRunModal';

export interface ReasonBreakdown {
  reason: string;
  cost: number;
  count: number;
  /** Share of total loss, 0-100. */
  percent: number;
}

export interface WastageSummary {
  totalLoss: number;
  count: number;
  materialCount: number;
  recipeCount: number;
  /** Reasons ordered by cost, biggest first. */
  byReason: ReasonBreakdown[];
  /** Total loss as a share of total production spend, or null with no production cost to compare to. */
  lossVsProductionPercent: number | null;
}

export const UNSPECIFIED_REASON = 'No reason given';

export const reasonOf = (log: Pick<WastageLog, 'reason'>) => (log.reason || '').trim() || UNSPECIFIED_REASON;

export function summarizeWastage(logs: WastageLog[], productionRuns: ProductionRun[]): WastageSummary {
  const totalLoss = logs.reduce((s, l) => s + (l.cost || 0), 0);
  const groups = new Map<string, { cost: number; count: number }>();
  for (const l of logs) {
    const key = reasonOf(l);
    const g = groups.get(key) || { cost: 0, count: 0 };
    g.cost += l.cost || 0;
    g.count += 1;
    groups.set(key, g);
  }
  const byReason = Array.from(groups, ([reason, g]) => ({
    reason,
    cost: g.cost,
    count: g.count,
    percent: totalLoss > 0 ? (g.cost / totalLoss) * 100 : 0,
  })).sort((a, b) => b.cost - a.cost || b.count - a.count || a.reason.localeCompare(b.reason));

  const productionCost = productionRuns.reduce((s, r) => s + (r.costTotal || 0), 0);
  return {
    totalLoss,
    count: logs.length,
    materialCount: logs.filter(l => l.type === 'material').length,
    recipeCount: logs.filter(l => l.type === 'recipe').length,
    byReason,
    lossVsProductionPercent: productionCost > 0 ? (totalLoss / productionCost) * 100 : null,
  };
}
