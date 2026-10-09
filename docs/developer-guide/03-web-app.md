# 3. The web app (`src/`)

React 19 + TypeScript + Vite + Tailwind CSS v4. Charts use Recharts, animation uses `motion`/framer-motion, icons are
`lucide-react`, PDFs are `html2canvas` + `jspdf` (loaded on first use), QR codes are `qrcode`, CSV is `papaparse`.

## Entry points and routing

`src/main.tsx` mounts React Router with four routes:

| Path | Component | Notes |
|---|---|---|
| `/` | `LandingPage.tsx` | Marketing page. Public. See *Landing page* below. |
| `/app` | `App.tsx` | The product. Sign-in, paywall and the eight tabs all live behind this one route. |
| `/terms`, `/privacy` | `TermsPage.tsx`, `PrivacyPage.tsx` | Draft legal pages with `[BRACKETED]` placeholders for the owner to fill in. |

The tabs are **not** routes. The active tab is React state in `App.tsx` (`TabId`) and is remembered in
`localStorage['activeTab']`. The server's SPA fallback makes `/app` work on refresh.

The public customer bill page (`/bill/:token`) is **not** part of this app. It is plain server-rendered HTML
(`lib/billHtml.ts`), so a customer's phone loads one small document with no JavaScript.

## `App.tsx`: the shell

`App` wraps `BakeryApp` in an `ErrorBoundary`. `BakeryApp` (about 1,700 lines) does these jobs, in this order:

1. **Auth state.** `onAuthStateChanged` sets `user` and `isAuthReady`. Email/password, Google popup, and the demo
   sandbox sign-in all just change Firebase's auth state; the listener does the rest.
2. **Data listeners.** One `useFirestoreCollection` call per collection (`materials`, `menu`, `orders`, `experiments`,
   `productionRuns`, `wastageLogs`, `priceLog`) plus `useSettingsListener` for the single settings document. Each
   subscribes with `onSnapshot` once auth is ready, and re-subscribes if the user changes. `dataReady` becomes true
   when the main ones have each delivered a first snapshot (used so an AI briefing is never built from placeholder data).
3. **Feature hooks.** `useInventoryActions`, `useMenuActions`, `useOrderActions`, `useProductionActions`,
   `useExperimentActions`, `useWastageActions`, `useSettings`, `useIntegrations`, `useBilling`, `useOrderParser`,
   `useProductionParser`. Each receives the read-only data it needs as arguments and returns handlers.
4. **Render gates**, in this order: loading → sign-in (`AuthScreen`) → "Checking your plan..." → `PaywallScreen` (only if
   the server says `billing.paywall` is on for this account and there is no active or trialing plan) → the app.
5. **The app.** A sidebar (desktop) or bottom bar (phone), the top bar, global modals (alert/confirm, Add Order, Log
   Production Run, Add Material, Ingredient selector, Restock, Discard, Nutrition), the active view, and the floating
   "Ask your business" button (`AskBusiness`), which sits over every tab.

`App.tsx` builds one big object, `appProps`, and passes it to the active view as `{...appProps}`. Views take
`AppViewProps` (`src/types/index.ts`). It is a big prop bag on purpose: it let the original monolith be broken apart
without rewriting every view's props. A new view or handler means adding a field to `AppViewProps` and to `appProps`.

Tabs are lazy-loaded (`React.lazy`), so only the active view's code is downloaded. Only one view is mounted at a time.

### Tab names

| Tab id | Sidebar label | Bottom bar | View |
|---|---|---|---|
| `summary` | Dashboard | Home | `SummaryView` |
| `inventory` | Stock / Inventory | Stock | `InventoryView` |
| `orders` | Orders | Orders | `OrdersView` |
| `production` | Production Runs | Runs | `ProductionView` |
| `menu` | Recipes & Menus | Recipes | `MenuView` |
| `experiments` | R&D Lab | R&D | `ExperimentsView` |
| `wastage` | Wastage | Waste | `WastageView` |
| `settings` | Settings | More | `SettingsView` |

Two cross-tab shortcuts exist: `openUpcomingOrders()` jumps to Orders with the "upcoming" filter, and `openRepricing()`
jumps to Recipes with the "repricing" filter (`ordersFilterOnOpen`, `menuFilterOnOpen`).

### Why state is not in a global store

Rather than add Redux/Zustand/Context on top of a large refactor, each feature area became a hook that owns its own
writes and any modal state nothing else needs. The shared collections stay in `App.tsx` and are passed in as
parameters, so a hook never keeps a second copy. This is described in `docs/ARCHITECTURE.md`.

## Hooks (`src/hooks/`)

