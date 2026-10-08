import type { StatusKind } from '../../../src/utils/quickApiTypes';

/** Where tapping a status line on Today goes, when there is somewhere yet. */
export type StatusTarget = 'upcoming' | 'payments' | null;

export function statusTarget(kind: StatusKind): StatusTarget {
  if (kind === 'orders_due') return 'upcoming';
  return kind === 'payments_pending' ? 'payments' : null;
}
