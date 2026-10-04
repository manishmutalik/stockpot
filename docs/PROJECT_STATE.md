# Stockpot: project state and working notes

A running record of what has been built, the decisions behind it, how to
verify work, and what is next. Written so that nothing is lost when a working
session is compacted or handed over. Last updated after True Profit part 3.

## What Stockpot is

A bakery and kitchen inventory and margin app, India-first: the default
currency is INR, the demo is an Indian bakery with GST switched off, and the
landing page price is ₹1,200 a month.

Stack: React 18, Vite, TypeScript, Tailwind v4, motion/react, lucide-react,
react-router-dom, Firebase Auth and Firestore, an Express `server.ts` using
firebase-admin, Stripe, `qrcode`, `jspdf`, `html2canvas`. Tests are Vitest and
Testing Library; Playwright is used for visual checks.

## Conventions that matter

- No ESLint in this repo. `npm run lint` is `tsc --noEmit`.
- Verify with `npx tsc --noEmit`, `npx vitest run` and `npm run build`.
- Work is merged to `main` by squash PR, one feature per PR.
- Fake Firebase for tests is `src/__tests__/fakeFirebase.ts`. The demo
  sandbox data is derived in `src/utils/demoData.ts`, and its consistency is
  asserted by `src/utils/__tests__/demoData.test.ts` and
  `src/__tests__/demoSandbox.test.tsx`.
- html2canvas cannot read `oklch()` colours, which Tailwind v4 emits. Anything
  captured to an image or PDF (`BillCard`, `MenuCard`) uses inline hex colours.
- A paid order has no `paymentStatus`; only pay-later orders store `'unpaid'`.
- The Orders row is tight at narrow widths. Check 390, 820 and 1280px when
  adding anything to it.
- Do not open a PR or merge without the user saying so.

## Shipped, in order (all merged to `main`)