| Hook | Owns |
|---|---|
| `useFirestoreCollection` | Generic `onSnapshot` listener for `users/{uid}/<collection>`; returns `[items, setItems, loaded]` |
| `useSettingsListener` | The single `settings/bakery` document; also fills `categories` and `currency` |
| `useSettings` | Debounced autosave of settings, the theme-colour CSS variable, explicit save and currency change |
| `useInventoryActions` | Materials and categories CRUD, CSV import/export, the Restock modal's own state and submit |
| `useMenuActions` | Menu item CRUD and recipe editing; stamps `pricedAt`/`costAtPricing` when a price changes |
| `useOrderActions` | Order add/update/delete, hand-over (`fulfillOrder`), cancel pre-order, mark paid, payment method |
| `useProductionActions` | Logging and deleting production runs, discarding expired batches |
| `useWastageActions` | The Discard flow for materials and finished goods |
| `useExperimentActions` | R&D Lab experiments and their materials |
| `useIntegrations` | Shopify and Odoo: status, connect/disconnect, importing orders and matching them to menu items |
| `useBilling` | Fetches `/api/billing/status`; starts Razorpay Checkout; cancels. Exposes `hasAccess` and `billing.paywall` |
| `useOrderParser`, `useProductionParser` | Reading a pasted/typed message into the Add Order / Log Production Run form (AI) |

**The write pattern.** A hook computes what to write with a *plan* from `src/utils/plans` (see
[Money, plans and bills](04-money-plans-bills.md)), puts the writes in a Firestore `writeBatch` with
`addWritesToBatch`, commits, and reports failures through `handleFirestoreError`. Anything else that must be atomic
(multiple documents) uses a batch too. Do not write related documents with separate `setDoc` calls.

**Errors.** `handleFirestoreError(err, OperationType.X, path)` (`src/utils/firestoreError.ts`) logs a structured record
including the auth context and then throws. Use it rather than bespoke try/catch so failures look the same everywhere.

**Talking to our own API.** Always use `apiFetch` (`src/utils/apiClient.ts`). It adds the Bearer ID token and, for
non-GET requests, the CSRF token. A raw `fetch('/api/...')` will be rejected.

## Views (`src/views/`)

One component per tab, presentation only. They take `AppViewProps` and call handlers from hooks. They must not work
out money themselves; they call `src/utils/profit.ts` and friends.

| View | Main content | Key helpers it uses |
|---|---|---|
| `SummaryView` | Dashboard: range picker (daily/weekly/monthly/custom), revenue/profit tiles, charts, daily briefing, repricing card, due-tomorrow card | `profit.ts`, `preorders.ts`, `DailyBriefing` |
| `InventoryView` | Materials table with status pills, restock, price history, reorder suggestions, nutrition, CSV | `inventoryStatus.ts`, `reorder.ts`, `pricing.ts` |
| `MenuView` | Menu items, recipe editor with live cost, margin drift, target margin, what-if pricing, nutrition rollup | `pricing.ts`, `menuStats.ts`, `nutritionCalculations.ts` |
| `OrdersView` | Orders by day, customer panel, pending payments, pre-orders and hand-over, bills, shareable menu PDF | `payments.ts`, `preorders.ts`, `customers.ts`, `billing.ts` |
| `ProductionView` | Production runs and batches, freshness, discard | `batchStock.ts`, `stockAging.ts`, `productionStats.ts` |
| `ExperimentsView` | R&D Lab: draft recipes and their cost | `rndStats.ts` |
| `WastageView` | Wastage log and totals | `wastageStats.ts` |
| `SettingsView` | Business profile, GST, time zone, fees, fixed costs, pricing choices, UPI, online payments, integrations, categories, subscription | `settingsParts.tsx`, `OnlinePaymentsCard` |

## Components (`src/components/`)

Reusable modals, cards and panels. A few are worth knowing:

- `ModalShell.tsx`: the common modal frame and the shared field styles (`modalField`, `MODAL_LABEL`). New modals should
  use it. `overlayStacking.test.tsx` guards that stacked modals layer correctly.
- `AddOrderModal.tsx`: the Add Order form, including customer suggestions (`CustomerCombobox`), pre-order fields
  (`PreorderParts`) and the paste-a-message box.
- `BillModal.tsx` / `BillCard.tsx`: build and share a bill (image, QR, WhatsApp link, online link).
- `MarkPaidModal.tsx`, `PendingPayments.tsx`: collecting unpaid orders, per customer.
- `DailyBriefing.tsx`, `AskBusiness.tsx`: the AI surfaces; they ask `/api/ai/status` first and render nothing if AI is
  unavailable to the account.
- `OnlinePaymentsCard.tsx`: Settings card for the owner's own Razorpay/Cashfree keys.
- `settingsParts.tsx`: field styles and the `Section` card used by Settings.
- `AuthScreens.tsx`: `LoadingScreen`, `AuthScreen` (Google, email, demo), `PaywallScreen`.

