# Handoff: True Profit Engine + Ingredient Price Log

**Status:** Planned, not started. Phase 1 of the Differentiation Strategy ("Know exactly what your food business makes").

**Read first:** `src/App.tsx` `getFinancialsForRange` (lines ~880–962), `src/utils/menuStats.ts` (`recipeCost`, `getMarginInfo`, `suggestedPrice`), `src/utils/orderStats.ts` (`summarizeOrders`, `orderLineTotal`), `src/utils/orderClustering.ts` (`attributeDeliveryFieldByGroup`), `src/utils/gstCalculations.ts` (`splitSaleForGst`, `calculateMaterialGstPaid`), `src/utils/billing.ts` (`buildBill`), `src/hooks/useOrderActions.ts` (`addOrderGroup`, `updateOrder`), `src/hooks/useInventoryActions.ts` (`handleRestock`), `src/hooks/useIntegrations.ts` (Shopify/Odoo order import), and `src/types/index.ts` (`Order`, `RawMaterial`, `BakerySettings`).

---

## Goal

1. **Per-order contribution:** every order (single or multi-item group) shows what the business actually made on it — "You made ₹438 on this order" — with the breakdown.
2. **Per-product profit:** each menu item shows units sold, revenue and total contribution over a date range.
3. **Business-level true profit:** contributions, minus wastage, minus fixed costs (rent, gas, salaries) prorated to the range.
4. **Ingredient price log:** an append-only record of every price paid for a material, starting now. Nothing reads it in this phase except a simple history list; Phase 2 (Price & Margin Intelligence) builds alerts on it. It ships now because history only accumulates from the day logging starts.

---

## Two existing problems this phase must fix first

### 1. Past orders are valued at today's prices and costs

`getFinancialsForRange`, `orderLineTotal`, `summarizeOrders` and `buildBill` all read `menu.find(...).sellingPrice` and `material.costPerUnit` **as they are now**. Change a cake's price from ₹600 to ₹700 and last month's revenue rises by ₹100 per cake sold. Restock butter at a higher price and last month's ingredient cost rises too. A "true profit" figure that rewrites history is the opposite of what this feature promises.

**Fix:** stamp price and cost onto each order when it's created (see data model). Every calculation reads the stamp, and falls back to current values only for legacy orders that don't have one — and the UI marks those figures "estimated".

### 2. GST-inclusive businesses have profit overstated

In `getFinancialsForRange`, `income` adds `sellingPrice × quantity`. In `inclusive` pricing mode that amount already contains output GST, but `profit = income − orderExpenses − deliveryExpenses − wastageExpenses` never subtracts it. The GST collected is owed to the government, not earned. Exclusive mode is unaffected (income there is the pre-GST base).

**Fix:** in the shared calculation below, revenue is always the pre-GST base: `splitSaleForGst(sale, rate, mode).baseAmount`. Confirm with a test that an inclusive-mode and an exclusive-mode business selling the same base amount report the same profit.

---

## Data model changes

All additive and optional; every existing document stays valid.

```typescript
export type PaymentMethod = 'upi' | 'cash' | 'card' | 'other';

export interface Order {
  // ...existing fields...

  /** Price of one unit of the menu item when this order was created.
   * Absent on orders created before this field existed — fall back to the
   * menu item's current sellingPrice and mark the figure as estimated. */
  unitPriceAtSale?: number;
  /** Material cost of one unit when this order was created, split so
   * packaging can be shown separately. Same fallback rule as above, using
   * recipeCost() at current material costs. */
  unitIngredientCostAtSale?: number;
  unitPackagingCostAtSale?: number;

  /** Amount knocked off the whole order (₹, not %). Shared by a multi-item
   * group exactly like deliveryCharge: stored on each member, attributed
   * once per group. Reduces the taxable sale amount. */
  discount?: number;
  /** How the customer paid. Drives the payment fee via
   * BakerySettings.paymentFeeRates. Absent = no fee. */
  paymentMethod?: PaymentMethod;
}

export interface BakerySettings {
  // ...existing fields...

  /** Fee the business pays per payment method, as a % of the amount
   * collected (e.g. { card: 2, upi: 0 }). Absent method = 0%. */
  paymentFeeRates?: Partial<Record<PaymentMethod, number>>;
  /** Recurring monthly costs not tied to any order. Prorated by day for
   * date ranges shorter or longer than a month. */
  fixedCosts?: { id: string; name: string; monthlyAmount: number }[];
}
```

