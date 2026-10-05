# AI CFO: design decisions and plan

The original handoff is `docs/handoffs/ai-cfo.md`. This file records what was
decided when it was reviewed against the codebase, so the handoff and the code
do not drift. Where the two differ, this file wins.

Status: the app is still in trial mode with no paying users, so everything
here ships switched off and is opened up deliberately.

## Decisions (agreed with the owner)

1. **Gating.** AI features are for active or trialing subscribers only. The
   demo gets a canned sample briefing, and AI chat is hidden in the demo.
2. **No customer PII to the model unless it must go.** Customers appear as
   pseudonymous labels (`C-4F2A`). Name matching (for order parsing) happens on
   our side, not in the prompt. Phone numbers never go.
3. **Time zone.** "Today" and "yesterday" are the business's own dates. The
   setting is `settings.timezone` (IANA name), default `Asia/Kolkata`.
4. **Chat cap.** 30 questions per user per day to start, configurable on the
   server (`AI_CHAT_DAILY_LIMIT`).
5. **Reorder suggestions (Feature 5)** are specified below before they are built.
6. **Order of work.** Customer Insights first, with the shared AI and security
   plumbing built alongside it.
7. **Financial truth.** No model-generated financial figures. Every number the
   customer sees comes from deterministic application data. See the next section.

## Financial truth: how requirement 7 is enforced

The rule is structural, not a request in a prompt.

- **The model writes words, never digits.** The model's prose may contain only
  text and *figure tokens* such as `{{fig:profit_change}}`, `{{name:item_12}}`,
  `{{cust:C-4F2A}}`. It never contains a digit of its own.
- **A figure registry.** The business snapshot carries `figures`: an id to a
  value with its kind (money, percent, count, date) and, for names, the text.
  Every value is computed by the application (`profit.ts`, `customers.ts`) before
  the model is called, including percentage changes, so the model has nothing to
  calculate. Pricing what-ifs run in the client; their results are added to the
  registry and referred to by token.
- **Code renders the tokens.** Formatting (₹, grouping, rounding, "+12%") is done
  by the app from the registry. A name that contains a digit ("500 g loaf") is
  safe because names are tokens too.
- **A guard sits between the model and the screen.** Model text is rejected if
  it contains any digit outside a token, a token whose id is not in the registry,
  or malformed output. On rejection the request is retried once with the
  rejection as feedback; if it fails again the screen shows deterministic text
  built by code from the same registry (for example the headline) or says the
  explanation is unavailable. A rejected answer is never shown.
- **Headlines are built by code.** "Yesterday: ₹6,240 revenue, ₹2,180 true
  profit, down 12% on last Thursday" is a template filled from the registry. The
  model writes only the explanatory sentences (`why`, `attention`).
- **Tiles and tables are never model output.** Figure tiles, lists and charts
  render directly from application data.
- **What the guard cannot do:** it cannot tell if a sentence is *wrong* (naming
  the wrong driver) only that it carries no invented number. Drivers are
  computed and ordered by code, and the prompt tells the model to explain only
  what the snapshot lists. Quality is checked with an eval set of the six CFO
  questions on the demo account.

## Gating and cost control

Every AI route passes one server-side check (`lib/aiGuard.ts`) before any model
call. Billing is enforced only client-side elsewhere in the app, so this is the
first server-side entitlement check.

1. `AI_FEATURES_ENABLED` must be `true` (default off), and `ANTHROPIC_API_KEY`
   must be set. Otherwise: "AI features are not configured on this server". The
   rest of the app is unaffected.
