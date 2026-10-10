# 8. The phone app: Stockpot Quick (`mobile/` and `/api/mobile/*`)

Stockpot Quick is a phone companion for the owner who is on their feet: say or type what happened ("Priya paid the
remaining thirteen hundred by UPI"), the app reads it, asks what is unclear, shows what it will save, and saves to the same
account the web app uses. One Expo / React Native codebase; Android first, iOS later. Specs and the decisions the owner made are
in [`docs/handoffs/stockpot-quick-mobile.md`](../handoffs/stockpot-quick-mobile.md) (read its "Review notes" first);
running and building the app is in [`mobile/README.md`](../../mobile/README.md).

## The principle that explains the design

**The app never works out money and never touches Firestore.** It signs in with Firebase Authentication (for an ID token),
then everything goes through the server's `/api/mobile/*` endpoints. Every figure on screen was computed by the server, with
the same functions the web uses. This is why the phone and the web cannot disagree, and why a bug fix in `src/utils/` fixes both.

The one piece of server code the app runs is `src/utils/money.ts` (how an amount is written: `₹12,00,000`, paise only when there
are some). Types come from `src/utils/quickApiTypes.ts` (types only, erased at build time). `mobile/metro.config.js` lets Metro read
`../src/utils`. **Keep those two files free of imports**; Metro bundles them into the app.

## Mobile code layout (`mobile/`)

```
mobile/
  app.json, app.config.js   Expo config; app.config.js adds the local-only parts (google-services.json, EAS project id)
  metro.config.js           lets Metro read ../src/utils
  .env.example              EXPO_PUBLIC_API_URL, EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, EXPO_PUBLIC_EAS_PROJECT_ID
  src/
    app/                    Screens (Expo Router: every file is a route)
      _layout.tsx           Providers, fonts, auth gate
      sign-in.tsx           Email/password, Google (Android), password reset, "demo kitchen"
      capture.tsx           Write/say → questions → confirm → saved
      (tabs)/index.tsx      Today
      (tabs)/upcoming.tsx   Upcoming pre-orders and Payments due
      (tabs)/settings.tsx   Account, notification choices, voice, sign out
    components/             Cards, buttons, sheets (HandOverSheet, PaymentDueCard, ToCollectCard, confirm.tsx, QuestionCard...)
    lib/                    Plain logic with no React Native, unit tested; plus the hooks that run it
    auth/AuthContext.tsx    Who is signed in, the API client that speaks as them
    theme/                  Colours, fonts, spacing (from the Stitch design system)
    firebase.ts             Firebase app/auth init for the phone
  scripts/                  Icon generator (Python, Pillow)
```

**`lib/` is the heart.** Keep logic there as plain functions/reducers with no React Native imports, so it runs under Vitest in
CI. Key files:

| File | Does |
|---|---|
| `api.ts` | `fetch` wrapper: base URL + Bearer token, timeouts, `ApiError(status, code, message)` (status 0 = could not reach the server), `Idempotency-Key` on POSTs |
| `capture.ts` | The reducer for one entry from first word to saved summary (see below) |
| `useCapture.ts` | Runs the reducer against the server and keeps the unsaved entry on the device |
| `draftStore.ts` | Saves an unsaved entry (AsyncStorage, 3 days) so closing the app does not lose it. Nothing is ever sent in the background |
| `useApiView.ts` | Loads a GET view (Today, Upcoming, Payments due) with refresh |
| `voice.ts`, `useVoiceInput.ts` | Speech to text (`expo-speech-recognition`, `en-IN`); partial/final results merged into the text box |
| `voiceHints.ts`, `useVoiceHints.ts` | Menu/material words fetched from `/api/mobile/speech-phrases`, cached 10 minutes, cleared on sign-out |
| `push.ts`, `notifications.ts`, `useNotificationSettings.ts` | Push registration and the notification choices |
| `savedSummary.ts`, `readingLabel.ts`, `upcoming.ts`, `paymentsDue.ts`, `handOver.ts`, `invoice.ts`, `share.ts` | Turning server answers into what the screens show; opening WhatsApp or the share sheet |
| `googleSignIn.ts`, `authErrors.ts` | Native Google sign-in and friendly sign-in errors |

## The capture flow

`capture.ts` is a reducer with these rules:

- The owner writes or speaks text; **Read it** sends `POST /api/mobile/parse` with `{text, kind?}`. A fresh read throws away any earlier
  reading and answers and costs one of the 60 daily readings (`AI_QUICK_DAILY_LIMIT`).
- The server answers with `{kind, draft, questions, notes, preview?, reading, currency, remaining}`.
- Each **question** (`choice`, `date`, `amount`) is answered one at a time. Answering sends the server's earlier `reading` back
  with the answers, so it costs nothing and cannot change what was said.
- When `questions` is empty, the confirm screen for the kind shows the server's `preview` (lines, totals, balance, stock after,
  etc.). There are no freely editable money fields (a decision): "Change what I said" returns to the words.