### Price log — new subcollection `users/{uid}/priceLog/{entryId}`

```typescript
export interface PriceLogEntry {
  id: string;
  materialId: string;
  date: string;          // YYYY-MM-DD
  /** Price paid per material unit, excluding input GST. */
  unitCost: number;
  quantity?: number;     // how much was bought, when known
  /** The material's moving-average cost after this entry was applied. */
  macAfter?: number;
  source: 'initial' | 'restock' | 'manual_edit' | 'goods_receipt';
}
```

Append-only: never update or delete an entry from app code. Firestore rules: same per-user scoping as every other `users/{uid}/*` collection.

---

## Shared calculation — new file `src/utils/profit.ts`

Pure functions, no React or Firebase, unit tested like `billing.ts`. **This becomes the one place money is computed.** Move `getFinancialsForRange`'s logic out of `App.tsx` into it (keep a thin wrapper in `App.tsx` so call sites don't change), and have `orderStats.ts` and `billing.ts` use the same price-resolution helpers. Two copies of P&L math drifting apart is the bug class already flagged in earlier handoffs.

```typescript
/** Stamped price if present, else the menu item's current price. */
export function resolveUnitPrice(order: Order, menu: MenuItem[]): { value: number; estimated: boolean };

/** Stamped ingredient/packaging cost if present, else recipeCost() split
 * by material category ('Packaging Materials' vs everything else). */
export function resolveUnitCosts(order: Order, menu: MenuItem[], materials: RawMaterial[]):
  { ingredients: number; packaging: number; estimated: boolean };

export interface OrderContribution {
  itemsRevenue: number;      // Σ unitPrice × qty, pre-GST base
  deliveryCharged: number;   // once per group, pre-GST base
  discount: number;          // once per group
  gstOnSale: number;         // owed to government, never revenue
  ingredients: number;
  packaging: number;
  courierFee: number;        // deliveryFee, once per group
  paymentFee: number;        // rate × amount the customer actually paid
  contribution: number;      // revenue − discount − all costs above
  estimated: boolean;        // true if any member used a fallback value
}

/** One order or one multi-item group (pass all members). */
export function orderContribution(members: Order[], menu: MenuItem[], materials: RawMaterial[],
  settings: BakerySettings): OrderContribution;

export function productProfit(menuItemId: string, orders: Order[], ...): {
  unitsSold: number; revenue: number; contribution: number; avgContributionPerUnit: number;
};

/** Business level. Extends what getFinancialsForRange returns today; keep
 * every existing key with the same meaning (except income now being the
 * pre-GST base — see problem 2) so SummaryView and Dashboard keep working. */
export function financialsForRange(input: {...}): {
  income, expenses, orderExpenses, experimentExpenses, deliveryExpenses,
  wastageExpenses, gstCollected, gstPaid, profit,
  // new:
  discounts, paymentFees, packagingExpenses, fixedCosts,
  totalContribution, trueProfit, avgOrderContribution, orderCount
};
```

Rules:

- **GST base:** `sale = itemsRevenue + deliveryCharged − discount`, then `splitSaleForGst(sale, rate, mode)`. GST only when `settings.gstApplicable`. Update `buildBill` to apply the discount the same way and show a Discount line on the bill — the bill and the profit view must agree on what the customer paid.
- **Payment fee base:** the amount the customer actually pays (the bill total), × `paymentFeeRates[paymentMethod] / 100`.
- **Group-shared fields:** `discount` follows the same once-per-group rule as `deliveryCharge` and `deliveryFee`. Generalize `attributeDeliveryFieldByGroup` to accept `'discount'` rather than writing a parallel function.
- **Wastage is not allocated to orders.** It is subtracted once, at business level. Splitting a spoiled batch across unrelated orders is false precision.
- **Fixed costs:** `Σ monthlyAmount × (days in range / days in that month)`, computed per calendar month the range touches. Subtracted at business level only.
- **`trueProfit` = totalContribution − wastageExpenses − fixedCosts.** Experiment costs stay out of profit, as they are today.

---

## Where stamps and log entries get written

**Price/cost stamps** — every path that creates an order or changes what it contains:

