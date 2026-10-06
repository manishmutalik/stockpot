import type { StatusKind } from '../../../src/utils/quickApiTypes';

/** Where tapping a status line on Today goes, when there is somewhere yet. */
export type StatusTarget = 'upcoming' | null;

export function statusTarget(kind: StatusKind): StatusTarget {
  return kind === 'orders_due' ? 'upcoming' : null;
}
