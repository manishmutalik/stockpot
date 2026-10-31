/**
 * waitlistRoutes.ts
 *
 * POST /api/waitlist: the landing page's "Join the waitlist", before launch. Public (no sign-in), so it is kept small and
 * careful:
 *  - the entry is checked as the form checks it (src/utils/waitlist);
 *  - a hidden field people never see (`website`) catches simple bots: if it is filled the request is thanked and dropped;
 *  - each address may send a few a quarter-hour (WAITLIST_LIMIT), counted in memory, which is enough against a script
 *    hammering the form from one place;
 *  - one entry per contact: the document id is a hash of the number or email, so signing up again updates it.
 * Entries go to the top-level `waitlist` collection, which no app can read or write (firestore.rules); the owner reads them
 * in the Firebase console. Nothing about them is logged. A new sign-up (not someone signing up again) is also emailed to the
 * owner (`notify`, lib/email), without holding up the answer: if the email fails, the sign-up still stands.
 */
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { checkWaitlist, type WaitlistEntry } from '../src/utils/waitlist';

export const WAITLIST_LIMIT = { count: 5, windowMs: 15 * 60 * 1000 };

export interface WaitlistStore {
  /** Saves the entry under `id`; resolves whether it was new, and how many are on the list now. */
  save(id: string, entry: WaitlistEntry, at: number): Promise<{ created: boolean; total: number }>;
}

export interface WaitlistDeps {
  store: WaitlistStore;
  now: () => number;
  /** Tells the owner about a new sign-up. */
  notify?: (entry: WaitlistEntry, info: { total: number; at: number }) => Promise<unknown>;
}

/** The owner's email about a new sign-up: who, how to reach them (a WhatsApp link for a number), and how many are on the list. */
export function waitlistEmail(entry: WaitlistEntry, info: { total: number; at: number }): { subject: string; text: string } {
  const about = [entry.business, entry.city].filter(Boolean).join(', ');
  const when = new Date(info.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  const reach = entry.contactType === 'whatsapp'
    ? `WhatsApp: +91 ${entry.contact.slice(0, 5)} ${entry.contact.slice(5)}\nMessage them: https://wa.me/91${entry.contact}`
    : `Email: ${entry.contact}`;
  return {
    subject: `New waitlist sign-up: ${entry.name}${about ? ` (${about})` : ''}`,
    text: [
      `${entry.name} joined the Stockpot waitlist.`,
      '',
      reach,
      `Business: ${entry.business ?? 'not given'}`,
      `City: ${entry.city ?? 'not given'}`,
      `Signed up: ${when} IST`,
      '',
      `${info.total} ${info.total === 1 ? 'person is' : 'people are'} on the waitlist now. See them all in the Firebase console, Firestore Database, waitlist.`,
    ].join('\n'),
  };
}

/** The same contact always gets the same id. */
export const waitlistId = (contact: string) => createHash('sha256').update(contact).digest('hex').slice(0, 32);

/** Who sent the request: the first address Render's proxy forwarded, else the connection's. */
const clientKey = (req: Request) => (String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.ip || 'unknown');

export function createWaitlistHandler(deps: WaitlistDeps) {
  const recent = new Map<string, number[]>();
  return async (req: Request, res: Response) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      if (typeof body.website === 'string' && body.website.trim() !== '') return res.json({ ok: true });

      const now = deps.now();
      const key = clientKey(req);
      const times = (recent.get(key) ?? []).filter(t => now - t < WAITLIST_LIMIT.windowMs);
      if (times.length >= WAITLIST_LIMIT.count) {
        return res.status(429).json({ error: 'Too many tries from here. Please try again in a little while.', code: 'too_many' });
      }
      times.push(now);
      recent.set(key, times);
      if (recent.size > 5000) for (const [k, ts] of recent) if (ts.every(t => now - t >= WAITLIST_LIMIT.windowMs)) recent.delete(k);

      const checked = checkWaitlist(body);
      if (checked.ok === false) return res.status(400).json({ error: checked.message, field: checked.field, code: 'bad_request' });

      const { created, total } = await deps.store.save(waitlistId(checked.entry.contact), checked.entry, now);
      if (created && deps.notify) {
        deps.notify(checked.entry, { total, at: now }).catch((err: unknown) => console.error('Waitlist email failed:', (err as Error)?.message));
      }
      return res.json({ ok: true, created });
    } catch (err: unknown) {
      console.error('Waitlist sign-up failed:', (err as Error)?.message);
      return res.status(500).json({ error: 'That did not go through. Please try again.' });
    }
  };
}

/** The Firestore store: `waitlist/{id}`, keeping when the person first signed up. */
export function createAdminWaitlistStore(): WaitlistStore {
  return {
    async save(id, entry, at) {
      const db = getFirestore();
      const ref = db.collection('waitlist').doc(id);
      const created = await db.runTransaction(async tx => {
        const existing = await tx.get(ref);
        const when = new Date(at).toISOString();
        tx.set(ref, { ...entry, updatedAt: when, ...(!existing.exists && { createdAt: when }) }, { merge: true });
        return !existing.exists;
      });
      const total = (await db.collection('waitlist').count().get()).data().count;
      return { created, total };
    },
  };
}
