import { ProductionRun } from '../components/ProductionRunModal';

/**
 * How urgently an unsold production batch needs a freshness check.
 *
 * This is the single source of truth for "what needs attention right now"
 * — read today by the header's freshness alert and the Market Stock view,
 * and designed to be reused unchanged by a future push-notification channel
 * (see the production-run/order redesign plan) once one exists. This phase
 * is UI-only: there's no scheduling here, just a pure computation that gets
 * re-read every time the app is open.
 */
export type StockUrgency = 'fresh' | 'aging' | 'expired';

const URGENCY_RANK: Record<StockUrgency, number> = { expired: 0, aging: 1, fresh: 2 };

/** After this many days with no known expiry, unsold stock is flagged as aging. */
export const AGING_THRESHOLD_DAYS = 2;
/** Flag stock as aging once it's this many days (or fewer) from a known expiry. */
export const EXPIRING_SOON_WINDOW_DAYS = 1;

/**
 * Whole calendar days from `from` to `to` (both YYYY-MM-DD). Zeroes out
 * time-of-day by parsing as local midnight, so date-only strings compare by
 * calendar day rather than a fixed 24h window.
 */
export function daysBetween(from: string, to: string): number {
  const fromDate = new Date(from + 'T00:00:00');
  const toDate = new Date(to + 'T00:00:00');
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

/**
 * Urgency tier for one unsold batch, as of `today` (YYYY-MM-DD — passed
 * explicitly rather than defaulted to `new Date()` so this stays pure and
 * testable).
 *
 * With a known expiry (the recipe has shelfLifeDays set, so the batch has
 * an `expiryDate`): 'expired' once that date has passed, 'aging' once it's
 * within EXPIRING_SOON_WINDOW_DAYS of it, otherwise 'fresh'.
 *
 * Without one, there's no real expiry to watch, so this falls back to a
 * flat "how long has it been sitting" rule: 'aging' once
 * AGING_THRESHOLD_DAYS have passed since it was produced, otherwise
 * 'fresh'. Never 'expired' in this case — there's no known date to have
 * passed, only a growing likelihood it needs a look.
 */
export function getStockUrgency(
  batch: Pick<ProductionRun, 'date' | 'expiryDate'>,
  today: string
): StockUrgency {
  if (batch.expiryDate) {
    const daysUntilExpiry = daysBetween(today, batch.expiryDate);
    if (daysUntilExpiry < 0) return 'expired';
    if (daysUntilExpiry <= EXPIRING_SOON_WINDOW_DAYS) return 'aging';
    return 'fresh';
  }
  return daysBetween(batch.date, today) >= AGING_THRESHOLD_DAYS ? 'aging' : 'fresh';
}

/**
 * Every unsold batch (remainingQuantity > 0) needing attention today —
 * 'aging' or 'expired' — sorted most urgent first. Backs the header's
 * freshness alert.
 */
export function getBatchesNeedingAttention(
  productionRuns: ProductionRun[],
  today: string
): { run: ProductionRun; urgency: StockUrgency }[] {
  return productionRuns
    .filter(r => (r.remainingQuantity ?? 0) > 0)
    .map(run => ({ run, urgency: getStockUrgency(run, today) }))
    .filter((entry): entry is { run: ProductionRun; urgency: 'aging' | 'expired' } => entry.urgency !== 'fresh')
    .sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]);
}

/**
 * The worst (most urgent) tier among one menu item's own unsold batches, or
 * 'fresh' if none need attention. Market Stock shows stock aggregated per
 * menu item rather than per individual batch, so a single item's badge
 * reflects its least-fresh remaining batch — the one that actually needs
 * checking first.
 */
export function getWorstUrgencyForItem(
  recipeId: string,
  productionRuns: ProductionRun[],
  today: string
): StockUrgency {
  let worst: StockUrgency = 'fresh';
  for (const run of productionRuns) {
    if (run.recipeId !== recipeId || (run.remainingQuantity ?? 0) <= 0) continue;
    const urgency = getStockUrgency(run, today);
    if (URGENCY_RANK[urgency] < URGENCY_RANK[worst]) worst = urgency;
  }
  return worst;
}
