/**
 * priceLog.ts
 *
 * Pure helpers for the ingredient price log: building an entry and listing a
 * material's history. Kept free of React and Firebase so it is unit tested on
 * its own and shared by the hooks that write entries and the view that lists
 * them.
 */
import type { PriceLogEntry, PriceLogSource, RawMaterial } from '../types';
import { UNIT_CONVERSIONS } from './conversions';

const round6 = (n: number) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;

export const PRICE_SOURCE_LABELS: Record<PriceLogSource, string> = {
  initial: 'Opening cost',
  restock: 'Restock',
  manual_edit: 'Edited by hand',
  goods_receipt: 'Goods receipt',
};

/** A new entry, ready to write. Costs are kept to six decimals, like material costs. */
export function newPriceLogEntry(input: {
  materialId: string;
  unit: string;
  unitCost: number;
  quantity?: number;
  macAfter?: number;
  source: PriceLogSource;
  /** YYYY-MM-DD; defaults to today. */
  date?: string;
  now?: number;
}): PriceLogEntry {
  const now = input.now ?? Date.now();
  return {
    id: Math.random().toString(36).slice(2, 11),
    materialId: input.materialId,
    date: input.date ?? new Date(now).toISOString().split('T')[0],
    unitCost: round6(input.unitCost),
    unit: input.unit,
    ...(input.quantity != null && { quantity: round6(input.quantity) }),
    ...(input.macAfter != null && { macAfter: round6(input.macAfter) }),
    source: input.source,
    createdAt: now,
  };
}

export interface PriceHistoryRow {
  id: string;
  date: string;
  source: PriceLogSource;
  /** Price per `unit`, shown in the material's current unit when the entry's unit can be converted to it. */
  unitCost: number;
  unit: string;
  quantity?: number;
  macAfter?: number;
}

/**
 * A material's price history, newest first. A material can change unit after
 * entries were written (kg to g, say), so each entry is shown in the material's
 * current unit when the two convert; across unit families it keeps the unit it
 * was recorded in rather than being guessed at.
 */
export function priceHistory(entries: PriceLogEntry[], material: Pick<RawMaterial, 'id' | 'unit'>): PriceHistoryRow[] {
  const current = material.unit || 'g';
  return entries
    .filter(e => e.materialId === material.id)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0) || b.id.localeCompare(a.id))
    .map(e => {
      const from = e.unit || current;
      const factor = from === current ? 1 : UNIT_CONVERSIONS[from]?.[current];
      if (factor === undefined || factor === 0) {
        return { id: e.id, date: e.date, source: e.source, unitCost: e.unitCost, unit: from, quantity: e.quantity, macAfter: e.macAfter };
      }
      return {
        id: e.id, date: e.date, source: e.source, unit: current,
        unitCost: round6(e.unitCost / factor),
        quantity: e.quantity != null ? round6(e.quantity * factor) : undefined,
        macAfter: e.macAfter != null ? round6(e.macAfter / factor) : undefined,
      };
    });
}
