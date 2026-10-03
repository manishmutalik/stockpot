# Handoff: AI CFO (Daily Briefing, Ask Your Business, NL Order Logging, Customer Insights)

**Status:** Planned, not started. **Revised 2 Oct 2026** to follow the Differentiation Strategy: the AI is positioned as an "AI CFO" that interprets the owner's own numbers, not a kitchen assistant. Changes from the first version are listed at the end.

**Depends on:** Phase 1, `true-profit-engine-handoff.md` (`src/utils/profit.ts`) — **build after it ships**, so the AI has true profit to reason over. Benefits from Phase 2, `price-margin-intelligence-handoff.md` (`src/utils/pricing.ts`) — the drift and what-if parts below light up once it ships, and degrade cleanly before.

**Read first:** `lib/stripe.ts` (the client pattern to mirror), `server.ts` (route conventions), `src/utils/billing.ts` (`normalizeWhatsAppNumber`, `buildWhatsAppUrl`), `useOrderActions.ts` (`addOrderGroup`), and the two phase docs above.

---

## Decisions already made — don't re-litigate without checking back

1. **AI CFO, not AI kitchen assistant.** No recipe generation, no generic chat. Every feature answers a question about this business's money: why profit moved, what to reprice, what to stop selling, who hasn't reordered.
2. **The model explains numbers; code computes them.** All figures come from `profit.ts`, `pricing.ts` and `customers.ts`. The model never does arithmetic on raw orders. When it needs a calculation it doesn't have (a what-if), it asks the client to run one (see Ask Your Business).
3. **Model: Claude Haiku 4.5** (`claude-haiku-4-5`) for everything. These are explain-and-extract tasks over small, pre-computed inputs.
4. **Billing: Anthropic Console, prepaid credits** (minimum $5 ≈ ₹480), under the project's own API key.
5. **Cost:** the earlier estimate was ≈₹20–27 per active user per month. The daily briefing adds roughly ₹10 per user per month at ~2,000 input and ~300 output tokens per day (Haiku 4.5 at $1/$5 per million tokens, ₹96 to the dollar). Re-measure with real token counts during testing; the target stays well under 5% of the ₹1,200 subscription.
6. **Nothing the AI produces writes data directly.** NL order logging returns a draft the owner confirms; creation still goes through `addOrderGroup`.
7. **Minimal customer data leaves Stockpot.** Customer phone numbers are never sent to the API. Customers appear in prompts under short labels (`C-014`) that the client maps back to names when displaying the answer.

---

## Shared infrastructure (build first)

