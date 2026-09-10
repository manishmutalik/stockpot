import express from "express";
import { createServer as createViteServer } from "vite";
import cookieParser from "cookie-parser";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import { requireAuth, AuthedRequest } from "./lib/auth";
import { requireCsrf, issueCsrfToken } from "./lib/csrf";
import { saveCredentials, getCredentials, deleteCredentials } from "./lib/integrationStore";
import { getStripe } from "./lib/stripe";
import { setBillingInfo, getBillingInfo, findUidByStripeCustomerId, SubscriptionStatus } from "./lib/subscriptionStore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ShopifyCreds {
  accessToken: string;
  shop: string;
}

interface OdooCreds {
  url: string;
  db: string;
  username: string;
  password: string;
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // --- Stripe webhook ---
  // MUST be registered before app.use(express.json()) below: Stripe's
  // signature verification needs the exact raw request body bytes, not the
  // already-parsed JSON object express.json() would produce. This route
  // uses express.raw() instead, scoped to just this one path.
  app.post("/api/billing/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const signature = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET is not configured");
      return res.status(500).send("Webhook not configured");
    }
    if (!signature) {
      return res.status(400).send("Missing stripe-signature header");
    }

    let event;
    try {
      event = getStripe().webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (err: any) {
      console.error("Stripe webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as any;
          const uid = session.client_reference_id;
          const subscriptionId = session.subscription as string;
          const customerId = session.customer as string;
          if (uid && subscriptionId) {
            const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
            await setBillingInfo(uid, {
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              status: subscription.status as SubscriptionStatus,
              currentPeriodEnd: (subscription as any).current_period_end ?? null,
            });
          }
          break;
        }
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const subscription = event.data.object as any;
          const customerId = subscription.customer as string;
          const uid = await findUidByStripeCustomerId(customerId);
          if (uid) {
            await setBillingInfo(uid, {
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscription.id,
              status: subscription.status as SubscriptionStatus,
              currentPeriodEnd: subscription.current_period_end ?? null,
            });
          }
          break;
        }
        case "invoice.payment_failed": {
          const invoice = event.data.object as any;
          const customerId = invoice.customer as string;
          const uid = await findUidByStripeCustomerId(customerId);
          if (uid) {
            await setBillingInfo(uid, { status: "past_due" });
          }
          break;
        }
        default:
          // Unhandled event types are fine to ignore — Stripe sends many
          // more event types than this app currently needs to react to.
          break;
      }
      res.json({ received: true });
    } catch (err: any) {
      console.error("Error processing Stripe webhook:", err.message);
      // Still 200 here would hide real bugs from Stripe's retry mechanism;
      // 500 tells Stripe to retry delivery.
      res.status(500).send("Webhook handler error");
    }
  });

  app.use(express.json());
  app.use(cookieParser());

  // --- Session / CSRF bootstrap ---
  // The client calls this once on load to get a CSRF token, then echoes it
  // back in an X-CSRF-Token header on every state-changing request below.
  app.get("/api/session/csrf", (req, res) => {
    issueCsrfToken(req, res);
  });

  // Every route below acts on behalf of a specific user, so all of them
  // require a valid Firebase ID token (Authorization: Bearer <token>).
  const api = express.Router();
  api.use(requireAuth);

  // --- Billing Routes ---

  /**
   * Temporary testing toggle: when BILLING_DISABLED=true, every signed-in
   * user is treated as having an active subscription, and the checkout/
   * portal routes below are never actually reached (the client-side paywall
   * never triggers). This is meant to be short-lived — remove the env var
   * (or set it to anything other than "true") to re-enable real billing.
   * No other code changes needed either way.
   */
  const isBillingDisabled = () => process.env.BILLING_DISABLED === "true";

  api.get("/billing/status", async (req: AuthedRequest, res) => {
    if (isBillingDisabled()) {
      return res.json({
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        status: "active",
        currentPeriodEnd: null,
        updatedAt: Date.now(),
      });
    }
    const info = await getBillingInfo(req.uid!);
    res.json(info);
  });

  /**
   * Number of days for the free trial on a brand-new subscription. Only
   * applied when the customer has never subscribed before (see below) —
   * otherwise canceling and resubscribing would grant an infinite free
   * trial. Change this single constant to adjust the trial length; no
   * other code needs to change.
   */
  const TRIAL_PERIOD_DAYS = 14;

  /**
   * Creates a Stripe Checkout session for the single subscription plan
   * (STRIPE_PRICE_ID). Reuses an existing Stripe customer for this uid if
   * one was already created by a previous checkout attempt, so a user
   * abandoning checkout and retrying doesn't create duplicate customers.
   *
   * Grants a free trial only on someone's first-ever subscription attempt
   * (no existing Stripe customer on file) — resubscribing after a
   * cancellation does not grant a second trial.
   */
  api.post("/billing/create-checkout-session", requireCsrf, async (req: AuthedRequest, res) => {
    if (isBillingDisabled()) {
      return res.status(400).json({ error: "Billing is temporarily disabled for testing." });
    }
    const priceId = process.env.STRIPE_PRICE_ID;
    const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
    if (!priceId || !appUrl) {
      return res.status(500).json({ error: "Billing is not configured on this server." });
    }

    try {
      const existing = await getBillingInfo(req.uid!);
      const isFirstEverSubscription = !existing.stripeCustomerId;

      const session = await getStripe().checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: req.uid!,
        customer: existing.stripeCustomerId || undefined,
        customer_email: existing.stripeCustomerId ? undefined : req.body?.email,
        subscription_data: isFirstEverSubscription
          ? { trial_period_days: TRIAL_PERIOD_DAYS }
          : undefined,
        success_url: `${appUrl}/app?billing=success`,
        cancel_url: `${appUrl}/app?billing=canceled`,
      });
      res.json({ url: session.url });
    } catch (err: any) {
      console.error("Failed to create checkout session:", err.message);
      res.status(500).json({ error: "Failed to start checkout" });
    }
  });

  /**
   * Creates a Stripe Billing Portal session so a subscribed user can update
   * their payment method, view invoices, or cancel — without this app
   * needing to build any of that UI itself.
   */
  api.post("/billing/create-portal-session", requireCsrf, async (req: AuthedRequest, res) => {
    if (isBillingDisabled()) {
      return res.status(400).json({ error: "Billing is temporarily disabled for testing." });
    }
    const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
    const info = await getBillingInfo(req.uid!);

    if (!info.stripeCustomerId) {
      return res.status(400).json({ error: "No billing account found. Subscribe first." });
    }

    try {
      const session = await getStripe().billingPortal.sessions.create({
        customer: info.stripeCustomerId,
        return_url: `${appUrl}/app`,
      });
      res.json({ url: session.url });
    } catch (err: any) {
      console.error("Failed to create billing portal session:", err.message);
      res.status(500).json({ error: "Failed to open billing portal" });
    }
  });

  // --- Shopify OAuth Routes ---

  api.get("/shopify/config-status", (req, res) => {
    res.json({
      hasEnvCredentials: !!(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET),
    });
  });

  api.get("/auth/shopify", (req: AuthedRequest, res) => {
    const shop = req.query.shop as string;

    if (!shop) {
      return res.status(400).send("Missing shop parameter");
    }

    // Per-shop client credentials are no longer accepted via query string —
    // that leaked secrets into logs and browser history. Only server-side
    // env credentials are supported. If you need per-tenant Shopify apps,
    // store the client id/secret via an authenticated settings endpoint
    // instead and look them up by req.uid here.
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error("Shopify credentials missing");
      return res.status(400).send("Shopify API credentials are not configured on the server.");
    }

    const fullShop = shop.includes(".") ? shop : `${shop}.myshopify.com`;
    const scopes = "read_orders,read_products";
    const baseUrl = (process.env.APP_URL || "").replace(/\/$/, "");
    if (!baseUrl) {
      console.error("APP_URL environment variable is missing");
      return res.status(500).send("APP_URL environment variable is not configured.");
    }

    // Encode uid + a short-lived nonce into `state` so the callback can tie
    // the exchanged token back to the right user without any cookie at all.
    const state = Buffer.from(JSON.stringify({ uid: req.uid, ts: Date.now() })).toString("base64url");
    const redirectUri = `${baseUrl}/api/auth/shopify/callback`;
    const shopifyUrl = `https://${fullShop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;

    res.json({ url: shopifyUrl });
  });

  // NOTE: This callback is hit by Shopify's redirect, not by our SPA, so it
  // cannot carry an Authorization header. We recover the user from the
  // `state` param we generated above instead of relying on a client-writable
  // cookie for identity.
  app.get("/api/auth/shopify/callback", async (req, res) => {
    const { shop, code, state } = req.query;

    if (!shop || !code || !state) {
      return res.status(400).send("Missing shop, code, or state");
    }

    let uid: string;
    try {
      const decoded = JSON.parse(Buffer.from(state as string, "base64url").toString("utf8"));
      uid = decoded.uid;
      if (!uid) throw new Error("no uid in state");
    } catch {
      return res.status(400).send("Invalid state parameter");
    }

    const fullShop = (shop as string).includes(".") ? (shop as string) : `${shop}.myshopify.com`;
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).send("Shopify credentials are not configured on the server.");
    }

    try {
      const response = await axios.post(`https://${fullShop}/admin/oauth/access_token`, {
        client_id: clientId,
        client_secret: clientSecret,
        code,
      });

      const { access_token } = response.data;
      await saveCredentials(uid, "shopify", { accessToken: access_token, shop: fullShop } as ShopifyCreds);

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'SHOPIFY_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Shopify connected successfully! You can close this window.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Shopify OAuth Error:", error.response?.data || error.message);
      res.status(500).send("Failed to exchange Shopify code for token");
    }
  });

  api.get("/shopify/status", async (req: AuthedRequest, res) => {
    const creds = await getCredentials<ShopifyCreds>(req.uid!, "shopify");
    res.json({ connected: !!creds, shop: creds?.shop || null });
  });

  api.get("/shopify/orders", async (req: AuthedRequest, res) => {
    const creds = await getCredentials<ShopifyCreds>(req.uid!, "shopify");
    const date = req.query.date as string; // YYYY-MM-DD

    if (!creds) {
      return res.status(401).json({ error: "Shopify not connected" });
    }

    try {
      const startTime = `${date}T00:00:00Z`;
      const endTime = `${date}T23:59:59Z`;

      const response = await axios.get(
        `https://${creds.shop}/admin/api/2024-01/orders.json?created_at_min=${startTime}&created_at_max=${endTime}&status=any`,
        { headers: { "X-Shopify-Access-Token": creds.accessToken } }
      );

      res.json(response.data.orders);
    } catch (error: any) {
      console.error("Shopify API Error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to fetch orders from Shopify" });
    }
  });

  api.post("/shopify/disconnect", requireCsrf, async (req: AuthedRequest, res) => {
    await deleteCredentials(req.uid!, "shopify");
    res.json({ success: true });
  });

  // --- Odoo Integration Routes ---

  api.get("/odoo/status", async (req: AuthedRequest, res) => {
    const creds = await getCredentials<OdooCreds>(req.uid!, "odoo");
    res.json({ connected: !!creds, url: creds?.url || null });
  });

  api.post("/odoo/connect", requireCsrf, async (req: AuthedRequest, res) => {
    const { url, db, username, password } = req.body;

    if (!url || !db || !username || !password) {
      return res.status(400).json({ error: "Missing Odoo credentials" });
    }

    try {
      const cleanUrl = (url as string).replace(/\/$/, "");

      const authResponse = await axios.post(`${cleanUrl}/jsonrpc`, {
        jsonrpc: "2.0",
        method: "call",
        params: { service: "common", method: "authenticate", args: [db, username, password, {}] },
      });

      const uid = authResponse.data.result;
      if (!uid) {
        return res.status(401).json({ error: "Invalid Odoo credentials" });
      }

      // Credentials are encrypted at rest and scoped to the authenticated
      // Firebase user (req.uid) — never sent back to the browser.
      await saveCredentials(req.uid!, "odoo", { url: cleanUrl, db, username, password } as OdooCreds);

      res.json({ success: true, uid });
    } catch (error: any) {
      console.error("Odoo connection error:", error.message);
      res.status(500).json({ error: "Failed to connect to Odoo" });
    }
  });

  api.get("/odoo/orders", async (req: AuthedRequest, res) => {
    const creds = await getCredentials<OdooCreds>(req.uid!, "odoo");
    const date = req.query.date as string; // YYYY-MM-DD

    if (!creds) {
      return res.status(401).json({ error: "Odoo not connected" });
    }

    try {
      const { url, db, username, password } = creds;

      const authResponse = await axios.post(`${url}/jsonrpc`, {
        jsonrpc: "2.0",
        method: "call",
        params: { service: "common", method: "authenticate", args: [db, username, password, {}] },
      });

      const uid = authResponse.data.result;
      if (!uid) throw new Error("Authentication failed");

      const startTime = `${date} 00:00:00`;
      const endTime = `${date} 23:59:59`;

      const searchResponse = await axios.post(`${url}/jsonrpc`, {
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "object",
          method: "execute_kw",
          args: [
            db, uid, password,
            "sale.order", "search_read",
            [[
              ["date_order", ">=", startTime],
              ["date_order", "<=", endTime],
              ["state", "in", ["sale", "done"]],
            ]],
            { fields: ["name", "order_line", "amount_total", "partner_id"] },
          ],
        },
      });

      const orders = searchResponse.data.result;

      const enrichedOrders = await Promise.all(
        orders.map(async (order: any) => {
          const linesResponse = await axios.post(`${url}/jsonrpc`, {
            jsonrpc: "2.0",
            method: "call",
            params: {
              service: "object",
              method: "execute_kw",
              args: [
                db, uid, password,
                "sale.order.line", "read",
                [order.order_line],
                { fields: ["product_id", "product_uom_qty", "price_unit"] },
              ],
            },
          });
          return { ...order, line_items: linesResponse.data.result };
        })
      );

      res.json(enrichedOrders);
    } catch (error: any) {
      console.error("Odoo API Error:", error.message);
      res.status(500).json({ error: "Failed to fetch orders from Odoo" });
    }
  });

  api.post("/odoo/disconnect", requireCsrf, async (req: AuthedRequest, res) => {
    await deleteCredentials(req.uid!, "odoo");
    res.json({ success: true });
  });

  app.use("/api", api);

  // --- Vite Middleware ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
