/**
 * Stock and expiry classification for raw materials, shared by the Inventory
 * screen's status pills, filters and summary cards.
 */

/** A material this close to its threshold (within 25% above it) is "reorder soon". */
export const REORDER_SOON_MARGIN = 0.25;

/** Expiry dates within this many days (inclusive) are flagged as expiring. */
export const EXPIRING_SOON_DAYS = 3;

export type StockStatus = 'low' | 'reorder' | 'ok';
export type ExpiryState = 'none' | 'ok' | 'expiring' | 'expired';

/**
 * `low` mirrors the app-wide low-stock alert rule (an explicit threshold > 0
 * and remaining at or below it) so the pills never disagree with the header
 * badge. `reorder` is the warning band just above that line.
 */
export function getStockStatus(remaining: number, threshold?: number): StockStatus {
  const t = threshold ?? 0;
  if (t <= 0) return 'ok';
  if (remaining <= t) return 'low';
  if (remaining <= t * (1 + REORDER_SOON_MARGIN)) return 'reorder';
  return 'ok';
}

/** How far below its threshold a material is, as a whole percent (0 when at/above). */
export function getParDeficitPercent(remaining: number, threshold?: number): number {
  const t = threshold ?? 0;
  if (t <= 0 || remaining >= t) return 0;
  return Math.min(100, Math.round((1 - Math.max(remaining, 0) / t) * 100));
}

export function getExpiryInfo(
  expiryDate: string | undefined | null,
  now: Date = new Date()
): { state: ExpiryState; daysLeft: number | null } {
  if (!expiryDate) return { state: 'none', daysLeft: null };
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return { state: 'none', daysLeft: null };
  expiry.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
  if (daysLeft < 0) return { state: 'expired', daysLeft };
  if (daysLeft <= EXPIRING_SOON_DAYS) return { state: 'expiring', daysLeft };
  return { state: 'ok', daysLeft };
}
