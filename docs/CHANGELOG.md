# Changelog

## USDA + Open Food Facts nutrition lookup (step 4 of the feature)

Third step built (step 3, the menu item detail rollup view, is still
pending) of the Nutrition & Allergen Info feature: a "Look up" search in
the Nutrition & Allergens modal that queries both free data sources and
lets the owner pick a result to pre-fill the form from.

- New `lib/nutritionSearch.ts`: `searchUsda()` and `searchOpenFoodFacts()`,
  each normalizing its source's response into a shared
  `NutritionSearchResult` shape. USDA is restricted to Foundation/SR Legacy
  data types (generic ingredients, matching its intended use here) and
  never carries allergen data; Open Food Facts is the primary allergen
  source, with its `en:`-prefixed tags mapped onto this app's fixed
  `ALLERGEN_TAGS` (documented as a deliberate, non-exhaustive best-effort
  mapping — e.g. `en:gluten` -> `wheat`). Covered by
  `lib/__tests__/nutritionSearch.test.ts` (the pure normalization logic;
  the actual HTTP calls aren't mocked/tested).
- Two new authenticated routes in `server.ts`:
  `GET /api/nutrition/search-usda` and `GET /api/nutrition/search-openfoodfacts`,
  each wrapped in its own try/catch per this codebase's established
  "one unguarded external call crashed the whole server" lesson. The USDA
  route requires `USDA_API_KEY` (new env var, documented in `.env.example`
  and the README) and fails with a clear "not configured" error without it;
  Open Food Facts needs no key.
- **The client queries both routes in parallel for every lookup, never one
  as a fallback for the other** — USDA has no allergen data at all, so a
  fallback chain that only tried Open Food Facts when USDA came up empty
  would rarely actually reach the app's one allergen source in practice.
  Both result lists (and either source's own failure) are shown side by
  side in the modal, so the owner can pick from either.
- Picking a result pre-fills the form (still fully editable afterward,
  since no database perfectly matches a specific brand/supplier) and
  records which source it came from, shown in the modal as the visible
  `nutritionSource` the data model already had a field for.

**Known limitation:** this environment's outbound network policy blocks
both `api.nal.usda.gov` and `world.openfoodfacts.org`, so the API
integration could not be exercised against live traffic while writing it.
The request/response shapes match each API's stable, documented contract,
but treat this as unverified against real responses until it's been
smoke-tested from an environment that can actually reach them.

---

## Nutrition & allergen manual entry UI (step 2 of the feature)

Second step of the Nutrition & Allergen Info feature (step 1 added the data
model and calculation module — see below): a "Nutrition & Allergens" modal
on the Inventory tab, so a business owner can manually enter this data per
material with no external API dependency yet.

- `useInventoryActions.ts` gained the modal's state (mirroring the existing
  Restock modal's pattern exactly) and two handlers: `openNutritionEditor`
  pre-fills the form from whatever a material already has, and
  `saveNutritionInfo` writes it back via the existing `patchMaterial`.
  Nutrition is only written when at least one macro field was filled in —
  leaving all four blank means "no data" (so recipe rollups correctly flag
  it incomplete), not "zero calories". Allergens save exactly as selected,
  including an empty selection.
- New icon-only "Nutrition & allergens" button next to Restock/Discard on
  each Inventory row, opening the modal with calorie/protein/carb/fat
  inputs (labeled per the material's actual basis unit — g, ml, or pcs)
  and an `ALLERGEN_TAGS` multi-select.

Not yet built: the menu item detail rollup view, USDA/Open Food Facts
lookup-and-fill, and the shareable nutrition card.

---

## Nutrition & allergen data model + calculation module (step 1 of the feature)

First step of the planned Nutrition & Allergen Info feature (full spec
handed off separately): the data model and pure calculation module, with
no UI yet.

- `RawMaterial` (`types/index.ts`) gained `nutrition` (calories/protein/
  carbs/fat per 100g/ml), `nutritionSource` ('usda' | 'openfoodfacts' |
  'manual', display-only), and `allergens` (free-form string array,
  validated against `ALLERGEN_TAGS` at rollup time rather than at the type
  level, since it may hold values from an external API before cleanup).
  All optional — existing materials are unaffected.
- New `src/utils/nutritionCalculations.ts`: `ALLERGEN_TAGS` (the fixed,
  India-and-US-covering allergen tag list) and `calculateRecipeNutrition()`,
  a pure per-serving nutrition + allergen-union rollup for a recipe, mirroring
  the existing recipe-cost rollup pattern (reuses `convertAmount()`, never
  reimplements unit conversion). Handles a material stocked in a different
  unit than its nutrition basis (e.g. stocked in kg, nutrition per 100g),
  missing/zero yield without dividing by zero, and flags `hasIncompleteData`
  whenever any ingredient lacks nutrition data so the UI never presents a
  partial estimate as a complete one. `MenuItem` itself stores no nutrition
  field — it's always computed on the fly from the current recipe, so it
  can't go stale.
- Covered by `src/utils/__tests__/nutritionCalculations.test.ts` (16 cases:
  zero/negative/missing yield, unit-family conversion for kg/l/pcs-stocked
  materials, missing materials, missing nutrition data, allergen
  union/dedup, and an end-to-end multi-ingredient recipe).

Not yet built (later steps of the same feature): material edit UI for
nutrition/allergen entry, the menu item detail rollup view, USDA/Open Food
Facts lookup-and-fill, and the shareable nutrition card.

---

## Removed the Summary tab's Inventory Status table

A previous fix made this table actually render (it had been dead code —
see the entry below), but real usage surfaced a deeper problem: its
"Used in Period" figure only counts orders that are still unfulfilled
(a deliberate choice elsewhere in the app, to avoid double-counting stock
already deducted at fulfillment), so it reads 0 for any business that
promptly fulfills orders — the normal case — making "Initial Stock" and
"Current Stock" identical too. Redesigning it to show real period
consumption was one option, but the Inventory tab already shows live
stock levels per material, making this table redundant. Removed it
(and the now-unused `sortedRemainingInventory`/`summaryInventoryUsage`
props and icon imports that only it needed).

---

## Fixed the Summary tab's Inventory Status table (was always empty)

The table at the bottom of the Summary/dashboard tab (`SummaryView.tsx`),
meant to list every material's stock status for the selected period, was
dead code that never rendered a single row:

- It grouped materials by comparing `category` against the hardcoded
  literals `'raw'`/`'packaging'`, but materials actually store category as
  `'Raw Materials'`/`'Packaging Materials'` (or any custom category a user
  adds) — so the filter always matched zero items, for every business.
- Even had that matched, the row JSX read `item.currentStock`,
  `item.usedInPeriod`, and `item.minStock`, none of which exist on
  `remainingInventory` entries (which expose `remaining`, `used`, and
  `threshold`) — it would have crashed immediately.

Fixed by grouping over the real `categories` list (plus an "Uncategorized"
fallback for orphaned materials, matching `InventoryView.tsx`'s own
pattern), and using the correct fields: `item.remaining` for current stock
and the low-stock check (matching `InventoryView.tsx`'s
`(threshold ?? 0) > 0 && remaining <= threshold` logic), and
`summaryInventoryUsage[item.id]` — a period-filtered usage figure that was
already computed in `App.tsx` but, like this table, never actually wired
up anywhere — for "Used in Period".

---

## Hide GST % column in Inventory when GST is off

The Inventory table's "GST %" column (and its per-material input) showed
unconditionally, even for businesses with GST switched off in Settings —
a stray, meaningless field for the common case. It now only renders when
`settings.gstApplicable` is true, matching the Summary tab's GST cards.

---

## GST tracking added

Added optional GST (Goods & Services Tax) tracking, off by default:

- `src/utils/gstCalculations.ts` — new pure module: `splitSaleForGst()` (splits
  a sale amount into base + GST, for either GST-inclusive or GST-exclusive
  menu pricing) and `calculateMaterialGstPaid()` (sums input tax paid on
  consumed materials, from each material's own `gstRate`). Covered by
  `src/utils/__tests__/gstCalculations.test.ts`.
- `BakerySettings` gained `gstApplicable`, `gstRate`, `gstPricingMode` — wired
  through `useSettingsListener.ts`'s default/Firestore mapping so they
  actually load, not just `useSettings.ts`'s save path.
- `getFinancialsForRange` in `App.tsx` now also returns `gstCollected`
  (output tax on sales, using the module above) and `gstPaid` (input tax on
  materials used), additively — the existing `income`/`expenses`/`profit`
  numbers are unchanged.
- Settings → Business Settings: a new GST card (toggle, rate, inclusive/
  exclusive pricing mode), right after Business Profile.
- Inventory: a per-material editable "GST %" column, replacing what used to
  be a write-only field (`RawMaterial.gstRate` existed but had no UI
  anywhere — only a hardcoded 5% fallback in the restock modal's display).
- Summary: "GST Collected" and "GST Paid" cards, shown only when GST is
  switched on.

---

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
