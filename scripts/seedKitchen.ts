/**
 * seedKitchen.ts
 *
 * Fills an empty Stockpot account with a sample kitchen, for demos and the demo video: three weeks of orders, recipes,
 * stock, production runs, price history, wastage and overheads that add up the way a real kitchen's do.
 *
 *   npm run seed:kitchen -- --email you@example.com              fill an account you have already made
 *   npm run seed:kitchen -- --email you@example.com --create     make the account first (a verification email is sent)
 *   npm run seed:kitchen -- --email you@example.com --kitchen bakery
 *   npm run seed:kitchen -- --dry-run                            show what would be written, without signing in
 *
 * The password is read from STOCKPOT_PASSWORD, or asked for. It signs in as that account, through the same rules as the
 * app, so it can only ever write to that account; and it stops if the account already has materials, a menu or orders,
 * so it can never overwrite real data. Settings the account already has (its name, time zone, GST) are kept; the
 * sample fills only what is blank.
 */
import { createInterface } from 'node:readline/promises';
import { initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, sendEmailVerification, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, initializeFirestore, limit, query, writeBatch } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { BAKERY, buildKitchenData } from '../src/utils/demoData';
import { CLOUD_KITCHEN } from '../src/utils/cloudKitchenData';
import { todayInZone } from '../src/utils/localDate';

const KITCHENS = { cloud: CLOUD_KITCHEN, bakery: BAKERY };
/** Writes per batch: Firestore allows 500. */
const BATCH_SIZE = 400;

function args() {
  const argv = process.argv.slice(2);
  const value = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  const kitchen = (value('kitchen') ?? 'cloud') as keyof typeof KITCHENS;
  if (!(kitchen in KITCHENS)) throw new Error(`--kitchen must be one of: ${Object.keys(KITCHENS).join(', ')}`);
  return { email: value('email'), kitchen, create: argv.includes('--create'), dryRun: argv.includes('--dry-run'), name: value('name') };
}

/** A setting someone has filled in: not empty text, an empty list or an empty map. */
const isSet = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
  && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);

/** Every document to write, as [collection, id, data]; the settings live at settings/bakery, as the app keeps them. */
function documents(uid: string, email: string, kitchen: keyof typeof KITCHENS, existingSettings: Record<string, unknown> = {}) {
  const today = todayInZone('Asia/Kolkata');
  const data = buildKitchenData(KITCHENS[kitchen], uid, today, email);
  const kept = Object.fromEntries(Object.entries(existingSettings).filter(([, v]) => isSet(v)));
  const docs: [string, string, object][] = [['settings', 'bakery', { ...data.settings, ...kept }]];
  const add = (collection: string, items: { id: string }[]) => items.forEach(item => docs.push([collection, item.id, item]));
  add('materials', data.materials);
  add('menu', data.menu);
  add('orders', data.orders);
  add('productionRuns', data.productionRuns);
  add('experiments', data.experiments);
  add('priceLog', data.priceLog);
  add('wastageLogs', data.wastageLogs);
  return { today, docs };
}

function summary(docs: [string, string, object][]) {
  const counts = new Map<string, number>();
  for (const [collection] of docs) counts.set(collection, (counts.get(collection) ?? 0) + 1);
  return [...counts].map(([c, n]) => `${n} ${c}`).join(', ');
}

async function main() {
  const { email, kitchen, create, dryRun, name } = args();
  if (dryRun) {
    const { today, docs } = documents('dry-run', email ?? 'you@example.com', kitchen);
    console.log(`The ${kitchen} kitchen as of ${today}: ${summary(docs)}.`);
    return;
  }
  if (!email) throw new Error('Give the account with --email you@example.com');
  let password = process.env.STOCKPOT_PASSWORD;
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question(`Password for ${email}: `);
    rl.close();
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  const { user } = create ? await createUserWithEmailAndPassword(auth, email, password) : await signInWithEmailAndPassword(auth, email, password);
  if (create) {
    await updateProfile(user, { displayName: name ?? KITCHENS[kitchen].name });
    await sendEmailVerification(user);
    console.log(`Made the account ${email}. A verification email is on its way: open it before using the AI features.`);
  }

  // Signing in to the app writes default settings, so an account counts as empty until it has materials, a menu or orders.
  for (const c of ['materials', 'menu', 'orders']) {
    if (!(await getDocs(query(collection(db, 'users', user.uid, c), limit(1)))).empty) {
      throw new Error(`${email} already has ${c}. This only fills an empty account, so nothing was written.`);
    }
  }
  const existing = await getDoc(doc(db, 'users', user.uid, 'settings', 'bakery'));

  const { today, docs } = documents(user.uid, email, kitchen, existing.data());
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const [collection, id, data] of docs.slice(i, i + BATCH_SIZE)) batch.set(doc(db, 'users', user.uid, collection, id), data);
    await batch.commit();
  }
  console.log(`Filled ${email} with the ${kitchen} kitchen as of ${today}: ${summary(docs)}.`);
  await signOut(auth);
}

main().then(() => process.exit(0), (err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
