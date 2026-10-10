/**
 * ownerPush.ts
 *
 * Telling an owner's phone something straight away, outside the 15-minute notification job: today only a customer's "I've paid
 * by UPI" (lib/payOnline.ts). It goes to every phone the owner has registered and not switched off (`users/{uid}/devices`), and a
 * phone Expo says is gone is switched off, as the job does. Nothing is sent to a phone that has never turned notifications on.
 */
import type { PushSender } from './expoPush';
import type { QuickDb } from './quickDb';
import type { OwnerMessage } from './payOnline';

export function createOwnerNotifier(deps: { db: QuickDb; send: PushSender; now: () => number }) {
  return async (uid: string, message: OwnerMessage): Promise<void> => {
    const devices = await deps.db.run(uid, async tx =>
      (await tx.all('devices')).filter(d => typeof d.token === 'string' && d.disabled !== true).map(d => ({ id: d.id, token: d.token as string })));
    if (devices.length === 0) return;
    const results = await deps.send(devices.map(d => ({ to: d.token, title: message.title, body: message.body, data: message.data })));
    const dead = devices.filter((_, i) => results[i]?.invalidToken);
    if (dead.length === 0) return;
    await deps.db.run(uid, async tx => {
      tx.apply(dead.map(d => ({ collection: 'devices' as const, id: d.id, merge: true, data: { disabled: true, disabledAt: deps.now() } })));
    });
  };
}