### `lib/anthropic.ts` — mirrors `lib/stripe.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required for AI features. ' +
      'Get it from https://platform.claude.com (Console → API Keys).'
    );
  }
  client = new Anthropic({ apiKey });
  return client;
}
```

Add `@anthropic-ai/sdk` to `package.json`.

### Routes

All under `api.post("/ai/...")` inside the authenticated `api` router (`requireAuth` applies), `requireCsrf` on every POST, the usual try/catch-and-500. Missing `ANTHROPIC_API_KEY` → a clear 500 ("AI features are not configured on this server"), exactly as the USDA route handles `USDA_API_KEY`. The rest of the app keeps working.

### The business snapshot — `src/utils/aiSnapshot.ts`

One pure function builds the compact JSON every AI feature sends. The client computes it (the logic already lives client-side) and POSTs it; the server never re-derives figures.

```typescript
export function buildBusinessSnapshot(input: {...}): {
  business: { name: string; currency: string; gstApplicable: boolean };
  period: { start: string; end: string };
  current: FinancialsSummary;   // from profit.financialsForRange
  previous: FinancialsSummary;  // the same-length period before, for "why did X change"
  drivers: {                    // computed deltas, largest first — what the model explains
    label: string;              // e.g. "Ingredient costs", "Wastage", "Discounts", "Card fees"
    change: number;             // ₹ effect on true profit vs previous period
  }[];
  products: {                   // top ~30 by revenue in the period
    name: string; units: number; revenue: number; contribution: number;
    marginNow: number; drift?: { pointsLost: number; topDriver?: string }; // Phase 2
  }[];
  materialPriceMoves: { name: string; change30d: number | null }[];  // Phase 2; top ~10 by |change|
  repricingAlerts: { product: string; reason: string; suggestedPrice: number }[]; // Phase 2
  inventory: { cashTiedUp: number; lowStock: string[]; expiringSoon: string[] };
  customers: CustomerSummary;   // see Customer insights; labels only, no phones
};
```

- **Keep it small.** Cap list lengths as noted. A typical snapshot should be about 1,500–2,500 tokens.
- **Phase 2 fields are optional.** Before Phase 2 ships they are omitted, and the prompts say "price-change data isn't available yet" rather than guessing.
- **`drivers` is the key field.** It's how the briefing can say "revenue grew but profit fell because butter costs, wastage and discounting rose" without the model doing arithmetic.

---

## Feature 1: Daily Briefing (replaces "Narrated Insights")

The strategy's "daily business briefing". It becomes the owner's first screen (and the explanation line on the Phase 3 dashboard).

**Route:** `POST /api/ai/briefing` — input: the snapshot for yesterday (with `previous` = the same weekday a week earlier) plus a 7-day trend.

**Output:** structured JSON (use tool use / structured output, not free prose):

```typescript
{
  headline: string;            // "Yesterday: ₹6,240 revenue, ₹2,180 true profit — down 12% on last Thursday."
  why: string;                 // 1–2 sentences from `drivers`
  attention: {                 // at most 4, most urgent first
    kind: 'reprice' | 'wastage' | 'price_move' | 'reorder_customer' | 'low_stock' | 'expiring';
    text: string;              // "Butter is up 14% — 3 cakes are below your target margin."
  }[];
}
```

The client renders the figures itself from the snapshot (yesterday's revenue and true profit, 7-day trend, wastage) — the model writes only the sentences. That way a wrong model sentence can't show a wrong number in a figure tile.

**Caching:** generate once per day per user, on first open, and store it (Firestore `users/{uid}/briefings/{date}`). Never regenerate on every view. A "refresh" button can regenerate at most a few times a day.

**Date-range insight:** the Summary view's "explain this period" uses the same route with the selected range instead of yesterday. Cache per range per day, as before.

---

## Feature 2: Ask Your Business

**Route:** `POST /api/ai/chat` — input: `{ question, snapshot, history? }` (last 4 turns at most).

**System prompt:** you are the business's CFO; answer only from the snapshot; be concise and specific with ₹ figures; when the data doesn't cover the question, say so plainly; refer to customers only by their labels.

**Questions it must handle well** (use these as test cases):
- Why was profit down this month?
- Which five products should I raise prices on? *(Phase 2: from `repricingAlerts` and `drift`)*
- Which ingredients are becoming expensive? *(Phase 2: `materialPriceMoves`)*
- What should I stop selling? *(lowest contribution per unit and in total)*
- Which customers haven't ordered in 30 days? *(customer insights below)*
- If I increase prices by 8%, what happens to monthly profit? *(the what-if tool below)*

### The one client-executed tool: `run_pricing_scenario` (Phase 2)

The model can't run `pricingScenario` itself, and shouldn't estimate it. Give it one tool:

```typescript
{
  name: 'run_pricing_scenario',
  description: 'Compute the effect of a price change on monthly contribution using the business\'s own sales volumes.',
  input_schema: { type: 'object', properties: {
    products: { type: 'array', items: { type: 'string' }, description: 'Product names, or ["ALL"]' },
    pctChange: { type: 'number' },
    expectedVolumeChangePct: { type: 'number' }
  }, required: ['products', 'pctChange'] }
}
```

Flow: the route returns the model's tool call to the client → the client runs `pricing.pricingScenario` locally → POSTs the result back to the same route → the model writes the answer, including the break-even sentence. Allow one tool round per question. Before Phase 2 ships, don't offer the tool; the model says what-if analysis isn't available yet.

**Client:** a slide-over chat panel. Map customer labels back to names when rendering answers.

---

## Feature 3: Natural-language order logging (the WhatsApp intake)

This is how a WhatsApp order gets into Stockpot without the paid WhatsApp Business API: the owner copies the customer's message and pastes it into **Quick Log**.

**Route:** `POST /api/ai/parse-order` — input: `{ text, menuItems: {id, name}[], knownCustomers: {label, name}[] }` (names only, no phones).

**Structured output:**

```typescript
{
  lineItems: { menuItemId: string | null; nameAsWritten: string; quantity: number }[];
  customerLabel?: string;     // matched existing customer, if any
  customerName?: string;      // as written, if no match
  date?: string;              // "tomorrow", "Saturday" → resolved YYYY-MM-DD
  deliveryAddress?: string;
  paymentMethod?: 'upi' | 'cash' | 'card' | 'other';   // Phase 1 field
  discount?: number;                                    // Phase 1 field
  unmatched: string[];        // items it couldn't match — surfaced, never guessed
}
```

Pass today's date in the prompt so "tomorrow" and "Saturday" resolve correctly.

**Client:** shows the parse as the pre-filled Add Order form. The phone comes from the matched customer's record client-side, or the owner types it. On confirm → the existing `addOrderGroup` (stock checks and Phase 1 price stamps included). Unmatched items are shown as "Couldn't find 'croisant' — did you mean Classic Croissant?".

A near-identical `POST /api/ai/parse-production-run` covers the Production Log.

---

## Feature 4: Customer insights (new)

Covers the strategy's "which customers haven't ordered in 30 days?" and "customers due for a reorder". **No new collection**: profiles are derived from orders on the fly.

### `src/utils/customers.ts`

```typescript
export interface CustomerProfile {
  key: string;            // normalizeWhatsAppNumber(phone), else lower-cased trimmed name
  label: string;          // stable short label for AI prompts, e.g. "C-014"
  name: string;           // most recent name used
  phone?: string;
  firstOrder: string;
  lastOrder: string;
  orderCount: number;     // multi-item groups count once
  totalSpent: number;     // from profit.ts, pre-GST
  totalContribution: number;
  medianDaysBetweenOrders: number | null;  // null with fewer than 3 orders
  favouriteItems: string[];                // top 3 by quantity
  status: 'new' | 'active' | 'due' | 'lapsed';
}