- Stitch skins for the app screens (dashboard, inventory, orders, production,
  recipes, R&D, wastage, settings, modals, auth and paywall screens) (#13-#20).
- Demo sandbox: explains why it fails, signs out if seeding fails, and the
  data adds up (batch costs, ingredient and shelf stock derived from recipes)
  with end-to-end tests (#21, #22).
- Landing page rebuilt from the Stitch design, with banner and food photos,
  fewer screenshots, and a laptop and phone showcase (#23-#29).
- India-first: Indian demo data, INR default, ₹1,200/month price (#25).
- Bills (#30, #31): Generate Bill from an order, UPI and "view online" QR
  codes, WhatsApp send, and a public `/bill/:token` page served from a
  server-built snapshot (`lib/billStore.ts`, `lib/billRoutes.ts`,
  `lib/billHtml.ts`). The token is 32 hex characters, created once and reused.
  Pure bill logic is `src/utils/billing.ts`, shared by browser and server.
- Pending payments and a consolidated bill (statement) per customer (#32).
- Share Menu: the menu as a PDF sent over WhatsApp (#33).
- True Profit parts 1 to 3 (#34, #35 and the part 3 PR below).

## True Profit engine

Source handoff: `docs/handoffs/true-profit-engine.md`. It is split into three
PRs. The decisions the user approved when we reviewed the handoff:

1. Unpaid orders count as revenue, with an "of which unpaid" note.
2. Fixed costs get optional start and end dates (beyond the handoff).
3. The three-PR split.
4. The changelog says GST-inclusive income and profit drop by the GST collected.

### Part 1 (#34): stable history and one place for the maths

- Each order is stamped at creation with unit price, ingredient cost,
  packaging cost, input GST and item name (`src/utils/orderPricing.ts`:
  `stampFor`, `resolveUnitPrice`, `resolveUnitCosts`, `resolveItemName`).
  Legacy orders fall back to today's values and are flagged `estimated`; they
  are deliberately not back-filled.
- All money maths lives in `src/utils/profit.ts`. Revenue is always the
  pre-GST base. A shared delivery charge, courier fee and discount count once
  per multi-item order (`attributeDeliveryFieldByGroup`). Wastage is subtracted
  once at business level. R&D is excluded from profit.
- The GST-inclusive profit overstatement is fixed (profit falls by the GST
  collected).
- Restock cost uses six-decimal moving-average rounding.

### Part 2 (#35): discounts, fees, fixed costs, "Made"

- `Order` gained `discount`, `paymentMethod`, `paymentFeeRate`.
  `BakerySettings` gained `paymentFeeRates` and `fixedCosts`
  (`{id, name, monthlyAmount, startDate?, endDate?}`).
- `saleAmounts()` in `profit.ts` is the single definition of what the customer
  is billed; `buildBill`, the Orders tab, order stats and profit all use it, so
  a bill total equals the base the payment fee is charged on.
- Discount is stored on the first item of a group only, comes off income once,
  is clamped to the billed amount, and GST is computed on the discounted sale.
- Payment fee is `customerPays × rate%`, using the rate stamped on the order
  when the method was recorded, and only once the order is paid. Rate changes
  never rewrite history.
- Fixed costs are prorated per calendar month by days inside each cost's
  start and end dates (`fixedCostsForRange`).
- Formulas: `income` is net of discount. `profit = income - orderExpenses -
  courierFees - wastage` (keeps its old meaning). `trueProfit =
  totalContribution - wastage - fixedCosts`, where contribution already has
  payment fees taken off.
- UI: "Made ₹x" badge and breakdown on each order or group
  (`ContributionBreakdown.tsx`), Paid by and Discount in Add Order and order
  details, `MarkPaidModal` asks how it was paid, Settings sections for payment
  fees and fixed costs, Summary cards for True Profit, Avg Order Contribution,
  Fixed Costs, Payment Fees and Discounts, and an "Includes ₹x not yet paid"
  note. Bills and the public bill page show a Discount line.
- Demo data has UPI, cash and card orders (card 2%), one discounted past café
  order, and three fixed costs.
- Verified in a browser: today's True Profit reconciles by hand; layouts at
  390, 820 and 1280px.

### Part 3: ingredient price log and per-product profit

- `PriceLogEntry` (`src/types`) is stored at `users/{uid}/priceLog/{id}`:
  `{id, materialId, date, unitCost, unit, quantity?, macAfter?, source,
  createdAt}`. Differences from the handoff: each entry also stores its `unit`
  (so a later unit change cannot corrupt history; the history converts to the
  material's current unit) and a `createdAt` (to order entries of the same day).
- Pure helpers in `src/utils/priceLog.ts` (`newPriceLogEntry`, `priceHistory`).
- Written by: restock (`handleRestock` now uses one `writeBatch` for the
  material and the entry), a material added with a cost (App
  `handleAddMaterialSubmit` and the CSV import, source `initial`), and the
  inline cost box (`updateMaterial`, debounced one second and flushed on
  unmount, source `manual_edit`). A unit change (`changeUnit`) writes nothing.
- App reads the whole `priceLog` collection once and passes `priceLog` to the
  views (it is small; per-material queries were not worth the extra fake
  Firebase support).
- Inventory: a history button per material opens `PriceHistoryModal`
  (portalled, like `MarkPaidModal`).
- Menu: a period select (7, 30, 90 days, all time; default 30) and a
  `ProductPerformance` strip per item, from `productProfits` in `profit.ts`.
  Shared order charges are split by each item's sales so product contributions
  sum to the order contributions (tested).
- The price log is append-only in code and, since the rules rewrite, in
  `firestore.rules` too (create and read only). The demo seeds a price history
  for every material.
- This completes the True Profit handoff. Not built: a Goods Receipt source
  (reserved in the type, for Purchase Management) and any price alerts or
  trends (Phase 2, to read from this log).

## AI CFO

Design and plan: `docs/AI_CFO_DESIGN.md`; original handoff:
`docs/handoffs/ai-cfo.md`. Everything AI ships switched off (trial mode, no
paying users). Built so far: customer insights, the business time zone, the
shared plumbing (server-side gate and daily caps, figure registry and text
guard, business snapshot, rules) and the daily briefing on the Dashboard
(`POST /api/ai/briefing`, cached per day, validated with a code-built fallback;
the demo shows a sample) and Ask Your Business (`POST /api/ai/chat`, a slide-over
chat; no what-if tool until Phase 2) and order parsing (the Add Order form can be
filled from a pasted message; `POST /api/ai/parse-order`) and reorder
suggestions (`utils/reorder.ts`, a card on the Inventory tab, no AI needed). The AI list
in the handoff is complete except `parse-production-run` and the Phase 2 items
(repricing alerts, price drift, the what-if tool). Rule for every AI feature: no model-generated figures
(see the design doc).

## Firestore security rules

`firestore.rules` is an allow-list. Firestore rules are additive (any matching
`allow` grants access; a specific deny never overrides a broader allow), so the
file uses no recursive wildcard: each client collection under `users/{uid}` is
named in `isBusinessCollection`, `priceLog` is create and read only, the user
document is read-only for everyone (billing status and `role` are server-only),
and `integrationCredentials` and `bills` are not reachable from a client. The
earlier version let any user make themselves admin; see the changelog.

- Tests: `npm run test:rules` (Firestore emulator, needs Java 21; also a CI job).
  Not part of `npm test`. Run them whenever the rules or the set of collections
  the apps use changes. `firebase.json` configures the emulator and deploys.
- A new client collection under `users/{uid}` must be added to
  `isBusinessCollection` and to the test, or the app is denied.
- The rules in the repo are not live until deployed:
  `npx firebase-tools deploy --only firestore:rules --project stockpot-adffe`.

## Overlay stacking

- The fixed bottom nav and the mobile FAB are `z-50`. `ModalShell` overlays are
  `z-[60]`, `ConfirmDialog` is `z-[70]` (so it can open over a modal) and the
  Menu undo toast is `z-[80]`. `overlayStacking.test.tsx` keeps modal > nav and
  confirm > modal.

## Open items for the user (none blocking)

- **Razorpay or Cashfree instead of Stripe.** The user wanted this later. We
  need: which provider, whether ₹1,200 includes 18% GST, whether there are
  existing Stripe subscribers, and whether to keep Stripe.
- The Stripe price must be set to ₹1,200/month in INR.
- The banner logo image still shows `$` and `%`; it needs a rupee version.
- **Deploy the new Firestore rules** (below). Until they are published, the old
  open rules are live in production.

## Running the app for browser checks

The real app needs Firebase, which is unreachable from the sandbox, so visual
checks use a Vite config that aliases `./firebase` to an in-memory mock built
on `buildDemoData` (live writes and listeners). A temporary config file inside
the repo root is needed so module resolution works; delete it afterwards. Do
not use `pkill -f` or `pgrep -f` with a pattern that also appears in your own
command line, as it kills the shell.
