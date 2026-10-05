# Changelog

## Fixes

- **Target margin, alert threshold and price rounding now stay set.** They were saved but not
  read back when the app loaded, so they went back to the defaults after a reload.
- **Advance amount on a phone.** In Add Order's pre-order form the amount box was squeezed
  to nothing and the payment-method list ran off the screen; the amount now has the room.
- A margin alert no longer offers the same price twice (back to the old margin and your target
  can come to the same price).

## Log a production run from a note

In the Log Production Run form, type or paste what you made ("Made 40 croissants and 24
muffins this morning, 3 croissants burnt") and press **Fill the form**. The items,
quantities, date and notes are filled in for you to check; nothing is logged until you
press Log Run.

- It only fills in what you wrote. A quantity you did not write is never assumed, an item
  that is not on your menu is shown as "Couldn't find 'croisant'" with the closest menu
  item to choose, and a time it cannot place ("tomorrow") leaves the date for you to set.
- Waste you mention is turned into the sellable yield for a single item (made minus
  waste, worked out by the app). With several items it tells you which waste to record
  with Discard in the Production Log.
- Shown only when AI is on for your account (not in the demo); phone numbers are not
  sent. It uses one of your daily "read a message" requests.

## Pricing in the AI

The briefing and "Ask your business" now know about prices.

- **Briefing.** If a menu item's margin has slipped, the briefing says so ("Butter Cake
  margin is down from 83% to 70%, with Butter up +67%. A price of ₹450 would restore it"),
  and flags an ingredient that has got dearer over the last month.
- **Ask your business** can answer "which prices should I raise?" and "which ingredients
  are getting expensive?" from the same numbers, and "what if I raise prices by 8%?":
  the app works the sum out from your own sales and the AI explains it, including how far
  sales could fall before you are no better off. Under that answer it prints what it
  assumed (which items, how much, how many days of sales) so you can check it. Every figure
  still comes from your data; the AI only writes the words, and a number it writes
  that you did not is refused. A what-if uses two of your daily questions.

## Price & margin intelligence

Stockpot now watches your margins and tells you when a price needs to move. All of it is
arithmetic over your own purchases, orders and recipes (no AI), and it works on the pre-GST
price like every other figure.

- **Margin drift.** Each menu item remembers the day its price was set and what it cost then
  (per ingredient). When ingredient prices rise, the item shows "Margin 68% → 57% · Butter
  +14%", and expands to the ingredients that moved, what each added to the unit cost, and a
  one-tap "Use ₹X" that puts the margin back (and starts a new baseline). A recipe edit is
  shown as its own line ("Recipe changes +₹X, not ingredient prices"), never blamed on an
  ingredient. Items priced before this shipped show "Tracking margin since <date>" and are
  measured from that day; nothing is reconstructed.
- **Target margin.** Set one in Settings (Pricing) and optionally per item. Suggested
  prices are now cost ÷ (1 − target), plus GST when prices include it, rounded up to the
  nearest ₹5 (changeable). Until you set a target, suggestions are the old 3.5× markup and
  nothing is flagged as under target.
- **Needs repricing.** A Menu filter and a Dashboard card ("2 items need repricing") for
  items whose margin slipped 5 points (changeable) since pricing, or is under their target.
- **What if…** On the Menu: change prices by a % or enter exact prices, go by the last 30
  or 90 days of real sales, optionally guess a sales change, and see monthly contribution
  now and after plus the honest answer: "You could lose up to 12% of these sales and still
  make the same profit as today." Fixed costs do not move with price, so this is also the
  change in profit. Items with no recent sales say so rather than showing 0%.
- **Ingredient price stats** in each material's price history: last price paid, 90-day
  average, 30- and 90-day change ("not enough history yet" until there is a purchase old
  enough to compare with), and which recipes use it with the cost of a 10% rise.
- **The sale price saves when you finish typing** (leave the field or press Enter) rather
  than on every keystroke, so one price is one write and one baseline.
- **Margins on GST-inclusive menus are now worked out on the pre-GST price** on the Menu
  screen (they were on the GST-inclusive price, which overstated them).

## Pre-orders

Take an order for a later day. In **Add Order**, switch from *From stock* to *Pre-order*,
pick the due date (and a time of day if you like), add notes, and optionally an advance.

- **No stock is taken when you book.** The units leave `finishedGoodsStock` when you hand
  the order over, all items of a multi-item order together or none. Booking works even
  when the shelf is empty.
- **Revenue lands on the due date.** Every actual figure (profit, revenue, Dashboard,
  Orders stats, Pending Payments, customers, AI figures) counts only orders dated today
  or earlier in your time zone and not cancelled. Orders booked for later are shown
  separately as **Booked for later ₹X**, with the advances you hold.
- **Advances.** An advance can be UPI, cash, card or other. The bill shows the advance and
  the balance, the UPI QR asks for the balance, and Pending Payments owes the total less
  the advance. Payment fees are charged on the advance at the rate in force the day it
  was taken and on the balance at the order's own rate.
- **Handover** asks you to collect the balance, re-costs the order at today's material
  prices (the price and item name stay as booked) and takes the stock.
- **Cancel** a pre-order and either refund the advance or keep it. A kept advance is
  income on the day of cancellation (it is in profit and True Profit, with its own
  driver), and the cancelled order is never counted as a sale.
- **Orders tab.** New *Upcoming* (due after today, grouped by day, handed over early
  included) and *Cancelled* filters, and a pre-order tag with due date, advance, balance
  and notes on each row. **Dashboard:** a "Pre-orders due" card for today and tomorrow
  with *View in Orders*.
- **Per-line price.** Each item in an order can carry its own price (a custom cake, a
  wedding quote); the menu price is only the default.
- **Booking confirmation** with a ready WhatsApp message (date, time, advance, balance).
- **AI.** The daily briefing leads with pre-orders due today and tomorrow, the chat and
  snapshot know about them, and the order message reader switches a future date to
  Pre-order and fills the notes and advance. Customer stats ignore not-yet-due pre-orders.

## Customer suggestions in Add Order

Type the first letters of a returning customer's name, or three or more digits of their
phone number, and Add Order lists matching past customers. Picking one fills both the
name and the phone, so a repeat order takes two taps.

- Each suggestion shows the name, the phone ("no phone" if there is none), when they last
  ordered and what they usually order, so two people called Priya can be told apart.
- A name matches the start of the full name or the start of any word ("pri" and "sha"
  both find "Priya Sharma"); case and accents are ignored. A phone number matches
  anywhere in the last ten digits, ignoring spaces, +91 and a leading 0.
- Nothing is chosen for you: the list opens only when you type, Enter picks only a row
  you moved to with the arrow keys (and never submits the form), Esc closes it, and a
  new name stays a new customer. Fully usable with the keyboard, a mouse or a finger.
- The same customer grouping as the Customers panel and Pending Payments, so one Priya
  there is one Priya here.

## Reorder suggestions

A **Reorder suggestions** card on the Inventory tab shows which materials will run out
before the low-stock alert would warn, when, and how much to order
(`docs/AI_CFO_DESIGN.md`). It is a calculation from your own production runs and
discards over the last four weeks (the larger of the 28-day and the 7-day rate, so a
busy week counts), with no AI, so every account sees it.

- A material is shown when it has about four days of stock left (two days to get it plus
  two spare). The suggested quantity covers the next week on top of that, rounded up.
- "Already low" marks one the low-stock alert already covers; "Low confidence" marks one
  with under two weeks of history or very uneven use.
- A material used for under a week is not guessed at: the card says there is not enough
  history yet. Restocks and R&D are not counted as use.
- The briefing and the chat know about it too, with the numbers filled in by the app.

## Add an order from a pasted message

The Add Order form can fill itself from a customer's WhatsApp message
(`docs/AI_CFO_DESIGN.md`). Paste the message, press "Fill the form", and the items,
quantities, customer, date, payment, discount and delivery address are filled in for
you to check. Nothing is saved until you press Add Order, and stock is still checked.

- It only uses what the message says: quantities, names, the date phrase, the address
  and discounts must all be written in the message, or the reading is rejected and you
  fill the form by hand. The date is worked out by the app ("Saturday", "12 Oct",
  "12/10"), and a percentage discount is turned into an amount from the order's value.
- Items that are not on your menu are listed ("Couldn't find 'croisant'"), with the
  closest menu item to pick if you want it. Nothing is added for you.
- Phone numbers and the names of your existing customers are not sent: a known
  customer is recognised on your device and filled in from their own record. The name
  of a new customer and the delivery address, if in the message, are read by the AI.
- New: an optional **delivery address** on the Add Order form.
- 30 messages a day per account (`AI_PARSE_DAILY_LIMIT`). Not shown in the demo or to
  accounts without AI.

## Fix: settings could be reset to the defaults

The Settings screen autosaves a second after `settings` changes. Before the stored
settings had been read (a slow connection, a read that failed, a new sign-in)
`settings` was only the built-in defaults, so the autosave could write those over
the stored values, blanking the business name, phone number, UPI id, address, email,
GST settings, fixed costs, payment fee rates and time zone (categories and currency
are saved separately and were not affected). Now nothing is saved until the stored
settings have loaded, and then only what differs from what was loaded; the Save
button does nothing before then; and a new sign-in starts again from "not loaded".
Existing settings that were already overwritten have to be entered again.

## Fix: AI calls with an API key that is not tied to a workspace

Anthropic rejected every AI call from a key that was not created inside a
workspace ("This API key is not scoped to a workspace"), so the briefing fell
back to its built-in summary and the chat said the AI service could not answer.
The server now sends the `anthropic-workspace-id` header when the optional
`ANTHROPIC_WORKSPACE_ID` environment variable is set. A key created inside a
workspace needs nothing.

## Ask Your Business

A chat for questions about your own business (`docs/AI_CFO_DESIGN.md`), opened
from a floating "Ask" button.

- Ask about this month so far, last month, the last 7 days or the last 30 days:
  why profit moved, what to stop selling, which customers to get back in touch
  with, where money is being lost. Customers can be named in the question.
- The answer is words only: every number in it is filled in by the app from your
  own figures after the server has checked it, so the AI cannot invent one. If an
  answer fails the check twice, nothing is shown and the question still counts.
- Customer names are replaced by labels on your device before a question is sent,
  and phone numbers are removed, so the AI service never sees either.
- 30 questions a day per account (`AI_CHAT_DAILY_LIMIT` on the server). Not shown
  in the demo or to accounts without AI. Price-change advice and "what if I raise
  prices" arrive with the pricing work; the chat says so until then.

## Fix: sold stock no longer shows as "in stock" on production batches

Adding an order took the units off the item's stock count, but each production
batch kept its own "N left", so the Production tab ("In stock · N left"), the
Freshness alerts and the oldest-batch and aging badges still showed units that
were already on an order. Batches now show what is really left: the shelf count
is spread over the batches, newest first, so the oldest units are the ones sold
(`utils/batchStock.ts`, applied once in `App.tsx`). Editing or deleting an order,
discarding stock and wastage are all reflected too. Nothing is written back, so
existing data is corrected as soon as the app loads.

## Daily briefing

"Yesterday's briefing" at the top of the Dashboard (`docs/AI_CFO_DESIGN.md`).

- The headline, tiles and 7-day bars are the app's own numbers. The AI writes
  only the explanation and a short attention list, as words and tokens that are
  validated on the server (retried once, then replaced by a summary built by code)
  and resolved in the browser against the app's figures. No number comes from
  the model.
- One briefing per day is cached per account; a refresh button regenerates it
  within the daily allowance. Demo accounts see a clearly labelled sample built
  from the demo data. Accounts without AI see no card.
- The card waits until every collection has loaded (new `dataReady` flag), so a
  half-loaded app never produces an empty briefing.
- When yesterday's comparison day was a loss or zero, profit is described as
  "up/down ₹X" rather than a percentage.
- Still switched off unless `AI_FEATURES_ENABLED=true` with a key (use
  `AI_ALLOWED_EMAILS` during the trial).

## AI plumbing (switched off; no AI feature yet)

Shared groundwork for the AI CFO (`docs/AI_CFO_DESIGN.md`). Nothing user-facing
and no model call yet, and it does nothing unless `AI_FEATURES_ENABLED=true`.

- **The server decides who may use AI.** Until now billing was enforced only by
  the browser, and the demo is an open sign-up, so any account could have called
  a paid API. Now every AI route passes `requireAiAccess`: AI must be switched on
  with a key; demo accounts are always refused; an optional allow-list
  (`AI_ALLOWED_EMAILS` / `AI_ALLOWED_UIDS`) limits it to named accounts during the
  trial whatever their billing; otherwise an account needs an active or trialing
  subscription (or the server must be in trial mode). It fails closed.
- **Daily caps, configurable on the server.** Per user per feature (chat 30,
  briefing 4, order parsing 30) and a global daily ceiling (1500 calls), counted
  atomically in Firestore before any model call. A user's day follows their time
  zone. `GET /api/ai/status` reports what is available and what is left.
- **No model-generated figures** (`src/utils/aiFigures.ts`, `aiSnapshot.ts`). The
  model will only be able to write words and tokens like `{{fig:profit_change}}`;
  the app computes every number (including changes and percentages) and renders
  tokens itself. A guard rejects any answer with a digit, a spelled-out number or
  an unknown token outside a token, so an invented figure cannot reach the screen.
  The snapshot sent to the model holds customers as short labels only: no names
  and no phone numbers (tested).
- **Rules.** `users/{uid}/briefings` is owner-read, server-write; the usage
  counters cannot be read or changed by any client. 5 new rules tests (37 in all).
- Adds `@anthropic-ai/sdk`. Server settings: `AI_FEATURES_ENABLED`,
  `ANTHROPIC_API_KEY`, the allow-lists and `AI_*_DAILY_LIMIT` (all in the design doc).

## Customer insights and a business time zone

First part of the AI CFO work (design in `docs/AI_CFO_DESIGN.md`). This part
makes no AI call and works with AI features off.

- **Customers panel in Orders.** Shows who has ordered, across all dates:
  customers who are **due** for a reorder, **lapsed**, or all, each with last
  order and how long ago, their usual gap between orders, favourite items, what
  the business made on them (from `profit.ts`, so it matches the Orders tab) and
  a **WhatsApp** button that opens their chat with a short message ready
  ("Hi Priya, shall I keep Chocolate Cake for you this week?"). Nothing is sent
  until you press send in WhatsApp. A customer is the same person whether the
  phone is typed `+91 98450 10101` or `9845010101`; customers with no phone are
  known by name and marked "No phone".
- **How due and lapsed are decided** (`src/utils/customers.ts`): the usual gap is
  the median days between order dates once there are three of them. Active until
  that gap has passed since the last order, due up to twice the gap, lapsed
  after. Floors stop a near-daily customer being flagged on a quiet day, and the
  plain 30-day rule applies only to customers with fewer than three orders, so
  someone who orders every 40 days is not called lapsed at day 31.
- **Business time zone** (Settings, Business): "today" for the Customers panel is
  the date in your time zone, default India. Until now dates came from UTC, so an
  Indian shop was a day behind from midnight to 5:30am. Only the new features use
  it so far; the rest of the app is unchanged.
- **Demo.** Hotel Sai Residency orders every other day, so the panel shows a
  customer who is due.

## Fix: restocking in grams, and GST shown when GST is off

- **Quantity in another unit.** The restock form only took the item's own unit,
  so "500" for an item kept in kg added 500 kg, and the price paid for 500 g
  was treated as the price for 500 kg. The quantity now has a unit picker next
  to it (g or kg, ml or l; items counted in pcs have none), starting on the
  item's own unit. What is typed is converted to the item's unit, and the price
  paid is for that whole quantity, so 520 for 500 g adds 0.5 kg at 1,040 a kg.
  The form says so as you type ("Adds 0.5 kg to stock", "Cost per unit: 1,040.00
  / kg", "For the whole quantity above, 500 g"). Weight and volume are not mixed.
  The price log entry records the converted quantity and the price per item
  unit.
- **GST only when GST is on.** The form always showed "GST (5%)" and a "Total
  paid" that included it, using a made-up 5% for any item without a rate. It
  was display only (stock and cost were never changed by it), but it looked as
  if tax was being added. With GST off, nothing about GST appears and the price
  box is just "Total price paid". With GST on, the GST and total show for items
  that have a GST rate; an item without one says so instead of assuming a rate,
  and the price box reads "before GST".
- Cancelling a restock now clears what was typed, so the next restock does not
  open with the previous item's numbers.

## Security: Firestore rules rewritten (needs deploying)

**Any signed-in user could grant themselves free access and read other
customers' data.** The deny rules in `firestore.rules` for the user document
and `integrationCredentials` did nothing. Firestore rules are additive: when
several `match` blocks cover a document, access is granted if *any* of them
allows it, so a specific `allow ... if false` never overrides a broader
`allow`. The catch-all `match /{document=**}` under `/users/{userId}` also
matches the user document itself (a recursive wildcard matches zero segments),
so the owner could write it. Confirmed against the Firestore emulator: an
ordinary user could

- write `role: 'admin'` on their own user document, and then read and write
  **every other user's data** (the admin check reads that `role`);
- write their own `billing` field (subscription status), bypassing payment;
- read, overwrite and delete their stored Shopify and Odoo tokens;
- edit and delete ingredient price log entries.

The file no longer uses a recursive wildcard. Each collection the apps use
(`materials`, `menu`, `orders`, `experiments`, `productionRuns`, `wastageLogs`,
`settings`) is listed; `priceLog` is create-and-read only; the user document is
read-only for everyone; and everything not listed (other subcollections, deeper
nesting, `integrationCredentials`, `bills`) is denied by omission, which another
rule cannot undo. Admin access (by `role` or the verified owner address) is
unchanged for business data. The server uses the Admin SDK and is unaffected.

- **Tests.** `npm run test:rules` runs 32 tests against the Firestore emulator
  (`test/rules/firestore.rules.test.ts`), and a `firestore-rules` job runs them
  in CI. The same tests fail 10 ways against the old rules. Needs Java 21.
- **Adding a collection.** A new client-side collection under `users/{uid}` must
  be added to `isBusinessCollection` in `firestore.rules` (and to the test), or
  the app will be denied. This is deliberate: it fails closed.
- **Deploying.** Changing the file does not change production. Publish it with
  `npx firebase-tools deploy --only firestore:rules --project stockpot-adffe`
  (a `firebase.json` is now in the repo), or paste it into the Firebase console
  under Firestore, Rules. Until it is deployed the old, open rules are live.
- **Still worth doing.** Check whether any user document already has a `role` or
  a `billing` value nobody put there, and whether any account is a stranger's.
  Rotating Shopify and Odoo tokens is only needed if you suspect abuse.
- Also fixed: an ESLint error (a ref assigned during render) in the inventory
  hook added by the price log, which would have failed CI's ESLint step.

## True profit, part 3: ingredient price log and per-product profit

The last of the three True Profit steps.

- **Ingredient price log.** Every price paid for a material is now recorded in
  a new `users/{uid}/priceLog` collection, from today on (nothing is
  back-filled, so history only accumulates from this release). An entry holds
  the material, date, price per unit excluding GST, the unit it is in, how much
  was bought and the material's moving-average cost afterwards, plus why it was
  recorded: **Restock** (written in the same batch as the stock and cost update,
  so a restock is never half recorded), **Opening cost** (a material added with a
  cost, one at a time or from CSV) and **Edited by hand** (the cost box in
  Inventory). Entries are only ever added: editing or deleting a material never
  changes or removes its history.
- **Hand edits are logged once.** The cost box saves on every keystroke, so
  typing `0.045` would otherwise log 0, 0.0, 0.04 and 0.045. A hand edit is
  logged once the box has been quiet for a second, as where the edit ended, and
  not at all if it ended where it began or was cleared. It lives in the
  inventory hook, not the screen, so it still lands if you switch tabs straight
  after typing.
- **Changing a unit doesn't corrupt history.** Each entry keeps the unit it was
  recorded in, and the history shows it in the material's current unit when the
  two convert (45 per kg shows as 0.045 per g after switching to grams).
- **Price history in Inventory.** A history button on each material opens its
  recorded prices, newest first: date, price per unit, how much was bought, the
  average after, and why. Read-only, with no charts or alerts yet; Price &
  Margin Intelligence will build on the log.
- **Per-product profit in Menu.** Each menu item shows units sold, revenue, what
  it made and what that is per unit over a chosen period (last 7, 30 or 90
  days, or all time; default 30), next to its recipe margin. When a product's
  recipe margin is healthy but it keeps a lot less of its sales once discounts,
  payment fees and delivery are taken off, it says so. Figures come from the
  same sums as the Orders and Summary screens (`productProfits` in
  `src/utils/profit.ts`): a product's own sales, ingredients and packaging are
  exact, and what an order shares between its items (delivery charged,
  discount, courier fee, payment fee) is split by each item's share of the
  order's sales, so the products always add up to what the orders made.
- **Demo.** The demo bakery has a price history for every material; butter,
  eggs, chocolate chips and yeast were topped up at a different price, and the
  history is worked out so the average ends at each material's current cost.
- **Known limits.** At the time, append-only was only a rule of the app code,
  because the old rules' wildcard allowed every write (see "Firestore rules
  rewritten" above, which now enforces it). Dates use UTC, like the rest of the
  app.

## True profit, part 2: discounts, payment fees, fixed costs and "Made"

The second of three steps. Orders now show what they actually made, and the
dashboard shows a True Profit that includes the costs that aren't tied to any
one order.

- **Made on every order.** The Orders tab shows "Made ₹743" under each order
  (and once for a multi-item order, in its header), coloured by the same margin
  bands as menu items. Click it for the sums: items, delivery charged, discount,
  ingredients, packaging, courier fee, payment fee, then what was made. A loss
  reads "Lost". Orders from before prices were recorded are marked "est.".
- **Discounts.** Add Order has an optional discount off the whole order, and
  it can be edited later from the order's details. It is stored once per order
  (on the first item), comes off income and profit once however many items the
  order has, shows as a Discount line on the bill and the public bill page, and
  GST is worked out on the discounted amount. It can't exceed the order total.
- **Payment method and fees.** "Paid by" (UPI, cash, card, other) on Add Order
  and in an order's details. Settings has a fee percentage per method. The rate
  is stamped on the order when the method is recorded (`paymentMethod`,
  `paymentFeeRate`), so changing a rate later never rewrites past profit. The
  fee is a percentage of what the customer paid and only counts once the order
  is paid. Marking a pay-later order paid, singly or as a customer's whole
  pending list, now asks how it was paid.
- **Fixed monthly costs.** Rent, gas, salaries and the like, in Settings, each
  with an optional From and Until date. They are spread evenly over the days of
  each month and counted for whatever period the dashboard shows, so a cost that
  stops or changes keeps the right history if you end it and add a new line.
- **Dashboard.** New cards: True Profit (contribution minus wastage, payment
  fees and fixed costs), Average Order Contribution, and Fixed Costs, Payment
  Fees and Discounts when there are any. Net Profit keeps its old meaning
  (before fees and fixed costs). Unpaid orders count as income, with an
  "Includes ₹x not yet paid" note.
- **One set of sums.** `saleAmounts` in `src/utils/profit.ts` is shared by the
  bill, the Orders tab and the dashboard, so a bill's total is exactly the
  amount the payment fee is worked out on.
- **Demo.** The demo bakery has UPI, cash and card payments (card 2%), one
  discounted café order and three fixed costs, so every new figure shows.

## True profit, part 1: stable history and one place for the maths

Profit now means what the business actually made, and past figures no longer
move when prices change. (This is the first of three steps; discounts, payment
fees and fixed costs, then the ingredient price log and per-product view, come
next.)

- **Past orders keep the price and cost they had.** Every new order is stamped
  with the unit price, the ingredient and packaging cost, the input GST inside
  those costs and the item's name at that moment (`unitPriceAtSale`,
  `unitIngredientCostAtSale`, `unitPackagingCostAtSale`, `unitInputGstAtSale`,
  `itemNameAtSale`; helpers in `src/utils/orderPricing.ts`). Revenue, costs,
  the Orders tab, bills and statements all read the stamp. Before this, raising
  a cake from 600 to 700 added 100 to last month's revenue for every cake sold,
  and restocking butter dearer raised last month's ingredient cost. Tested: with
  prices tripled and costs doubled, the dashboard's profit is unchanged.
  A bill regenerated later no longer reprices either, and a bill for a deleted
  menu item still shows its name and price.
- **Where stamps are written:** Add Order (single and multi-item), changing an
  order's item (re-stamped from the new item; changing only the quantity keeps
  the stamp), Shopify and Odoo imports (at the price the customer actually paid
  when the import has one, otherwise the menu price), and the demo data.