## Utilities (`src/utils/`)

Pure functions, one concern per file, each with a header comment. Grouped by purpose:

| Group | Files |
|---|---|
| Money and profit | `profit.ts` (the one place), `orderPricing.ts` (stamps), `gstCalculations.ts`, `pricing.ts` (margin drift, target prices, what-if), `priceLog.ts` |
| Orders and customers | `orderClustering.ts` (group lines into orders), `orderStats.ts`, `preorders.ts`, `payments.ts`, `customers.ts` |
| Stock | `conversions.ts` (units), `inventoryDeduction.ts`, `inventoryStatus.ts`, `batchStock.ts`, `stockAging.ts`, `reorder.ts`, `productionStats.ts`, `productionRunClustering.ts`, `wastageStats.ts`, `rndStats.ts`, `experimentMaterialUsage.ts` |
| Plans | `plans/` (shared by web and server) |
| Customer-facing | `billing.ts` (bills, UPI links, WhatsApp text, tokens), `menuShare.ts`, `shareFile.ts`, `pdfExport.ts` |
| AI | `aiSnapshot.ts`, `aiBriefing.ts`, `aiChat.ts`, `aiFigures.ts`, `aiPrivacy.ts`, `orderParse.ts`, `productionParse.ts`, `menuVariants.ts` |
| Phone app support | `quickApiTypes.ts`, `quickViews.ts`, `quickParse.ts`, `restockParse.ts`, `paymentParse.ts`, `quickPayments.ts`, `quickNotifications.ts`, `quickNotificationJob.ts`, `speechPhrases.ts`, `money.ts` |
| Platform | `firestoreError.ts`, `apiClient.ts`, `authErrors.ts`, `localDate.ts`, `trial.ts`, `onlinePayments.ts`, `clustering.ts`, `demoData.ts` |

## Landing page

`src/LandingPage.tsx` is a long marketing page: hero, problem, features, how it works, pricing, FAQ, footer.

- Copy is in the file (constants like `PROBLEM_LINES`, `FEATURE_CARDS`, `FAQS`). `src/__tests__/LandingPage.test.tsx` pins
  important phrases, so a copy change may need a test change.
- The four infographics are HTML/CSS (not images) in `src/components/landing/Infographics.tsx`. Their numbers and bar
  widths come from `figures.ts`, which is unit tested; each has a text alternative (`role="img"` with an `aria-label`
  stating the figures). They size themselves with CSS container queries (styles in `src/index.css`, classes `ig-*`).
- Motion (reveal on scroll, parallax, tilt) respects `prefers-reduced-motion` (`wantsLessMotion()`).
- The free-trial length shown on the page is `TRIAL_DAYS` from `src/utils/trial.ts`. Never hard-code "14 days" or "45 days".
- Images are in `public/landing/` (`hero-kitchen`, `laptop-pricing`, `pastries`, `sourdough`).

## Adding a feature (the checklist)

1. **Decide where the logic goes.** If it is arithmetic or a rule, write a pure function in `src/utils/` and test it.
   If it writes data, write a plan in `src/utils/plans/` (so the phone can reuse it later) and a hook that commits it.
2. **New collection?** Add it to `isBusinessCollection` in `firestore.rules`, add a rules test, and subscribe with
   `useFirestoreCollection` in `App.tsx`. If the server alone should touch it, do *not* list it in the rules.
3. **Hook.** Take read-only data as parameters; return handlers; use `handleFirestoreError`.
4. **Wire it.** Call the hook in `BakeryApp`, spread its return into `appProps`, add the fields to `AppViewProps`.
5. **UI.** A view or a modal using `ModalShell`; money from `profit.ts`/`pricing.ts`, never recomputed.
6. **Tests.** Hook tests mock `../firebase` with `vi.mock` (see `src/hooks/__tests__/`); pure logic needs no mocks.
   The whole app can be rendered against `src/__tests__/fakeFirebase.ts`.
7. **Docs.** Add a `docs/CHANGELOG.md` entry; update this guide if you added a concept.

A real caution from the refactor history: several bugs turned out to be a feature whose logic existed and worked but was
never connected to a UI trigger, or was wired to the wrong prop name. If something "does not work", check that the
handler is actually called with the right prop before assuming the maths is wrong.

## Styling

Tailwind v4 via `@tailwindcss/vite`; global styles and design tokens are in `src/index.css`. Brand colour is user-set
(`settings.primaryColor`, applied as a CSS variable by `useSettings`). The look is: teal primary, off-white canvas, white
cards with soft teal-grey borders, mono uppercase captions (`font-mono text-[10px] uppercase tracking-wider`). Reuse the
existing tokens and classes (`surface-card`, `modalField`) rather than new ad-hoc colours.
