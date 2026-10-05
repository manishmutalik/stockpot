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
in the handoff is complete except `parse-production-run` (the Phase 2 items, repricing
alerts, price drift and the what-if tool, are built). Rule for every AI feature: no model-generated figures
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

## Customer suggestions (Add Order)

`utils/customers.ts`: `groupOrdersByCustomer` is the one place that decides who a
customer is (`payments.customerKey`); `buildCustomerProfiles` and `buildCustomerDirectory`
both use it. `matchCustomers` ranks name matches (full-name prefix, then word prefix) and
phone matches, most recent first, at most six. `components/CustomerCombobox.tsx` is the
ARIA combobox used for the name and phone inputs. The directory is built once in `App.tsx`
and passed to `AddOrderModal` as `customers`.

## Overlay stacking

- The fixed bottom nav and the mobile FAB are `z-50`. `ModalShell` overlays are
  `z-[60]`, `ConfirmDialog` is `z-[70]` (so it can open over a modal) and the
  Menu undo toast is `z-[80]`. `overlayStacking.test.tsx` keeps modal > nav and
  confirm > modal.

## Pre-orders (Phase A, built)

Handoff: `pre-orders-handoff.md`. The rules live in `src/utils/preorders.ts`
(`holdsStock`, `countsAsSale`, `isActual`, `isBookedForLater`, `isOpenPreorder`,
`summarizeDue`). Order gained `preorder`, `bookedOn`, `dueSlot`, `notes`, `stockClaimed`,
`advance {amount, method, feeRate, date}`, `cancelledOn`, `advanceOutcome`.

- **Stock.** A pre-order holds no stock until handover (`stockClaimed`). Delete, edit,
  reset and cancel give stock back only when `holdsStock` is true. Handover claims every
  line of the group or none, and re-stamps costs (not price or name).
- **Figures count only up to today** (owner's decision). Every actual figure counts
  orders dated today or earlier, in `settings.timezone`, and not cancelled. Future-dated
  orders are **Booked for later ₹X** (`bookedAhead` in `profit.ts`) on Orders and the
  Dashboard. Revenue lands on the due date. Customer stats (last order, status, spend,
  due, lapsed) ignore not-yet-due pre-orders.
- **Advance money.** Stored on the first member of a group, like a discount. Payment fee
  = advance × `advance.feeRate` + balance × the order's own rate (balance fee only when
  paid with a method recorded). Bills show advance and `balanceDue`; the UPI link asks for
  the balance; `groupPendingPayments` owes total − advance and skips future and cancelled
  orders. A kept advance is income on the cancellation day (`forfeitedAdvances` in
  `financialsForRange`, a driver in the AI snapshot).
- **UI.** `AddOrderModal` (mode toggle, due date and slot, notes, advance, per-line price,
  confirmation step), `OrdersView` + `PreorderParts` (Upcoming and Cancelled filters,
  booked-ahead strip, handover collects the balance, cancel dialogs), `DueTomorrowCard`
  on the Dashboard. An order handed over before its due date stays under Upcoming until
  that date.
- **AI.** Briefing kind `'preorder'` (deterministic lines, placed first), snapshot
  `preorders` section, parser fills notes, advance and a future date.
- **Not done.** `bakery-mobile` is unused (a native app is planned) and was left alone.
  The "Accountant Pack" mentioned in the handoff is not in the repo (still unlocated).

## Price & margin intelligence (Phase 2, built)

Handoff: `price-margin-intelligence-handoff.md`. All of it is `src/utils/pricing.ts`
(pure, tested) over data that already existed; it reads `profit.ts` (`productProfits`,
now also returning `grossRevenue`, `paymentFees` and `costOfGoods`) and `priceLog.ts`.

- **Stamp.** `MenuItem` gained `pricedAt`, `costAtPricing`, `materialCostsAtPricing`,
  `pricingIsBaseline`, `targetMargin`. `useMenuActions.updateMenuItemField` writes the
  stamp whenever `sellingPrice` is set to a positive number, and the Menu price input
  (`PriceInput`) commits on blur or Enter, so the stamp describes the final price.
  `stampPricingBaselines()` runs once per session after the data has loaded (an effect in
  `App.tsx`) and gives priced, unstamped items a baseline stamp at today's costs, marked
  `pricingIsBaseline`. Past costs are never reconstructed.
