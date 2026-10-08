/**
 * Tests for firestore.rules, run against the real Firestore emulator
 * (`npm run test:rules`). Rules are additive (any matching rule that allows an
 * access grants it), which is exactly how an earlier version of the file ended
 * up with deny blocks that did nothing, so these tests state what must stay
 * impossible as well as what the apps need.
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OWNER = 'alice';
const OTHER = 'bob';

let env: RulesTestEnvironment;

/** Fixed data, written with the rules switched off, so tests start from the same state. */
const seed = () =>
  env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, `users/${OWNER}`), { billing: { status: 'trialing' } });
    await setDoc(doc(db, `users/${OWNER}/materials/m1`), { name: 'Flour' });
    await setDoc(doc(db, `users/${OWNER}/priceLog/p1`), { materialId: 'm1', unitCost: 1 });
    await setDoc(doc(db, `users/${OWNER}/integrationCredentials/shopify`), { token: 'secret' });
    await setDoc(doc(db, `users/${OWNER}/paymentGateway/active`), { provider: 'razorpay', secretEnc: 'v1.x.y.z' });
    await setDoc(doc(db, `users/${OTHER}/materials/m1`), { name: "Bob's flour" });
    await setDoc(doc(db, `users/${OWNER}/briefings/2026-06-30`), { headline: 'x' });
    await setDoc(doc(db, `users/${OWNER}/aiUsage/2026-06-30`), { chat: 3 });
    await setDoc(doc(db, 'aiUsageGlobal/2026-06-30'), { total: 10 });
    await setDoc(doc(db, 'bills/tok'), { uid: OWNER });
    await setDoc(doc(db, 'users/support'), { role: 'admin' });
    await setDoc(doc(db, 'users/plainuser'), { displayName: 'No role here' });
  });

const as = (uid: string, token: Record<string, unknown> = {}) => env.authenticatedContext(uid, token).firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-stockpot',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8089 },
  });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(); });

/** Every collection under users/{uid} that the web and mobile apps use directly. */
const BUSINESS_COLLECTIONS = ['materials', 'menu', 'orders', 'experiments', 'productionRuns', 'wastageLogs', 'settings'];

describe('the owner can use their own business data', () => {
  for (const name of BUSINESS_COLLECTIONS) {
    it(`reads, lists, writes, updates and deletes ${name}`, async () => {
      const db = as(OWNER);
      await assertSucceeds(setDoc(doc(db, `users/${OWNER}/${name}/x1`), { a: 1 }));
      await assertSucceeds(getDoc(doc(db, `users/${OWNER}/${name}/x1`)));
      await assertSucceeds(getDocs(collection(db, `users/${OWNER}/${name}`)));
      await assertSucceeds(updateDoc(doc(db, `users/${OWNER}/${name}/x1`), { a: 2 }));
      await assertSucceeds(setDoc(doc(db, `users/${OWNER}/${name}/x1`), { b: 1 }, { merge: true }));
      await assertSucceeds(deleteDoc(doc(db, `users/${OWNER}/${name}/x1`)));
    });
  }

  it('saves the bakery settings', async () => {
    await assertSucceeds(setDoc(doc(as(OWNER), `users/${OWNER}/settings/bakery`), { name: 'Asha Bakes' }, { merge: true }));
  });

  it('reads their own user document', async () => {
    await assertSucceeds(getDoc(doc(as(OWNER), `users/${OWNER}`)));
  });

  it('writes in one batch-sized burst, as the demo seed and a restock do', async () => {
    const db = as(OWNER);
    await assertSucceeds(Promise.all([
      setDoc(doc(db, `users/${OWNER}/materials/m9`), { name: 'Butter' }, { merge: true }),
      setDoc(doc(db, `users/${OWNER}/priceLog/p9`), { materialId: 'm9', unitCost: 2 }),
    ]));
  });
});

describe('the user document is server-only', () => {
  it('cannot be written by its owner, so billing status cannot be faked', async () => {
    await assertFails(setDoc(doc(as(OWNER), `users/${OWNER}`), { billing: { status: 'active' } }, { merge: true }));
    await assertFails(updateDoc(doc(as(OWNER), `users/${OWNER}`), { billing: { status: 'active' } }));
  });

  it('cannot be written to give oneself the admin role', async () => {
    await assertFails(setDoc(doc(as('mallory'), 'users/mallory'), { role: 'admin' }));
    await assertFails(setDoc(doc(as(OWNER), `users/${OWNER}`), { role: 'admin' }, { merge: true }));
  });

  it('cannot be created or deleted by its owner', async () => {
    await assertFails(setDoc(doc(as('newcomer'), 'users/newcomer'), { anything: true }));
    await assertFails(deleteDoc(doc(as(OWNER), `users/${OWNER}`)));
  });

  it('cannot be written by an admin either', async () => {
    await assertFails(setDoc(doc(as('support'), `users/${OTHER}`), { billing: { status: 'active' } }, { merge: true }));
  });
});

