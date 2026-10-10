# 9. Testing, CI and operations

## Tests

About 2,200 tests, run with **Vitest** (`npm test` = `vitest run`; `npm run test:watch` while developing).
`vitest.config.ts`: `jsdom` environment, `globals: true`, and it excludes `test/rules/**` (needs the emulator) and `mobile/**` (own job).

Tests sit beside the code in `__tests__/` folders:

| Where | What it tests |
|---|---|
| `src/utils/__tests__/` | The pure logic: profit, GST, pricing, plans, billing text, parsing validators, notifications. The largest and most important group. No mocks needed |
| `src/hooks/__tests__/` | Hooks, with `vi.mock('../../firebase', ...)` and asserting on what got written. `plansParity.test.ts` proves hooks commit exactly what a plan says |
| `src/components/__tests__/` | Modals and cards rendered with Testing Library; `overlayStacking.test.tsx` guards modal layering |
| `src/__tests__/` | `LandingPage.test.tsx` (copy, infographics, motion), `demoSandbox.test.tsx` (the whole app against `fakeFirebase.ts`) |
| `lib/__tests__/` | Server handlers called with fakes: `memoryQuickDb.ts` (an in-memory transaction layer that holds writes back and applies them together or not at all), injected models, clocks and stores |
| `test/rules/firestore.rules.test.ts` | Security rules against the real Firestore emulator (`npm run test:rules`) |
| `mobile/src/lib/__tests__/` | The phone app's plain logic; run from `mobile/` (`npm test`) |

Helpers worth knowing:

- `src/__tests__/fakeFirebase.ts`: a tiny in-memory stand-in for `src/firebase.ts` (email/password auth, document and collection reads and
  writes, batches, live `onSnapshot` listeners), enough to run the whole app in a test.
- `lib/__tests__/memoryQuickDb.ts`: the in-memory `QuickDb`. Use it for any `/api/mobile/*` handler test.
- `lib/__tests__/briefingFixtures.ts`: sample AI snapshots and model answers.

Conventions that have paid off:

- **A fix comes with a test that fails without it.** For a rule that must stay impossible (a client reading gateway keys, a duplicate
  save), write the test that states the *impossible* thing, as `firestore.rules.test.ts` does.
- **Strict fakes.** The fake Firestore used in server tests rejects `undefined` anywhere in a document, as the Admin SDK does. It was added
  after a production bug; keep new fakes just as strict.
- **Mutation-check a new guard**: temporarily break the thing you are protecting and confirm the test fails.
- Vitest quirk: `beforeEach(() => someMock.mockReset())` *returns* the mock and Vitest calls a returned function as cleanup. Use braces:
  `beforeEach(() => { someMock.mockReset(); })`.
- Do not assert "does not contain 'script'" on HTML that has words like "description" in it; assert on tags.

### Checking the UI in a browser