2. Optional trial allow-list: if `AI_ALLOWED_EMAILS` or `AI_ALLOWED_UIDS` is set,
   only those accounts may use AI, whatever their billing status. An email
   matches only when Firebase has verified it (the token carries an email even
   for an account that signed up with someone else's address); a uid needs no
   email. This is how it
   is tried during the trial without opening it to every signup.
3. Billing: the user's status must be active or trialing
   (`subscriptionStore.hasActiveAccess`). When `BILLING_DISABLED=true` (trial
   mode) everyone counts as active, so billing alone cannot be the gate in trial.
4. Demo accounts (email `demo_<digits>_<digits>@bettereat.com`) are refused
   whatever else is true: they are real, open-signup accounts. They use the
   canned sample in the client and never reach the model.
5. Daily caps, counted in Firestore by the server (Admin SDK, not reachable by
   clients): per feature per user (`AI_CHAT_DAILY_LIMIT` default 30,
   `AI_BRIEFING_DAILY_LIMIT` default 4, which is the first briefing of the day
   plus three refreshes, and `AI_PARSE_DAILY_LIMIT` default 30) and a global daily
   ceiling (`AI_GLOBAL_DAILY_LIMIT`, default 1500 calls). A user's day is their
   business date (their time zone); the global day is UTC. A request is counted
   before the model is called, atomically, and a failed call still counts.
   At roughly ₹0.4 per chat call, 1500 calls is about ₹600 a day at the very
   most; set a monthly spend limit in the Anthropic Console as well.
6. Request bodies are validated with size limits before anything else.

## Privacy

- Labels, not names, in snapshots and chat. The client keeps the label to
  customer map and substitutes names when displaying an answer.
- Order parsing: the model returns the customer name as written; the client
  matches it to a customer. No customer list is sent. The pasted message has
  phone numbers removed on the client before it is sent. The message itself may
  still contain a name and an address, so the privacy policy must say that order
  text pasted into Quick Log is processed by Anthropic.
- No phone numbers in any snapshot (asserted in tests with a fixture that has
  phones). Customer insights itself (below) makes no AI call.

## Customer insights (built)

`src/utils/customers.ts`, `src/components/CustomersPanel.tsx`, in the Orders tab.

- Identity is `payments.customerKey` (phone last 10 digits, else name), the same
  as Pending Payments. Orders with neither are left out.
- Status counts distinct order dates (a multi-item order counts once).
  One order: `new` for 30 days, then `lapsed`. Two orders: `active` for 30 days,
  then `lapsed` (no rhythm yet). Three or more: usual gap M is the median days
  between orders; `active` below M, `due` from M to 2M, `lapsed` from 2M.
  Floors: due no sooner than 2 days, lapsed no sooner than 14, so a near-daily
  customer is not flagged on a quiet day. The 30-day rule applies only when there
  is no rhythm, so a customer who orders every 40 days is not lapsed at day 31.
- Labels are `C-` plus four characters of a hash of the key (longer only on a
  collision). They depend on the key alone, so they do not move when orders are
  added or back-dated.
- Lists: Due (most overdue first), Lapsed (most valuable first), All (latest
  first). Each row has a WhatsApp link with a short message ready. Nothing is
  sent until the owner presses send in WhatsApp.
- Money is what profit.ts says each order made, pre-GST.
- Known limits: one person under two phone numbers, or a name typed two ways
  with no phone, shows as two customers; a "No phone" tag marks name-only ones.

## Reorder-point suggestions (Feature 5): built

The original handoff only says "unchanged from the first version", and that
text is not in the repository, so these rules were written here first and then
built as written (`src/utils/reorder.ts`, tests in `utils/__tests__/reorder.test.ts`).
One correction to the wording below: a material's `threshold` is an amount in its
own unit (the app's low-stock alert fires at `remaining <= threshold`), not a
percentage, and `at_threshold` uses exactly that test. Pure
calculation, no model call. Changing a constant is a one-line edit; each is a
named export so tests pin the behaviour.

**Question answered:** which materials will run out before the percentage
threshold alert would warn, and how much should be ordered?

**Usage.** Raw material used per day, from the last 28 days (`USAGE_WINDOW_DAYS`).
- Production runs: `quantityProduced` x the recipe's amount for each material,
  converted to the material's unit (`convertAmount`). Runs do not record what
  they consumed, so the *current* recipe is used for history. (Improvement for a
  later change: stamp `materialUsage` on new runs, as orders are stamped with
  prices.)
- Plus discards of that material (wastage logs of type `material`).
- Not counted: R&D experiments (they are projected, not consumed), restocks.
- History needed: at least 7 days since the material was added or first used
  (`MIN_HISTORY_DAYS`); fewer means no suggestion, shown as "not enough history
  yet", never a guess.
- Rate = total used in the window / days in the window (or days of history if
  shorter). A recent spike is not ignored: the rate used is the larger of the
  28-day rate and the 7-day rate (`conservative`), so a busy week is not
  averaged away.

**Cover.** `daysOfCover = stock / rate` (stock is the live remaining stock the
Inventory tab shows). `runOutDate = today + floor(daysOfCover)` in the business
time zone.

**When to reorder.** Lead time defaults to 2 days (`DEFAULT_LEAD_TIME_DAYS`) plus
a safety margin of 2 days (`DEFAULT_SAFETY_DAYS`). A material is flagged when
`daysOfCover <= lead + safety`. An optional per-material `leadTimeDays` can
override the default later (no UI in the first version).

**What is suggested.** Order enough to cover the next review period of 7 days
(`REVIEW_DAYS`) plus lead and safety: `suggestedQty = rate x (7 + lead + safety)
- stock`, never below zero, rounded up to two significant figures in the
material's unit. Packaging is treated the same as ingredients.

**Which flag it raises.**
- `before_threshold`: flagged by cover while the stock is still above the
  percentage threshold. This is the one the strategy asks for.
- `at_threshold`: already at or below the threshold (the existing alert covers it;
  shown for completeness with the same suggested quantity).
- A material with no usage in the window is never flagged.

**Confidence.** `low` when there are fewer than 14 days of history or when the
daily usage varies a lot (coefficient of variation above 1); otherwise `normal`.
Low-confidence suggestions say so.

**Output per material:** `{ materialId, rate, daysOfCover, runOutDate,
suggestedQty, flag, confidence }`. These feed the briefing's `low_stock` items
(rendered through the figure registry) and are the starting point for a suggested
purchase order when Purchase Management is built.

**Not handled yet:** seasonality and weekday patterns, expiry (a material that
will spoil before it is used), pack sizes and supplier minimums, and materials
whose use is only through R&D.

**Where it shows (built).** A "Reorder suggestions" card on the Inventory tab, for
every account, with or without AI: the material, how many days are left and the
run-out day, how much to order, "Already low" / "Low confidence" tags, a Restock
button, and a note naming materials with too little history. The briefing and the
chat also get `inventory.reorderSoon` in their snapshot (at most 5, as figures: days
left, the run-out date and a `quantity` figure with its unit), so what they say is
rendered by the app from the same numbers. The code-built briefing adds a line
("X may run out around <date>; about <quantity> would cover the next week") unless
the material is already in the low-stock line.

**Tests written with it:** a steady-use material flagged exactly at lead plus
safety days; a busy last week raising the rate; fewer than 7 days of history
giving no suggestion; unit conversion (a recipe in g, stock in kg); a discard
counted as use; a restock not counted; R&D excluded; stock already at the
threshold labelled `at_threshold`; zero or negative stock; zero usage; the quantity
rounding.

## Shared plumbing (built)

- `lib/aiConfig.ts`: reads the environment (all AI settings above); default off.
- `lib/aiGuard.ts`: `checkAiEntitlement` and `checkAiAccess` (the order above) and
  the `requireAiAccess(feature, deps)` middleware for routes that call the model.
  It fails closed: if a check throws, the answer is 500, never "allowed".
- `lib/aiUsage.ts`: the daily counters, reserved in one Firestore transaction.
- `lib/anthropic.ts`: a lazily created client (the server boots without a key),
  `AI_MODEL = claude-haiku-4-5`, and `aiErrorResponse`, which turns provider
  failures into messages for the owner and never forwards the provider's text.
- `lib/aiRoutes.ts`, `GET /api/ai/status`: whether AI is available to this
  account and what is left of today's allowance, so the app can show or hide AI.
  The reasons the app can act on are `demo_account`, `subscription_required`,
  `not_allowed` and `unavailable` (not configured; no detail is given).
- `lib/auth.ts` now also puts the verified email on the request.
- `src/utils/aiFigures.ts`: the figure registry, token grammar, `validateAiText`
  and `renderAiText` (the financial-truth guard above).
- `src/utils/aiSnapshot.ts`: `buildBusinessSnapshot`. Every number is a figure;
  changes and percentages are precomputed; the "drivers" (sales, discounts,
  ingredients, packaging, courier, payment fees, wastage, fixed costs) are each
  component's effect on true profit, largest first, and add up to the change in
  true profit to within rounding (tested). Customers are labels only. The
  comparison is the same weekday a week earlier for a single day, otherwise the
  same number of days just before.
- Firestore rules: `users/{uid}/briefings/{day}` is owner-read, server-write; the
  usage counters are unreachable from any client (tested in the emulator).
- Built on top of this: the briefing, the chat and order parsing (below).

## Daily briefing (built)

"Yesterday's briefing" is a card at the top of the Dashboard.

- **What is code and what is the model.** The headline, the four tiles and the
  7-day bars are built in the browser from the app's own figures
  (`buildBriefingHeadline`, `DailyBriefing`). The model writes only `why` (one or
  two sentences) and up to 4 `attention` items, as words and `{{fig:..}}`,
  `{{name:..}}`, `{{cust:..}}` tokens. The headline says "up/down ₹X" instead of
  a percentage when the comparison day was a loss or zero, because a percentage
  from a non-positive base misleads (the snapshot omits those percentages).
- **Flow.** Once all Firestore collections have delivered their first snapshot
  (`dataReady`: without it a half-loaded app would send an empty day), the card
  asks `GET /api/ai/status`. Available: `POST /api/ai/briefing` with the
  snapshot (`lib/briefingRoutes.ts`). Demo (`demo_account`): a "Sample" card
  built by `buildDeterministicBriefing` from the demo data. Any other reason: no
  card. AI offered but failing: the same code-built summary with a note.
- **Server.** `requireAiAccess` + CSRF; the snapshot is shape-checked; one
  briefing per day is cached in `users/{uid}/briefings/{day}` (`lib/briefingStore.ts`)
  with a generation lock (a second tab gets 409 and retries). The model call
  (`lib/briefingModel.ts`, `lib/briefingPrompt.ts`) uses structured output; the
  answer is validated by `validateBriefingContent`, retried once with the problems
  listed, and otherwise stored as `source: 'fallback'` so the screen builds the
  text itself. Refresh regenerates and counts against the daily briefing cap (4).
- **Stale cache.** A cached answer refers to figures by id; if the data changed
  so an id no longer exists, `contentResolves` fails and the screen shows the
  code-built version with "Your data has changed since this was written".
- **Privacy.** The prompt holds no customer names or phone numbers, only hash
  labels (checked on the real prompt, about 6k characters).

## Ask Your Business (built)

A floating "Ask" button (bottom-right on desktop, bottom-left above the nav on
phones) opens a slide-over chat. Shown only when `GET /api/ai/status` says AI is
available, so never in the demo and never to accounts without AI.

- **Question to answer.** The browser prepares the question (`prepareQuestion`):
  customer names the owner types are replaced by the customer's label (full name,
  or a first name when it is unique), and phone-number-like digits become
  `[number]`. It then builds a snapshot of the chosen period with
  `buildBusinessSnapshot`, adding the customers who were named
  (`customers.mentioned`: status, days since last order, orders, spent, what the
  business made on them, favourite item, all by label) and the menu items with no
  sales (`unsoldItems`). `POST /api/ai/chat` gets `{ question, snapshot, history }`
  (last 4 answered turns, answers still in tokens). No name or phone number
  reaches the server or the model (tested in the browser, the prompt and the
  snapshot).
- **Periods.** This month so far (against the same stretch of last month), last
  month, last 7 days and last 30 days (`chatPeriods`). Each answer is rendered
  against the figures it was written for, so changing the period later does not
  change an earlier answer.
- **Server** (`lib/chatRoutes.ts`): validates the body and its sizes, then the same
  gate as the briefing, then reserves one `chat` use (30 a day by default,
  `AI_CHAT_DAILY_LIMIT`), asks the model (`lib/chatModel.ts`, structured output
  `{ answer }`), validates with the figure guard (`validateChatAnswer`, up to
  1200 characters), retries once with the problems, and otherwise returns
  `answer: null` ("could not give a checked answer") rather than anything
  unchecked. A counted question stays counted. Provider errors are mapped to
  messages and never forwarded.
- **Prompt** (`lib/chatPrompt.ts`): answer only from the snapshot, concise, lists
  as "- " lines (a numbered list would be rejected as digits), say plainly when the
  data does not cover the question, decline off-topic questions, and treat names
  and the question as data. Pricing questions are answered from `pricing.repricing`
  and `pricing.materialMoves` (see "Pricing and the AI").
- **Not built yet:** answers about customers beyond the top 10 per list and the
  ones named in the question.

## Pricing and the AI (built)

The pricing calculations (`utils/pricing.ts`) are plain arithmetic; the AI only
explains their results, through the same figure registry as everything else.

- **Snapshot `pricing`** (optional, so older snapshots validate; shape-checked in
  `lib/briefingRoutes.validatePricing`). `repricing`: up to 5 menu items whose margin
  slipped since pricing or is under a target the owner set: the margin then and now,
  the ingredient whose price rose most (never a recipe edit) and by how much, and a
  price that restores the margin. `materialMoves`: up to 6 ingredients whose purchase
  price moved by 2% or more over 30 days (else 90), only where a purchase old enough
  exists to compare with. As of today, whatever period is asked about. Both are built
  by `buildBusinessSnapshot` (it takes the `priceLog`). The old note "price-change
  data is not available yet" is gone.
- **Briefing.** Two new attention kinds, `reprice` and `price_move`. The code-built
  version (`buildDeterministicBriefing`) now raises the worst repricing item ("Butter
  Cake margin is down from 83% to 70%, with Butter up +67%. A price of ₹450 would
  restore it.") after pre-orders, and an ingredient that got dearer, in words that
  need no digits ("in the last month"/"in the last quarter"). The model is told what
  each kind is built from and may only quote a suggested price through its figure.
- **The what-if "tool".** `run_pricing_scenario` is a round trip through the same
  route, not an Anthropic tool-use call, so it reuses the structured output, the
  validator and the gate:
  1. The reply schema is `{ answer: string | null, scenario: {...} | null }`; exactly
     one is set. For "what if I raise prices 8%?" the model sets `scenario`:
     `products` (`item_...` name ids from the snapshot, or `["ALL"]`), and exactly one
     of `changePercent` / `newPrice`, plus an optional `salesChangePercent`.
  2. `validateScenarioRequest` checks it, because the model must not do arithmetic or
     invent a number: every number must be written in the question (digits or words),
     with the sign the words around it imply ("cut ... 10%" is negative; checked per
     number, so "raise 8% and sales drop 5%" is read correctly); products must be ones
     the snapshot names; a new price is for exactly one product. It is refused if the
     snapshot already holds a result, so the model cannot ask forever. It gets the
     usual one retry, then `unverified`.
  3. The route returns `{ scenario }` instead of `{ answer }`. The browser (`AskBusiness`)
     turns it into price changes (`scenarioChanges`), runs `pricingScenario` on the
     device's own data, turns the result into figures (`buildScenarioSection`: the
     assumptions, the biggest items, the totals, the break-even) and asks again with
     them in `pricing.scenario` (`withScenario`). The model then explains it, and may
     only use those figures.
  4. Under the answer the app prints what was assumed (`describeScenario`, built by
     code: "Assumed: prices +8% on all items, sales unchanged, from 30 days of real
     sales"), so the owner can check it whatever the wording.
  A what-if costs two chat uses (each request is counted, so the daily cap cannot be
  bypassed by a client claiming to be a follow-up).

## Order parsing (built)

The Add Order form has a "Fill from a message" box, shown only when
`GET /api/ai/status` says AI is available (never in the demo). The owner pastes a
customer's WhatsApp message and presses "Fill the form"; the form is pre-filled and
**nothing is saved until the owner checks it and presses Add Order**. There is no
separate "Quick Log" screen in the app, so the Add Order form is where it lives. It
also gained an optional delivery address, which is saved on every item of the order
(`addOrderGroup`'s `deliveryAddress`). The Log Production Run form has the same
thing ("Production runs" below).

- **Privacy** (`utils/aiPrivacy.ts`, `utils/orderParse.ts`). In the browser, before
  anything is sent: phone numbers become `[phone]` (and the first one is kept to
  fill the Phone field), and the names of customers the app already knows become
  their label. So the server and the model never see a phone number or a known
  customer's name. What does reach the model is what the message itself holds: the
  name of a customer who is not yet known and the delivery address. Reading those is
  the point of the feature, and the owner is told what is not sent.
- **What the model returns** (`ORDER_SCHEMA`, `POST /api/ai/parse-order`, one
  `parse` use, 30 a day, `AI_PARSE_DAILY_LIMIT`): the items (as written, the menu id
  it means or null, a quantity), a customer label or name, the phrase for the date as
  written, a delivery address, whether it is paid or to be paid later, how, and a
  discount amount or percentage. Every field is present; "not said" is null.
- **It never invents.** `validateParsedOrder` rejects the answer, and the model is
  asked once more with the problems listed, if: a quantity is not written in the
  message (digits, words, "a dozen", "half a dozen", "2 dozen" is 24; one is always
  allowed); an item name, customer name, date phrase or address is not text from the
  message; a menu id is not on the menu; a discount is not a number written in the
  message. If it still fails nothing is returned and the owner fills the form by hand.
- **Financial truth.** The model does no money maths. A percentage discount is turned
  into an amount in the browser from the order's own value (`buildOrderForm`), and a
  discount is capped at the order's value. The date is not worked out by the model:
  it returns the phrase and `resolveWhen` (today, tomorrow, weekday names, "12 Oct",
  "12/10", day first) works it out in the business's own time zone, or the form says
  it could not tell.
- **Matching.** A known customer is matched on the device by label and their name and
  phone come from their own record. An item the model could not match is shown as
  "Couldn't find 'croisant' on the menu", with the closest menu item as a suggestion
  (`suggestMenuItem`) that is only used if the owner accepts it. Stock is still a hard
  cap when the order is saved.

## Pre-orders and the AI (built)

- **Figures.** Every figure handed to the model is an actual one (due today or earlier,
  not cancelled). The snapshot's `preorders` section carries what is booked ahead: the
  open pre-orders due today and tomorrow (orders and units per item, top
  `SNAPSHOT_LIMITS.preorderItems` items) and the booked-for-later total, all registered
  as figures so text uses tokens, never digits. A kept advance is a profit driver.
- **Briefing.** A deterministic line comes first: "Pre-orders due today/tomorrow:
  {{fig}} {{name}}...". The model only adds words around it.
- **Order parsing.** The parser also returns `notes` and `advanceAmount`; like every field
  both must appear in the message. A future date switches the form to Pre-order; the
  browser resolves the date. Nothing is saved until the owner presses the button.

## Production-run parsing (built)

The Log Production Run form has a "Fill from a note" box, shown only when AI is
available (never in the demo): the owner types or pastes "Made 40 croissants and 24
muffins this morning, 3 croissants burnt" and presses "Fill the form". **Nothing is
saved until the owner checks it and presses Log Run.** It is order parsing's
counterpart (`POST /api/ai/parse-production-run`, `utils/productionParse.ts`,
`lib/productionParse{Prompt,Model,Routes}.ts`, `hooks/useProductionParser.ts`) and
counts as one `parse` use (30 a day, `AI_PARSE_DAILY_LIMIT`).

- **What the model returns** (`PRODUCTION_SCHEMA`): the items made (as written, the
  menu id it means or null, a quantity, and the waste written for that item or null), the
  phrase for when it was made, and notes. Every field is present; "not said" is null.
- **It never invents, and never assumes a quantity.** `validateParsedProduction`
  rejects the answer (the model is asked once more with the problems listed) if: a
  quantity is not written in the note (digits, words, "half a dozen", "2 dozen" is 24;
  unlike an order, a bare "croissants" is not one: one needs "a croissant", "one" or
  "1"); a waste figure is not written or is more than was made; a name, date phrase or
  note is not text from the note; an id is not on the menu. If it still fails nothing
  is returned and the owner fills the form by hand.
- **Financial truth.** The model does no sums. Waste is only the number the note
  states; the sellable yield is **worked out in the browser** as made minus waste, and
  only for a single item (the form's yield section is single-item only). With several
  items, per-item waste cannot be entered, so it is listed by name with "record it with
  Discard in the Production Log". The date is not worked out by the model:
  `resolveProductionDate` reads the phrase as a past date (today, "this morning",
  yesterday, "last night", the most recent weekday, "3 Oct"); a future date ("tomorrow")
  is "couldn't tell the date", never guessed. Material cost is the form's own live
  calculation as always.
- **Matching.** An item the model could not match shows as "Couldn't find 'croisant' on
  the menu", with the closest menu item as a suggestion (`suggestMenuItem`) that is
  applied only if the owner clicks it; until then the row is left empty to choose from.
- **Privacy.** Phone numbers are removed in the browser before sending; no customer
  data is involved.

## Delivery plan

1. Customer insights, time zone setting, design doc (built).
2. Shared plumbing: Anthropic client, the gate and usage caps, rules for the
   server-written `briefings` collection, the business snapshot with the figure
   registry, and the text guard (built). No user-facing AI yet.
3. Daily briefing (with the canned demo sample) (built).
4. Ask Your Business (built), and its what-if tool with the pricing work (built).
5. Order parsing in the Add Order form, with a delivery address (built).
6. Reorder-point suggestions, then the briefing's stock items (built).

7. Pricing in the AI: repricing alerts and ingredient price moves in the snapshot,
   the briefing's `reprice` and `price_move` items, and the chat's what-if (built).

8. Production-run parsing (`parse-production-run`) (built).

The AI list in the handoff is now complete.

## Operational

- `ANTHROPIC_API_KEY`, `AI_FEATURES_ENABLED` and the limits are server
  environment variables. The handoff says "Render"; nothing in the repository
  names the host, so set them wherever the server runs.
- `ANTHROPIC_WORKSPACE_ID`: only for an API key that is not created inside a
  workspace. Anthropic then rejects every call with "This API key is not scoped
  to a workspace" until the request names one, which this variable does (the
  `anthropic-workspace-id` header). A key created inside a workspace needs it
  not.
- Prepaid credits: set a monthly spend limit and a low-balance alert in the
  Anthropic Console.
