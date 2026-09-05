# Changelog

## Rebranded to Stockpot; broadened target market beyond bakeries

Renamed the product from "Bakery Manager" to **Stockpot**, and broadened
user-facing copy from bakery-specific language to general food-business
language, to reflect a wider target market: home chefs and small online
food stores, not just bakeries.

Updated across: the landing page (nav, hero, features, pricing card,
footer — including removing an unverifiable "hundreds of bakeries" claim
already flagged in an earlier entry), the Terms/Privacy page nav and
`[PRODUCT NAME]` placeholders, the login screen, loading state, paywall
copy, sign-out text, demo seed data, default business-name fallbacks,
the Settings business-profile section (labels, placeholders, the "Master
Baker" badge → "Business Owner"), production-run copy in `ProductionView`
and `ProductionRunModal` ("baking session" → "production run"), and the
downloaded CSV template filename.

**Deliberately left unchanged:** the internal `BakeryApp` React component
name and the `users/{uid}/settings/bakery` Firestore document path — both
are internal identifiers with zero user visibility; renaming them is a
cosmetic-only change carrying real risk (a Firestore path rename would need
a data migration for any existing users) for no actual benefit. Also left
untouched: `docs/CHANGELOG.md`'s historical entries (accurate to what
happened at the time) and the two pre-existing planning documents
(`docs/commercialization_roadmap.md`, `docs/home_chef_product_spec.md`),
which are strategic references, not live product copy.

---

## Single-plan pricing + 14-day free trial

The landing page previously advertised three pricing tiers (a $0 "Hobbyist"
free tier, a $49 "Bakery Pro" tier promising a 14-day trial, and a $149
"Team" tier promising multi-user roles and multiple locations) — none of
which the backend actually supported. It billed exactly one plan, with no
trial, and no multi-user support at all. A customer landing on that page
would have been promised things the product couldn't deliver.

Fixed by decision: ship one real plan, with a real 14-day free trial,
and mark anything beyond that as "coming soon" rather than advertising it
as available:

- `server.ts`: `create-checkout-session` now passes
  `subscription_data.trial_period_days` (a single `TRIAL_PERIOD_DAYS`
  constant) — but only for a customer's first-ever subscription attempt
  (`!existing.stripeCustomerId`), so canceling and resubscribing doesn't
  grant a second free trial. The webhook handler already stored whatever
  status Stripe reported for the subscription (`trialing`, `active`, etc.)
  dynamically, and `hasActiveAccess()` already treated `trialing` as valid
  access — so no further changes were needed there to support trials
  correctly.
- `src/LandingPage.tsx`: replaced the three-tier pricing grid with a single
  plan card matching what's actually billed, removed the unverifiable
  "hundreds of bakeries" customer claim, and wired the four previously
  non-functional CTA buttons ("Join Waitlist", "Request Early Access", etc.)
  to actually link to the app's signup/trial flow.
- Updated paywall copy in `App.tsx` and the Settings billing section to
  reflect "start your free trial" rather than "subscribe now" language.

---

## Legal pages added; billing redirect URL bug fixed

Added `/terms` and `/privacy` routes (`src/TermsPage.tsx`,
`src/PrivacyPage.tsx`), linked from the landing page footer and from the
paywall screen shown to unsubscribed users. **These are draft templates,
not finished legal documents** — every `[BRACKETED]` placeholder needs real
values, and the content needs review by a lawyer before charging real
customers. Privacy and consumer-protection requirements vary significantly
by jurisdiction (GDPR, CCPA, etc.) in ways a template can't account for.

Also fixed a real bug found while wiring up the legal pages: the Stripe
billing redirect URLs (`success_url`, `cancel_url`, `return_url` in
`server.ts`) pointed at `/` — the marketing landing page — instead of `/app`,
where the actual application lives. A customer completing checkout would
have landed back on the marketing page instead of the app they just paid
for.

---

## Stripe billing added

Added subscription billing so this app can be sold as a paid product rather
than run as a single internal tool:

- `lib/stripe.ts` — lazily-initialized Stripe client. Deliberately not
  initialized at import time: if billing isn't configured yet, the rest of
  the server still boots and serves every non-billing route normally.