export function buildCustomerProfiles(orders: Order[], ...): CustomerProfile[];
```

- **Identity:** group by normalized phone (reuse `normalizeWhatsAppNumber` from `billing.ts`). Orders without a phone group by name — weaker, so show those customers with a "no phone" marker.
- **Labels must be stable** (e.g. assigned by first-order date) so a label means the same customer across chat turns.
- **Status rules:**
  - `new`: 1 order.
  - `due`: today − lastOrder ≥ the customer's median interval, and less than 2× it.
  - `lapsed`: no order in 30 days, or more than 2× their median interval.
  - `active`: everything else.
- `CustomerSummary` in the snapshot: counts by status, plus up to 10 `due` and 10 `lapsed` customers (label, days since last order, favourite item, total contribution).

### UI

A **Customers** section in the Orders view with tabs for Due and Lapsed, plus All. Each row: name, last order, usual interval, favourite item, lifetime contribution, and a **WhatsApp nudge** button (`buildWhatsAppUrl` with a pre-filled "Hi Priya, shall I keep a chocolate truffle cake for you this week?"). Optionally attach the menu PDF from `menu-pdf-share-handoff.md` once that ships. This is plain code, no AI call, and works even if the AI features are switched off.

---

## Feature 5: Reorder-point suggestions (pure calculation)

Unchanged from the first version: predict each material's usage from order and production history, and flag materials likely to run out before the percentage threshold would warn. No LLM call. It feeds the briefing's `low_stock` items and gives Purchase Management a suggested-PO starting point.

---

## Things to get right

- **Code computes, the model explains.** No figure in the UI comes from model text. Figure tiles render from the snapshot; the model writes sentences.
- **Phase-aware prompts.** Without Phase 2 data, the AI says so rather than estimating price moves.
- **API key never reaches the client.** All Anthropic calls are server-side.
- **Fail quietly when the key is unset.** Briefing and chat are simply hidden; customer insights and reorder suggestions still work, since they don't use the API.
- **No phone numbers to the API.** Labels only. Map back client-side.
- **Small prompts, cached outputs.** One briefing per user per day. Chat history capped at 4 turns.

---

## What changed from the first version

| Before | Now |
| --- | --- |
| Narrated Insights (a narrative for a date range) | Daily Briefing with structured headline / why / attention items; range insight kept as a secondary use |
| Snapshot built ad hoc per feature | One `buildBusinessSnapshot`, built on Phase 1 `profit.ts` with a `drivers` breakdown |
| Chat answered from financials only | CFO question set, product/price/customer data, and a client-executed what-if tool |
| NL order logging | Same, now framed as the WhatsApp intake; also extracts payment method, discount, date, and matches existing customers |
| Smart pricing suggestions (category-aware markup) | **Moved** to `price-margin-intelligence-handoff.md` |
| No customer model | Customer insights derived from orders: due/lapsed lists and a WhatsApp nudge |
| Could start immediately | Build after Phase 1 |

---

## Verification checklist

- `tsc --noEmit` clean; `npm run build` succeeds; ESLint clean
- `npm test`:
  - `buildBusinessSnapshot`: figures match `profit.financialsForRange` exactly; list caps respected; no phone numbers anywhere in the output (assert on a fixture with phones); Phase 2 fields omitted when unavailable
  - `buildCustomerProfiles`: the same customer typed as "+91 98450 10101" and "9845010101" merges into one profile; a multi-item group counts as one order; due/lapsed boundaries; stable labels across calls
  - Briefing route: rejects or repairs non-conforming model output against the schema; served from cache on a second request the same day
  - Chat: tool round trip — the model's `run_pricing_scenario` call is returned to the client, and the client's result is accepted back; tool absent before Phase 2
  - Parse-order: unmatched items surfaced; confirm path goes through `addOrderGroup` with its stock checks intact
- Manually verify: with the key unset, the app works and customer insights still show; the six CFO questions get specific, figure-backed answers on the demo account; "what if I raise prices 8%" returns the break-even sentence; pasting a real WhatsApp order message produces a correct draft; a customer who orders weekly and hasn't for 10 days appears under Due with a working WhatsApp nudge
- Set `ANTHROPIC_API_KEY` in the Render environment before shipping
