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
   only those accounts may use AI, whatever their billing status. This is how it
   is tried during the trial without opening it to every signup.
3. Billing: the user's status must be active or trialing
   (`subscriptionStore.hasActiveAccess`). When `BILLING_DISABLED=true` (trial
   mode) everyone counts as active, so billing alone cannot be the gate in trial.
4. Demo accounts (email `demo_<digits>_<digits>@bettereat.com`) are refused
   whatever else is true: they are real, open-signup accounts. They use the
   canned sample in the client and never reach the model.
5. Daily caps, counted in Firestore by the server (Admin SDK, not reachable by
   clients): per feature per user (`AI_CHAT_DAILY_LIMIT` default 30,
   `AI_BRIEFING_REFRESH_DAILY_LIMIT` default 3, `AI_PARSE_DAILY_LIMIT` default
   30) and a global daily ceiling (`AI_GLOBAL_DAILY_LIMIT`, default 1500 calls).
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

## Reorder-point suggestions (Feature 5): proposed rules, not yet built

The original handoff only says "unchanged from the first version", and that
text is not in the repository, so these rules are proposed here first. Pure
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

**Tests to write with it:** a steady-use material flagged exactly at lead plus
safety days; a busy last week raising the rate; fewer than 7 days of history
giving no suggestion; unit conversion (a recipe in g, stock in kg); a discard
counted as use; a restock not counted; R&D excluded; stock already at the
threshold labelled `at_threshold`; zero or negative stock; zero usage; the quantity
rounding.

## Delivery plan

1. Customer insights, time zone setting, design doc (this change).
2. Shared plumbing: Anthropic client, the gate and usage caps, rules for the
   server-written `briefings` collection, the business snapshot with the figure
   registry, and the text guard. No user-facing AI yet.
3. Daily briefing (with the canned demo sample).
4. Ask Your Business (without the what-if tool until Phase 2 exists).
5. Order parsing in Quick Log (the Add Order form also needs a delivery address).
6. Reorder-point suggestions, then the briefing's stock items.

Deferred: everything that needs Phase 2 (`pricing.ts`): repricing alerts, price
drift and the what-if tool. The price log (shipped) gives `materialPriceMoves`
only once a material has two or more entries.

## Operational

- `ANTHROPIC_API_KEY`, `AI_FEATURES_ENABLED` and the limits are server
  environment variables. The handoff says "Render"; nothing in the repository
  names the host, so set them wherever the server runs.
- Prepaid credits: set a monthly spend limit and a low-balance alert in the
  Anthropic Console.
