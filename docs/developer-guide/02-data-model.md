# 2. Data model

All data is in Firestore, under one root: `users/{uid}`. `uid` is the Firebase Authentication user id, and one account is
one business. Types are in `src/types/index.ts` (except `ProductionRun`, which still lives in
`src/components/ProductionRunModal.tsx`, a leftover from the original monolith).

## Map of collections

| Path | Written by | Readable by client | What it holds |
|---|---|---|---|
| `users/{uid}` | server only | owner, admin | `billing` (subscription state), `role` (support access). **Nothing in the apps writes it.** |
| `users/{uid}/materials/{id}` | web, phone server | owner | Raw materials and packaging (`RawMaterial`) |
| `users/{uid}/menu/{id}` | web, phone server | owner | Menu items and their recipes (`MenuItem`) |
| `users/{uid}/orders/{id}` | web, phone server | owner | One document per order *line* (`Order`) |
| `users/{uid}/productionRuns/{id}` | web, phone server | owner | Things made (`ProductionRun`) |
| `users/{uid}/wastageLogs/{id}` | web | owner | Discarded stock |
| `users/{uid}/experiments/{id}` | web | owner | R&D Lab recipe experiments |
| `users/{uid}/settings/bakery` | web | owner | **One** document: business profile, GST, time zone, fees, fixed costs, pricing choices, `categories`, `currency` |
| `users/{uid}/priceLog/{id}` | web, phone server | owner | Ingredient price history. **Append-only**: create and read, never update or delete |
| `users/{uid}/briefings/{day}` | server only | owner | The cached AI briefing for a day (`YYYY-MM-DD`) |
| `users/{uid}/aiUsage/{day}` | server only | nobody | `{chat, briefing, parse, quick}` counters for the owner's day |
| `users/{uid}/integrationCredentials/{provider}` | server only | nobody | Encrypted Shopify token / Odoo login (`lib/crypto.ts`, `SESSION_ENC_KEY`) |
| `users/{uid}/paymentGateway/active` | server only | nobody | The owner's Razorpay / Cashfree setup; secret encrypted (`lib/secretBox.ts`, `PAYMENT_SECRETS_KEY`) |
| `users/{uid}/idempotency/{scope_key}` | server only | nobody | Saved answers to phone saves, so a retry returns the same answer (24 h) |
| `users/{uid}/devices/{id}` | server only | nobody | A registered phone: Expo push token, platform, `disabled` |
| `users/{uid}/mobileSettings/{doc}` | server only | nobody | `notifications` (the owner's choices) and `notificationState` (what was already sent today) |
| `bills/{token}` | server only | nobody | Public bill snapshots: `{uid, orderIds, bill, payment?}` |
| `aiUsageGlobal/{day}` | server only | nobody | `{total}` model calls across all users on a UTC day |

"Server only" means the Firestore rules deny every client, the owner included, so only the Admin SDK can reach it.
That is intentional for anything holding credentials, entitlement or other people's data.

## Security rules in short (`firestore.rules`)

- **Default deny** for any path not listed.
- **Nothing uses a recursive wildcard.** Firestore rules are additive: a broad `allow` can never be undone by a more
  specific `deny`. An earlier version used `{document=**}` under `users/{userId}`, which also matched the user document
  and the credentials, and let any signed-in user make themselves admin. The rules file explains this at its top.
  Do not reintroduce a `{document=**}` under `users`.
- Business collections are listed in `isBusinessCollection(...)`: `materials, menu, orders, experiments, productionRuns,
  wastageLogs, settings`. The owner (or an admin) can read and write those.
- `priceLog` is create-and-read only; `briefings` is read only; `users/{uid}` is read only.
- **Admin** is a verified email `manishmutalik@gmail.com`, or a user document with `role: 'admin'` (itself unwritable by
  any client). Admins can read any user's business collections for support.
- To let the client use a **new** collection under `users/{uid}`: add its name to `isBusinessCollection`, add a case to
  `test/rules/firestore.rules.test.ts`, and run `npm run test:rules` (needs Java and the Firestore emulator; CI runs it).
- The server's Admin SDK ignores all of this. Server code must therefore do its own scoping by uid. Every path starts
  at `users/{uid}` from the verified token.

## Core documents

### `RawMaterial` (`users/{uid}/materials`)

A thing bought and kept in stock.

- `unit` is the *stock* unit (kg, g, l, ml, pcs...). Recipes may use a different compatible unit; conversion is in
  `src/utils/conversions.ts` (`convertAmount`).
- `initialStock` is the **current quantity on hand**, in `unit`. The name is misleading (it is not a starting value); it
  is the running number that restocks add to and that production runs and discards take away
  (`planIngredientDeduction` in `src/utils/inventoryDeduction.ts`, `plans/planInventory.ts`).
- `costPerUnit` is the **moving average** cost, recalculated on every restock (`plans/planInventory.ts`), and each
  restock appends a `priceLog` entry. `expiryDate` is the use-by date of the current/latest stock.
- `batches` (`InventoryBatch`: `originalQuantity`, `remainingQuantity`, `expiryDate`, `costPerUnit`, `dateAdded`) is optional lot data
  left from an earlier design. Only the discard flow (`useWastageActions`) still maintains it; stock levels are not
  derived from it. Do not build new logic on `batches` without checking this first.
- `threshold` is the low-stock alert level; `leadTimeDays` feeds reorder suggestions (`src/utils/reorder.ts`).
- `category` groups items; materials in the category `Packaging Materials` (`PACKAGING_CATEGORY`) are costed as
  packaging, everything else as ingredients.
- Optional nutrition and allergens, filled from USDA FoodData Central or Open Food Facts (`lib/nutritionSearch.ts`).

### `MenuItem` (`users/{uid}/menu`)

A thing the owner sells.

- `recipe`: `{materialId, amount, unit}[]`; `servings` is the yield of one recipe batch.
- `sellingPrice`, and `finishedGoodsStock`: how many are made and on the shelf. Production adds to it; orders and hand-over
  take from it. Stock is a **hard cap**: an order cannot take more than is on the shelf.
- Pricing stamp used for margin drift: `pricedAt`, `costAtPricing`, `materialCostsAtPricing`, `pricingIsBaseline`,
  and `targetMargin` (overrides `settings.defaultTargetMargin`). See `src/utils/pricing.ts`.

### `Order` (`users/{uid}/orders`)

**One document is one line (one menu item).** A customer's purchase of "2 cakes and 3 cookies" is two `Order`
documents with the same `orderGroupId`. Each is a complete document with its own `fulfilled` flag, but shared charges are
stored **once**, on the first line, and counted once per group (`utils/orderClustering.ts` does the grouping):

- `deliveryCharge`, `deliveryFee`, `discount`, `advance`, `dueSlot`, `notes`, `paymentMethod` follow the "once per group" rule.

Important fields and what they mean:

| Field | Meaning |
|---|---|
| `date` | `YYYY-MM-DD`, business time zone. For a pre-order this is the **due** date. |
| `paymentStatus` | `'unpaid'` = pay later and still owed. **Absent means paid**, so every old order stays paid. |
| `paymentMethod`, `paymentFeeRate` | How it was paid and the fee rate (%) in force *then*, so changing Settings never rewrites past profit. |
| `unitPriceAtSale`, `unitIngredientCostAtSale`, `unitPackagingCostAtSale`, `unitInputGstAtSale`, `itemNameAtSale` | The **stamp**, written when the order is created. Old orders without it fall back to today's values and are flagged `estimated`. They are deliberately not back-filled. |
| `preorder`, `bookedOn`, `dueSlot`, `notes` | Pre-order basics. |
| `stockClaimed` | Whether this line has taken its units out of `finishedGoodsStock`. Absent means the old rule (took them at creation). A pre-order starts `false` and becomes `true` at hand-over. |
| `advance` | `{amount, method, feeRate, date}` money received before hand-over; on the first line of the group. |
| `cancelledOn`, `advanceOutcome` | A cancelled order is never a sale; a kept advance counts as income on the cancellation date, a refunded one does not. |
| `fulfilled` | Handed over / completed. No inventory maths hangs off it any more. |
| `billToken`, `statementToken` | Public bill / statement link tokens. **Written by the server only.** |
| `paymentClaim` | A customer's "I've paid by UPI" from the bill page: `{at, amount, method: 'upi'}`. A claim, not a payment; cleared (`null`) when the order is marked paid or unpaid, or the owner says it was not received. Written by the server. |
| `productionRunId` | Legacy: an order auto-created by a production run. New runs no longer create orders. |
| `deliveryMethod` | `'pickup' | 'self_delivery' | 'third_party'`; only `third_party` has a `deliveryFee` (paid to a courier). |

The pre-order rules are all in `src/utils/preorders.ts` (`holdsStock`, `countsAsSale`, `isActual`,
`isBookedForLater`, `isOpenPreorder`). Use those, do not re-derive them: revenue lands on the due date, and an "actual"
figure counts only orders due today or earlier.

### `ProductionRun`

`recipeId`, `quantityProduced`, `quantityYield` (sellable units after waste), `date`, `costTotal` (snapshotted at
creation, never recalculated), `remainingQuantity`, `expiryDate`, and `productionSessionId` (groups runs logged
together). `purpose` is legacy.

`MenuItem.finishedGoodsStock` is the authoritative shelf count. A run's stored `remainingQuantity` only shrinks when that
batch is discarded, so `withShelfStock` (`src/utils/batchStock.ts`) spreads the shelf count over the runs, newest first,
for screens that show per-batch freshness. Nothing there is written back.

### `BakerySettings` (`users/{uid}/settings/bakery`)

The business profile (`name`, `logo`, `primaryColor`, `address`, `phone`, `email`), tax (`gstApplicable`, `gstRate`,
`gstPricingMode: 'inclusive' | 'exclusive'`), `upiId`, `timezone` (IANA name, default `Asia/Kolkata`),
`paymentFeeRates` (% per method), `fixedCosts` (monthly costs with optional start/end dates), and the pricing choices
`defaultTargetMargin`, `marginAlertPoints`, `priceRounding`. The same document also stores `categories` and `currency`;
`useSettingsListener` splits them into separate pieces of state. Cleared pricing choices are saved as `null` and read back
as "not set".

### Billing state (`users/{uid}.billing`)

`status` (`none | trialing | active | past_due | canceled | incomplete`), `razorpaySubscriptionId`, `currentPeriodEnd`
(unix seconds), `trialUsed`, `cancelScheduled`, `lastEventAt` (so a late, older webhook cannot undo a newer one).
Written only by `lib/subscriptionStore.ts`. `hasActiveAccess(status)` is true for active and trialing.

## Customers are not a collection

There is no `customers` collection. A customer is whoever the orders say they are, worked out on the fly:
`customerKey(order)` in `src/utils/payments.ts` is `phone:<last 10 digits>` if a phone number exists, otherwise
`name:<lower-cased, space-collapsed name>`, otherwise `anon:<groupId or id>`. `src/utils/customers.ts` builds profiles
from that. This means renaming a customer on one order does not rename them elsewhere, and two orders with neither name
nor phone are two different (anonymous) customers.

## Dates and time

Dates are `YYYY-MM-DD` strings compared as text. "Today" is the date in `settings.timezone`, via `todayInZone`. Do not
use `new Date().toISOString().slice(0, 10)`, which is UTC and is yesterday for an Indian business until 05:30.
`createdAt`/`updatedAt` fields are Unix milliseconds. `currentPeriodEnd` on billing is Unix **seconds**, as Razorpay sends it.

## Writing to Firestore: two rules to remember

1. **Admin SDK rejects `undefined`** anywhere in a document. Leave optional fields out (conditional spread), or strip
   with `JSON.parse(JSON.stringify(x))` (`withoutUndefined` in `lib/billStore.ts`). The client SDK is similar. A missed
   `undefined` once made every "Send invoice" on the phone fail with a 500.
2. **Writes that must be consistent go through a plan and a batch or transaction**, never as separate `setDoc` calls
   scattered in a component. See [Money, plans and bills](04-money-plans-bills.md).

## Demo data

`src/utils/demoData.ts` (`buildDemoData`) generates a complete sample kitchen whose numbers add up (batch costs, stock,
ingredient use are derived, not typed). The web app seeds it from the browser; the phone app asks
`POST /api/mobile/demo/seed` (`lib/demoSeedRoutes.ts`), which refuses any account that is not a demo account or already
has settings, so it cannot overwrite a real kitchen.
