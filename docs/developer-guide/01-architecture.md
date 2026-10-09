# 1. Architecture

## The pieces

```
                       ┌────────────────────────────┐
   Owner's browser     │  Web app (React SPA, src/) │
   stockpot.in         └──────┬───────────────┬─────┘
                              │ Firestore     │ /api/*  (Bearer ID token + CSRF)
                              │ client SDK    │
   Owner's phone       ┌──────┴─────────┐     │
   Stockpot Quick      │ Phone app      │     │
   (mobile/)           └───┬────────────┘     │
                           │ /api/mobile/* (Bearer ID token + Idempotency-Key)
                           │                  │
                      ┌────┴──────────────────┴──────────────┐      ┌─────────────────┐
                      │  Express server (server.ts, lib/)    │─────▶│ Anthropic API   │
   Customer's phone   │  one process on Render               │─────▶│ Razorpay (own   │
   /bill/<token> ────▶│  also serves the built web app       │      │  subscriptions) │
                      └────┬──────────────┬──────────────────┘─────▶│ Owner's gateway │
   Render Cron Job         │ Admin SDK    │                         │  (Razorpay /    │
   every 15 minutes ──────▶│ (bypasses    │                         │   Cashfree)     │
   (notifications)         │  rules)      │                         │ Expo push, USDA,│
                      ┌────┴──────────────┴──────┐                  │ Open Food Facts,│
                      │  Firebase: Auth + Firestore│                │ Shopify, Odoo   │
                      └───────────────────────────┘                 └─────────────────┘
```

Two ways to reach Firestore, and the split matters:

- **The web app talks to Firestore directly** with the Firebase client SDK for ordinary business data (materials,
  menu, orders, production runs, wastage, settings, experiments, price log). The security rules decide what it may do.
  This is why the web app works with so little server code, and why the rules file is part of the product's security.
- **The server uses the Admin SDK**, which bypasses the rules. It does everything a client must not be trusted with:
  billing status, stored integration credentials, payment-gateway keys, AI usage counters, public bill snapshots, the
  phone app's writes, and the notification job.

The phone app never touches Firestore. It signs in with Firebase Authentication (to get an ID token) and then speaks only
to `/api/mobile/*`.

## How the server is put together

`server.ts` is a single `startServer()` function. It builds dependency objects, then registers routes. The handlers
themselves live in `lib/` as factories that take their dependencies as arguments (see [The server](05-server.md)).
The order of registration is significant:

1. `process.on('unhandledRejection')`, so one bad promise cannot kill the process.
2. `POST /api/billing/webhook` with `express.raw()`. It must come **before** `express.json()`, because Razorpay signs the
   exact bytes of the body and a parsed-and-reserialised body would not match.
3. `express.json()` and `cookie-parser` for everything after.
4. `GET /api/session/csrf` hands out a CSRF token.
5. `POST /api/internal/notifications/run`, outside the authenticated router (it has its own shared secret).
6. An Express `Router` named `api`, with `requireAuth` applied first. Every route registered on it needs a valid
   Firebase ID token: AI, billing, the phone endpoints, Shopify and Odoo, nutrition search, bills, gateway settings.
   It is mounted at `/api`.
7. The public bill pages `GET /bill/:token`, `/bill/:token/pay`, `/bill/:token/return`. No sign-in.
8. In development, Vite runs in middleware mode (so the app and API share one port and hot reload works). In production
   (`NODE_ENV=production`), the built `dist/` folder is served statically and every unknown path falls back to
   `index.html` so React Router can handle it. Because this comes last, API and bill routes are never swallowed by the SPA.

Production is `npm run build` followed by running `server.ts` with `NODE_ENV=production`. There is no Dockerfile or
Render blueprint in the repository; the Render service is configured in the Render dashboard. The environment
variables it needs are in [Testing, CI and operations](09-testing-and-operations.md).

## Who is trusted, and how they prove it

