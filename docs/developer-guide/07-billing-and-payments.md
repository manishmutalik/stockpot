# 7. Billing and payments

There are **two completely separate money flows** in this codebase. Do not confuse them.

| | Stockpot's own subscription | Owner's customer payments |
|---|---|---|
| Who pays whom | The owner pays **Stockpot** ₹1,200/month | The owner's **customer** pays the **owner** for an order |
| Gateway account | Stockpot's one Razorpay account (env vars) | The owner's own Razorpay or Cashfree account (keys saved by the owner in Settings) |
| Code | `lib/razorpay.ts`, `lib/billingRoutes.ts`, `lib/subscriptionStore.ts`, `src/hooks/useBilling.ts` | `lib/payOnline.ts`, `lib/gateways/*`, `lib/gatewayRoutes.ts`, `lib/gatewayStore.ts`, `lib/secretBox.ts` |
| State lives in | `users/{uid}.billing` | `users/{uid}/paymentGateway/active`, `bills/{token}.payment`, and the orders' `paymentStatus` |
| Entitlement effect | Decides whether the account may use the app | None; it only marks orders paid |

---

## Part A: Stockpot's own subscription (Razorpay Subscriptions)

### The model

One plan: ₹1,200 a month (`RAZORPAY_PLAN_ID`), with a free trial of `TRIAL_DAYS` days (`src/utils/trial.ts`, currently 45; shared by
the landing page, paywall and server). The owner approves a payment mandate (card or UPI AutoPay) when they start; the first
charge is taken when the trial ends. Cancelling and re-subscribing never grants a second trial (`billing.trialUsed`).
There are no tiers; `docs/PROJECT_STATE.md` explains the GST decision (₹1,200 becomes GST-inclusive once the business has a GST number).

### Status values

`users/{uid}.billing.status` is one of `none | trialing | active | past_due | canceled | incomplete`. `hasActiveAccess(status)` is
true for `active` and `trialing`. Mapping from Razorpay's own status (`mapSubscriptionStatus` in `lib/razorpay.ts`):

| Razorpay says | Stockpot status |
|---|---|
| `authenticated` and the start date is in the future | `trialing` |
| `authenticated` otherwise, `created`, anything new | `incomplete` |
| `active` | `active` |
| `pending`, `halted`, `paused` | `past_due` |
| `cancelled`, `completed`, `expired` | `canceled` |

For a trial, `currentPeriodEnd` is the first-charge time; otherwise `current_end` (else `charge_at`). Times are unix **seconds**.

### The flow