- `lib/subscriptionStore.ts` — subscription status stored at
  `users/{uid}.billing`, written only by the server (checkout completion or
  a Stripe webhook), never by the client.
- Server routes: `GET /api/billing/status`, `POST
  /api/billing/create-checkout-session`, `POST
  /api/billing/create-portal-session` (all authenticated + CSRF-protected),
  and `POST /api/billing/webhook` (Stripe-signature-verified, registered
  with `express.raw()` *before* the global `express.json()` middleware,
  since signature verification needs the exact raw body bytes).
- **Closed a real security gap found while implementing this:** the existing
  `firestore.rules` wildcard let the owner of a `users/{uid}` document write
  to it directly — harmless before, but a real hole once that document holds
  server-controlled billing status (a client could otherwise just set their
  own `billing.status` to `"active"` and get free access). Fixed by denying
  all client writes to the top-level `users/{uid}` document; nothing in the
  app legitimately needed that access (verified by search before changing —
  all real app data lives in subcollections, which keep their existing
  write access).
- Client: `useBilling` hook, a paywall gate in `App.tsx` shown to signed-in
  users without an active/trialing subscription, and a "Manage Billing"
  section in Settings that opens the Stripe Customer Portal.
- Tests: `lib/__tests__/subscriptionStore.test.ts` (mocking
  `firebase-admin/firestore`), covering default status, merge-write
  behavior, and the access-check logic.

---

## Integration credentials moved from local SQLite to Firestore

`lib/integrationStore.ts` previously stored encrypted Shopify/Odoo
credentials in a local SQLite file (`data/integrations.db`) on the server's
disk. That's fine for a single personal-use instance, but becomes a real
liability the moment this app has paying customers depending on uptime: a
local file doesn't survive a redeploy on most platforms unless a persistent
volume is explicitly attached, and it can't be shared across multiple server
instances if the app ever needs to scale horizontally.

Moved to Firestore instead (`users/{uid}/integrationCredentials/{provider}`,
written via the Firebase Admin SDK, which bypasses Firestore security
rules — client-side access to that subcollection is explicitly denied in
`firestore.rules`). This removes the disk dependency entirely: the app works
identically on any number of server instances, on any hosting platform,
including ones with ephemeral/serverless compute.

Side effects of this change:
- `saveCredentials`/`getCredentials`/`deleteCredentials` are now `async`
  (Firestore Admin SDK calls are Promise-based; the old SQLite calls were
  synchronous). All 9 call sites in `server.ts` were updated to `await` them.
- The `better-sqlite3` dependency (and its native-build toolchain) was
  removed entirely — one fewer native dependency to worry about across
  different deployment platforms/architectures.
- Added `lib/__tests__/integrationStore.test.ts`, mocking
  `firebase-admin/firestore`, covering path construction, the
  encrypt/decrypt round trip, and confirming plaintext secrets never appear
  in the stored payload.

---

## Security, structure, and correctness remediation

A multi-phase cleanup covering security, repo hygiene, dependencies, code
structure, testing, and a set of real functional bugs found along the way.

**Security (Phase 1):**
- Removed a Gemini API key that was being inlined into the client-side JS
  bundle via Vite's `define` — anyone could read it from the shipped bundle.
- Shopify/Odoo credentials no longer live in client-readable cookies. They're
  now encrypted (`lib/crypto.ts`) and stored server-side (`lib/integrationStore.ts`),
  keyed by the authenticated Firebase user (`lib/auth.ts` verifies Firebase ID
  tokens on every integration request).
- Added CSRF protection (`lib/csrf.ts`) on state-changing routes.
- Stopped accepting Shopify client secrets via URL query string.

**Dependencies (Phase 3):** resolved critical/high-severity CVEs via `npm
update`; migrated `firebase-admin` 13 → 14 (a breaking API change — modular
subpath imports replaced the old `admin.*` namespace object).

