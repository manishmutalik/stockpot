# Stockpot

An inventory, recipe-costing, and production management app for home chefs,
bakers, and small online food stores: track raw materials, recipes, orders,
production runs, wastage, and (optionally) sync orders in from Shopify or
Odoo.

## Architecture

- **Frontend:** React 19 + TypeScript, built with Vite, styled with Tailwind CSS.
  State and business logic live in feature-scoped hooks under `src/hooks/`
  (`useIntegrations`, `useSettings`, `useInventoryActions`, `useMenuActions`,
  `useOrderActions`, `useProductionActions`, `useExperimentActions`,
  `useWastageActions`); `src/App.tsx` composes them and owns the shared
  Firestore data listener. `src/views/` holds one component per tab
  (Inventory, Menu, Orders, Production, Experiments, Summary, Wastage,
  Settings).
- **Backend:** a small Express server (`server.ts`) that proxies the Shopify
  and Odoo integrations. It never talks to your database directly — auth and
  data live in Firebase.
- **Data:** Firebase Authentication (email/password + Google) and Firestore
  (per-user documents under `users/{uid}/...`). See `firestore.rules` for the
  security rules.
- **Integration credentials:** Shopify tokens and Odoo credentials are
  encrypted (`lib/crypto.ts`) and stored in Firestore
  (`lib/integrationStore.ts`, via the Firebase Admin SDK at
  `users/{uid}/integrationCredentials/{provider}`), keyed by the
  authenticated Firebase user — never sent to or stored in the browser, and
  not on any single server's local disk. `firestore.rules` explicitly denies
  client-side access to that subcollection; only the trusted server (which
  bypasses security rules via the Admin SDK) can read or write it.
- **Billing:** subscriptions are handled by Razorpay (`lib/razorpay.ts`,
  `lib/billingRoutes.ts`, `lib/subscriptionStore.ts`, `useBilling` hook).
  Subscription status lives at `users/{uid}.billing` — readable by the owning
  client (so the app can show plan status and gate access) but **not writable
  by the client**; only the server (payment verification, or a Razorpay
  webhook) can change it.
  Signed-in users without an active or trialing subscription see a paywall
  screen instead of the app.

See [`docs/CHANGELOG.md`](docs/CHANGELOG.md) for a history of the larger
cleanup/remediation work this codebase has been through.

## Setup

**Prerequisites:** Node.js >= 20, a Firebase project (Auth + Firestore
enabled), a Razorpay account.

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill in the values (see below).
3. Copy your Firebase web app config into `firebase-applet-config.json`
   (client-side config — safe to be public; Firebase's security model relies
   on `firestore.rules`, not on this key being secret).
4. Set up Razorpay (see "Billing setup" below).
5. Run the app:
   ```
   npm run dev
   ```
   This starts `server.ts`, which runs Vite in middleware mode — one process,
   one port.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `APP_URL` | Yes | Base URL of the running app, used to build the Shopify OAuth callback URL. |
