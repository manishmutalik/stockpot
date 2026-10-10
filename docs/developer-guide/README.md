# Stockpot developer guide

Start here if you are a developer picking up this codebase. It explains what Stockpot is, how the pieces fit together,
where things live, how to run and check it, and the rules that are easy to break by accident. Each topic has its own
file; read this page first, then the topic you are working on.

## What Stockpot is

An inventory, recipe-costing and margin app for home bakers, home chefs, tiffin services and small cloud kitchens,
India first (rupees, GST, UPI, WhatsApp, grams to litres). One owner has one business. Three things ship from this
repository:

| Piece | What it is | Where |
|---|---|---|
| **Web app** | React single-page app: landing page, sign-in, and eight tabs (Dashboard, Stock, Orders, Production Runs, Recipes & Menus, R&D Lab, Wastage, Settings). Live at https://www.stockpot.in. | `src/` |
| **Server** | One Express process that serves the built web app, the JSON API, the public customer bill page, and a scheduled-job endpoint. Hosted on Render. | `server.ts`, `lib/` |
| **Stockpot Quick** | The Android (later iOS) phone companion: say or type what happened, confirm, save. Expo / React Native. | `mobile/` |

Data lives in **Firebase**: Authentication for sign-in, Firestore for everything else. There is no other database.

## Read in this order

| # | File | Read it for |
|---|---|---|
| 1 | [Architecture](01-architecture.md) | The big picture: how a request travels, who is trusted, what runs where |
| 2 | [Data model](02-data-model.md) | Every Firestore collection, the `Order` model and its quirks, security rules |
| 3 | [The web app](03-web-app.md) | `src/`: entry points, `App.tsx`, hooks, views, components, utilities, adding a feature |
| 4 | [Money, plans and bills](04-money-plans-bills.md) | How profit, GST, stock and pre-orders are worked out, and why the maths sits where it does |
| 5 | [The server](05-server.md) | `server.ts`, middleware, the full route list, the dependency-injection pattern |
| 6 | [AI features](06-ai.md) | Briefing, Ask your business, order and production reading, the "no invented numbers" guard |
| 7 | [Billing and payments](07-billing-and-payments.md) | Stockpot's own subscription (Razorpay) and the owner's own card gateway for customer bills |
| 8 | [The phone app](08-phone-app.md) | `mobile/` and the `/api/mobile/*` endpoints behind it |
| 9 | [Testing, CI and operations](09-testing-and-operations.md) | Tests, CI, environment variables, deploy, cron job, troubleshooting |

Other documents that stay current and are not repeated here:

- [`docs/PROJECT_STATE.md`](../PROJECT_STATE.md): what is shipped, decisions the owner made, open items. The best record of *why*.
- [`docs/CHANGELOG.md`](../CHANGELOG.md): history, newest first. `git log` plus this answers "when did this change and why".
- [`docs/AI_CFO_DESIGN.md`](../AI_CFO_DESIGN.md): the design decisions behind the AI features.
- [`docs/handoffs/`](../handoffs/): the original specs (AI CFO, True Profit engine, Stockpot Quick) and what was built against them.
- [`README.md`](../../README.md) (setup, environment variables, billing and notification set-up) and [`mobile/README.md`](../../mobile/README.md) (running and building the phone app, including a Windows APK recipe).

## Run it in five minutes

Prerequisites: Node 20 or newer (CI uses 22), a Firebase project with Authentication and Firestore turned on.

```bash
npm install
cp .env.example .env.local        # fill in at least APP_URL, SESSION_ENC_KEY and the Firebase service account
# put your Firebase web app config in firebase-applet-config.json (public client config, not a secret)
npx tsx --env-file=.env.local server.ts   # one process: Express + Vite in middleware mode, on http://localhost:3000
```

**Environment variables are not loaded automatically.** Nothing in `server.ts` loads a `.env` file (`dotenv` is installed but not
imported), and `npm run dev` is just `tsx server.ts`. Either export the variables in your shell, or start the server with
`--env-file=.env.local` as above (Node 20.6+). Without them the server still boots, but token verification fails until a Firebase service
account is provided. (Vite does read `.env.local`, but only for `VITE_`-prefixed variables that go to the browser, and this app uses none.)

The web app boots with nothing else configured. Billing, AI, Shopify, USDA lookups, online payments and
notifications each switch on only when their own environment variables are set; without them the server starts
normally and only that feature reports "not configured". The full variable list is in the root `README.md` and
[Testing, CI and operations](09-testing-and-operations.md).

To look at the app without data, press **Explore Demo Sandbox** on the sign-in screen. It creates a throw-away
account and fills it with a realistic sample kitchen (`src/utils/demoData.ts`).

## Before you push: the four checks

CI runs these on every pull request, plus two more jobs. Run all four locally; each has failed CI on its own before.