describe('integration credentials are server-only', () => {
  it("cannot be read, listed, written or deleted by the owner", async () => {
    const db = as(OWNER);
    await assertFails(getDoc(doc(db, `users/${OWNER}/integrationCredentials/shopify`)));
    await assertFails(getDocs(collection(db, `users/${OWNER}/integrationCredentials`)));
    await assertFails(setDoc(doc(db, `users/${OWNER}/integrationCredentials/shopify`), { token: 'mine' }));
    await assertFails(setDoc(doc(db, `users/${OWNER}/integrationCredentials/odoo`), { token: 'mine' }));
    await assertFails(deleteDoc(doc(db, `users/${OWNER}/integrationCredentials/shopify`)));
  });

  it('cannot be reached by an admin', async () => {
    await assertFails(getDoc(doc(as('support'), `users/${OWNER}/integrationCredentials/shopify`)));
  });
});

describe('the payment gateway keys are server-only', () => {
  it('cannot be read, listed, written or deleted by the owner, or reached by an admin', async () => {
    const db = as(OWNER);
    await assertFails(getDoc(doc(db, `users/${OWNER}/paymentGateway/active`)));
    await assertFails(getDocs(collection(db, `users/${OWNER}/paymentGateway`)));
    await assertFails(setDoc(doc(db, `users/${OWNER}/paymentGateway/active`), { provider: 'link', link: 'https://evil.example/' }));
    await assertFails(deleteDoc(doc(db, `users/${OWNER}/paymentGateway/active`)));
    await assertFails(getDoc(doc(as('support'), `users/${OWNER}/paymentGateway/active`)));
    await assertFails(getDoc(doc(as(OTHER), `users/${OWNER}/paymentGateway/active`)));
  });
});

describe('the ingredient price log is append-only', () => {
  it('can be read and added to', async () => {
    const db = as(OWNER);
    await assertSucceeds(getDoc(doc(db, `users/${OWNER}/priceLog/p1`)));
    await assertSucceeds(getDocs(collection(db, `users/${OWNER}/priceLog`)));
    await assertSucceeds(setDoc(doc(db, `users/${OWNER}/priceLog/p2`), { materialId: 'm1', unitCost: 2 }));
  });

  it('cannot have an entry edited, replaced or deleted', async () => {
    const db = as(OWNER);
    await assertFails(updateDoc(doc(db, `users/${OWNER}/priceLog/p1`), { unitCost: 99 }));
    await assertFails(setDoc(doc(db, `users/${OWNER}/priceLog/p1`), { unitCost: 99 }));
    await assertFails(setDoc(doc(db, `users/${OWNER}/priceLog/p1`), { unitCost: 99 }, { merge: true }));
    await assertFails(deleteDoc(doc(db, `users/${OWNER}/priceLog/p1`)));
  });

  it('cannot be edited or deleted by an admin either', async () => {
    const db = as('support');
    await assertFails(updateDoc(doc(db, `users/${OWNER}/priceLog/p1`), { unitCost: 99 }));
    await assertFails(deleteDoc(doc(db, `users/${OWNER}/priceLog/p1`)));
  });

  it("cannot be read or added to by another user", async () => {
    await assertFails(getDoc(doc(as(OTHER), `users/${OWNER}/priceLog/p1`)));
    await assertFails(setDoc(doc(as(OTHER), `users/${OWNER}/priceLog/p3`), { unitCost: 1 }));
  });
});