- **Save** posts the draft to the matching endpoint with a **new idempotency key per draft**; a retry of the same Save reuses the key,
  so a flaky connection can never save an order twice, and an edited draft can never be mistaken for the one already saved.
- Saving needs a connection (decided: no offline queue in v1). Without one the app says "No connection — your draft is kept".

## Endpoints (`server.ts` → `lib/quickRoutes.ts`, `lib/quickParseRoutes.ts`)

All need a Bearer ID token and pass `quickGate` (a plan, if the paywall applies to the account) unless noted. **No CSRF.** Every POST
needs an `Idempotency-Key`. Shapes are in `src/utils/quickApiTypes.ts`.

| Endpoint | Purpose | Answer |
|---|---|---|
| `POST /mobile/parse` | Read text into a draft for one of four kinds: `order`, `restock`, `production`, `payment` | `ParseResponse` |
| `POST /mobile/orders` | Save an order (new, or pre-order with optional advance) via `planOrderGroup` | `OrderSaved` (201) |
| `POST /mobile/restocks` | Stock bought, via `planRestock` | `RestockSaved` |
| `POST /mobile/production-runs` | Something made, via `planProductionSession` | `ProductionSaved` |
| `POST /mobile/orders/:id/hand-over` | Hand a pre-order over; optionally record the balance as received | `HandOverSaved` |
| `POST /mobile/orders/:id/invoice` | Build the invoice and public bill link, ready to send | `InvoiceResponse` (message, `whatsappUrl`) |
| `POST /mobile/payments` | Record a payment against a customer's whole orders (must equal what whole orders are owed) | `PaymentSaved` |
| `POST /mobile/payments/statement` | Statement or invoice for one customer's unpaid orders | `StatementResponse` |
| `POST /mobile/payments/claim` | Confirm (paid by UPI) or dismiss a customer's "I've paid by UPI" from the bill page | `ClaimReviewSaved` |
| `GET /mobile/payments-due` | Everyone who owes, largest first, with any "says they paid" claim; card payments started from a bill are asked about first | `PaymentsDueView` |
| `GET /mobile/payment-setup` | Whether bills ask for UPI, and which card payments are set up (Settings) | `PaymentSetupView` |
| `GET /mobile/today` | Status lines, due today/tomorrow, overdue, "to collect" (top three), low stock, use-by soon, today's takings | `TodayView` |
| `GET /mobile/upcoming` | Open pre-orders (overdue first), with confirmation text and WhatsApp URL | `UpcomingView` |
| `GET /mobile/speech-phrases` | Words to hint the recogniser | `{phrases}` |
| `POST`, `DELETE /mobile/push-token` | Register / switch off this phone's Expo token (DELETE has no plan check, so a lapsed account can still sign out) | |
| `GET`, `PUT /mobile/notification-settings` | The owner's four notification choices | `NotificationSettings` |
| `POST /mobile/demo/seed` | Fill a **demo** account with the sample kitchen (no plan check; refuses non-demo accounts and accounts with settings) | |

How a save works (`lib/quickRoutes.ts`): validate the body → `withIdempotency` → inside one Firestore transaction, read the live
documents, run the **same plan** the web runs, apply the writes → create/refresh the public bill if the answer carries a link → answer.
A plan refusal becomes a 4xx with the plan's own message and code. Stock is therefore checked against the shelf *now*.

### Reading: the four kinds

`detectKind(text)` guesses; if unclear the server asks "What is this about?" (costs nothing). Each kind has a prompt (`lib/orderParsePrompt.ts`,
`productionParsePrompt.ts`, `quickReaders.ts`), a schema and a validator in `src/utils/` that checks the model's reading against the message
(see [AI features](06-ai.md)), and a builder that turns the checked reading plus the owner's answers into a draft and a preview, asking a
question for anything the message left open. `quickParse.ts` holds the shared question/answer machinery. The handler also refuses to hand
over a draft that the matching save endpoint would refuse.

Handler refusals worth knowing: `no_menu` (422, add menu items in the web app first), `unverified` (reading did not pass the checks),
`bad_reading` (a returned reading does not match the text), `daily_limit`, `subscription_required` (402).

## Today, Upcoming and Payments due