**Structure (Phase 4):** `App.tsx` was 3,837 lines with 78 `useState` calls
and every handler defined inline. Extracted into eight feature hooks under
`src/hooks/` (see `docs/ARCHITECTURE.md` for the pattern) — down to ~2,300
lines. Also hoisted `SidebarTabButton`/`BottomNavButton` out of the render
body to module scope (they were being redefined as new component instances
on every render, a classic remount/state-loss anti-pattern caught by
`eslint-plugin-react-hooks`'s newer rules).

**Testing & CI (Phase 5):** added Vitest, ESLint (flat config, TypeScript +
React Hooks rules), and a GitHub Actions workflow running type-check → lint →
test → build on every push/PR.

**Real bugs found and fixed** (not style issues — actual shipped breakage,
found while doing the structural work above):
- `appProps` was passing hardcoded no-op stubs (`shopifyStatus: {}`,
  `lastSynced: ""`, `patchMaterial: ()=>{}`, etc.) instead of the real,
  working state/handlers that already existed in `App.tsx`. `lastSynced: ""`
  in particular would have crashed `InventoryView` (`"".toLocaleTimeString()`
  is not a function) if the error boundary hadn't caught it.
- `restockMaterial`/`setRestockMaterial` were real state, never wired into
  `appProps` — `InventoryView` called `setRestockMaterial(mat)` directly,
  which would throw on every restock attempt.
- Dead, unused props (`isRestockModalOpen`, `restockQuantity`, `restockCost`)
  were copy-pasted into all 7 view files' prop destructuring but never used.
- The Discard/Wastage modal (`useWastageActions`) was fully built but
  unreachable: no button called `setDiscardTarget` with a real target, and
  the success path called `toast.success(...)` — a phantom global with zero
  runtime backing that would have thrown `ReferenceError` if ever reached.
  Wired up real triggers in `InventoryView` (materials) and `ProductionView`
  (finished goods), and replaced the phantom `toast` call with the app's real
  `showAlert`.
- `handleDiscardBatch` (discarding an expired production batch) had the same
  problem — destructured in every view, never called. The expired-batches
  notification dropdown had a "View & Discard" button that only navigated to
  a tab and dismissed the alert; it never actually discarded anything. Added
  a real per-batch Discard button.
- Deleted three completely dead files (`src/utils/conversions.ts`,
  `errorHandling.tsx`, `constants.ts`) that were never imported anywhere and,
  in two cases, didn't even export their contents — permanently unreachable.
  Recreated a clean, properly-exported `conversions.ts` and wired `App.tsx`
  to import from it instead of defining `convertAmount`/`UNIT_CONVERSIONS`
  locally.

**Repo hygiene (Phase 2):** see the entry below — removed ~24 one-off
AI-assisted-development patch scripts, a stale duplicate `temp_zip/`
directory, and misc scratch files.

**Known gaps left for follow-up:** see the "Known gaps" section of the main
README.

---

## Repository cleanup (Phase 2 of remediation)

Removed a set of one-off Node scripts that had been left committed on `main`.
These were used during earlier AI-assisted development to patch `src/App.tsx`
and `src/types/index.ts` via string/regex replacement (e.g. adding fields to
the `Order` interface, wiring up the `IngredientSelectorModal` import, adding
missing props like `patchMaterial`, `shopifyStatus`, `odooStatus`, and various
production/wastage-related state). They were scratch tooling, not part of the
running application, and are removed here in favor of editing source files
directly going forward:

`patch_app.cjs`, `patch_app_2.cjs`, `patch_app_3.cjs`, `patch_app_4.cjs`,
`patch_production.cjs`, `fix_appProps.cjs`, `fix_ticks.cjs`, `fix_wastage.cjs`,
`update_app.cjs`, `update_app_correct.cjs`, `update_app_last.cjs`,
`update_app_precise.cjs`, `whack.cjs`, `mop_up.cjs`, `cleanup.cjs`,
`check_end.cjs`, `check_main.cjs`, `check_wrapper.cjs`, `extract_1.cjs`,
`extract_views.cjs`, `create_props.cjs`, `finalize_app.cjs`,
`assemble_views.cjs`.

Also removed: `bakeryapp.zip` and `temp_zip/` (a stale duplicate copy of an
earlier version of `src/`), and leftover scratch files `tmp2.txt` and
`tmp_wastage_ctx.txt`.

None of this affected the application's runtime behavior — these files were
never imported or executed by the app itself.