- **Older orders are not back-filled.** That would freeze today's prices into
  old orders. They are valued at today's menu and costs as before, and the
  dashboard says "Includes orders valued at today's prices (est.)" while any
  are in the period.
- **GST-inclusive profit was overstated, now fixed.** In inclusive pricing the
  price already contains GST, which is owed to the government, but income
  counted all of it. Income is now the pre-GST base in both modes (labelled
  "Income (excl. GST)" when GST is on), so **in a GST-inclusive business, income
  and net profit drop by exactly the GST collected**. Checked on the demo with
  5% inclusive: 16,200.00 gross became 15,428.57 income plus 771.43 GST, and
  profit fell by the same 771.43. Exclusive mode and businesses with GST off
  see no change. An inclusive and an exclusive business selling the same base
  amount now report the same profit (tested). The Orders tab's "Revenue
  booked" still shows what customers are billed.
- **One calculation, many readers.** `src/utils/profit.ts` now holds the
  income, cost and profit maths (`financialsForRange`, `orderContribution`);
  `getFinancialsForRange` in `App.tsx` is a thin wrapper, so the dashboard,
  chart and Summary read the same code. It also returns `totalContribution`,
  `avgOrderContribution`, `orderCount`, `packagingExpenses` and `estimated`
  for the screens to come. All existing keys keep their meaning. Wastage is
  subtracted once at business level and R&D stays out of profit, as before; a
  multi-item order's delivery charge and courier fee still count once.
