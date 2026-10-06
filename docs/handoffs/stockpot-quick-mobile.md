# Handoff: Stockpot Quick — Android & iOS companion app

**Status:** Planned, not started. **Replaces `mobile-app-handoff.md`** (that file is not in the repo), which assumed a full port of the web app. **Read the "Review notes" at the end first:** they record what was checked against the code and the screen designs, and the points still to decide. The owner has since decided the phone app is a *quick-capture companion*: a few fast actions, mostly by voice, feeding the same account the web app uses. Everything else stays in the web app.

**Read first:** `server.ts` (route wiring, `requireAuth`, `requireCsrf`, the AI guard and daily caps), `lib/auth.ts`, `lib/csrf.ts`, `lib/orderParseRoutes.ts` + `src/utils/orderParse.ts`, `lib/productionParseRoutes.ts` + `src/utils/productionParse.ts`, `src/hooks/useOrderActions.ts` (`addOrderGroup`, `fulfillOrder`), `src/hooks/useInventoryActions.ts` (`handleRestock`), `src/hooks/useProductionActions.ts` (`logProductionRunSession`), `src/utils/orderPricing.ts`, `src/utils/preorders.ts`, `src/utils/priceLog.ts`, `src/utils/profit.ts`, `src/utils/reorder.ts`, `lib/billStore.ts` (an example of the server importing pure `src/utils` code), and `docs/PROJECT_STATE.md`.

---

## What it is

The owner's **daily cockpit** for the moments their hands are busy: at the counter, at the oven, at the wholesale market. The home screen shows what needs attention; one big mic ("Tell Stockpot what happened") takes a plain-language description; Stockpot works out what kind of entry it is, asks if anything is unclear, shows what it understood, and the owner saves. It lands in the same Firestore account, so the web app shows it immediately through its existing live listeners.

