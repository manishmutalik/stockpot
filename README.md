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
- **Billing:** subscriptions are handled by Stripe (`lib/stripe.ts`,
  `lib/subscriptionStore.ts`, `useBilling` hook). Subscription status lives
  at `users/{uid}.billing` — readable by the owning client (so the app can
  show plan status and gate access) but **not writable by the client**;
  only the server (checkout completion, or a Stripe webhook) can change it.
  Signed-in users without an active or trialing subscription see a paywall
  screen instead of the app.

See [`docs/CHANGELOG.md`](docs/CHANGELOG.md) for a history of the larger
cleanup/remediation work this codebase has been through.

## Setup

**Prerequisites:** Node.js >= 20, a Firebase project (Auth + Firestore
enabled), a Stripe account.

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill in the values (see below).
3. Copy your Firebase web app config into `firebase-applet-config.json`
   (client-side config — safe to be public; Firebase's security model relies
   on `firestore.rules`, not on this key being secret).
4. Set up Stripe (see "Billing setup" below).
5. Run the app:
   ```
   npm run dev
   ```
   This starts `server.ts`, which runs Vite in middleware mode — one process,
   one port.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `APP_URL` | Yes | Base URL of the running app, used to build the Shopify OAuth callback URL and Stripe redirect URLs. |
| `SESSION_ENC_KEY` | Yes | Encrypts Shopify/Odoo credentials at rest. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes | A Firebase service account, used by the server to verify Firebase ID tokens (`lib/auth.ts`). The former points at a downloaded JSON file; the latter takes the JSON contents directly as a string, for platforms where you can't mount a file. |
| `STRIPE_SECRET_KEY` | For billing | Stripe secret API key. Without it, the server still boots and every non-billing route works; only billing routes and the paywall fail with a clear error. |
| `STRIPE_PRICE_ID` | For billing | The Stripe Price ID customers subscribe to. |
| `STRIPE_WEBHOOK_SECRET` | For billing | Signing secret for the Stripe webhook endpoint (see below). |
| `COOKIE_SECRET` | No | Reserved for future cookie signing; currently only the CSRF token cookie is set, and it isn't signed. |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | No | Only needed if you want to enable the Shopify order-import integration. |

### Billing setup

1. In the [Stripe Dashboard](https://dashboard.stripe.com), create a
   recurring **Product & Price** for your subscription plan. Copy the Price
   ID (`price_...`) into `STRIPE_PRICE_ID`.
2. Copy your secret API key into `STRIPE_SECRET_KEY` — use a test-mode key
   (`sk_test_...`) until you're ready to accept real payments.
3. Create a [webhook endpoint](https://dashboard.stripe.com/webhooks)
   pointing at `{APP_URL}/api/billing/webhook`, subscribed to at least:
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`. Copy its
   signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Test locally with the [Stripe CLI](https://stripe.com/docs/stripe-cli):
   `stripe listen --forward-to localhost:3000/api/billing/webhook` gives you
   a local webhook secret and forwards real test events without needing a
   publicly reachable URL.
5. When ready to charge real money, swap in your live-mode keys
   (`sk_live_...`) and re-create the webhook endpoint against your
   production `APP_URL`.

**Free trial:** every first-time subscriber gets a 14-day free trial
(a card is required at signup, and billing starts automatically when the
trial ends — this is standard Stripe subscription behavior, not something
this app enforces separately). To change the trial length, edit the single
`TRIAL_PERIOD_DAYS` constant in `server.ts`. Canceling and resubscribing
does not grant a second trial — the trial is only applied the first time a
given Firebase user has no existing Stripe customer on file.

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

- **Single subscription plan.** Billing supports one plan (`STRIPE_PRICE_ID`)
  with no tiers. Adding tiers means: multiple Price IDs, a plan-selection
  step before checkout, and feature-gating logic keyed by plan — none of
  which exists yet. The landing page pricing section and paywall screen
  intentionally reflect this (one plan, marked "coming soon" for anything
  beyond it) rather than advertising tiers the product can't yet deliver.
- **No admin/support tooling.** There's no way to look up a customer's
  subscription, issue a refund, or grant free access from within the app —
  that has to be done directly in the Stripe Dashboard for now.
- **Legal pages are drafts, not finished legal documents.** `/terms` and
  `/privacy` (`src/TermsPage.tsx`, `src/PrivacyPage.tsx`) exist and are
  linked from the landing page footer and the paywall screen, but every
  `[BRACKETED]` placeholder (company name, jurisdiction, refund policy,
  contact info, etc.) needs to be filled in with real values, and the
  content should be reviewed by a lawyer before you charge real customers —
  requirements vary significantly by where your business and customers are
  located (e.g. GDPR, CCPA).
- **`bakery-mobile/`** (a separate Expo/React Native app) currently lives
  inside this repo as a plain subfolder rather than a proper monorepo
  workspace or its own repository.

## Design notes

- **Shopify uses one app-wide set of credentials** (`SHOPIFY_CLIENT_ID`/
  `SHOPIFY_CLIENT_SECRET`), not per-tenant credentials. This is deliberate:
  a single Shopify app can already connect to any number of stores, since
  each store owner does their own OAuth authorization and gets their own
  separate access token (already stored per-user — see
  `lib/integrationStore.ts`). Per-tenant app credentials would only be needed
  for a white-label scenario where each tenant needs a fully separate Shopify
  app identity, which isn't a current requirement.

