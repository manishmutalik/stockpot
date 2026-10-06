/**
 * The shared shape of a "plan": what an action will write, worked out without
 * touching Firebase. The web hooks commit a plan with the client SDK; the phone
 * app's server endpoints commit the same plan inside an Admin SDK transaction,
 * so both paths write exactly the same documents.
 *
 * Plans are pure: everything they need (current documents, today's date, an id
 * generator, the clock) is passed in, so they are deterministic and unit tested
 * with plain objects.
 */

/** The collections under `users/{uid}` that an action can write to. */
export type PlanCollection = 'orders' | 'menu' | 'materials' | 'priceLog' | 'productionRuns';

/** One document write: `merge: true` updates only these fields, otherwise the document is replaced. */
export interface PlannedWrite {
  collection: PlanCollection;
  id: string;
  data: Record<string, unknown>;
  merge: boolean;
}

/** Why a plan could not be made: `title` and `message` are what the owner sees, `thrown` is the developer-facing error text. */
export interface PlanError {
  code: string;
  title: string;
  message: string;
  thrown: string;
}

/** The two things a plan needs from outside: a source of ids and the clock. */
export interface PlanContext {
  newId: () => string;
  now: () => number;
}

/** The default id: nine base-36 characters, as documents have always been given. */
export const randomId = (): string => Math.random().toString(36).substr(2, 9);

/**
 * Collapses several writes to the same document into one, in the order they
 * were planned: a later write to a document replaces an earlier one's fields. A
 * transaction should touch each document once, and a multi-step plan (a
 * production session) writes the same ingredient or menu item more than once.
 */
export function collapseWrites(writes: PlannedWrite[]): PlannedWrite[] {
  const out = new Map<string, PlannedWrite>();
  for (const w of writes) {
    const key = `${w.collection}/${w.id}`;
    const earlier = out.get(key);
    if (!earlier) { out.set(key, { ...w, data: { ...w.data } }); continue; }
    out.set(key, { ...earlier, merge: earlier.merge && w.merge, data: w.merge ? { ...earlier.data, ...w.data } : { ...w.data } });
  }
  return [...out.values()];
}