- **Restocking no longer rounds the cost to 2 decimals.** The moving-average
  cost was stored with `toFixed(2)`, so a per-gram cost of 0.045 became 0.04
  (11% low) and 0.0475 became 0.05, distorting every recipe cost. It now keeps
  six decimals.

## Share Menu: a menu PDF sent over WhatsApp

A **Share Menu** button (fork-and-knife icon) now sits next to the bill icon on
each order, and in the header of a multi-item order. It opens a preview of the
current menu as a designed PDF with **Download** and **Send via WhatsApp**,
addressed to that order's customer. It works like the bill: on phones the share
sheet opens with the PDF attached; on desktop the PDF is saved and `wa.me`
opens with a short message ("Hi Priya, here's our menu from Asha Bakes.") to
attach it to. With no usable phone number WhatsApp is turned off with an
explanation, and Download still works. PDF only: no public menu page or QR.

- **The PDF** is drawn from the live menu each time (nothing is cached), on A4
  pages in the same look as the bill: business name, address, phone and logo,
  then each item's name and price under category headings. Only items with a
  name and a sale price are listed. A long menu runs over as many pages as it
  needs, with the section heading repeated as "(continued)" and page numbers;
  a heading is never left alone at the bottom of a page. A 29-item menu in five
  categories made three clean pages. The file is named `<business-name>-menu.pdf`.