| `SESSION_ENC_KEY` | Yes | Encrypts Shopify/Odoo credentials at rest, and (through a key derived from it) signs the Shopify OAuth `state` so the callback can trust which user started the connection. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes | A Firebase service account, used by the server to verify Firebase ID tokens (`lib/auth.ts`). The former points at a downloaded JSON file; the latter takes the JSON contents directly as a string, for platforms where you can't mount a file. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | For billing | Razorpay API keys. Without them, the server still boots and every non-billing route works; only billing routes and the paywall fail with a clear error. The Key Id is public (checkout needs it); the Key Secret stays on the server. |
| `RAZORPAY_PLAN_ID` | For billing | The Razorpay Plan (monthly, INR) customers subscribe to. |
| `RAZORPAY_WEBHOOK_SECRET` | For billing | The secret you chose for the Razorpay webhook (see below). |
| `PAYMENT_SECRETS_KEY` | For owners' card payments | 32 random bytes in base64 (make one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). Encrypts the Razorpay / Cashfree keys owners save under Settings, Online payments. Keep it safe and do not change it. Without it owners can only paste a payment link. See "Online payments" below. |
| `NOTIFICATIONS_CRON_SECRET` | For phone notifications | A long random string (16+ characters) that the scheduler sends to `POST /api/internal/notifications/run`. Without it that route answers 503 and no notifications go out. See "Phone app notifications" below. |
| `EXPO_ACCESS_TOKEN` | No | Only if the Expo project has "enhanced push security" switched on; sent when pushing through Expo. |
| `AI_QUICK_DAILY_LIMIT` | No | Voice/text readings per user per day for the phone app (default 60), separate from the web's `AI_PARSE_DAILY_LIMIT`. |
| `COOKIE_SECRET` | No | Reserved for future cookie signing; currently only the CSRF token cookie is set, and it isn't signed. |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | No | Only needed if you want to enable the Shopify order-import integration. |
| `USDA_API_KEY` | No | Free key from [fdc.nal.usda.gov](https://fdc.nal.usda.gov/api-key-signup.html), used by the Inventory tab's nutrition "Look up" feature. Without it, that one search source returns a clear "not configured" error — Open Food Facts (queried alongside it) needs no key. |

### Billing setup

1. In the [Razorpay Dashboard](https://dashboard.razorpay.com), switch to
   **Test Mode** and create a monthly **Plan** at ₹1,200 (INR). Copy its ID
   (`plan_...`) into `RAZORPAY_PLAN_ID`.
2. Copy the Test Mode **Key Id** and **Key Secret** (Account & Settings → API
   Keys) into `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
3. Add a [webhook](https://dashboard.razorpay.com/app/webhooks) pointing at
   `{APP_URL}/api/billing/webhook`, choose a secret and put it in
   `RAZORPAY_WEBHOOK_SECRET`, and subscribe it to the subscription events
   (`subscription.authenticated`, `.activated`, `.charged`, `.pending`,
   `.halted`, `.cancelled`, `.completed`, `.paused`, `.resumed`). Razorpay
   must be able to reach the URL, so test webhooks on a deployed URL (or
   through a tunnel such as ngrok).
4. Turn the paywall on. It is off for everyone by default. Make sure
   `BILLING_DISABLED` is empty, then set `BILLING_ENFORCED_EMAILS` to your own
   test accounts (comma separated) to try the whole flow while everyone else is
   unaffected, and `BILLING_ENFORCED=true` at launch to put every account behind
   it (see `.env.example`). Demo accounts are never asked to pay, and nothing is
   enforced while the `RAZORPAY_*` values are missing.
5. To take real payments, once Razorpay has activated the account, swap in the
   Live Mode keys and a Live Mode Plan, and re-create the webhook in Live Mode.

**How checkout works:** the app asks the server for a subscription
(`POST /api/billing/create-subscription`) and opens Razorpay Checkout in a
popup. When the customer pays, the app sends Razorpay's signed proof to
`POST /api/billing/verify-payment`; the server checks the signature, reads the
subscription's real state from Razorpay and saves the plan status. The webhook
keeps it right afterwards (renewals, failed charges, cancellations).
`POST /api/billing/cancel` cancels: a paying plan ends at the end of the period
already paid for, a trial ends at once and is never charged.

**Free trial:** every first-time subscriber gets a free trial of `TRIAL_DAYS`
days (`src/utils/trial.ts`, shared by the landing page, the paywall and the
server — change it in that one place). The customer approves a payment mandate
(card or UPI AutoPay) when they start, and the first charge is taken when the
trial ends. Cancelling and re-subscribing does not grant a second trial: it is
only offered while the account has never approved a mandate (`billing.trialUsed`).
Whether Razorpay accepts a first charge `TRIAL_DAYS` days ahead has to be
checked in Test Mode: if it refuses, checkout fails with a clear error and the
trial length must be adjusted.

### Online payments (card, through the owner's own gateway)

An owner can let customers pay a bill by card or online through their **own** Razorpay or Cashfree account (the money goes
straight to them; this is separate from Stockpot's own subscription billing above). In Settings, Online payments they enter
the gateway's keys, which are checked with the gateway and kept encrypted with `PAYMENT_SECRETS_KEY` in
`users/{uid}/paymentGateway/active`, a place only the server can reach. Or they paste a payment link, which is shown on the
bill as a button but cannot be marked paid automatically.

For a customer, the bill page (`/bill/:token`) then has a **Pay by card or online** button. `GET /bill/:token/pay` makes a
payment link for what is owed at that moment (worked out on the server from the orders, never from the browser; a link already
made for the same amount is reused) and sends the customer to it. When they come back (`GET /bill/:token/return`), or open the
bill again, the server asks the gateway whether the link was paid in full, and only then marks the orders paid by card (with the
card fee), once. The owner has no webhook to set up. `APP_URL` must be the real public address, because the gateway sends the
customer back to it.

The Razorpay and Cashfree clients (`lib/gateways/`) were written from their documented APIs and tested against recorded
replies, not a live gateway. Before relying on them, use **test-mode keys** (Razorpay `rzp_test_…`, Cashfree sandbox) and pay a
₹1 bill end to end.

### Phone app notifications

Stockpot Quick's notifications (morning summary, running low, use-by soon, due tomorrow) are sent by a job the server
runs when `POST /api/internal/notifications/run` is called with `Authorization: Bearer $NOTIFICATIONS_CRON_SECRET`. On
Render, add a **Cron Job** with the schedule `0,15,30,45 * * * *` and the command

```
curl -fsS -X POST -H "Authorization: Bearer $NOTIFICATIONS_CRON_SECRET" "$APP_URL/api/internal/notifications/run"
```

(give the cron job the same two environment variables). Each run visits every owner who has registered a phone and
sends what is due: at most one of each kind per owner per day, only what the owner has switched on, in the owner's own
time zone, and never between 9 pm and 7 am for stock and use-by. It answers with a small summary
(`{ users, notifications, delivered, released, errors }`). A run that starts while another is still going gets a 409.
The route reads each phone's push token from `users/{uid}/devices` and what was already sent from
`users/{uid}/mobileSettings/notificationState`, both of which only the server can reach.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Runs the app locally (Express + Vite middleware mode). |
| `npm run build` | Production build to `dist/`. |
| `npm run preview` | Preview a production build locally. |
| `npm run lint` | Type-checks the whole project (`tsc --noEmit`). |
| `npm run lint:eslint` | Runs ESLint. |
| `npm test` | Runs the test suite once (Vitest). |
| `npm run test:watch` | Runs tests in watch mode. |
| `npm run clean` | Removes `dist/`. |

CI (`.github/workflows/ci.yml`) runs all of the above (minus `dev`/`preview`)
on every push and pull request to `main`.

## Known gaps / in-progress work

A few things are worth knowing about if you're picking up this codebase:

- **Single subscription plan.** Billing supports one plan (`RAZORPAY_PLAN_ID`)
  with no tiers. Adding tiers means: multiple Price IDs, a plan-selection
  step before checkout, and feature-gating logic keyed by plan — none of
  which exists yet. The landing page pricing section and paywall screen
  intentionally reflect this (one plan, marked "coming soon" for anything
  beyond it) rather than advertising tiers the product can't yet deliver.
- **No admin/support tooling.** There's no way to look up a customer's
  subscription, issue a refund, or grant free access from within the app —
  that has to be done directly in the Razorpay Dashboard for now.
- **Legal pages are drafts, not finished legal documents.** `/terms` and
  `/privacy` (`src/TermsPage.tsx`, `src/PrivacyPage.tsx`) exist and are
  linked from the landing page footer and the paywall screen, but every
  `[BRACKETED]` placeholder (company name, jurisdiction, refund policy,
  contact info, etc.) needs to be filled in with real values, and the
  content should be reviewed by a lawyer before you charge real customers —
  requirements vary significantly by where your business and customers are
  located (e.g. GDPR, CCPA).
- **`mobile/`** (Stockpot Quick, the phone companion app: Expo/React Native)
  lives inside this repo as a plain subfolder with its own `package.json`
  rather than a proper monorepo workspace; see `mobile/README.md`. **`bakery-mobile/`**
  is an older unused prototype, left alone until the new app ships.

## Design notes

- **Shopify uses one app-wide set of credentials** (`SHOPIFY_CLIENT_ID`/
  `SHOPIFY_CLIENT_SECRET`), not per-tenant credentials. This is deliberate:
  a single Shopify app can already connect to any number of stores, since
  each store owner does their own OAuth authorization and gets their own
  separate access token (already stored per-user — see
  `lib/integrationStore.ts`). Per-tenant app credentials would only be needed
  for a white-label scenario where each tenant needs a fully separate Shopify
  app identity, which isn't a current requirement.