The real app needs Firebase, which is unreachable from restricted sandboxes. For visual checks, `docs/PROJECT_STATE.md` ("Running the app
for browser checks") describes a temporary Vite config at the repo root that aliases `./firebase` to an in-memory mock built on
`buildDemoData`. Delete it afterwards. For screenshots use the pre-installed Chromium; headless "new" mode has a minimum window width of about
500 px, so test phone widths (390) with `chromium_headless_shell`. Do not use `pkill -f`/`pgrep -f` with a pattern that also appears in your
own command line: it kills your shell.

## CI (`.github/workflows/ci.yml`)

Runs on every push and pull request to `main`. Three jobs, all required to pass:

| Job | Steps |
|---|---|
| **build-and-test** (Node 22) | `npm ci` → `npm run lint` (tsc) → `npm run lint:eslint` → `npm test` → `npm run build` |
| **firestore-rules** (Node 22 + Java 21) | `npm ci` → `npm run test:rules` (starts the Firestore emulator on 127.0.0.1:8089) |
| **mobile** (Node 22) | `npm ci` at root and in `mobile/` → `tsc --noEmit` → `npm test` → `npx expo export --platform android` (with `EXPO_PUBLIC_API_URL=https://example.invalid`) |

Run all four of the first job's steps locally before pushing. They catch different things: `tsc` finds type errors; **ESLint finds
react-hooks problems tsc cannot** (for example the `react-hooks/refs` rule rejects a hook that returns an object of refs; return a tuple);
tests find behaviour; the build finds bundling problems. `any` and unused variables are warnings, not errors, but do not add new ones.

`eslint.config.js` ignores `dist`, `node_modules`, `temp_zip`, `bakery-mobile` and `mobile`.

## Environment variables (server)

Set in the Render dashboard in production. Locally, keep them in `.env.local` and start the server with `npx tsx --env-file=.env.local server.ts`
(or export them in your shell): nothing loads the file for you. `.env.example` is the template.
Nothing is required to *boot*; each row says what breaks without it.

| Variable | Needed for | Notes |
|---|---|---|
| `APP_URL` | Public links (bills, payment-return, Shopify callback) | **Must be the real public URL** (`https://www.stockpot.in`). A placeholder once made every payment link point at a placeholder domain. No trailing slash needed |
| `PORT` | Server port | Default 3000 |
| `NODE_ENV` | `production` serves `dist/`; anything else runs Vite in middleware mode | Also makes the CSRF cookie `secure` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` **or** `GOOGLE_APPLICATION_CREDENTIALS` | Verifying ID tokens, all Admin SDK access | The JSON string, or a path to the file |
| `SESSION_ENC_KEY` | Encrypting Shopify/Odoo credentials | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PAYMENT_SECRETS_KEY` | Encrypting owners' gateway secrets | 32 random bytes, base64. **Never change it** once owners have saved keys |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLAN_ID`, `RAZORPAY_WEBHOOK_SECRET` | Stockpot's own subscription | Without them billing routes say "not configured" and the paywall never applies |
| `BILLING_DISABLED` | Testing switch | `true` = everyone has access, billing routes refuse. Remove to restore billing |
| `BILLING_ENFORCED` / `BILLING_ENFORCED_EMAILS` | Turning the paywall on | `true` for everyone; or a list of verified emails to try it |
| `AI_FEATURES_ENABLED`, `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID` | AI | Workspace id only for a key not tied to a workspace |
| `AI_ALLOWED_EMAILS`, `AI_ALLOWED_UIDS` | Limit AI to listed accounts | While in trial |
| `AI_CHAT_DAILY_LIMIT`, `AI_BRIEFING_DAILY_LIMIT`, `AI_PARSE_DAILY_LIMIT`, `AI_QUICK_DAILY_LIMIT`, `AI_GLOBAL_DAILY_LIMIT` | AI caps | Defaults 30, 4, 30, 60, 1500 |
| `NOTIFICATIONS_CRON_SECRET` | Phone notifications job | 16+ characters; also set on the Render Cron Job |
| `EXPO_ACCESS_TOKEN` | Expo push | Only if "enhanced push security" is on |
| `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | Shopify import | App-wide credentials (each store owner still authorises their own store) |
| `USDA_API_KEY` | Nutrition lookup (USDA source) | Open Food Facts needs none |
| `COOKIE_SECRET` | Reserved | Documented but unused |

Client-side config is **not** environment: `firebase-applet-config.json` (public Firebase web config; security relies on the rules, not on
hiding this) is committed. Never put a secret in a `VITE_` variable or in `vite.config.ts`'s `define`: both ship to every visitor.

## Deployment (Render)

- **Web service**: needs `npm run build` (produces `dist/`) and then `server.ts` running with `NODE_ENV=production` (for example
  `npx tsx server.ts`), which serves `dist/` and the API. There is no Dockerfile or blueprint in the repo; the exact build and start commands
  are set in the Render dashboard. A merged change that touches the web app or server only goes live after a Render deploy.
- **Cron Job** (notifications): schedule `0,15,30,45 * * * *`, command
  `curl -fsS -X POST -H "Authorization: Bearer $NOTIFICATIONS_CRON_SECRET" "$APP_URL/api/internal/notifications/run"`, with the same two env vars.
- **Razorpay webhook**: `{APP_URL}/api/billing/webhook` with the subscription events (README "Billing setup").
- **Firestore rules**: published separately in Firebase (`firebase deploy --only firestore:rules`, or via the console). Merging a rules change
  does **not** publish it.
- **Phone app**: not deployed by Render. Build an APK (see `mobile/README.md`) or use EAS. A server change that only affects `/api/mobile/*`
  needs no new APK; a change to the app needs one.

Render's `npm audit` shows vulnerabilities in dependencies from time to time; `npm audit fix` (reviewing the diff, then the four checks) has
been enough.

## Troubleshooting (things that have actually happened)

| Symptom | Cause and fix |
|---|---|
| "Stockpot had a problem" on a phone save, nothing in the UI | The server threw. Check Render logs for the route. Last time: `undefined` inside a Firestore document (the Admin SDK rejects it). Strip optional fields |
| Payment/bill links show a placeholder domain | `APP_URL` on Render is still the template value |
| Owner cannot save gateway keys; Settings says it is not set up | `PAYMENT_SECRETS_KEY` missing or not 32 bytes of base64. The server logs a warning at start |
| Saved gateway keys suddenly "cannot be read" | `PAYMENT_SECRETS_KEY` changed. Owners must re-enter their keys |
| 402 `subscription_required` on the phone | The paywall applies to this account and it has no active plan (check `BILLING_ENFORCED*` and the account's `billing.status`) |
| 503 from `/api/internal/notifications/run` | `NOTIFICATIONS_CRON_SECRET` unset or shorter than 16 characters |
| 409 from the same | A previous run is still going; harmless |
| AI card/button missing | Account not eligible: AI off, no key, demo account, not on the allow-list, or no plan. `GET /api/ai/status` gives the reason |
| `403 Invalid or missing CSRF token` from the web app | A raw `fetch` was used instead of `apiFetch`, or the CSRF cookie was blocked |
| "Failed to obtain CSRF token" locally | `/api/session/csrf` not reachable; check the dev server and that cookies are allowed on localhost |
| Firestore listener silently returns nothing | A collection missing from `isBusinessCollection` in `firestore.rules`, so reads are denied |
| Dates off by a day for India early morning | Someone used `toISOString().slice(0,10)` instead of `todayInZone` |
| `tsc` passes, CI ESLint fails | Run `npm run lint:eslint` locally; usually a react-hooks rule |
| Branch conflicts in 25 files after a squash-merge | The branch was cut from an old local branch. Branch from `origin/main`; merge `origin/main` and keep your 3-file diff |
| Phone shows "No connection — your draft is kept" | Expected offline; saving needs a connection |
| Razorpay "cannot charge N days ahead" at checkout | Razorpay refused the long trial; adjust `TRIAL_DAYS` (checklist in `docs/PROJECT_STATE.md`) |

## Working conventions

- **One change per pull request**, branched from `origin/main`. The repository squash-merges, so PR descriptions become history: say what
  changed, what was deliberately not changed, and the test plan, including anything that still needs a real device or a real gateway.
- **Add a `docs/CHANGELOG.md` entry** (newest at the top). When two PRs both edit the top of it, keep both entries when resolving.
- **Update the docs you touched**: file header comments, this guide, `docs/PROJECT_STATE.md` for decisions and open items,
  `.env.example` and the README table for new variables.
- **Say what you could not verify.** Several parts (Razorpay subscription, the owner gateway clients, push notifications, speech recognition,
  Google sign-in) cannot be exercised without real accounts or devices; the repo records exactly which and what the first real check is.
- **Do not weaken a security test to get green.** If a rules or CSRF test fails, the change is probably the problem.
