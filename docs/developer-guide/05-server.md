# 5. The server (`server.ts` and `lib/`)

One Express 4 process, written in TypeScript and run with `tsx` (no separate compile step for the server). It serves the
built web app, a JSON API under `/api`, the public bill pages under `/bill`, and one scheduled-job endpoint. Server-only
logic is in `lib/`; code it shares with the browser is in `src/utils/`.

## The pattern every route follows

Handlers are **factories that take their dependencies**:

```ts
// lib/someRoutes.ts
export interface SomeDeps { db: QuickDb; now: () => number; model: SomeModel; /* ... */ }
export function createSomeHandler(deps: SomeDeps) {
  return async (req: AuthedRequest, res: Response) => { /* validate → authorise → work → respond */ };
}

// server.ts
api.post('/some', requireCsrf, createSomeHandler({ db: createAdminQuickDb(), now: Date.now, model: createSomeModel() }));
```

Why: tests construct the handler with in-memory fakes (`lib/__tests__/memoryQuickDb.ts`, injected fake models and clocks)
and call it with a fake request/response, so no Firebase, no network and no model are needed. `server.ts` is the only
place real dependencies are plugged in. When you add a route, follow this shape: put the handler and its types in
`lib/`, test it with fakes, and wire it in `server.ts`.

Other conventions:

- **Validate the body first** and answer `400` with `{ error }` for a bad one. Bound every size (message lengths, id lists,
  JSON size of a `reading`). Never trust a field's type.
- **Answer errors as JSON `{ error: string, code?: string }`**, never leak stack traces or provider messages. Log details
  with `console.error` (without message text, names or secrets).
- **Scope by `req.uid`** from the verified token. Never take a uid from the body or query.
- Do not write `undefined` into Firestore documents.

## Middleware and registration order

See [Architecture](01-architecture.md) for the full order. The pieces:

| Piece | File | Does |
|---|---|---|
| `requireAuth` | `lib/auth.ts` | Verifies `Authorization: Bearer <Firebase ID token>`; sets `req.uid`, `req.email`, `req.emailVerified`. Initialises the Admin SDK from `FIREBASE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS` |
| `issueCsrfToken` / `requireCsrf` | `lib/csrf.ts` | Double-submit cookie CSRF. `GET /api/session/csrf` issues; `requireCsrf` compares the `csrf_token` cookie to the `X-CSRF-Token` header |
| `requireAiAccess(feature, deps)` | `lib/aiGuard.ts` | The one check every model-calling route passes. See [AI features](06-ai.md) |
| `createAccessGate` (`quickGate`) | `lib/quickRoutes.ts` | Plan check for the phone endpoints: if the paywall applies to this account and it has no active plan → `402 subscription_required` |
| `paywallApplies` | `lib/billingRoutes.ts` | Pure rule for whether an account must have a plan (see [Billing](07-billing-and-payments.md)) |

CSRF is applied **per route** (`requireCsrf` in `server.ts`), on state-changing web routes. It is intentionally absent from
`/api/mobile/*` (Bearer-token app, no cookies) and from the cron and webhook endpoints (own secrets/signatures).

## Route reference

All routes below are under `/api` and need a Firebase ID token unless marked **public** or **secret**.

### Session

| Method and path | Handler | Notes |
|---|---|---|
| `GET /api/session/csrf` (**public**) | `issueCsrfToken` | Returns `{csrfToken}` and sets the cookie |

### AI (switched off unless `AI_FEATURES_ENABLED=true`)

| Method and path | Handler | Notes |
|---|---|---|
| `GET /ai/status` | `lib/aiRoutes.ts` | Is AI available to this account and how much of today's allowance is left. Counts nothing |
| `POST /ai/briefing` (CSRF) | `lib/briefingRoutes.ts` | Daily briefing; cached per day in `users/{uid}/briefings/{day}` |
| `POST /ai/chat` (CSRF) | `lib/chatRoutes.ts` | "Ask your business"; may answer with a `scenario` request the client runs and sends back |
| `POST /ai/parse-order` (CSRF) | `lib/orderParseRoutes.ts` | Reads a pasted order message into Add Order fields |
| `POST /ai/parse-production-run` (CSRF) | `lib/productionParseRoutes.ts` | Reads a note into Log Production Run fields |