| Path | File | Action |
| --- | --- | --- |
| Add Order (single and multi-item) | `useOrderActions.ts` `addOrderGroup` | Stamp all three fields on each member inside the existing `writeBatch` |
| Change an order's item | `useOrderActions.ts` `updateOrder` when `field === 'menuItemId'` | Re-stamp from the new item |
| Change quantity / other fields | `updateOrder` | Keep the existing stamp — the unit price didn't change |
| Shopify / Odoo import | `useIntegrations.ts` (~lines 318, 391) | Stamp with the imported line price if the payload has one, else the menu price |
| Demo seed | `App.tsx` (~line 643) | Stamp, so the demo shows non-estimated figures |

**Price log entries:**

| Event | File | `source` |
| --- | --- | --- |
| Restock | `useInventoryActions.ts` `handleRestock` | `restock` — `unitCost = baseTotal / qty`, `quantity = qty`, `macAfter = newMAC`. Write it in the same operation as the material update (switch that `setDoc` to a `writeBatch`) |
| New material with a cost | `App.tsx` (~line 1100) | `initial` |
| Cost edited by hand | `InventoryView` inline `costPerUnit` edit | `manual_edit` |
| Goods Receipt (Purchase Management, when built) | — | `goods_receipt` |

---

## UI

1. **Orders view — per order / per group:** a contribution figure beside the existing revenue figure in the group header and single-order row ("Made ₹438"), colored with the existing margin tiers from `getMarginInfo`. Tap or hover shows the breakdown: revenue, discount, GST, ingredients, packaging, courier, payment fee, contribution. Estimated figures carry a small "est." marker with a tooltip explaining why.
2. **Add/edit order:** a Payment method select (UPI / Cash / Card / Other) and a Discount (₹) field, both optional. Mind the layout of the existing order row — the Generate Bill button already crowds the price at narrow widths.
3. **Settings:** a Payment fees block (a % input per method, defaults blank = 0) and a Fixed monthly costs list (name + amount, add/remove).
4. **Summary view:** add True Profit, Fixed costs, Payment fees, Discounts and Average order contribution alongside the existing figures. Keep the existing labels and numbers that don't change meaning, so owners don't see unexplained jumps — except income/profit in GST-inclusive mode, which should drop by the GST amount; note that in the changelog.
5. **Menu view — per product:** units sold, revenue and contribution for the selected range, next to the existing margin %. A product with a healthy recipe margin but poor contribution (heavy discounting, card fees, courier costs) should be visible as such.
6. **Inventory — material detail:** a simple price history list (date, unit cost, source) from `priceLog`. No charts or alerts in this phase.

---

## Things to get right

- **One calculation, many readers.** Orders view, Summary, Menu, the bill, and later the Accountant Pack report and AI CFO all read from `src/utils/profit.ts`. No view recomputes money inline.
- **Never rewrite history.** Stamped values win over current values everywhere, including the bill.
- **Pre-GST revenue in both modes.** Add the inclusive/exclusive parity test before changing any UI.
- **Legacy orders still work.** No migration needed: orders without stamps fall back to current values and show "est.". Don't backfill stamps on old orders — that would freeze today's prices into last year's orders, which is just as wrong.
- **Payment fees and discounts are optional.** A business that never sets them sees exactly today's numbers (apart from the GST-inclusive fix).
- **Price log is write-only in this phase** apart from the history list. Don't build alerts or trend math yet — that's Phase 2, and it should read from this log rather than from `costPerUnit`.

---

## Verification checklist

- `tsc --noEmit` clean
- `npm run build` succeeds
- `npm test` — add tests for:
  - `orderContribution`: single order; multi-item group with delivery charge, courier fee and discount each counted once; GST exclusive vs inclusive giving the same contribution for the same base amount; payment fee applied to the amount actually paid; legacy order without stamps marked `estimated`
  - `financialsForRange`: fixed costs prorated across a range spanning two months; wastage subtracted once; `trueProfit = totalContribution − wastage − fixedCosts`; existing keys unchanged for an exclusive-mode business with no discounts, fees or fixed costs
  - Changing a menu item's `sellingPrice` after an order is created does not change that order's revenue or contribution
  - `addOrderGroup` writes stamps on every member; `updateOrder` re-stamps only when the item changes
  - `handleRestock` writes exactly one `priceLog` entry with the right `unitCost` and `macAfter`
  - `buildBill` shows and applies a discount, and its total matches the amount used for the payment fee
- ESLint — no new errors
- Manually verify: create an order, raise that item's price, confirm the order's figures don't move; a multi-item order with a ₹50 discount shows the discount once; a GST-inclusive demo business shows profit lower than before by exactly the GST collected; the bill for a discounted order matches the Orders view; restocking a material adds a row to its price history
