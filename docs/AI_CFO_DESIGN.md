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
- Not yet: order parsing (the briefing and the chat are below).

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
  and the question as data. Price-change advice, ingredient price trends and
  what-if calculations say they are not available yet until Phase 2.
- **Not built yet:** the `run_pricing_scenario` tool (Phase 2), and answers about
  customers beyond the top 10 per list and the ones named in the question.

## Delivery plan

1. Customer insights, time zone setting, design doc (built).
2. Shared plumbing: Anthropic client, the gate and usage caps, rules for the
   server-written `briefings` collection, the business snapshot with the figure
   registry, and the text guard (built). No user-facing AI yet.
3. Daily briefing (with the canned demo sample) (built).
4. Ask Your Business (without the what-if tool until Phase 2 exists) (built).
5. Order parsing in Quick Log (the Add Order form also needs a delivery address).
6. Reorder-point suggestions, then the briefing's stock items.

Deferred: everything that needs Phase 2 (`pricing.ts`): repricing alerts, price
drift and the what-if tool. The price log (shipped) gives `materialPriceMoves`
only once a material has two or more entries.

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