### Stockpot's own subscription

| Method and path | Handler | Notes |
|---|---|---|
| `GET /billing/status` | `createBillingStatusHandler` | `{status, currentPeriodEnd, trialUsed, cancelScheduled, paywall}` |
| `POST /billing/create-subscription` (CSRF) | `createSubscriptionHandler` | Creates a Razorpay subscription (with the trial); returns `{keyId, subscriptionId, trial, trialDays}` |
| `POST /billing/verify-payment` (CSRF) | `createVerifyPaymentHandler` | Checks Razorpay's signature, reads the subscription's real state, saves status |
| `POST /billing/cancel` (CSRF) | `createCancelHandler` | A paying plan ends at period end; a trial ends at once |
| `POST /api/billing/webhook` (**signature**) | `createWebhookHandler` | `express.raw`; verifies `x-razorpay-signature`; keeps status right on renewals, failures, cancellations |

### Phone app (`quickGate`; no CSRF; every POST needs `Idempotency-Key`)

Documented in [The phone app](08-phone-app.md): `POST /mobile/parse`, `/mobile/orders`, `/mobile/restocks`,
`/mobile/production-runs`, `/mobile/orders/:id/hand-over`, `/mobile/orders/:id/invoice`, `/mobile/payments`,
`/mobile/payments/statement`, `/mobile/payments/claim`; `GET /mobile/payments-due`, `/mobile/payment-setup`, `/mobile/today`, `/mobile/upcoming`, `/mobile/speech-phrases`;
`POST` and `DELETE /mobile/push-token`; `GET` and `PUT /mobile/notification-settings`; and `POST /mobile/demo/seed`
(no plan check; demo accounts only).

### Bills and online payments

| Method and path | Handler | Notes |
|---|---|---|
| `POST /bills` (CSRF) | `createBillHandler` (`lib/billRoutes.ts`) | Body `{orderId}` or `{orderIds}` (a statement, up to a fixed maximum). Builds the bill on the server, stores the snapshot, returns `{token, bill}`. `404` if the order is not the caller's |
| `GET /payments/gateway` | `lib/gatewayRoutes.ts` | Which gateway is set up, the key id and the last four of the secret. Never the secret |
| `PUT /payments/gateway` (CSRF) | same | Saves keys (checked with the gateway first, then stored encrypted) or a pasted payment link |
| `POST /payments/gateway/test` (CSRF) | same | "Test connection" |
| `DELETE /payments/gateway` (CSRF) | same | Removes the setup |
| `GET /bill/:token` (**public**) | `createBillPageHandler` (`lib/payOnline.ts`) | The customer's bill page |
| `GET /bill/:token/pay` (**public**) | `createPayHandler` | Makes a payment link for what is owed *now* and redirects the customer |
| `GET /bill/:token/return` (**public**) | `createReturnHandler` | Where the gateway sends the customer back; asks the gateway whether it was paid |
| `POST /bill/:token/claim` (**public**) | `createClaimHandler` | "I've paid by UPI": keeps the customer's claim on the unpaid orders and tells the owner's phone once; marks nothing paid |

### Integrations and lookups (defined inline in `server.ts`)

| Method and path | Notes |
|---|---|
| `GET /shopify/config-status`, `/shopify/status`, `/shopify/orders`; `POST /shopify/disconnect` (CSRF); `GET /auth/shopify` | Shopify import. `/auth/shopify` returns the authorise URL |
| `GET /api/auth/shopify/callback` (**no auth; see weakness in [Architecture](01-architecture.md)**) | Shopify's redirect target; exchanges the code and stores the token encrypted |
| `GET /odoo/status`, `/odoo/orders`; `POST /odoo/connect` (CSRF), `/odoo/disconnect` (CSRF) | Odoo import over JSON-RPC; credentials stored encrypted |
| `GET /nutrition/search-usda`, `/nutrition/search-openfoodfacts` | Nutrition lookup (`lib/nutritionSearch.ts`); both normalise to one shape |

