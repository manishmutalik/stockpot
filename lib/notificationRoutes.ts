/**
 * notificationRoutes.ts
 *
 * POST /api/internal/notifications/run: what the scheduler calls every 15 minutes to send the phone app's notifications.
 * It is not for people or the app: it is protected by a shared secret (`NOTIFICATIONS_CRON_SECRET`, sent as a Bearer
 * token) and is switched off while that is not set. On Render it is a Cron Job that runs
 *   curl -fsS -X POST -H "Authorization: Bearer $NOTIFICATIONS_CRON_SECRET" "$APP_URL/api/internal/notifications/run"
 * with the schedule `0,15,30,45 * * * *`. A run that starts while another is still going is refused (409).
 */
import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import type { JobSummary } from './notificationJob';

export interface NotificationRunDeps {
  secret: () => string | undefined;
  run: () => Promise<JobSummary>;
}

/** Compares two strings without leaking, by timing, how much of the secret was right. */
export function secretMatches(given: string, secret: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createNotificationRunHandler(deps: NotificationRunDeps) {
  let running = false;
  return async (req: Request, res: Response) => {
    const secret = deps.secret();
    if (!secret || secret.length < 16) return res.status(503).json({ error: 'Notifications are not set up on this server.', code: 'not_configured' });
    const header = req.headers.authorization ?? '';
    const given = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!given || !secretMatches(given, secret)) return res.status(401).json({ error: 'Not allowed.', code: 'unauthorized' });
    if (running) return res.status(409).json({ error: 'A run is already going.', code: 'busy' });

    running = true;
    try {
      const summary = await deps.run();
      return res.json(summary);
    } catch (err: any) {
      console.error('Notification run failed:', err?.message);
      return res.status(500).json({ error: 'The run failed.', code: 'run_failed' });
    } finally {
      running = false;
    }
  };
}

/** Every owner with at least one phone that has not been switched off. Reads only each phone's `disabled` flag. */
export async function listUsersWithDevices(): Promise<string[]> {
  const snap = await getFirestore().collectionGroup('devices').select('disabled').get();
  const owners = new Set<string>();
  for (const doc of snap.docs) {
    const owner = doc.ref.parent.parent;
    if (owner && owner.parent.id === 'users' && doc.get('disabled') !== true) owners.add(owner.id);
  }
  return [...owners];
}