describe('AI briefings and usage counters are server-only', () => {
  it('lets the owner read a briefing but never write, change or delete one', async () => {
    const db = as(OWNER);
    await assertSucceeds(getDoc(doc(db, `users/${OWNER}/briefings/2026-06-30`)));
    await assertSucceeds(getDocs(collection(db, `users/${OWNER}/briefings`)));
    await assertFails(setDoc(doc(db, `users/${OWNER}/briefings/2026-07-01`), { headline: 'invented' }));
    await assertFails(updateDoc(doc(db, `users/${OWNER}/briefings/2026-06-30`), { headline: 'changed' }));
    await assertFails(deleteDoc(doc(db, `users/${OWNER}/briefings/2026-06-30`)));
  });

  it('keeps one user out of another\'s briefings', async () => {
    await assertFails(getDoc(doc(as(OTHER), `users/${OWNER}/briefings/2026-06-30`)));
    await assertFails(setDoc(doc(as(OTHER), `users/${OWNER}/briefings/2026-07-01`), { headline: 'x' }));
  });

  it('cannot be got round by writing a briefing as an admin either', async () => {
    await assertFails(setDoc(doc(as('support'), `users/${OWNER}/briefings/2026-07-01`), { headline: 'x' }));
  });

  it('hides the usage counters, so a user cannot reset their own daily allowance', async () => {
    const db = as(OWNER);
    await assertFails(getDoc(doc(db, `users/${OWNER}/aiUsage/2026-06-30`)));
    await assertFails(setDoc(doc(db, `users/${OWNER}/aiUsage/2026-06-30`), { chat: 0 }));
    await assertFails(deleteDoc(doc(db, `users/${OWNER}/aiUsage/2026-06-30`)));
    await assertFails(setDoc(doc(db, `users/${OWNER}/aiUsage/2026-07-01`), { chat: 0 }));
  });

  it('hides the global counter from everyone', async () => {
    await assertFails(getDoc(doc(as(OWNER), 'aiUsageGlobal/2026-06-30')));
    await assertFails(setDoc(doc(as(OWNER), 'aiUsageGlobal/2026-06-30'), { total: 0 }));
    await assertFails(getDoc(doc(as('support'), 'aiUsageGlobal/2026-06-30')));
  });
});

describe('each user sees only their own data', () => {
  it("cannot read or write another user's business data", async () => {
    const db = as(OWNER);
    await assertFails(getDoc(doc(db, `users/${OTHER}/materials/m1`)));
    await assertFails(getDocs(collection(db, `users/${OTHER}/materials`)));
    await assertFails(setDoc(doc(db, `users/${OTHER}/materials/m9`), { name: 'x' }));
    await assertFails(deleteDoc(doc(db, `users/${OTHER}/materials/m1`)));
  });

  it("cannot read another user's user document", async () => {
    await assertFails(getDoc(doc(as(OWNER), `users/${OTHER}`)));
  });

  it('cannot reach anything when signed out', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, `users/${OWNER}/materials/m1`)));
    await assertFails(setDoc(doc(db, `users/${OWNER}/materials/m9`), { name: 'x' }));
    await assertFails(getDoc(doc(db, `users/${OWNER}`)));
  });
});

describe('support access', () => {
  it("an admin by role can read and write any user's business data", async () => {
    const db = as('support');
    await assertSucceeds(getDoc(doc(db, `users/${OTHER}/materials/m1`)));
    await assertSucceeds(setDoc(doc(db, `users/${OTHER}/materials/m5`), { name: 'support fix' }));
    await assertSucceeds(getDoc(doc(db, `users/${OTHER}`)));
  });

  it('the owner address with a verified email has the same access', async () => {
    const db = as('someone', { email: 'manishmutalik@gmail.com', email_verified: true });
    await assertSucceeds(getDoc(doc(db, `users/${OTHER}/materials/m1`)));
    await assertSucceeds(setDoc(doc(db, `users/${OTHER}/materials/m6`), { name: 'support fix' }));
  });

  it('the owner address with an unverified email has none', async () => {
    const db = as('someone', { email: 'manishmutalik@gmail.com', email_verified: false });
    await assertFails(getDoc(doc(db, `users/${OTHER}/materials/m1`)));
  });

  it('a user whose document has no role has none', async () => {
    await assertFails(getDoc(doc(as('plainuser'), `users/${OTHER}/materials/m1`)));
  });

  it('claiming admin in a token does not grant it', async () => {
    await assertFails(getDoc(doc(as('mallory', { role: 'admin', admin: true }), `users/${OTHER}/materials/m1`)));
  });
});

describe('everything that is not planned for is denied', () => {
  it('a collection under a user that is not in the list', async () => {
    await assertFails(setDoc(doc(as(OWNER), `users/${OWNER}/surprise/x1`), { a: 1 }));
    await assertFails(getDoc(doc(as(OWNER), `users/${OWNER}/surprise/x1`)));
  });

  it('a collection nested deeper than a business collection', async () => {
    await assertFails(setDoc(doc(as(OWNER), `users/${OWNER}/materials/m1/nested/n1`), { a: 1 }));
    await assertFails(setDoc(doc(as(OWNER), `users/${OWNER}/priceLog/p1/nested/n1`), { a: 1 }));
  });

  it('the public bill snapshots, which only the server touches', async () => {
    const db = as(OWNER);
    await assertFails(getDoc(doc(db, 'bills/tok')));
    await assertFails(setDoc(doc(db, 'bills/tok'), { uid: OWNER }));
    await assertFails(setDoc(doc(db, 'bills/new'), { uid: OWNER }));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'bills/tok')));
  });

  it('any other top-level collection', async () => {
    await assertFails(getDoc(doc(as(OWNER), 'test/connection')));
    await assertFails(setDoc(doc(as(OWNER), 'stuff/x'), { a: 1 }));
  });
});