- **Today** (`buildToday` in `src/utils/quickViews.ts`): up to five status lines (orders due, payments pending, running low, use-by soon, profit),
  due today/tomorrow/overdue summaries, a **To collect** card with the three customers who owe most, and today's revenue and true profit. It
  uses `financialsForRange`, `summarizeDue`, `groupPendingPayments`: the web dashboard's own functions.
- **Upcoming**: open pre-orders by day, overdue pinned at the top, each with **Hand over**, **Send confirmation** and **Send invoice**.
  The hand-over sheet's "Balance received now" switch starts **off** so the app never records money as received unless the owner turns it on.
- **Payments due**: a customer who tapped "I've paid by UPI" on the bill shows **Says they paid ₹X by UPI · when**, with **Confirm received** and **Not received** (see [Billing and payments](07-billing-and-payments.md)). Reached by tapping "N payments pending" or "See all" in To collect. Each customer shows what they owe, how long their oldest
  order has waited (amber from 7 days, coral from 14), the orders behind it, **Send invoice / Send statement** and **Got paid**, which opens
  the Payment capture with "Priya paid 1300" pre-written.
- **Sharing**: the server writes the message and builds a `wa.me` URL when the order has a phone; the app opens it, or the phone's share
  sheet when there is no number.

## Notifications

Push goes through Expo's push service (`lib/expoPush.ts`). The phone registers its token (`POST /mobile/push-token`) after the owner taps
**Turn on notifications** in Settings (never at launch) and the token is switched off at sign-out. A **Render Cron Job every 15 minutes** calls
`POST /api/internal/notifications/run`; `lib/notificationJob.ts` visits every owner with a registered phone and, per owner, in order:

1. a cheap look (settings, what was already sent, devices); if nothing could be due, nothing more is read;
2. one transaction that reads the business, decides (`planNotifications` in `src/utils/quickNotificationJob.ts`), and writes the new state
   ("claims" what it will send), so an overlapping run finds it already claimed and sends nothing twice;
3. the push itself, **outside** the transaction;
4. a phone Expo reports as `DeviceNotRegistered` is switched off, and if no phone accepted a notification the claim is given back so the next
   run retries.

Rules (`quickNotificationJob.ts`): kinds are `morning`, `lowStock`, `useBy`, `dueTomorrow`; morning and due-tomorrow go out once their time has
come and are given up on after **3 hours**; running-low and use-by are checked once an hour between **07:00 and 21:00** local time; a material is
announced once, and again only after it recovers and runs low a second time; nothing is sent when there is nothing to say; at most three names per
notification. An owner whose plan has lapsed gets nothing. Expo's later delivery receipts are not read yet. State lives in
`users/{uid}/mobileSettings/notificationState`, devices in `users/{uid}/devices`.

## Environment and build

| Variable (in `mobile/.env`) | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | The Stockpot server address, no trailing slash |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Switches on "Continue with Google" (Android) |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | Lets Expo's push service issue a token; without it Settings says notifications are not set up in this build |

`google-services.json` (git-ignored) goes in `mobile/` for Android push. **Anything `EXPO_PUBLIC_` is baked into the app; never put a secret in it.**
Expo Go is enough for sign-in and Today; voice, Google sign-in and push need a **development build** or APK (native modules). The Windows APK recipe, push set-up
(FCM, EAS credentials) and Google sign-in set-up (SHA-1) are in `mobile/README.md`. `mobile/AGENTS.md` reminds anyone (human or AI) that Expo changes
every SDK, so read the versioned Expo docs before touching an Expo API (this repo is on SDK 57).

## Checks and CI

In `mobile/`: `npx tsc --noEmit`, `npm test` (Vitest over `mobile/src/lib/__tests__`, using the **root** project's vitest, so run `npm install` at the repo root
first), and `npx expo export --platform android` (does it bundle?). The `mobile` CI job runs exactly these. The mobile tests are not part of the
root `npm test`.

## Not built, or deliberately left out

- **Hindi voice**: Hindi speech returns Devanagari and the "every number and name was written in the message" checks expect Latin script; needs
  server work first.
- **Remind** button on overdue pre-orders: the design has it, the spec does not say what it should do.
- **Notification action buttons** (Stock in / Dismiss / See items): a tap opens the useful screen instead.
- **Editable money fields** on confirm screens (would need a "recalculate" call per change).
- **Offline queue** (decided against), part-payments (need a data-model change), iOS release (store work, push key, Sign in with Apple if Google sign-in is offered).
- **Reading a WhatsApp screenshot** as an order is a parked idea, written up in `docs/handoffs/whatsapp-screenshot-orders.md` (on branch `whatsapp-screenshot-doc` until that is merged). Not started.
