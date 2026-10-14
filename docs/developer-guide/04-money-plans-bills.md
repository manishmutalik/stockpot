# 4. Money, plans and bills

This is the core of the product and the part most worth reading before changing anything. It has four ideas: one place
computes money; orders are stamped so history is stable; writes are "plans" shared by web and server; bills are built
from the same stamped data.

## 4.1 One place computes money: `src/utils/profit.ts`

No view works out revenue, cost or profit on its own. The Orders tab, Dashboard, Summary, bills, the AI snapshot and the
phone app all read from `profit.ts`, so two screens can never disagree. If you need a new figure, add it here (with a
test), not in a component.

The three rules (stated in the file's header):

1. **Revenue is always the pre-GST base.** GST collected is owed to the government, never income.
   - *Inclusive* pricing: the menu price contains GST, which is backed out (`base = price / (1 + rate/100)`).
   - *Exclusive* pricing: GST is added on top and never enters revenue.
   - A business selling the same base amount reports the same profit in either mode. `splitSaleForGst` and `basePriceOf`
     (`gstCalculations.ts`) are the only places this split happens. Margins are also computed on the base price.
2. **History is never rewritten.** An order's price and costs come from the stamp written when it was created.
   Only orders from before stamping fall back to today's values and are flagged `estimated`.
3. **A shared charge counts once per multi-item order.** Delivery charge, courier fee, discount and advance are stored
   on the first line of a group and counted once (`orderClustering.ts`).

### What `financialsForRange` returns

`financialsForRange({orders, menu, materials, experiments, wastageLogs, productionRuns, settings, start, end, today})` returns a
`Financials` object. The important fields:

| Field | Meaning |
|---|---|
| `income` | Pre-GST sales after discounts: items plus delivery charged, minus discounts. Unpaid orders count (see `unpaidIncome`). |
| `orderExpenses`, `packagingExpenses` | Ingredient and packaging cost of what was sold (from the stamp) |
| `deliveryExpenses` | Courier fees |
| `wastageExpenses`, `experimentExpenses` | Discarded stock; R&D Lab spend |
| `productionLoss` | What runs in the range came out short of, at their planned cost per piece (negative for a gain); `utils/batches` |
| `gstCollected`, `gstPaid` | Output GST on sales; input GST contained in costs |
| `paymentFees` | Fees on payments received (including on advances that were kept) |
| `fixedCosts` | Monthly fixed costs, prorated by day to the range, **up to today** (like sales; see below) |
| `forfeitedAdvances` | Advances kept from cancelled pre-orders: income on the cancellation date |
| `profit` | Income (plus kept advances) less ingredients, packaging, courier, wastage and production loss. Shown as **Profit before overheads** |
| `trueProfit` | `profit` less payment fees and fixed costs: **what the business really made**, the Dashboard's headline |
| `unpaidIncome` | The part of income still waiting to be paid |
| `estimated` | True if any order in range predates stamping |

Passing `today` matters: with it, nothing dated after today is counted (an order due next Friday is "booked for later",
not yet a sale; the days after today carry no fixed costs either, so a month view on the 10th sets 10 days of rent against 10
days of sales), and cancelled orders are never counted. `bookedAhead(...)` reports what is booked for later.

Per-order and per-product views are `orderContribution` and `productProfits` / `productProfit` in the same file.

The Dashboard draws these as one list, sales down to true profit, from `profitSteps(financials)` (each cost as a step with a
short explanation; a step that is zero is left out, except ingredients). The trend chart's bars come from `trendFigures`: sales,
all costs (sales less true profit) and true profit. Production cost is **not** a step: stock made is counted as a cost when it is
sold, inside ingredients and packaging, so taking it off again would count it twice. The Dashboard shows it on the production card
as money spent, with that explanation.

## 4.2 Stamps: `src/utils/orderPricing.ts`

When an order is created, `stampFor(menuItem, materials, unitPrice?)` copies onto it: `unitPriceAtSale`,
`unitIngredientCostAtSale`, `unitPackagingCostAtSale`, `unitInputGstAtSale`, `itemNameAtSale`. Everything that values an
order calls `resolveUnitPrice` / `resolveUnitCosts` / `resolveItemName`, which use the stamp, and fall back to the live
menu/material only for old orders (returning `estimated: true`). Old orders are deliberately **not** back-filled, because
that would freeze today's prices into last year's orders.

A pre-order keeps the price agreed at booking, but is **re-stamped with costs at hand-over**, because that is when the item
was actually made (`planHandOver`).

Menu items carry a separate *pricing stamp* (`pricedAt`, `costAtPricing`, `materialCostsAtPricing`; `pricing.ts` →
`pricingStamp`) that records what the recipe cost when the price was set. The difference between then and now is the
**margin drift** (`marginDrift`), which drives the "reprice" cards, the briefing's price-move alerts, and the what-if modal.

## 4.3 Pricing intelligence: `src/utils/pricing.ts`

Plain arithmetic over data the app already holds, no AI. Defaults: target margin `100 × (1 − 1/3.5)` ≈ 71.4% (the old
3.5× markup) when the owner has not set one, alert after a 5-point slip, round suggested prices up to the nearest ₹5.

- `marginOf(menuPrice, unitCost, settings)`: margin %, on the pre-GST price.
- `targetFor(item, settings)`: the item's target (its own, else the business default).
- `marginDrift(item, materials, settings)`: whether and why the margin slipped, with the ingredient drivers.
- `suggestedPriceFor` / `suggestedPriceForTarget` / `repriceOptions`: the price that restores the old or target margin.
- `materialPriceStats`, `recipesAffectedBy`: how a material's price moved and which recipes it affects.
- `pricingScenario` / `pricesFromPercent`: the what-if ("raise these items 10%"): new margins, revenue effect, break-even.
- `itemsNeedingRepricing`: the list behind the Dashboard card.

## 4.4 Plans: `src/utils/plans/`

A **plan** is a pure function that takes the current documents and returns the list of writes to make:

```ts
interface PlannedWrite { collection: 'orders'|'menu'|'materials'|'priceLog'|'productionRuns'; id: string; data: object; merge: boolean }
```

| Plan | File | What it does |
|---|---|---|
| `planOrderGroup` | `planOrders.ts` | Creates one `Order` per line item (sharing an `orderGroupId` if more than one); stamps each; checks stock (hard cap, same item across lines added together); for a pre-order checks nothing now; validates the advance (never more than owed, GST-aware) |
| `planHandOver` | `planOrders.ts` | Marks an order handed over. An ordinary order is just a flag (stock was claimed at creation). A pre-order now claims its stock (all items or none), re-stamps costs, marks `stockClaimed` |
| `planMarkPaid` | `planOrders.ts` | Marks orders paid/unpaid with the method and the fee rate in force now |
| `paymentFields` | `planOrders.ts` | `{paymentMethod, paymentFeeRate}` for a method |
| `planRestock` | `planInventory.ts` | Adds a purchase to a material, recalculates the moving-average cost, writes a `priceLog` entry (so the material and its history are never half recorded). The quantity may be in a different compatible unit |
| `planProductionRun`, `planProductionSession` | `planProduction.ts` | Deducts ingredients, adds yield to finished stock, records the run with `costTotal` and expiry. Each run starts from the stock the previous one left, so two items sharing an ingredient add up instead of the later write replacing the earlier |
| `collapseWrites` | `types.ts` | Merges several writes to one document into one (a transaction should touch each document once) |

A plan returns `{ ok: true, writes, ... }` or `{ ok: false, error: PlanError }`. `PlanError` carries `title` and `message`
(shown to the owner) and `thrown` (developer text). The messages are the ones the web has always shown, so tests and
users see the same words on both paths.

**Plans are given everything they need**: documents, today's date (`todayInZone`), an id generator (`PlanContext.newId`),
the clock. They never read the system clock or generate ids themselves, so they are deterministic and unit tested with
plain objects.

**Two committers, one source of truth:**

- Web: `addWritesToBatch(batch, userId, writes)` (`plans/clientCommit.ts`) adds each write to a Firestore `writeBatch`.
  Kept in a separate file so plans themselves import no Firebase and can run on the server.
- Server: `lib/quickRoutes.ts` reads the live documents *inside* a Firestore transaction (`lib/quickDb.ts`), runs the
  plan, applies the writes through `tx.apply`, and stores the answer under the request's idempotency key. A stock cap is
  therefore checked against what is on the shelf *now*, not what the phone loaded earlier.

`src/hooks/__tests__/plansParity.test.ts` proves the hooks commit exactly what a plan says. If you change a plan, the web
and phone both change; if you change a hook so it no longer writes what its plan says, that test fails.

## 4.5 Payments owed: `payments.ts` and `quickPayments.ts`

- An order is **unpaid** when `paymentStatus === 'unpaid'`; anything else is paid.
- `customerKey(order)` identifies a customer (phone's last 10 digits → lower-cased name → the order's own id).
- `groupPendingPayments` groups unpaid orders by customer for the Pending Payments panel and the consolidated bill.
- `quickPayments.ts` (`customerDues`, `buildPaymentsDue`, `matchingOption`) splits what each customer owes into **whole
  orders, oldest first**. There are no part-payments (only a pre-order's advance), so a recorded payment must come to
  exactly what one or more whole orders are owed. A pre-order is listed as owed only once it falls due; a cancelled
  order never is. True part-payments would need a payments list on each order first (a data-model change).

## 4.6 Bills: `src/utils/billing.ts`

`buildBill({orders, menu, settings, currency, statement?, today?})` builds a `Bill`:
lines (name, quantity, unit price, line total, plus date on a statement), `itemsTotal`, `deliveryCharge`, `discount`,
`gst {rate, mode, amount}`, `total`, `advance`, `balanceDue`, the business details, and `upiId` only when one is set and the
currency is rupees. It uses stamped prices/names, so a later menu change never alters a bill already shown.
`statement: true` builds a consolidated bill of several orders with an `ST-` reference.

The same file holds everything customer-facing around a bill:

- `billBalance(bill)`: what is still owed (the QR/link ask for this, never the total).
- `buildBillUpiLink` / `buildUpiLink` / `canPayByUpi`: the `upi://pay` deep link and QR payload.
- `buildWhatsAppUrl(phone, text)` / `normalizeWhatsAppNumber`: the `wa.me` link. Indian numbers are normalised.
- Message text: `buildBillMessage` (short bill), `buildInvoiceMessage` (invoice, itemised or short with a link),
  `buildStatementMessage`, `buildPreorderConfirmation`. When there is an online link, the message is short and carries
  `View/pay: <link>`; without one, the full itemised text. WhatsApp bold is `*text*`.
- Tokens: `generateBillToken()` (128 random bits as 32 hex characters), `isValidBillToken`, and `resolveBillToken(orders, field)`,
  which reuses an existing token so links and QR codes already sent keep working.

### Public bill pages (server)

`lib/billStore.ts` is the server half. `createOrRefreshBill(uid, orderId)` and `createOrRefreshStatement(uid, orderIds)`
read the order(s) with the Admin SDK, build the bill **on the server with the same `buildBill`**, store a read-only snapshot
at `bills/{token}`, write the token back onto the order(s) (`billToken` / `statementToken`), and return it. The browser
then shares `${APP_URL}/bill/<token>`.

`GET /bill/:token` (`lib/billRoutes.ts` + `lib/billHtml.ts`, wrapped by `lib/payOnline.ts`) serves that snapshot as one
self-contained HTML page: inline CSS, no scripts, no external requests (CSP `default-src 'none'`), every value
HTML-escaped (names are free text). Malformed, unknown and missing tokens give the same 404, so nothing reveals whether a
bill exists. The page shows only what the bill shows: no phone number, no other orders, no inventory or finances. It has
Open Graph tags so a pasted link previews well in WhatsApp. When the owner has an online-payments gateway, it also shows
**Pay by card or online** (see [Billing and payments](07-billing-and-payments.md)).

## 4.7 Units and conversions: `src/utils/conversions.ts`

`convertAmount(amount, from, to)` converts between compatible units (g/kg, ml/l, pcs). Recipes may use a different unit
from the stock unit; always convert to the material's own unit before arithmetic. `enterableUnits` lists the units that
can be entered for a material. Incompatible units (kg to litres) are not silently converted: a restock plan refuses them
with `reason: 'unit_mismatch'`. `getDefaultRecipeUnit` (in `types/index.ts`) picks g for kg/g, ml for l/ml.

## 4.8 Items made from other items: `src/utils/itemParts.ts`

An item's `parts` lists other items that go into one of it (a sponge base in a cream cake, cookies in a hamper). Two rules:

- **Costs flatten.** Anything worked out from materials (cost and margin, order stamps, drift and repricing, What if…,
  nutrition, "cost incomplete") uses the item as costing sees it: `costView(item, menu)` / `costMenu(menu)`, its recipe
  with its parts' recipes written in, scaled. Functions that take the whole menu (`summarizeMenu`, `itemsNeedingRepricing`,
  `recipesAffectedBy`, `pricingScenario`, `resolveUnitCosts`) flatten inside; single-item ones (`stampFor`, `pricingStamp`,
  `marginDrift`, `suggestedPriceFor`, `unpricedMaterials`) are passed `costView(item, menu)` by the caller.
- **Stock does not.** `planProductionRun` takes the item's own recipe from materials and its parts from their finished stock
  (short stock goes below nothing, with a warning, as a short ingredient does), and records `partsUsed`/`partsCost`; it
  works the run's `costTotal` out itself for an item with parts. Reorder forecasts use the direct recipe for the same
  reason. Orders take the item itself, as before; an item `notForSale` cannot be ordered (`not_for_sale`).

`wouldLoop` keeps an item from containing itself (the editor and `setItemParts` both check); flattening also stops after
`MAX_PART_DEPTH`. The phone's server loads an item's parts with `itemsWithParts` before costing or making it.

## 4.9 Batches and actual yield: `src/utils/batches.ts`

An item's `batchMakes` says how many one batch makes; its recipe stays per one, so a batch is `batchMakes` of it. A run
records what its ingredients were for (`quantityProduced`, from `expectedUnits(batches, batchMakes)` when logged in
batches) and what came out (`quantityYield`, which goes on the shelf). Sold items carry the planned cost per piece (the
order stamp), so margins stay steady; the difference is its own cost, `runYieldLoss` (planned less actual, times
`costTotal / quantityProduced`; negative for a gain), summed by `productionLossForRange` in `financialsForRange` and shown as
**Lost in production**. Together they add up to what was spent.

`batchYield` averages an item's last `BATCH_HISTORY` runs in batches; `rescaleForBatchSize` makes the average the new size
while one batch keeps the same ingredients (the per-piece recipe and parts scale by old ÷ new), which is what the Menu's
**Use X** does (`useMenuActions.setBatchSize`, `keep-batch`). `from-whole-batch` divides a recipe typed for the whole batch.
Validators allow a yield up to `MAX_YIELD_OVER` (3) times what was planned.

## 4.10 Rules of thumb when changing money code

- Add the figure to `profit.ts`/`pricing.ts`/`billing.ts` with a test; do not compute it in a component or route.
- If it changes what is *written*, change the plan (both web and phone follow), not the hook.
- Round at the edge (`round2`), not mid-chain. Do not use floating-point equality on money in new code.
- Dates are business-time-zone strings; see [Data model](02-data-model.md).
- A change to what an old order is "worth" is a bug unless it is behind the `estimated` fallback.
- Keep the GST invariant: the same base sale gives the same profit in inclusive and exclusive modes. There are tests; keep them.
- Cost an item through `costView`/`costMenu`, never `item.recipe` alone, or an item made from others loses its parts' cost.