- **Drift** (`marginDrift`). Price drift per material = today's recipe amount × (today's
  cost − stamped cost). The remainder of the cost change is `recipeChangeImpact`, so the
  two add up and an edited recipe is never blamed on an ingredient. Alert `below_target`
  only when the owner has set a target (item or Settings default): with none, the
  implicit 71.4% (the 3.5× markup) is used for suggestions only, so no existing item is
  flagged by surprise. `slipped` at `marginAlertPoints` (default 5).
- **Suggested price** (`suggestedPriceForTarget`, `suggestedPriceFor`) replaces
  `menuStats.suggestedPrice` everywhere. `DEFAULT_TARGET_MARGIN = 100 × (1 − 1/3.5)`
  reproduces 3.5× exactly before rounding; rounding is up to `priceRounding` (default ₹5).
  `repriceOptions` offers "back to the margin it had" and "your target", only ever higher
  than the current price.
- **What-if** (`pricingScenario`). Units, discounts and payment fees come from the actual
  sales in the window (30 or 90 days, or fewer if the business is newer; scaled to 30
  days). "Now" and "after" are both at *today's* menu price and costs, so a price or cost
  that moved since those sales is not folded into "+8%". Delivery charged and courier
  fees are carried over unchanged. Break-even is `can_lose` (1 − c/c′), `must_gain` for a
  cut, `unchanged`, or `not_applicable` when there is no profit to defend.
- **Price stats** (`materialPriceStats`, `recipesAffectedBy`): purchases only (`restock`,
  `goods_receipt`); a change is `null` ("not enough history yet"), never 0, without an
  entry old enough to compare with; entries in a unit that does not convert are skipped.
- **UI.** Menu: drift badge and panel (`MarginDriftPanel`), target field, "Needs
  repricing" filter, "What if…" (`PricingScenarioModal`). Inventory: stats and "Used in"
  in `PriceHistoryModal`. Settings: a Pricing section (target, alert points, rounding;
  cleared values are saved as `null` because Firestore rejects `undefined`). Dashboard:
  `RepricingCard`.
- **Menu margins are now on the pre-GST price** (`basePriceOf` in `gstCalculations.ts`),
  as the handoff requires; `summarizeMenu` takes the settings for this.
- **AI side (built).** Repricing alerts and ingredient price moves are in the AI
  snapshot, the briefing has `reprice` and `price_move` items, and the chat can run a
  what-if ("Pricing and the AI" in `docs/AI_CFO_DESIGN.md`).
- **Not done.** Per-category targets were skipped (the handoff made them optional). The
  Menu "Suggest" tile shows the suggestion but there is no bulk "apply all". The
  what-if is read-only: it does not change prices.

Next in the owner's queue: the still-open `parse-production-run` from the AI handoff.

## Open items for the user (none blocking)

- **Razorpay or Cashfree instead of Stripe.** The user wanted this later. We
  need: which provider, whether ₹1,200 includes 18% GST, whether there are
  existing Stripe subscribers, and whether to keep Stripe.
- The Stripe price must be set to ₹1,200/month in INR.
- The banner logo image still shows `$` and `%`; it needs a rupee version.

Done by the owner and tested: the Anthropic workspace id (or a key inside a workspace),
re-entering the settings blanked by the earlier reset, publishing the Firestore rules,
and the AI environment variables.

## Running the app for browser checks

The real app needs Firebase, which is unreachable from the sandbox, so visual
checks use a Vite config that aliases `./firebase` to an in-memory mock built
on `buildDemoData` (live writes and listeners). A temporary config file inside
the repo root is needed so module resolution works; delete it afterwards. Do
not use `pkill -f` or `pgrep -f` with a pattern that also appears in your own
command line, as it kills the shell.