**Trust rule: Stockpot interprets. The owner confirms.** It never fills in a value the owner didn't say unless it comes from the owner's own data (a menu price, a material's unit), and then it's labelled as such.

| Kind | Example | Becomes |
| --- | --- | --- |
| **New order** | "Priya, two chocolate truffle cakes for Saturday evening, five hundred advance on UPI" | An order (from stock or a pre-order), exactly as Add Order would create it |
| **Stock in** | "Bought five kilo maida for four fifty and two litres milk for one twenty" | A restock per material: stock, moving-average cost and price log updated |
| **Production** | "Made twenty four butter croissants and two sourdough" | A production run: ingredients deducted, finished stock added |
| **Payment** | "Priya paid the remaining thirteen hundred by UPI" | Her unpaid order(s) marked paid with the method, as Mark paid does on the web |

Plus read-only screens **Today** (the cockpit) and **Upcoming**, and push **notifications** for low stock, use-by dates and tomorrow's pre-orders. Anything else shows an "Open in web app" link. Launch with these four kinds only; the owner shouldn't have to learn a command language, and more kinds can be added later without changing how the app is used.

---

## Decisions

1. **Companion, not a port.** Build a new Expo app in a new `mobile/` folder. Don't extend `bakery-mobile/`: it is an unused, single-file prototype whose types and logic have drifted from the web app (see `mobile-app-handoff.md`). Delete `bakery-mobile/` once Stockpot Quick ships.

2. **Every write goes through new server endpoints; the app has no Firestore write code.**
   - A phone app can't be fixed instantly: store review and slow user updates mean a bug in on-device business logic lives for weeks. Server logic is fixed with one deploy.
   - Stock caps (a from-stock order can't take more than is baked) are checked against live data inside a Firestore transaction, not against whatever the phone loaded earlier.
   - The endpoints must reuse the web app's logic, not re-create it (see "Shared logic" below).
   - The app reads only what its two screens need, also through the server.

3. **Voice is recognised on the phone**, with [`expo-speech-recognition`](https://github.com/jamsch/expo-speech-recognition) (the system recogniser: Apple Speech on iOS, Google on Android). Free, fast, no audio sent to Stockpot.
   - Default language `en-IN`; a Settings switch for `hi-IN`. Hinglish usually comes through as mixed text; the owner can always edit the transcript before it's read.
   - Request on-device recognition where the OS offers it (`requiresOnDeviceRecognition` on iOS). Where it doesn't, the phone's own recogniser may use Apple's or Google's servers — say so in the privacy text, and never claim "audio never leaves the phone" unconditionally.
   - The package needs a development build (EAS); it does not run in Expo Go.
   - Typing is always available in the same box. Voice is a faster way to fill the text box, nothing more.

4. **The text is read by the existing AI readers.** Orders use the same model, prompt and validation as the web's pasted-message reader (`parse-order`); Production uses `parse-production-run`. "Stock in" and "Payment" need new readers built the same way. Same daily caps, same rule: every quantity, price and name must appear in the text or come from the owner's own data, or it becomes a question. Nothing saves until the owner confirms.

5. **One mic, plus shortcuts.** The big mic sends the text without a kind; the reader returns the kind it detected along with the draft (same AI call, no extra cost). If it can't tell, that's a question like any other ("Is this an order or a payment?"). The four shortcut chips send the kind up front, skipping detection.

6. **Ask, never guess.** The reader returns `questions[]` alongside the draft whenever something required is missing or ambiguous. The app shows them one at a time (tappable options, or a typed/spoken answer), then re-validates. Ask when:
   - an item matches more than one menu item or material ("Butter Croissant or Chocolate Croissant?");
   - an item isn't on the menu and no price was said ("Custom cake isn't on your menu. What's the price per cake?");
   - two customers share the name ("Priya Sharma or Priya Nair?");
   - a quantity, amount or payment method is missing;
   - a date is vague ("next week — which day?");
   - a payment doesn't match what the customer owes (see Payment below).

   Don't ask when the owner's own data answers it: a menu item's price comes from the menu (shown with a "MENU PRICE" tag), a material's unit from the material. Saying "two chocolate truffle cakes" doesn't need a price question, because the menu has one.

7. **Same sign-in, same account.** Firebase Auth from the same project, with persistence through AsyncStorage (`initializeAuth` + `getReactNativePersistence`). Email/password first. Google sign-in needs native configuration in the dev build; add it once the rest works.

---

## Shared logic (do this first)

Today the write logic lives inside React hooks that call the Firestore client SDK. The server can't import those. The server *can* import pure modules from `src/utils` (as `lib/billStore.ts` already does with `billing.ts`).

Extract each action into a pure **plan** function: given the current documents and the owner's input, it validates and returns the exact documents to write (or a clear error). No Firebase, no React.

| Plan function | Extracted from | Covers |
| --- | --- | --- |
| `planOrderGroup` | `addOrderGroup` | From-stock cap, pre-order (no stock claim), price/cost stamps, custom line prices, advance, discount, delivery address, `bookedOn` |
| `planHandOver` | `fulfillOrder` | Pre-order stock claim (whole group or nothing), cost re-stamp keeping the booked price, balance due |
| `planRestock` | `handleRestock` | Unit conversion (g/kg), MAC, `priceLog` entry, expiry |
| `planProductionRun` | `logProductionRunSession` | Ingredient deduction, finished stock, batch and expiry |

Then:
- **Web hooks** call the plan function and commit its writes with the client SDK (behaviour unchanged).
- **Server endpoints** call the same plan function inside a Firestore Admin **transaction** (read the documents, plan, write), so the stock check and the write can't be separated by another order.
- **Tests:** for each action, the same input produces identical documents through the hook path and the server path.

This refactor is the main risk in the whole project; do it with the existing tests green before adding any endpoint.

---

## Server: the quick-actions API

All under the authenticated `api` router (`requireAuth`, Bearer Firebase ID token). Every POST takes an **`Idempotency-Key`** header (a UUID the app generates per confirm tap): phones retry on flaky networks, and a retried "save order" must never create a second order. Store used keys per user for 24 hours.

| Endpoint | Does |
| --- | --- |
| `GET /api/mobile/today` | Figures for the Today screen, computed with `profit.ts`, `preorders.ts`, `reorder.ts`, `payments.ts`: sales and true profit today; pre-orders due today and tomorrow (items × quantities); low-stock and reorder count; pending payments total |
| `GET /api/mobile/upcoming` | Open pre-orders due from today on, soonest first: customer, items, slot, notes, advance, balance |
| `POST /api/mobile/parse` | `{ kind?: 'order' \| 'restock' \| 'production' \| 'payment', text, answers?: { questionId, value }[] }` → `{ kind, draft, questions[] }`. Without `kind`, the reader detects it. Does the same preparation the web does in the browser (strip phone numbers and known customer names before the AI call; resolve dates in the business time zone) and the same validation. Answers are applied in code, then the draft is re-validated; an empty `questions[]` means the draft is ready to confirm |
| `POST /api/mobile/orders` | The confirmed draft → `planOrderGroup` in a transaction |
| `POST /api/mobile/restocks` | Confirmed lines → `planRestock` per line, one transaction |
| `POST /api/mobile/production-runs` | Confirmed draft → `planProductionRun` |
| `POST /api/mobile/orders/:id/hand-over` | `planHandOver`; returns the balance due and the public bill link (`billStore`) for sharing |
| `POST /api/mobile/payments` | `{ customerKey, amount, method }` → marks that customer's unpaid orders paid, oldest first, with the method's fee rate, exactly as the web's Mark paid does. Must cover whole orders (see Payment rules) |
| `POST /api/mobile/push-token` | Saves the device's Expo push token and notification settings for this user |

**New AI reader for "Stock in":** `lib/restockParseModel.ts` / `restockParsePrompt.ts` / `restockParseRoutes.ts`, mirroring the order and production readers. Output per line: material (matched against the owner's materials), quantity, unit, total price paid. Every number must appear in the text; an unknown material is flagged ("add it in the web app first"), never created.

**CSRF:** the web's double-submit check exists because browsers attach cookies automatically. The app authenticates with a Bearer token it holds itself, which a third-party site can't make it send, so the `/api/mobile/*` routes don't take `requireCsrf`. Keep CSRF exactly as it is on every existing route.

### Payment rules

Orders today are either paid or unpaid; there is no part-payment (an advance on a pre-order is the only split). So in this version:

- A spoken amount must equal what the customer owes for one or more whole unpaid orders, oldest first. Then those orders are marked paid.
- Anything else becomes a question, never a guess: "Priya owes ₹1,300 for one order. ₹700 doesn't cover it. Check the amount?"
- True part-payments need a data-model change in the web app first (a payments list per order). Treat that as a separate, later feature.

### Notifications

- **Delivery:** Expo push notifications (`expo-notifications`) using the device token saved by `/api/mobile/push-token`. Needs the development/store build, like the speech package.
- **Sending:** a scheduled server job every 15 minutes (a Render Cron Job, or an external scheduler calling a secret-protected endpoint). It sends each user's notifications at their chosen time in the business time zone.
- **What it sends, by default:**
  - **Morning summary** (default 8:00 am): due today, payments pending, anything running low or near its use-by date, in one notification.
  - **Running low:** once, when a material newly drops below its low-stock % or `reorder.ts` says it runs out within its lead time. Not repeated daily for the same material. Action button: Stock in.
  - **Use-by soon:** raw materials and finished batches whose expiry is within 2 days (`expiryDate`, batches, `stockAging.ts`). Action button: See items.
  - **Due tomorrow** (optional, evening): tomorrow's pre-orders as items and quantities.
- **Settings:** a switch per type and the summary time, stored per user. Off switches are respected server-side.
- **Never more than one notification of each type per day per user.** Tapping opens the matching screen.

---

## The app

**Stack:** Expo (current SDK) + React Native + TypeScript, Expo Router, EAS Build for development and store builds, Firebase JS SDK for auth only, `expo-speech-recognition`, the app's colours and fonts (Manrope, JetBrains Mono) from the web.

### Screens

1. **Sign in.** Email/password (Google later). "Open the demo kitchen" link as on the web.
2. **Today** (the cockpit).
   - Up to five **status lines** with coloured dots, most urgent first, each opening where the problem is: orders due today (coral), payments pending (amber), running low (amber), use-by soon (amber), today's true profit (green).
   - The big mic, **"Tell Stockpot what happened"**, then four shortcut chips: **New order · Stock in · Production · Payment**.
   - Pull to refresh. "All clear" line when nothing needs attention.
3. **Capture** (one screen).
   - Tap-to-talk mic above an editable text box that fills as the owner speaks. **Read it** sends the text to `/api/mobile/parse`.
   - Clear states: listening, reading, couldn't read it (with the reason).
4. **Questions**, only when `questions[]` isn't empty: one card at a time, the unclear words quoted, answers as tappable chips or a typed/spoken reply.
5. **Confirm.** The draft as an editable form, the same fields the web form shows.
   - **Order:** customer (past customers suggested), lines with prices (menu prices tagged), pre-order date and slot, advance and method, discount.
   - **Stock in:** material, quantity, unit and price per line.
   - **Production:** item and quantity per line, with a warning if an ingredient would run short.
   - **Payment:** customer, what they owe and for which orders, amount and method.
   - **Save** posts with an idempotency key; on success, a short summary ("Order saved — balance ₹1,300") and back to Today.
6. **Upcoming.** Pre-orders grouped by date. Each row: **Hand over** (shows the balance; then offers to share the bill link on WhatsApp via the system share sheet) and **Send confirmation** (WhatsApp share with the existing confirmation text).

### Behaviour

- **Drafts survive.** If the app is closed or the network drops before Save, the transcript and draft are kept on the device (AsyncStorage) and offered again on next open. No silent background sending in this version.
- **Online required to save.** Show a clear "No connection — your draft is kept" state. (A true offline queue is phase 2.)
- **Permissions:** microphone and speech recognition, requested the first time the mic is tapped, with plain usage strings ("Stockpot uses the microphone so you can say an order instead of typing it").
- **Figures always come from the server.** The app never computes money itself.

---

## Phase 2 (not in this handoff's scope)

Add new kinds one at a time, each through the same mic and the same ask-then-confirm flow:

- **Waste:** "Threw away six croissants" (the web's wastage log already exists).
- **Stock adjustment:** "Found two kilos of flour in the other cupboard" (a stock correction, not a purchase: no price-log entry).
- **Expense:** "Paid ₹850 for electricity" (needs a one-off expenses feature in the web app first; today only fixed monthly costs exist).
- **Part-payments** (needs the payments-list data change described above).
- **Customer follow-up:** "Remind Priya tomorrow about her cake" (a reminder notification to the owner).

Also later: a real offline queue, and home-screen quick actions (long-press the icon → New order).

---

## Release

- **Accounts:** a Google Play developer account and an Apple Developer Program membership (check their current fees). Both stores need a privacy policy URL; extend the existing Privacy page to cover the app.
- **App IDs:** e.g. `com.stockpot.quick` on both stores (decide once; it can't change later).
- **Store privacy forms:** declare speech recognition and microphone use; no audio stored; account data shared with the Stockpot server only; AI reading done by Anthropic on text (no phone numbers sent).
- **Platforms:** one Expo / React Native codebase builds both the Android and the iOS app, so the iOS release later is mostly store work, not a rewrite. For iOS: an Apple Developer Program membership; Sign in with Apple must be offered if the app offers Google sign-in (email and password alone does not need it); the sign-up and upgrade screens must not link out to buy a subscription from inside the iOS app unless Apple's current rules allow it (see the App Store link risk in the review notes); speech recognition needs the microphone and speech permissions with their usage strings; push needs an APNs key in EAS. The first release can be Android only.
- **Builds:** EAS development builds for testing on real phones; internal testing track (Play) and TestFlight (iOS) before public release.

---

## Things to get right

- **One set of business rules.** Plan functions are shared; neither the server nor the app re-implements stock, MAC, stamps, pre-orders or advances.
- **No duplicate writes.** Idempotency keys on every POST; the Save button disables after the first tap.
- **Nothing saves without the confirm screen**, and nothing the reader didn't find in the text is filled in.
- **The web app shows phone-made changes live** with no web changes needed beyond the shared-logic refactor.
- **Honest privacy text** about where speech recognition happens.
- **Business time zone** for "today", "tomorrow" and spoken dates ("Saturday").

---

## Verification checklist

- Web: all existing tests pass after the plan-function refactor; new tests show hook path and server path write identical documents for each action.
- Server tests: each `/api/mobile/*` route rejects a missing or invalid token; a repeated `Idempotency-Key` returns the first result without writing again; a from-stock order beyond stock is refused inside the transaction; the restock reader rejects a number not in the text and flags an unknown material; daily AI caps apply to `/api/mobile/parse`.
- App: `tsc` clean; runs on a real Android phone and iPhone via a development build.
- Manual, on both phones:
  - Say a pre-order in English and in Hinglish → correct draft → save → it appears in the web app's Upcoming list within seconds.
  - Say a restock → the material's stock, cost and price history update in the web app.
  - Say a bake → ingredients drop and finished stock rises in the web app.
  - Turn off the network before Save → the draft is kept and offered again.
  - Hand over a pre-order with an advance → the balance shown matches the web; the shared bill link opens the public bill.
  - "Made twenty four croissants" with two croissant recipes → asks which; "two custom cakes" not on the menu → asks the price; "two chocolate truffle cakes" → no question, menu price tagged.
  - Say a payment that matches what's owed → orders marked paid in the web app; say one that doesn't → a question, nothing saved.
  - Use the big mic without a shortcut for each of the four kinds → the right kind is detected.
  - Notifications: the morning summary arrives at the set time; a material crossing its low-stock level triggers one alert, not one a day; switching a type off stops it.


---

## Review notes (2026-10-06)

Added after this handoff was checked against the code and against the Stitch screen designs
(`stitch_stockpot_quick_app_design.zip`, 15 screens plus `DESIGN.md`; six of the preview images came
through blank, so those screens were read from their HTML). The text above is unchanged.

### A. Checked against the code

**Confirmed as written:** every file and function named under "Read first" exists (`addOrderGroup`,
`fulfillOrder`, `handleRestock`, `logProductionRunSession`, `payments.ts`, `stockAging.ts`, `billStore.ts`).
`lib/billStore.ts` does import pure `src/utils` code, so the server-imports-shared-logic approach has a
precedent. `requireCsrf` is applied per route in `server.ts`, so leaving it off `/api/mobile/*` is simple.
`bakery-mobile/` exists as described (one commit, a 1,565-line `App.tsx`). The payment rules match the web:
Mark paid is `markOrdersPaid` plus the method's fee rate, a pre-order due later is not listed as owed, and
what a customer owes is the total less any advance.

**Found and fixed already:** one production session with two items sharing an ingredient took off only the
last item's use of it (flour 1,000 g, 200 g and 100 g used, ended at 900 g, not 700 g). The same affected
an item entered twice, an ingredient listed twice in one recipe, and deleting a whole session. Fixed in
PR #59. What it means for the plan functions: `deductIngredients` now returns the materials as they stand
afterwards and writes only `{ initialStock }`, and **`planProductionRun` must plan a whole session against one
live read**, not one row at a time. Sessions logged before the fix may leave ingredient stock reading too high.

**Still to handle in the design:**
1. **Plan functions return field-level changes, not whole documents.** The web hooks read the stock the
   browser has loaded and write `current - requested` (orders, production) or `initialStock + qty`
   (restock). A transaction on the server protects only the server path, so phone and web at the same
   moment can still overwrite each other. Have the plan functions return patches or increments, and have the
   web run the same plan inside a client transaction.
2. **The order reader's preparation runs in the browser today.** Phone numbers and known customer names are
   removed in `src/utils/orderParse.ts` (with `aiPrivacy`), and `parse-order` receives the prepared text plus
   menu ids and names. `/api/mobile/parse` must do this preparation on the server, which needs the customer
   names from past orders.
3. **One shared AI limit.** Orders, production and the two new readers all count against the `parse` limit
   (default 30 a day). Decide whether to raise it or give the phone its own.
4. **Demo accounts are refused AI** (`demo_account`), so the app's "Open the demo kitchen" would show a mic
   that cannot read. Either give it a canned sample, as the web does, or hide the mic there.
5. **Customers are matched by phone (last 10 digits), otherwise by lower-cased name** (`customerKey` in
   `payments.ts`). Two different people with the same name and no phone are one customer, so "Priya Sharma or
   Priya Nair" is only a question when their full names differ.
6. **A production session is not atomic on the web** (each row commits on its own and a retry reuses the
   session id). Decide whether the server saves a session as one transaction or keeps that behaviour.
7. **Ingredient shortfall.** The web neither warns nor blocks when a production run needs more than is in
   stock; stock just goes negative. The warning in this handoff, and the "Produce anyway" choice in the
   design, are new behaviour, not a copy of the web.
8. **Not verified from the repo:** `expo-speech-recognition` exists on npm (v57.1.0 when checked), but its
   on-device option and Android push setup (FCM) need checking in the real build.

### B. Checked against the screen designs

**Consistent with this handoff:** Today (status lines, big mic, four shortcut chips, "All clear"); one
question at a time with "Question 1 of 2"; confirm screens for order, stock in, production and payment;
"Cardamom: not in your materials, add it in the web app first"; the saved summary; Upcoming; the three
notification types plus the morning summary; the key states (microphone permission, couldn't read quantities,
resume an unsaved draft, no pre-orders).

**Where the designs go beyond or against the handoff** (each needs a decision; the recommendation is mine):

| # | Design shows | Problem | Recommendation |
| - | ------------ | ------- | -------------- |
| 1 | "98% / 94% / 100% confidence" on the reading | The readers produce no confidence score, so this would be an invented number, against "interpret, the owner confirms" | Drop it, or show where each value came from ("in your words" / "menu price") |
| 2 | "Save order (Waiting for network)" and Settings → "Offline draft sync / Sync now" | Implies a queue that sends later; this handoff says online is required, the draft is kept, and nothing is sent in the background | **Decided (owner, 2026-10-06): do what this handoff says.** Saving needs a connection; without one the app shows "No connection — your draft is kept" and Save does not send. Change the design: no "Waiting for network" label, no "Offline draft sync / Sync now" setting. The draft still survives closing the app and is offered again on the next open |
| 3 | Chips filling in while the owner speaks ("Streaming audio, auto-parsing") | Would call the AI on partial speech and use the daily limit up fast | Read only when **Read it** is tapped |
| 4 | Figures on the confirm screens: new cost (₹90/kg, was ₹86, +4.6%), "Recipe margins recalculated +₹1.20", the butter shortfall, "Clears her full balance", yield | `/api/mobile/parse` returns only `{ kind, draft, questions[] }` | Return a `preview` with the draft, worked out server-side by a dry run of the plan functions (moving-average cost, `recipesAffectedBy`, stock after, balance after) |
| 5 | The Hand over sheet records the balance as received, with a payment method | The hand-over endpoint takes no payment | Let hand-over take an optional `{ balanceReceived: { method } }` and do both in one transaction |
| 6 | Upcoming has an "Attention needed: due yesterday" group and a **Remind** button | This handoff lists only orders due from today on, and does not say what Remind does | Include overdue open pre-orders; **owner to say what Remind should do** (or drop it) |
| 7 | Notification "Cooling Rack Shelf B2: ready" and "Early Prep Intelligence"; Settings: Bluetooth thermal printer and a second "Daily Kitchen Reminder" | No shelf data exists anywhere; the others are new features, not in scope | Leave all of these out of launch |
| 8 | Sign-in: "Start your free trial on the Stockpot website" | Apple restricts apps that send people elsewhere to buy a subscription | Check Apple's current rules before submitting to the App Store |

Sample figures in the designs (order numbers, a 1 kg tier next to "2 × 0.5 kg") are illustrative; real ones
come from the server.

### C. Decisions

**Decided:** offline saving follows this handoff (online required to save, draft kept, nothing sent in the background; a true offline queue stays phase 2).

**Still open:**

- What Remind does, and whether overdue pre-orders show (item 6).
- Whether `parse` gets its own limit, and what the demo kitchen's mic does (A3, A4).
- Whether a production session saves as one transaction (A6).

### D. Built so far in `/api/mobile/parse` (differs from the spec above)

- **Answering a question does not call the model again.** The first response carries the checked `reading`; the app sends the same `text` back with that `reading` and the `answers`. The server checks the reading against the text again (every quantity and name must still be written in it) and applies the answers in code. So answering is free and cannot change what the message said. A fresh read costs one `parse` use (shared with the web readers).
- **Unknown menu item.** The spec says to ask a price, but an order line must be a menu item (the plan refuses an unknown id). The question is instead "Which menu item is it?" with the closest match and "Leave it out"; any menu id is accepted as the answer. Selling something not on the menu needs adding to the menu in the web app first.
- **Kind detection is by words, not by the model.** Orders, stock bought, something made, payment received each have hint words; when none or two kinds match equally, the response is a `kind` question and nothing is spent. The app's four shortcut chips send `kind` directly.
- **Questions so far (order):** `item:N`, `date`, `payment` (paid by a method, or later), `advance_method`, `advance` (amount, when it is more than the order), `stock` (book it as a pre-order). `preview` has the lines, total, advance and balance due, worked out by the same plan the save runs.
- Restock, payment and production readers are not built yet: those kinds answer 501 `kind_not_ready`.