```bash
npm run lint          # tsc --noEmit (type-check the whole project)
npm run lint:eslint   # ESLint (this catches react-hooks rules that tsc does not)
npm test              # Vitest, about 2,200 tests
npm run build         # Vite production build
```

The other CI jobs: `firestore-rules` (`npm run test:rules`, needs Java and the Firestore emulator) and `mobile`
(types, tests and an Android bundle for `mobile/`). Details in [Testing, CI and operations](09-testing-and-operations.md).

## Repository map

```
server.ts                 The Express server (routes wired here; handlers live in lib/)
lib/                      Server-only code: route handlers, model calls, stores, payment gateways
  gateways/               Razorpay and Cashfree clients for the owner's customer-payment links
  __tests__/              Server tests (handlers are tested with in-memory fakes, no Firebase)
src/
  main.tsx                Router: / landing, /app the app, /terms, /privacy
  App.tsx                 The app shell: auth, data listeners, hooks wiring, layout, modals
  LandingPage.tsx         Marketing page (copy and layout); components/landing/ has its infographics
  firebase.ts             The single place the Firebase client SDK is imported from
  hooks/                  One hook per feature area: owns that area's writes and modal state
  views/                  One component per tab; pure presentation, fed by props from App.tsx
  components/             Modals, cards and panels used by the views
  utils/                  Pure logic with no React or Firebase: the money maths, parsing, formatting
  utils/plans/            "Plans": what an action will write, shared by web and server (see below)
  types/index.ts          Shared types (Order, MenuItem, RawMaterial, BakerySettings, AppViewProps)
mobile/                   Stockpot Quick: its own package.json, tests and CI job
firestore.rules           Security rules (default deny; tested against the emulator)
test/rules/               The security-rules tests
docs/                     Project docs; this guide is docs/developer-guide/
public/                   Static files: landing images, icons
bakery-mobile/            An older, unused prototype. Ignore it; it goes once the new phone app ships.
dist/                     Build output (generated, not committed)
```

`firebase-blueprint.json` and `metadata.json` are leftovers from the Google AI Studio project this started as;
nothing in the running app reads them.

## The ideas that explain most of the code

These recur everywhere. Knowing them makes the rest readable.

1. **Pure logic goes in `src/utils/`; effects go in hooks and routes.** Money maths, parsing, billing text, GST and so on
   are plain functions with no React, Firebase or network. The browser, the server and the phone app all call the
   same functions, so two screens (or the phone and the web) can never disagree. This is why `lib/` (server code)
   imports from `src/utils/`.
2. **Plans.** "Add an order", "hand over", "mark paid", "restock", "log a production run" are each a pure function that
   takes the current documents and returns *the list of writes to make*. The web commits them with a Firestore batch;
   the server commits the same list inside an Admin-SDK transaction. Same rules, one source. See
   [Money, plans and bills](04-money-plans-bills.md).
3. **History is never rewritten.** Each order is stamped with the price and costs at the moment it was created. Changing
   a menu price or a material cost later does not change past profit.
4. **Dependency injection for anything with I/O.** Server handlers are factories (`createXHandler(deps)`) that take
   their database, clock, id generator and model as arguments. Tests pass in-memory fakes. `server.ts` is where the
   real ones are plugged in.
5. **The server is the only judge of money and entitlement.** The browser's paywall is a courtesy; every server route
   that spends money or touches paid features checks again. Payment status comes from asking Razorpay or the owner's
   gateway, never from what a browser says.
6. **The model reads; code decides.** AI is used to *read* messy text and to *write explanatory sentences*. Every
   number is computed by code, every id the model returns is checked against the ones that were sent, and nothing is
   saved without the owner confirming. See [AI features](06-ai.md).
7. **Default deny.** Firestore rules list the few collections a client may touch; everything else (billing,
   credentials, gateway keys, AI usage, bills) is reachable only by the server's Admin SDK.

## Glossary