- **Two optional fields on a menu item**, set in Menu & Master Recipes under
  each item: **Menu category** (suggests categories already in use) and **Menu
  description** (one line under the name). Items without them show just a name
  and price, under a single "Menu" heading when nothing is categorised.
- **How it is built:** `MenuCard` draws the pages with inline hex colours only
  (no Tailwind classes, so `html2canvas` can read them; a test fails if a class
  ever appears) and explicit pixel sizes on the logo. `src/utils/pdfExport.ts`
  turns rendered pages into a PDF with `html2canvas` and `jsPDF` (loaded only
  when first used) and is generic, so other reports can reuse it.
  `src/utils/menuShare.ts` holds the grouping, pagination, file name and
  message. `src/utils/shareFile.ts` is the save-or-share-sheet step, now shared
  with the bill.
- New dependency: `jspdf`.
- On the Orders table the five action buttons are slightly tighter from the
  `xl` breakpoint so they still fit without squeezing the customer and phone
  fields.

## Pending payments and the consolidated bill

When a customer has several unpaid orders you can now send one bill covering
all of them.

- **Payment status on orders.** Add Order has a **Paid now / Pay later**
  switch (default Paid now). A pay-later order is stored as
  `paymentStatus: 'unpaid'` and shows an **Unpaid** tag (one click marks it
  paid; a multi-item order shows it once and marks every item together). An
  order's details also have a Payment select to set it back to unpaid. An
  order with no value counts as paid, so every existing order stays paid and
  nothing is suddenly owed. Orders imported from Shopify or Odoo are paid.
- **Payments pending** panel on the Orders tab (only while something is owed,
  and across all dates, not just the selected range): one row per customer
  with what they owe and how many orders. Customers are matched by phone (the
  last 10 digits, so `+91 98450 10101` and `098450-10101` are one customer),
  otherwise by name ignoring case. The amount is the same sum the bill shows
  (items, delivery once per order, GST).
- **Consolidated bill** per customer: one statement listing every pending
  order oldest first with its date, one **Total due**, the UPI QR for that
  total (INR with a UPI ID, as for any bill), a view-online QR/link and Send
  via WhatsApp ("here's your statement from X: Rs due for N orders"). The link
  is created once (stored as `statementToken` on the orders, separate from a
  single bill's `billToken`) and reused, even after more orders are added, so
  a link already sent keeps working; generating again refreshes what it shows.
  The server builds it from the owner's own orders (a multi-item order is never
  split) and refuses anything that is not theirs.
- **Mark all paid** on each customer (with a confirmation) once the money is
  in. The statement page shows what was due "as of" the day it was generated,
  so it is not updated automatically after a payment; generate it again to
  refresh it.

Server: `POST /api/bills` also accepts `{ orderIds: [...] }` (1 to 200).

## Bills: fixes to the Orders row and the missing UPI QR

- **Generate Bill overlapped the price.** The new bill button made the
  actions column four buttons wide, wider than its 7.5rem slot on the Orders
  table (from the `xl` breakpoint), so it ran over the Total. The column is
  now 9.5rem, paid for with a smaller Qty column and tighter gaps, so the item,
  customer and phone fields are as wide as before. Checked at 1280, 1440, 1100,
  820 and 390px: nothing overlaps.