1. **Browser** (`useBilling`'s `startCheckout`) calls `POST /api/billing/create-subscription`. The server refuses if the account already
   has access (409), decides `trial = !billing.trialUsed`, computes `start_at = now + TRIAL_DAYS days` for a trial, creates the
   Razorpay subscription (with the uid in its `notes`), saves the subscription id on the account, and returns
   `{keyId, subscriptionId, trial, trialDays}`.
2. The browser lazily loads `https://checkout.razorpay.com/v1/checkout.js` and opens Checkout.
3. On success the browser posts Razorpay's `{payment_id, subscription_id, signature}` to `POST /api/billing/verify-payment`. The
   server checks the signature (`verifyPaymentSignature`, HMAC with the key secret), checks the subscription belongs to **this**
   account, **fetches the subscription's real state from Razorpay**, and saves that. Nothing the browser says decides the status.
4. **The webhook is the long-term source of truth.** `POST /api/billing/webhook` (raw body, `verifyWebhookSignature`) handles renewals,
   failed charges and cancellations; `lastEventAt` stops a late, older event overwriting a newer state. It finds the account by
   the uid in the subscription's notes or by `findUidByRazorpaySubscriptionId`.
5. **Cancel** (`POST /api/billing/cancel`): a paying plan ends at the end of the period already paid (`cancelScheduled: true`);
   a trial ends at once and is never charged.

### The paywall

`billing.paywall` in `GET /api/billing/status` says whether *this* account must have a plan. `paywallApplies(account)` is false when:
`BILLING_DISABLED=true`, or the account is a demo account, or the `RAZORPAY_*` values are missing. Otherwise it is true if
`BILLING_ENFORCED=true`, or the account's **verified** email is in `BILLING_ENFORCED_EMAILS`. So deploying billing changes
nothing until the owner chooses; turning on `BILLING_ENFORCED=true` is the last launch step.

The web gate is in `App.tsx` (shows `PaywallScreen`). **The server enforces it too**: `quickGate` for the phone endpoints,
`requireAiAccess` for AI, and the notification job skips owners whose plan has lapsed. Do not rely on the web gate alone for
anything that costs money.

### Status of verification

This flow has been built and tested against mocks. The checklist for the first real run (full checkout in Test Mode, the webhook
arriving, and whether Razorpay accepts a first charge 45 days ahead) is in `docs/PROJECT_STATE.md`. If Razorpay refuses the
long trial, checkout fails with a clear error and the trial length must change.

### Setup

See the root `README.md` "Billing setup": plan, keys, webhook URL `{APP_URL}/api/billing/webhook` with the nine subscription
events, then the enforcement variables.

---

## Part B: The owner's customer payments (own gateway)

### What it does

An owner can let customers pay a bill by card or online, with the money going **straight to the owner's own account**. In Settings →
Online payments they enter their gateway keys (Razorpay, Cashfree) or paste a payment link. The customer's bill page then shows
**Pay by card or online**.

### The gateway interface (`lib/gateways/types.ts`)

Each gateway is one file behind the same three operations, so a new one never touches the bill page or Settings:

```ts
interface Gateway {
  id: 'razorpay' | 'cashfree'; label: string;
  check(creds, fetch):   Promise<KeyCheck>;    // are the keys valid? test or live?
  createLink(creds, link, fetch): Promise<{id, url}>;   // a payment link for an amount
  getLink(creds, linkId, fetch):  Promise<{status: 'paid'|'unpaid'|'expired'|'cancelled'|'partial', amountPaid, paymentId?}>;
}
```

- **Razorpay** (`lib/gateways/razorpay.ts`): Payment Links API, Basic auth with the owner's key id and secret, amounts in paise; test vs
  live is told by the key prefix (`rzp_test_`).
- **Cashfree** (`lib/gateways/cashfree.ts`): `/pg/links` with `x-client-id` / `x-client-secret` and API version `2023-08-01`. It needs a
  customer phone for every link; if the order has none it uses the business's own number, and with neither the link cannot be made.
  A separate sandbox service exists (`environment: 'sandbox'`).
- A third mode, **`link`**: the owner pastes an https payment link (a UPI collect page, say). It is shown as a button but cannot be marked
  paid automatically (there is nothing to ask).
- Gateway errors are turned into plain sentences (`GatewayError`); keys never appear in one. `rupeesToPaise`/`paiseToRupees` convert.

> **These two gateway clients were written from the documented APIs without access to the live services or docs, and tested only against
> recorded replies.** Before relying on them: use test-mode keys (`rzp_test_…`, Cashfree sandbox), press **Test connection**, then pay a
> ₹1 bill end to end.

### Keeping the keys safe

- Settings call `GET/PUT/DELETE /api/payments/gateway` and `POST /api/payments/gateway/test` (`lib/gatewayRoutes.ts`). `PUT` **checks the keys
  with the gateway first**, then stores them.
- The secret is encrypted by `lib/secretBox.ts` (AES-256-GCM, fresh nonce, the **uid bound in as additional authenticated data**) with
  `PAYMENT_SECRETS_KEY` (32 random bytes, base64) and stored at `users/{uid}/paymentGateway/active`. Firestore rules match nothing there, so no
  client can read it; the rules test covers it.
- What comes back to the owner is the gateway, the key id and the **last four characters** of the secret. Never the secret.
- Without `PAYMENT_SECRETS_KEY` nothing can be saved or read and Settings says why; owners can still paste a link.
- Do not change `PAYMENT_SECRETS_KEY` after owners have saved keys: they become unreadable and must be re-entered.

### The customer's side (`lib/payOnline.ts`)

```
GET /bill/:token           bill page (+ "Pay by card or online" button if a gateway is set)
GET /bill/:token/pay       make a payment link for what is owed NOW, redirect the customer to it
GET /bill/:token/return    gateway sends the customer back here; ask the gateway if it was paid
```

The rules that keep it safe:

1. **The amount is worked out on the server** from the orders as they are now (`buildBill`, `billBalance`). Nothing the browser sends is used.
2. **Coming back from the gateway proves nothing.** Whatever is on the return URL is ignored. The link is *asked about* using the owner's
   decrypted keys, and orders are marked paid only if the gateway says it was paid **in full**.
3. **Marking paid happens once.** Only orders still unpaid are touched, inside a transaction, via `planMarkPaid` with method `card` and
   the owner's card fee rate. If the customer paid but the orders were already marked paid by hand, nothing is marked and the attempt
   is noted `orders_already_paid` (the owner has been paid twice and should refund).
4. **No webhook for the owner to set up.** The status is fetched when the customer returns or opens the bill again, with a short throttle
   (a link is asked about at most every 10 seconds, however often the page is opened).
5. **Link reuse**: a link already made for the same amount is reused (the gateway's own link lasts a day), so repeated taps do not pile up
   links in the owner's account.
6. **Page safety**: the bill page is plain HTML with a strict CSP (`form-action 'none'`), so the pay button is an ordinary GET link. The
   owner's keys are decrypted only for the length of one call and never logged or sent anywhere but the gateway. What a gateway says can
   name the owner's setup problems (a missing phone, a disabled product): that is shown to the owner, not the customer.
7. The page is the bill first: if the payment side fails, the bill is still shown.
8. The payment attempt is stored on the bill record (`bills/{token}.payment`: provider, link id, url, amount, order ids, status
   `created | settled`, `checkedAt`, `settledAt`, `paymentId`).

`APP_URL` must be the real public address, because the gateway sends the customer back to it. (A placeholder `APP_URL` once made
every payment link point at a placeholder domain.)

### Owners with only UPI: "I've paid by UPI"

A UPI payment straight to the owner's UPI ID sends nothing back, so Stockpot cannot know it happened. The bill page therefore has an
**I've paid by UPI** button under the UPI one (only when the bill asks for UPI and is unpaid). It is a form that posts to
`POST /bill/:token/claim` (`createClaimHandler`), which:

1. marks **nothing** paid: it writes `paymentClaim: { at, amount, method: 'upi' }` on every unpaid order the bill covers, where
   `amount` is what the bill asked for at that moment;
2. tells the owner's phone once (`lib/ownerPush.ts`, through Expo; `data.screen = 'payments-due'`). A second tap within 30 minutes
   changes nothing and sends nothing;
3. sends the customer back to the bill with "Thank you! We have told …", and the page shows "You told … you have paid" instead of the
   button.

The owner then sees **Says they paid ₹X by UPI · when** on that customer (phone: Payments due, and SAYS PAID in Today's To collect; web:
Payments pending), checks their UPI app, and either:

- **Confirm received**: `POST /api/mobile/payments/claim` with `action: 'confirm'` (or, on the web, Mark paid with UPI preselected)
  marks the claimed orders paid by UPI with the UPI fee, as whole orders;
- **Not received**: `action: 'dismiss'` (`planDismissClaim`) clears the claim; the orders stay unpaid and the customer can claim again.

`planMarkPaid` always clears a claim (`paymentClaim: null`), so marking paid by any route settles it. `claimSummary` (in
`src/utils/quickViews.ts`) counts each tap once even when a statement's claim sits on several orders. Anyone with the bill link can tap
the button; that is acceptable because a claim changes no money and the owner must confirm it.

### Where the phone fits

The phone's Send invoice and Send statement create the same public bill, and the WhatsApp message carries the link. **Payments due asks
the gateway first** (`createWaitingPaymentSettler`, passed to the phone endpoints as `settleWaiting`): for the unpaid orders' bill and
statement tokens, it reconciles card payments still `created` and less than about a day old, at most 8 bills and 5 seconds, so a customer
who paid and closed the page without returning shows as paid. Anything slow or failing is left for the next look. The phone's Settings
show what is set up (`GET /api/mobile/payment-setup`: UPI on bills, and the gateway or a pasted link).

## Other credentials stored encrypted

Shopify tokens and Odoo logins use a different mechanism (`lib/crypto.ts`, key derived from `SESSION_ENC_KEY`, stored in
`users/{uid}/integrationCredentials/{provider}`, clients denied). Do not use it for new secrets; use `secretBox`.