| Term | Meaning |
|---|---|
| **Material** / **raw material** | An ingredient or packaging item in stock (`RawMaterial`). Stock is held in *batches* with their own use-by date and cost. |
| **Menu item** / **recipe** | A thing the owner sells (`MenuItem`), with a recipe (materials and amounts) and a selling price. `finishedGoodsStock` is how many are made and on the shelf. |
| **Production run** | Logging that something was made: takes ingredients out of stock and adds finished goods. |
| **Order** | One *line*: one menu item, a quantity, a date. A customer's multi-item purchase is several `Order` documents sharing an `orderGroupId`. |
| **Pre-order** | An order booked ahead; `date` is the due date. It takes no stock until handed over and may hold an advance. |
| **Hand over** | The moment a pre-order is delivered: it claims stock and may record the balance received. |
| **Pending payment** | An order with `paymentStatus: 'unpaid'` ("pay later"). An order with no `paymentStatus` counts as paid. |
| **Advance** | Money received before hand-over against a pre-order. Stored on the first line of the order. |
| **Stamp** | The price, ingredient cost, packaging cost, input GST and item name copied onto an order when it is created. |
| **True profit** | Revenue (pre-GST) less ingredient, packaging, fees, delivery and fixed costs. Computed in `src/utils/profit.ts` only. |
| **Margin drift** | A menu item's margin having slipped since it was priced because ingredient costs moved. |
| **MAC** | Moving average cost: a material's cost per unit after a restock, blended with what was in stock. |
| **Bill / statement** | A customer-facing summary of one order (bill) or several of one customer's orders (statement), shared by link. |
| **Bill token** | The unguessable string in `/bill/<token>`; it *is* the access check for the public bill page. |
| **Owner gateway** | The owner's own Razorpay or Cashfree account, used so customers can pay a bill by card. Separate from Stockpot's own subscription billing. |
| **Quick / Stockpot Quick** | The phone app and its `/api/mobile/*` endpoints. |
| **Idempotency key** | A per-tap id the phone sends so a retried save cannot create a second order. |
| **Demo account** | A throw-away sign-in created from the "Explore Demo Sandbox" button; recognised by its email. Never charged, never sent to the AI model. |
| **Paywall** | The server-controlled rule that signed-in accounts need an active or trialing plan. Off for everyone unless the server turns it on. |

## Where do I change...?

| I want to... | Go to |
|---|---|
| Change how profit, revenue or a margin is calculated | `src/utils/profit.ts` (and its tests). Never calculate money in a view. |
| Change GST handling | `src/utils/gstCalculations.ts`, then `profit.ts` / `orderPricing.ts` |
| Change what an order save writes | `src/utils/plans/planOrders.ts` (both web and phone follow it) |
| Add a field to an order, menu item or material | `src/types/index.ts`, then the plan that writes it, then the form, then `firestore.rules` only if it is a *new collection* |
| Add a new Firestore collection the client reads | `firestore.rules` (`isBusinessCollection`), `test/rules/`, and a `useFirestoreCollection` call in `App.tsx` |
| Add a new tab | `TabId` and the sidebar and bottom-nav buttons in `App.tsx`, a new `src/views/XView.tsx`, `AppViewProps` in `types/index.ts` |
| Change the customer bill (page, WhatsApp text) | `src/utils/billing.ts` (data and text), `lib/billHtml.ts` (the page) |
| Change what the phone app shows or saves | `src/utils/quickViews.ts` and `lib/quickRoutes.ts` (server), `mobile/src/` (app); shapes in `src/utils/quickApiTypes.ts` |
| Change an AI prompt | `lib/*Prompt.ts`; the *guarantee* lives in the matching `src/utils/*Parse.ts` / `ai*.ts` validator, so change both together |
| Add a payment gateway for owners | A new file in `lib/gateways/` behind the `Gateway` interface (`lib/gateways/types.ts`) and a case in `lib/gateways/index.ts` |
| Change the trial length | `TRIAL_DAYS` in `src/utils/trial.ts` (landing page, paywall and server all read it) |
| Change landing-page copy | `src/LandingPage.tsx`; the tests in `src/__tests__/LandingPage.test.tsx` pin key phrases |
| Add an environment variable | Read it where it is used, document it in `.env.example` and the root `README.md` table |

## Conventions

- **TypeScript everywhere**, `strict` type-check is a CI gate. Prefer narrowing over `any`; `AppViewProps` still has
  some `any`s from the original refactor, and they are not a pattern to copy.
- **Comments explain why**, not what. Almost every file opens with a header comment saying what it is for and the rules
  it keeps; keep that habit and update the header when behaviour changes.
- **Dates are `YYYY-MM-DD` strings in the business's own time zone** (`settings.timezone`, default `Asia/Kolkata`).
  Never use `toISOString().slice(0, 10)` for "today": it is UTC and is wrong in India from midnight to 05:30. Use
  `todayInZone` from `src/utils/localDate.ts`.
- **Money is a plain number in the business's currency**; rounding is done at the edge (`round2`), not in the middle of a
  chain. Gateways take paise: convert with `rupeesToPaise`.
- **Firestore (Admin SDK) rejects `undefined`** anywhere in a document. Leave optional fields out, or strip with a JSON
  round-trip (`withoutUndefined` in `lib/billStore.ts`). This caused a real production bug.
- **Never put a secret in `vite.config.ts`'s `define` or any `VITE_`/client file.** It ships to every visitor.
- **Tests sit beside the code** in `__tests__/` folders. A fix should come with a test that fails without it.
- **Pull requests**: branch from `origin/main`, keep one change per PR, add a `docs/CHANGELOG.md` entry (newest first), and
  make sure all CI jobs pass. The repository squash-merges.