- **No UPI QR on the bill.** The QR is, by design, shown only when a UPI ID is
  saved under Settings > Business & GST and the bill's currency is INR, and
  nothing said so. The bill now explains why there is none ("Add your UPI ID in
  Settings..." or "UPI works only for bills in INR"). The note sits below the
  bill and is not part of the image that is downloaded or sent.

## Bills: Generate Bill, WhatsApp send and QR codes

Each order, and each multi-item order as a whole, now has a **Generate Bill**
button (Orders tab). It opens an itemised bill with the business details, line
items, delivery charge, a GST line when GST is on, and the total, plus two QR
codes and ways to send it:

- **Scan to pay (UPI)**: a `upi://pay` QR with the business's UPI ID, name,
  exact amount and the bill reference. Shown only when a **UPI ID** is set
  (new optional field under Settings > Business & GST) and the currency is
  INR; otherwise the bill has no payment QR at all.
- **View bill online**: a QR (and link) to a read-only copy of the bill at
  `/bill/<token>`. The token is 128 random bits, created the first time a bill
  is generated, stored on the order(s) as `billToken` and reused afterwards, so
  links already sent keep working. Generating again refreshes what the page
  shows, on the same link.
- **Send via WhatsApp**: on phones, the share sheet opens with the bill image
  attached; on desktop the image is saved and `wa.me/<number>` opens with a
  short pre-filled message and the bill link. Nothing is sent automatically
  (that needs the paid WhatsApp Business API, which was deliberately
  deferred). Phone numbers are cleaned for `wa.me` (spaces, `+`, leading `0`,
  `0091`; a bare 10-digit number is taken as Indian). With no usable phone
  number the button is disabled with an explanation.
- **Download** saves the bill as a PNG.

How it differs from the original handoff plan, and why:

- The public link is `/bill/<token>`, not `/bill/<orderId>/<token>`. Orders
  live under `users/{uid}/orders`, so the server could not find one from an
  order id alone. Instead the server builds the bill itself from Firestore
  (never from what the browser sends) and stores a snapshot at the top-level
  `bills/{token}` document, and the public page reads only that. Firestore
  rules are unchanged in effect (`bills` is denied to every client, as is
  everything not listed); orders are never exposed or queried publicly.
- The snapshot has no customer phone, no other orders and no inventory or
  financials. A wrong, malformed or unknown token gets the same 404 page.
- The captured bill uses inline hex colours rather than Tailwind classes:
  `html2canvas` throws on the `oklch()` colours Tailwind v4 emits, which broke
  Download and Send in a real browser.
- There is no ESLint in this project (`npm run lint` is `tsc --noEmit`).

New dependency: `qrcode` (+ `@types/qrcode`). New server pieces:
`lib/billStore.ts`, `lib/billHtml.ts`, `lib/billRoutes.ts`; shared logic in
`src/utils/billing.ts` (GST goes through the same `splitSaleForGst` as the
dashboard, with the delivery charge counted once per order).

## Landing page: laptop and phone showcase

Under "A metric-first kitchen operating system" the two separate screenshot
cards are replaced by one composition: the recipe-costing screen on a laptop
with the stock-alerts screen on a phone overlapping its corner (stacked on
phones). Both are real captures of the app on the rupee demo data (the phone
one at a 390px mobile layout), in `public/landing/device-laptop.webp` and
`device-phone.webp`. The recipe and inventory descriptions moved into text
cards with checked points, so all six features are now cards in a 3 x 2 grid.

## Landing page: fewer screenshots, more words

The page had eight app screenshots plus three photos. Now it has three app
screens and the photos:

- **Kept:** the dashboard in the hero (it shows the profit the headline
  promises; the hero used the recipe screen, which now appears only in the
  feature section), the recipe-costing screen and the inventory screen.
- **Replaced with text:** Production, Orders & delivery, GST and Wastage & R&D
  are now cards with a short description and four checked points each, written
  from what the app really does (for example, "Delivery charged to the
  customer vs. fee paid to the courier"). They sit in one row of four.
- The pastries photo is a banner strip above the feature cards instead of
  being squeezed into the Recipe card.
- The unused screenshots (`production`, `orders`, `gst`, `wastage`, `rnd`,
  `add-order`, `add-item`) stay in `public/landing/` in case they are wanted
  again; nothing links to them.

## Landing page: banner and food photos, one section per row

- **Photos added** (`public/landing/`, WebP): the widescreen hero banner
  (`banner-wide`, with a 4:3 `banner-tablet` version for phones and tablets
  through `<picture>`), a pastries photo on the Recipe Engine card, and a
  sourdough photo behind the closing call to action.
- **No two sections side by side.** The hero was text beside a screenshot, the
  FAQ had its heading beside the questions and the price card was split in
  two to fill the width. Each section is now one full-width column: banner,
  then headline and buttons, then the app screenshot; pricing and FAQ are
  centred single columns. Only cards of the same kind (problem cards, the
  four workflow steps, the feature cards) sit in a row.

## Landing page: revised design, wider desktop layout, rupee price

`src/LandingPage.tsx` follows the revised Stitch landing-page design: a
two-column hero (headline left, recipe-costing screenshot right), a
"hidden leaks" problem band, the feature bento, four compact workflow cards,
a wide single-plan pricing card, a two-column FAQ and a closing call to action.

- **Responsive.** The page was a narrow centred column on desktop; content now
  spans up to 1,600px with 48px gutters, and the hero, bento, workflow,
  pricing and FAQ use the extra width. Phone and tablet layouts are unchanged
  in spirit (single column, no horizontal scroll).
- **Price is ₹1,200 / month** (was "Rs.1200"), matching the design and the
  ₹ used throughout the app. The Stripe price behind `STRIPE_PRICE_ID` must be
  ₹1,200 / month in INR.
- **Left out of the design on purpose:** the "Founder Voices" testimonials,
  named case study and results ("food cost variance 8% to 1.5%"), and the
  invented statistics (-22% margin, 4.2h lost a week, 12% waste, +78% target
  margin, 35.7% COGS, +₹115 delivery delta). None of them come from real
  customers or data, so they are not shown; a testimonials section can be added
  once there are real quotes. Also omitted: the stock-photo hero, the
  US/India price toggle, the About / Community / Support / Security links
  (no such pages), the invented browser-bar URL, and "no credit card required"
  (Stripe Checkout collects a card for the trial, so the page says so).
- The hero's secondary button now scrolls to the features instead of opening
  the demo; the demo is still linked from the footer and the FAQ.
- Every screenshot on the page is a real capture of the app on the (rupee)
  demo data in `public/landing/`.

## Demo sandbox: India-specific data

Stockpot is focused on the Indian market for now, so the demo sandbox is now an
Indian bakery (`src/utils/demoData.ts`):

- **Rupees.** Currency is INR (₹). GST is left off in the demo (it can still
  be switched on in Settings). The business address and phone are in
  Bengaluru (+91), and customers have Indian names and +91 phone numbers.
- **Typical Indian prices** (per kg unless noted): maida ₹45, whole wheat
  atta ₹48, sugar ₹48, unsalted butter ₹570, chocolate chips ₹600,
  instant yeast ₹700, milk ₹68 a litre, eggs ₹7 each, bakery box ₹12.
- **Menu:** Butter Croissant ₹150, Chocolate Muffin ₹120 and a Whole Wheat
  Atta Loaf ₹90 (replacing the sourdough loaf), with recipes costed from the
  prices above (₹57.12, ₹51.46 and ₹28.62 a unit). The R&D experiment is now
  an atta croissant trial and atta is a new raw material.
- Everything dependent is still derived, so batch costs, stock and shelf
  stock add up; tests cover the new figures.
- The ten landing-page screenshots in `public/landing/` were retaken, so they
  show rupees too; the GST screenshot is taken with GST switched on.
- **INR is the default currency** for every account (it was USD): it is now the
  first entry in `CURRENCIES`. Other currencies are still in the selector.
- **Landing page price is Rs.1200 / month** (was $24). The Stripe price behind
  `STRIPE_PRICE_ID` must be Rs.1200 / month in INR, or customers will be charged
  something different from what the page shows.

## Landing page: price is $24 / month

The pricing card now shows $24 / month (`PRICE` in `src/LandingPage.tsx`),
matching the Stitch design. The Stripe price behind `STRIPE_PRICE_ID` is set
in Stripe, not in code, and must be $24 / month too or customers will be
charged a different amount than the page shows.

## Landing page: new "Culinary Precision" design

`src/LandingPage.tsx` is rebuilt from the Stitch landing-page design: sticky
header, hero with a framed dashboard screenshot, a three-card problem section,
a bento feature grid, a four-step workflow, a single-plan pricing card, an FAQ
accordion (buttons carry `aria-expanded` / `aria-controls`), a closing call to
action and a footer. Space Grotesk and Inter are loaded only while this page
is open.

The design was checked against the product and corrected where it disagreed:

- **Card required.** The design said "no credit card required", but
  `server.ts` starts the 14-day trial through Stripe Checkout, which collects
  a card. The page now says a card is required and that nothing is charged if
  you cancel before the trial ends.
- **Price.** The design showed $24 / ₹499 with a region toggle; the page keeps
  the live $49 / month (`PRICE` at the top of the file). It must match the
  Stripe price in `STRIPE_PRICE_ID`.
- **Left out** because they don't exist: About and Contact pages, the invented
  browser-bar URL, and the "backed up automatically" claim (the FAQ now says
  what is true: data lives in Google's Firebase cloud, per account).
- **Screenshots** are real captures of the redesigned app on the demo data
  (`public/landing/*.webp`), not hotlinked design mock-ups. The old
  `public/dashboard_mockup.png` and `public/inventory_mockup.png` are removed.
- **Dollars throughout.** The demo sandbox now seeds a USD currency
  (was INR), so the demo and the landing-page screenshots show `$` and match
  the $49 price. The screenshots were retaken.
- Every call to action points to `/app`; Terms and Privacy point to `/terms`
  and `/privacy`.

Tests: `src/__tests__/LandingPage.test.tsx`.

## Demo data: every figure now adds up

The demo sandbox's sample data had numbers typed in that contradicted each
other — e.g. 25 croissants costing 2,085 in production while the recipe costs
about 1.53 a unit, ingredient stock that ignored everything the batches had
used, shelf stock that disagreed with the batches, and every order (even old
ones) left pending. The data now lives in `src/utils/demoData.ts` and every
dependent figure is derived:

- a batch's cost = quantity produced x the recipe's material cost (25
  croissants = 38.31);
- a material's stock = what was bought minus what the batches used (flour
  60,000g bought, 42,750g used, 17,250g left);
- shelf stock = units made after waste minus units ordered, and the batches'
  remaining units are what is left after orders take from the oldest batches
  first, so they sum to the shelf stock (croissants 75 - 56 = 19);
- orders before today are fulfilled, today's are pending;
- thresholds are meaningful, so exactly one material (yeast) shows Low Stock,
  batches with stock are within date, and one muffin batch has a lost unit so
  the yield pill has something to show.

`demoData.test.ts` checks these from first principles (hand-worked figures,
FIFO, day-by-day stock never going negative), and the end-to-end demo test
checks that the Production, Orders, Inventory and Dashboard screens show
figures that reconcile with the seeded data.

## Demo sandbox: clear errors, tidier sample data, end-to-end tests

The demo sandbox stopped working because the Firebase project has the
**Email/Password sign-in provider switched off** (Firebase Authentication >
Sign-in method): the demo signs in as a throwaway email/password user, so the
request is refused with `PASSWORD_LOGIN_DISABLED` and the screen only said
"Failed to initialize demo sandbox". Turning the provider on fixes it; this
change makes the problem visible and the demo safer.

- `src/utils/authErrors.ts` turns Firebase error codes into specific messages
  for Google, email and demo sign-in (provider switched off, unauthorised
  domain, network, rate limit, blocked pop-up, refused database write).
  Email sign-in also now recognises `auth/invalid-credential`.
- If the demo account is created but its sample data fails to save, the
  visitor is signed out instead of being left in an empty app.
- Demo batches that still have stock no longer start out already expired
  (the dashboard opened with "Expired stock: 6 batches").
- `src/__tests__/` runs the real app against an in-memory Firebase
  (`fakeFirebase.ts`): demo sign-in, seeding, every tab rendering, the Add
  Order / Log Production Run modals opening, and both failure paths.

## Every remaining modal and pre-app screen restyled ("Kitchen Operations Platform" skin)

No mockups were supplied for these, so they extend the design already used by
the Add Order / Log Production Run modals and the redesigned screens. Behaviour,
validation and every handler are unchanged; App still owns the state and
submit handlers, and the modals only render them.

- **Restock**, **Discard**, **Add Item** and **Nutrition & Allergens** moved out
  of `App.tsx` into `RestockModal`, `DiscardModal`, `AddMaterialModal` and
  `NutritionModal`, and the small alert / confirm popup into `ConfirmDialog`.
  All use the shared `ModalShell` (bottom sheet on phones, centred card from
  640px, native form submit so Enter works and `required` fields validate,
  close on Cancel / X / backdrop click).
  - Restock also shows the resulting cost per unit.
  - Discard adds a "Use max" shortcut and a "Cost recorded" readout; the icon
    and confirm colour follow the action — coral for wastage, amber for
    Personal Use, teal for Sampling.
  - Nutrition & Allergens keeps the USDA / Open Food Facts lookup, the four
    nutrient fields and the allergen chips (now with `aria-pressed`).
  - The confirm popup is coral with Cancel / Delete; the alert popup is a
    single OK. It stacks above other modals.
- **Quick Select Ingredients** (the recipe editor's bulk picker) now uses
  `ModalShell` too, with a labelled search box and amount fields.
- **Sign-in / sign-up**, the **paywall** ("Start your free trial" / "Subscription
  needs attention") and the **loading** screen moved into
  `src/components/AuthScreens.tsx`: a teal canvas with a soft glow and one
  white card, labelled fields, an error banner with `role="alert"`, and the
  same Google / email / demo-sandbox options as before.
- `ModalShell` gained `tone`, `widthClass`, `closeOnBackdrop` and `onSubmit`
  options (Add Order and Log Production Run are unaffected).
- Not restyled: the public landing, terms and privacy pages (marketing pages,
  not part of the app).

## Settings redesign ("Kitchen Operations Platform" skin)

The Settings screen now follows the Stitch settings design. Only real settings
are shown: the mockup's FSSAI licence, GSTIN, tax-classification scheme,
KOT/thermal printers and station chits, staff permissions, telemetry and
"Discard Changes" have no counterpart in the app and were left out.

- **Layout**: a section list on the left (a scrolling chip row on phones)
  replaces the dropdown, with counts where they mean something (GST on,
  connected integrations, number of categories). The same five sections and
  the same `activeSettingsTab` state as before; Save Changes is unchanged.
- **Business & GST**, **Integrations**, **App Customisation**, **User
  Account** and **Inventory Categories** are restyled as cards with status
  pills (GST Active/Off, Shopify Connected / Setup required, connected count).
  Every field, toggle, connect/disconnect action, the billing link and Sign
  Out keep their existing behaviour. Form fields now have real labels.
- **Inventory Categories**: the add box is a controlled input (it used to
  read and clear the DOM node by id); Enter and the + button both add.
- **Brand colour** (was "Theme Colour"): the swatches were a set of brown
  tones left over from the old look; they are now the Stockpot palette plus the
  previous default. The label says what it drives — the shared nutrition
  cards — since the app's own colours come from the theme, not this setting.

## Add Order and Log Production Run modals redesign ("Kitchen Operations Platform" skin)

Both modals now follow the Stitch modal designs, sharing one frame
(`src/components/ModalShell.tsx`): a bottom sheet on phones and a centred card
from 640px up, with a teal accent bar, an icon tile + title + mono subtitle,
a scrolling body and a pinned Cancel / primary-action footer. It is a proper
`role="dialog"` with an accessible title and a labelled Close button. Form
logic, validation and save behaviour are unchanged. The mockups' station /
line-lead pickers, prep slot, "Repeat Last", and live-sync footers have no
counterpart in the app and were left out.

- **Add Order**: a − / + quantity stepper, how many units of the chosen item
  are available (coral at zero) with its unit price, a three-column
  date / customer / phone row, and the order total in the mono face.
- **Log Production Run**: the same stepper, a per-item material cost when
  logging several items, and the yield section reworked into a
  "Yield & waste accountability" card showing expected yield, sellable units
  and waste (with a "% yield" / "100% target met" badge). The cost preview now
  also shows cost per unit. The primary button is teal instead of amber.

## Recipes, R&D and Wastage redesign ("Kitchen Operations Platform" skin)

The Recipes & Menus, R&D Lab and Wastage tabs now follow the Stitch designs.
Only real data is shown: the mockups' recipe codes, batch yields, station and
handler columns, "logged by" avatars, sensory-panel and tasting-note cards,
equipment/station breakdowns, AI recommendations, trial statuses and Export
buttons have no counterpart in the app and were left out.

- **Menu & Master Recipes**: headline cards (menu items, average food cost,
  highest-margin item, items needing review), a name search and a margin
  filter, and restyled item cards with sale price, shelf life, servings and
  the 3.5x price suggestion as one tidy row. The recipe editor keeps Quick
  Add, per-category adds, the cost and nutrition estimate, and now shares one
  row component for ingredients and packaging; the delete button on each line
  is always visible instead of only on hover. Cost/margin maths lives in
  `src/utils/menuStats.ts` (previously repeated four times in the view). The
  nutrition-card share flow is unchanged.
- **R&D & Test Kitchen**: headline cards (sessions, total trial cost, this
  month's burn, distinct materials tested), a session search, and session
  cards showing the date, each material's cost and the session's total. Maths
  in `src/utils/rndStats.ts`. Fixed: the "No R&D sessions logged" empty state
  used to appear whenever nothing was logged for the Orders date filter, even
  while sessions were listed; it now shows only when there are no sessions.
- **Wastage & Loss Ledger**: headline cards (total loss, incidents split
  raw/finished, primary reason, loss as a share of production cost), search,
  reason, category-tab and date filters, a paginated ledger with unit cost
  and cost impact, and a "Loss by Reason" breakdown. Maths in
  `src/utils/wastageStats.ts`. Fixed: the old table's type badge never got
  its colour because of a stray escaped `${...}` in its class name.
  Wastage is still logged from Inventory (Discard) and Market Stock, as
  before — the mockup's "Log Waste Incident" button has no equivalent flow.

## Production Runs redesign ("Kitchen Operations Platform" skin)

The Production Runs tab now follows the Stitch production design. Only real
data is shown: the mockup's run numbers, SKU/rack codes, commissary statuses,
oven/equipment utilisation, scrap-ratio gauge, Export CSV and Batch
Calculator have no counterpart in the app and were left out.

- **Headline cards** (all time): Total Runs (with runs this week), Units
  Baked (with sellable units and overall yield), Total Prod. Cost (with
  average cost per unit) and Finished Goods (SKUs and units on shelf, with
  a freshness-alert count). Figures live in `src/utils/productionStats.ts`.
- **Market Stock & Freshness** keeps all four actions (Add to Order,
  Personal Use, Sampling, Discard) and now shows a Fresh / Check freshness /
  Expired badge and the age of the oldest unsold batch per item.
- **Runs table**: batch date and time, recipe, produced, a yield pill
  (sellable share of what was produced, flagging waste), batch cost, shelf
  expiry (marked Due / Expired while stock from the batch remains) and a
  status pill (in stock / check freshness / expired / sold out). Sessions
  keep their grouped header and Delete Session; sessions are never split
  across pages.
- **Filters and paging**: the existing recipe filter plus a date range,
  a "n of m runs" count, Clear filters, and 12-per-page pagination.
- The retired **Purpose** column now only appears when a listed run still
  carries one from before purpose was removed.
- The run-status pill logic moved from `SummaryView` to
  `src/utils/productionStats.ts` so the dashboard and this tab share it.

## Orders redesign ("Kitchen Operations Platform" skin)

The Orders tab now follows the Stitch orders design. Only real data is
shown: the mockup's order numbers, SLA timers, surge multipliers, dispatch
window, courier-partner breakdown, "Out for Delivery"/"Cancelled" statuses
and Export Manifest have no counterpart in the app and were left out.

- **Headline cards** for the selected date range: Total Orders (a
  multi-item order counts once, not once per item), Revenue Booked (items +
  delivery charged, same rule as the dashboard's income), Courier Cost
  (with the net of delivery charged vs. courier fees) and Pending
  Fulfilment. Figures live in `src/utils/orderStats.ts`; delivery charge and
  fee are counted once per order group.
- **Filters**: date range with Today / 7 Days / 30 Days shortcuts (the
  active one is highlighted), search across customer, phone, item and
  address, and All / Pending / Fulfilled tabs with counts. A multi-item
  order stays whole when any of its items matches.
- **Day cards** show orders, items and revenue per day. Each row keeps its
  inline editing (item, quantity, customer, phone) and adds a status pill,
  a delivery-method chip and the line total; actions are always visible.
  Multi-item orders keep their container with the order total and
  Fulfill All / Delete All. The delivery details panel now shows the
  delivery margin (charged to customer minus paid to courier) on courier
  orders.
- **Layout**: one row layout for every screen size — stacked cards on
  phones and tablets, a table-style row from 1280px up.
- `MetricCard` moved out of `SummaryView` into `src/components/MetricCard.tsx`
  so the dashboard and Orders share it.

## Inventory redesign ("Kitchen Operations Platform" skin)

The Inventory tab now follows the same Stitch design as the dashboard. Only
real data is shown: the mockup's vendor names, bin codes, week-over-week
value change, cold-store/dry-store cards and SKU-code column have no
counterpart in the app and were left out rather than faked.

- **Header cards**: a "Critical Stock Alert" card spotlights the material
  furthest below its threshold (with a Restock button that opens the
  existing restock flow; a green "All stocked up" card when nothing is
  low), plus Tracked SKUs, Under Threshold and Raw Inventory Value
  (stock on hand x cost per unit).
- **One searchable table** replaces the per-category tables: search by
  name, filter by category / status / unit, sort, and 15-row pages. A
  Category column (editable) replaces the old "Uncategorized Items"
  section, so materials with an unlisted category stay visible and can be
  reassigned.
- **Status pills** — Low Stock (same rule as the header alert: threshold
  > 0 and stock at/below it), Reorder Soon (within 25% above the threshold)
  and In Stock — plus a Total Value column. Rules live in
  `src/utils/inventoryStatus.ts`.
- **Unchanged behaviour**: inline editing of name, stock, threshold, cost,
  GST %, unit (with the same stock/cost/threshold conversion) and expiry;
  Restock, Nutrition, Discard and Delete actions.
- **Add Item / Import CSV** now target the category currently selected in
  the filter (or the first category when viewing "All Categories"), since
  there are no per-category sections any more.

## Dashboard redesign ("Kitchen Operations Platform" skin)

Re-skinned the dashboard and the app shell around it from a Stitch design
(teal brand, slate-navy ink, light-teal canvas behind white cards, Manrope
for text and JetBrains Mono for every figure that has to line up). Only
real app data is shown — the mockup's placeholder content (a named chef,
a monthly profit target, barcode scanning, a "lunch service" picker) has
no counterpart in the app and was left out rather than faked.

- **Theme** (`src/index.css`): brand `primary` is now teal `#00797B`
  (previously bread-brown), matching the new logo, plus `ink`, `muted`,
  `coral` and `margin` tokens, Manrope/JetBrains Mono, a `#EAF4F3` canvas
  and a `.surface-card` (border-less white card with a soft ambient
  shadow). This re-colours every view that uses `primary`/`surface`; the
  amber accents used on a few screens (e.g. Production) are unchanged.
- **Shell** (`App.tsx`): the sidebar moves from the right to the left and
  carries the Stockpot mark and the bakery's own name/logo; the header
  becomes a slim bar with low-stock / freshness alert pills (compact
  count badges below `xl`, and the same hover popovers as before, incl.
  discarding a batch), currency, signed-in user and sign-out; mobile gets
  a pill-style bottom nav and a teal production-run FAB. The bakery's
  name/logo shows in the mobile header when set.
- **Dashboard** (`SummaryView.tsx`): title + period controls card;
  Cost of Goods Sold / Production Cost / Delivery Expenses / Wastage
  cards with supporting stats (share of income, cost per run, courier
  deliveries — grouped orders count once); GST cards when GST is on;
  a grouped-bar Financial Trends chart; a Recent Production Runs table
  (yield %, cost, and freshness/remaining status, with a Log Production
  Run button); a Net Profit card that lays out income − COGS − couriers −
  wastage; a Low Stock card whose Restock button opens the existing
  restock flow; and a Freshness card for unsold batches to check or
  discard. The first-run onboarding steps and the custom date range are
  kept.
- **Dropped from the old dashboard**: the separate "Total Income" card
  (income now leads the Net Profit breakdown), and the "Items on Menu" /
  "Dates with Data" counters (orders and items sold are shown under Net
  Profit).

## Weight <-> volume unit conversion

Recipes and raw materials could mix weight (g/kg) and volume (ml/l) units
freely — e.g. a recipe requirement in ml for a material stocked in kg —
but `convertAmount` only ever handled conversions within the same family
and silently left the amount unchanged for any other pair, quietly
understating or overstating cost and usage.

- `UNIT_CONVERSIONS` (src/utils/conversions.ts) now converts weight <->
  volume assuming 1g = 1ml (water's density). Exact for water, a
  reasonable approximation for many kitchen liquids, but not accurate for
  anything meaningfully denser or lighter than water (oil, honey, syrup,
  etc.) — chosen as a simple, no-setup default over adding a per-material
  density field.
- `ProductionRunModal`'s cost preview had its own separate, duplicated
  conversion function with the same weight/volume gap (and no cross-family
  handling at all) — replaced with the shared `convertAmount` so the
  preview matches what actually gets saved and what every other cost
  calculation in the app uses.
- The Inventory tab's material unit-switcher (which recomputes stock/cost
  when a material's unit changes) reads from the same table, so switching
  a material between weight and volume units now converts its stock
  correctly too, instead of only relabeling the unit and leaving the
  numbers as-is.

## Stockpot logo

Added the real Stockpot logo (previously the landing page and login screen
used generic lucide icons — ChefHat, Utensils — as placeholders).

- `public/logo-icon.png`: the pot mark alone, square, transparent
  background — used as the browser favicon, the landing page nav, and the
  initial loading screen.
- `public/logo-full.png`: pot mark + "STOCKPOT" wordmark — used on the
  login/sign-up screen in place of the old icon-in-a-box + text heading.
- Left the app's own "Recipes" tab icon and the per-bakery logo shown once
  signed in (`settings.logo`, the bakery's own branding) unchanged — those
  are a different thing from Stockpot's own product identity.

## Production-run/order redesign: stock as the source of truth

Live use of the multi-item feature below surfaced a deeper mismatch:
production runs were tagged with a "purpose" at bake time (customer order /
market stock / sampling / personal use), but real bakeries decide what a
batch is for *after* baking, at order or consumption time. This redesign
makes `finishedGoodsStock` the single hard cap everything else reads from,
instead of a purpose picker deciding whether stock even exists.

- **Production logging**: the purpose picker is gone — a run is just
  recipe + quantity, and every run adds to stock. The old "customer order"
  auto-link (and its one-time backfill tool) is retired for new runs;
  `purpose` stays on existing records for historical display only, and
  deleting an old run still reverses stock correctly whether or not it
  used to add any (see LEGACY_STOCK_PURPOSES).
- **Orders are hard-capped to stock, claimed at creation**: adding an order
  (now a single "Add Order" button — the separate "Multi-Item Order"
  button is gone) validates the requested quantity against
  `finishedGoodsStock` and claims it atomically with the order, instead of
  a later "Fulfill" step doing the deduction. `fulfillOrder` is now a plain
  completion status with no inventory effect, and its old raw-material
  fallback is gone — if there isn't enough stock, the fix is logging
  another production run. Editing an order's item/quantity inline
  re-balances the claim; deleting an order (one at a time or via Reset)
  restores it. Shopify/Odoo-imported orders claim stock the same way,
  clamped at 0 rather than rejected, since an external sale can't be
  un-sold.
- **Market Stock**: the old "Finished Goods In Stock" chip list is now a
  proper section with three actions per item — Discard (unchanged),
  and new "Personal Use"/"Sampling" quick actions that route through the
  existing wastage-log mechanism (already excluded from income) with a
  preset, editable reason.
- **Freshness alerts**: a new pure urgency tiering (`fresh`/`aging`/
  `expired`) in `stockAging.ts` extends the old expiry-only alert to also
  flag batches with no known expiry that have simply been sitting a
  couple of days, surfaced in both the header alert and Market Stock.
  UI-only for now, but built as the one detection function a future push
  channel can reuse unchanged.
- **Regression fix**: `finishedGoodsStock` now being claimed at order
  creation (not fulfillment) made a raw-material-usage projection in the
  Inventory tab stale — it was projecting future material draw for
  unfulfilled orders, which can no longer happen since materials are
  deducted exactly once, at production time. Left uncorrected it would
  have under-reported remaining raw-material stock and could trigger false
  low-stock alerts. Fixed by dropping orders from that projection
  entirely (experiments still correctly count, since they never deduct
  real stock).

## Multi-item orders & production runs

A customer order is often for several different items ("2 cakes and 3
cookies"), and a single baking session often makes several different
things at once. `Order` and `ProductionRun` were both single-item
(`menuItemId`/`recipeId` + one `quantity`) — this feature adds multi-item
support to both, without restructuring either into arrays of line items.

- **Data model**: `Order.orderGroupId` and `ProductionRun.productionSessionId`
  are both optional and additive — undefined means "not part of a group,"
  which is every order/run that existed before this feature and every
  single-item one since. Chosen over restructuring into arrays specifically
  so every existing calculation that operates on one order/run at a time
  (`fulfillOrder`, inventory usage, `getFinancialsForRange`, the
  customer-order-to-production auto-linking, GST rollup, nutrition rollup)
  keeps working completely unchanged, and so per-item actions — a partial
  refund on one item from a multi-item order, discarding one bad batch from
  a session that also made other things — stay natural, since every
  document is still fully independent underneath the grouping.
- **Logging a production run**: the modal now accepts multiple
  recipe+quantity rows in one submission. Each row still becomes its own
  independent `ProductionRun` document via the existing single-run save
  path (materials deduction, finished-goods stock, customer-order
  auto-linking, all unchanged) — rows sharing a submission just get a
  common `productionSessionId`. Rows save sequentially, not atomically: a
  failure partway through leaves the earlier rows saved rather than rolled
  back, and a retry reuses the same session id instead of splitting the
  group.
- **Adding an order**: a new "Multi-Item Order" flow alongside the existing
  quick "Add Order" — shared date/customer fields plus one or more
  menu-item+quantity rows, saved as one atomic write (unlike production
  runs, a plain `Order` document has no side effects to partially unwind,
  so there's no reason to allow a partial group here).
- **Orders tab / Production Log display**: orders and runs sharing a group
  render together in a clustered container with a "(N items)" header and
  group-level bulk actions (fulfill/delete all, delete session), instead of
  as unrelated rows. The Expired Batches list also shows what else was made
  in the same session, so discarding one bad batch is an informed choice.
  Grouping logic (`clusterByGroupId`) is a single generic, unit-tested
  utility shared by both views rather than two parallel implementations.
- **Financials**: `getFinancialsForRange` now attributes `deliveryCharge`/
  `deliveryFee` once per `orderGroupId` rather than once per document —
  a group's members share one physical delivery, so summing every
  document's value would have multiplied a shared charge by the group
  size. The fix finds the actual value regardless of which member of the
  group it was entered on, so no UI changes were needed: delivery info is
  added the same way for every order, grouped or not, via the existing
  per-order inline editor.

## Shareable nutrition card (step 5 — final step of the feature)

Last step of the Nutrition & Allergen Info feature: a "Share Nutrition
Card" button (Salad icon, next to Duplicate/Delete) on each menu item,
generating a PNG the owner can send a customer via WhatsApp, Instagram, or
anywhere else.

- New `html2canvas` dependency (checked it wasn't already present first),
  dynamically imported only when a card is actually generated — it's a
  sizeable library and ends up in its own ~200KB chunk rather than
  inflating every page load.
- New `src/components/NutritionCard.tsx`: a plain presentational
  nutrition-facts-style card (business name/logo, item name, per-serving
  calories/macros, allergen badges, a "Partial estimate" note when
  `hasIncompleteData`, and the required disclaimer verbatim on every
  card — imported from `nutritionCalculations.ts`'s `NUTRITION_DISCLAIMER`
  rather than duplicated as a string). Rendered off-screen (`position:
  fixed` with a large negative offset — not `display: none`, which
  html2canvas can't capture) purely to be captured, never shown directly.
- Clicking the button before an item's Servings field is set shows a
  clear prompt instead of exporting a misleading "0 calories" card, since
  the rollup can't do anything meaningful without a yield to divide by.

---

## Menu item nutrition rollup view (step 3 of the feature)

Fourth step built (numbered per the feature's original build order — step
4, nutrition lookup, was built first; see below) of the Nutrition &
Allergen Info feature: the per-recipe nutrition estimate shown on the Menu
tab, next to the existing Recipe Cost card.

- Added an editable "Servings" field to each menu item (`MenuItem.servings`
  already existed on the type but had no UI anywhere to set it — needed
  here since it's the yield `calculateRecipeNutrition()` divides by).
- The expanded recipe editor now shows a "Nutrition (Est.) / Serving" card
  alongside Recipe Cost: calories/protein/carbs/fat per serving, allergen
  tag badges, and a "Partial" badge when `hasIncompleteData` is true. When
  servings hasn't been set yet, it shows "Set servings above to estimate"
  instead of a confidently-wrong zeroed number.
- Computed on the fly from the current recipe on every render (matching
  how Recipe Cost is already computed inline, no memoization) — nothing
  is stored, so it can't go stale when a material's nutrition data or the
  recipe itself changes.

---

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
