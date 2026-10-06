/**
 * demoSeedRoutes.ts
 *
 * POST /api/mobile/demo/seed: fills a demo account with the sample kitchen, for the phone app's "Try the demo kitchen".
 * The web app does this from the browser with the client SDK; the phone app asks the server instead, so the sample data
 * (src/utils/demoData.ts) is not duplicated in the app. Only demo accounts (the ones the sign-in screen makes, recognised
 * by their email) may call it, and it does nothing for an account that already has its settings document, so it can be
 * retried safely and can never overwrite a real kitchen.
 */
import type { Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import type { AuthedRequest } from './auth';
import { isDemoAccountEmail } from './aiConfig';
import { buildDemoData } from '../src/utils/demoData';
import { todayInZone } from '../src/utils/localDate';

export interface DemoSeedDeps {
  /** Writes the sample kitchen unless the account already has one. Resolves to whether it wrote anything. */
  seed: (uid: string, today: string) => Promise<boolean>;
  now: () => number;
}

export function createDemoSeedHandler(deps: DemoSeedDeps) {
  return async (req: AuthedRequest, res: Response) => {
    if (!isDemoAccountEmail(req.email)) return res.status(403).json({ error: 'Only the demo kitchen can be filled with sample data.', code: 'not_demo' });
    try {
      const seeded = await deps.seed(req.uid!, todayInZone(undefined, new Date(deps.now())));
      return res.json({ seeded });
    } catch (err: any) {
      console.error('Demo seed failed:', err?.message);
      return res.status(500).json({ error: 'Could not set up the demo kitchen. Please try again.', code: 'seed_failed' });
    }
  };
}

/** The real thing: one Firestore transaction, so a second call finds the kitchen already there. */
export async function seedDemoKitchen(uid: string, today: string): Promise<boolean> {
  const db = getFirestore();
  const user = db.collection('users').doc(uid);
  const demo = buildDemoData(uid, today);
  return db.runTransaction(async t => {
    if ((await t.get(user.collection('settings').doc('bakery'))).exists) return false;
    t.set(user.collection('settings').doc('bakery'), demo.settings as Record<string, unknown>);
    const sets: [string, { id: string }[]][] = [
      ['materials', demo.materials], ['menu', demo.menu], ['orders', demo.orders],
      ['productionRuns', demo.productionRuns], ['experiments', demo.experiments], ['priceLog', demo.priceLog],
    ];
    for (const [name, docs] of sets) for (const d of docs) t.set(user.collection(name).doc(d.id), d as unknown as Record<string, unknown>);
    return true;
  });
}