| Caller | Proves identity with | Notes |
|---|---|---|
| **Web app** → `/api/*` | `Authorization: Bearer <Firebase ID token>`, verified by `lib/auth.ts` (`requireAuth`) | `src/utils/apiClient.ts` (`apiFetch`) adds it, always use it for our own API |
| **Web app** → state-changing `/api/*` | The above **plus** an `X-CSRF-Token` header equal to the `csrf_token` cookie (`lib/csrf.ts`, `requireCsrf`) | Double-submit cookie. `apiFetch` fetches and caches the token. Applied route by route in `server.ts` |
| **Phone app** → `/api/mobile/*` | Bearer ID token only | No CSRF: a browser adds cookies by itself, an app attaches a token it holds, which another site cannot make it send. Instead every POST needs an `Idempotency-Key` |
| **Customer** → `/bill/*` | The unguessable token in the URL | The token *is* the access check. Malformed, unknown and missing tokens all give the same 404 page so existence is not revealed |
| **Render Cron** → `/api/internal/notifications/run` | `Authorization: Bearer $NOTIFICATIONS_CRON_SECRET` | Off (503) until the secret is set; compared in constant time |
| **Razorpay** → `/api/billing/webhook` | HMAC signature over the raw body with `RAZORPAY_WEBHOOK_SECRET` | |
| **Shopify** → `/api/auth/shopify/callback` | Nothing reliable today | See *Known weaknesses* below |

Authorization on top of identity:

- **Everything is scoped to `users/{uid}`.** Every server data path starts from the uid on the verified token, so one
  owner can only ever read or write their own documents. The phone endpoints enforce this structurally: `QuickDb.run(uid, …)`
  only exposes that owner's subcollections.
- **Entitlement** (may this account use the product / spend model money?) is decided on the server:
  `quickGate` for the phone endpoints, `requireAiAccess` for AI, the `paywall` flag for the web. See
  [Billing and payments](07-billing-and-payments.md).
- **Demo accounts** (email `demo_<digits>_<digits>@bettereat.com`) are never charged and never reach the AI model.

## What is shared between browser, server and phone

The code in `src/utils/` is deliberately free of React, Firebase and the DOM so the same file runs in all three places.
`lib/` imports from it freely (for example `lib/quickRoutes.ts` runs `src/utils/plans`, `profit.ts` and `billing.ts`).
`mobile/` imports **types only** from `src/utils/quickApiTypes.ts`, plus one tiny runtime function, `src/utils/money.ts`
(see `mobile/metro.config.js`). Because of this, two rules apply when editing `src/utils/`:

- Do not import `firebase`, `react`, `window` or `document` into a file that the server or phone also uses.
- Keep `quickApiTypes.ts` and `money.ts` free of imports. They are consumed from a different package.

## Environment gating ("works with nothing configured")

The server is designed to boot with almost no configuration and to fail a *feature*, not the process:

| Feature | Turns on when | Otherwise |
|---|---|---|
| Server auth | A Firebase service account is available (`GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON`) | `/api` routes cannot verify tokens |
| Stockpot subscriptions | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLAN_ID` | Billing routes answer "not configured"; paywall never applies |
| Paywall | The above **and** `BILLING_ENFORCED=true` (everyone) or `BILLING_ENFORCED_EMAILS` (listed test accounts); `BILLING_DISABLED` empty | Off for everyone |
| AI | `AI_FEATURES_ENABLED=true` and `ANTHROPIC_API_KEY` (plus an allow-list while in trial) | AI routes say so; the rest of the app is untouched |
| Owner card payments | `PAYMENT_SECRETS_KEY` (32 bytes, base64) | Owners can only paste a payment link |
| Phone notifications | `NOTIFICATIONS_CRON_SECRET` and a Render Cron Job | Route answers 503 |
| Shopify import | `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | Settings shows it as unavailable |
| Nutrition lookup | `USDA_API_KEY` (Open Food Facts needs none) | That one source returns "not configured" |

## Known weaknesses (read before relying on these)

These are real and unfixed at the time of writing. They are listed so nobody assumes otherwise.

- **Shopify OAuth callback trusts an unsigned `state`.** `GET /api/auth/shopify` builds `state` as base64url JSON
  `{uid, ts}` with no signature, and `GET /api/auth/shopify/callback` (necessarily outside `requireAuth`, since
  Shopify's redirect carries no Authorization header) takes the `uid` from it without checking a signature or the
  timestamp, and does not verify Shopify's own `hmac` query parameter. Someone who knows a victim's uid could complete
  the flow with their own store and attach it to the victim's account. The fix is a signed, expiring `state` (an HMAC
  with a server secret, with the `ts` actually checked) and verifying Shopify's `hmac`.
- **`COOKIE_SECRET` is unused.** The only cookie is the CSRF token, which is not signed (it does not need to be for
  double-submit).
- **Online payments clients (`lib/gateways/`) have never run against live Razorpay or Cashfree.** They were written from
  the documented APIs and tested against recorded replies. Test with test-mode keys and a ₹1 bill before relying on them.
- **The Razorpay subscription flow has only run against mocks**; see `docs/PROJECT_STATE.md` for the checklist.
- **Legal pages (`/terms`, `/privacy`) are drafts** for the owner and a lawyer to finalise.
