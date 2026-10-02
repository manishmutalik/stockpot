# Stockpot: project state and working notes

A running record of what has been built, the decisions behind it, how to
verify work, and what is next. Written so that nothing is lost when a working
session is compacted or handed over. Last updated after True Profit part 2.

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
- True Profit part 1 (#34) and part 2 (below).

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

### Part 2 (this PR): discounts, fees, fixed costs, "Made"

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

### Part 3: not started (waiting for the user to say go)

Scope, from the handoff:

- **Price log:** subcollection `users/{uid}/priceLog/{entryId}` with
  `PriceLogEntry { id, materialId, date, unitCost, quantity?, macAfter?,
  source: 'initial' | 'restock' | 'manual_edit' | 'goods_receipt' }`.
  Append-only from app code. Write on restock (switch the `setDoc` in
  `useInventoryActions.handleRestock` to a `writeBatch`; `unitCost = baseTotal
  / qty`, `macAfter = newMAC`), on a new material with a cost (`initial`), and
  on inline cost edits (`manual_edit`).
- Things to get right: log inline edits on commit or blur, not per keystroke;
  keep history consistent when the unit changes (`changeUnit`); include the CSV
  import path; Firestore rules cannot enforce append-only given the existing
  wildcard rule.
- **Inventory:** a simple price history list per material (date, unit cost,
  source). No charts or alerts.
- **Menu view, per product:** units sold, revenue, contribution and average
  contribution per unit for the selected range, next to the margin %. The
  `productProfit` function from the handoff is not yet written.
- Tests to add: exactly one log entry per restock with the right `unitCost` and
  `macAfter`; the manual-edit and initial paths; the product profit function;
  the Menu and Inventory UI.

## Open items for the user (none blocking)

- **Razorpay or Cashfree instead of Stripe.** The user wanted this later. We
  need: which provider, whether ₹1,200 includes 18% GST, whether there are
  existing Stripe subscribers, and whether to keep Stripe.
- The Stripe price must be set to ₹1,200/month in INR.
- The banner logo image still shows `$` and `%`; it needs a rupee version.
- Firestore rules are believed to be additive, so a deny on
  `integrationCredentials` is probably ineffective. Offered to verify and fix.

## Running the app for browser checks

The real app needs Firebase, which is unreachable from the sandbox, so visual
checks use a Vite config that aliases `./firebase` to an in-memory mock built
on `buildDemoData` (live writes and listeners). A temporary config file inside
the repo root is needed so module resolution works; delete it afterwards. Do
not use `pkill -f` or `pgrep -f` with a pattern that also appears in your own
command line, as it kills the shell.