### Scheduled job (**secret**)

`POST /api/internal/notifications/run` with `Authorization: Bearer $NOTIFICATIONS_CRON_SECRET` runs
`runNotificationJob` (`lib/notificationJob.ts`). `503` until a secret of at least 16 characters is set, `401` for a wrong one, `409` if a run is
already in progress. It answers `{users, notifications, delivered, released, errors}`.

## Stores (Firestore access from the server)

Each store is a small module with one job and, where it matters, an interface so tests can fake it:

| File | Stores |
|---|---|
| `lib/quickDb.ts` | The transaction layer for the phone endpoints (`QuickDb.run(uid, fn)`), `withIdempotency`, and the Admin implementation. Reads happen first, writes are buffered and applied together, so Firestore's "all reads before writes" rule holds |
| `lib/subscriptionStore.ts` | `users/{uid}.billing`: `getBillingInfo`, `setBillingInfo`, `findUidByRazorpaySubscriptionId` |
| `lib/billStore.ts` | `bills/{token}` and the order tokens; `createOrRefreshBill`, `createOrRefreshStatement`, `getPublicBill`, `createAdminBillRecords` (records plus the payment attempt) |
| `lib/gatewayStore.ts` | `users/{uid}/paymentGateway/active` |
| `lib/integrationStore.ts` + `lib/crypto.ts` | Shopify/Odoo credentials, AES-256-GCM with a key derived from `SESSION_ENC_KEY` |
| `lib/secretBox.ts` | Encrypts gateway secrets; the uid is bound as additional authenticated data so a copied ciphertext does not decrypt in another account. Format `v1.<nonce>.<tag>.<ciphertext>` (base64url). Key: `PAYMENT_SECRETS_KEY` |
| `lib/briefingStore.ts` | Cached briefings and a short generation marker so two open tabs do not both call the model |
| `lib/aiUsage.ts` | Daily AI counters, reserved in a transaction **before** the model is called |

Two different encryption keys exist on purpose: `SESSION_ENC_KEY` (integration credentials, derived key) and
`PAYMENT_SECRETS_KEY` (gateway secrets, 32 raw bytes, never change it or saved keys become unreadable).

## Idempotency (phone writes)

Every `POST /mobile/*` save needs `Idempotency-Key: <16–64 chars of letters, digits, - or _>`. `withIdempotency` looks up
`users/{uid}/idempotency/{scope}_{key}` inside the same transaction as the work: a repeat of a request that succeeded gets
the first answer back with nothing written again; only successes (2xx) are remembered; a saved answer is honoured for
24 hours. The phone creates a new key per confirm tap and reuses it for retries of that tap.

## Logging and errors

- Handlers log failures with `console.error` and answer a generic message. Model calls log token usage and stop reason, never
  the owner's text, customer names or amounts.
- `process.on('unhandledRejection')` logs and keeps the process alive.
- There is no request-logging middleware, rate-limit middleware or helmet. Rate control is by design in specific places: AI
  daily caps, the gateway "check" throttle (10 s), the single-run lock on the notification job.

## Adding a route (checklist)

1. Write the handler factory and its dependency interface in `lib/`.
2. Validate the body; scope by `req.uid`; return JSON errors.
3. Decide auth: behind `api` (token) by default; add `requireCsrf` if a browser calls it with a state change; add
   `quickGate` if it needs a plan; make it public only if the URL itself is the secret.
4. Test it with fakes in `lib/__tests__/`.
5. Wire it in `server.ts`; document it in the table above and, if the phone calls it, in `quickApiTypes.ts`.
6. If it needs a new collection that only the server uses, **do not** add it to `firestore.rules`; default deny covers it.
