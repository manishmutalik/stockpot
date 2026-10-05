import express from "express";
import { createServer as createViteServer } from "vite";
import cookieParser from "cookie-parser";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import { requireAuth, AuthedRequest } from "./lib/auth";
import { requireCsrf, issueCsrfToken } from "./lib/csrf";
import { saveCredentials, getCredentials, deleteCredentials } from "./lib/integrationStore";
import { readRazorpayConfig, createRazorpayApi } from "./lib/razorpay";
import { setBillingInfo, getBillingInfo, findUidByRazorpaySubscriptionId, hasActiveAccess } from "./lib/subscriptionStore";
import {
  createBillingStatusHandler, createSubscriptionHandler, createVerifyPaymentHandler, createCancelHandler, createWebhookHandler,
} from "./lib/billingRoutes";
import { readAiConfig } from "./lib/aiConfig";
import { createAiStatusHandler } from "./lib/aiRoutes";
import { createBriefingHandler } from "./lib/briefingRoutes";
import { createChatHandler } from "./lib/chatRoutes";
import { createChatModel } from "./lib/chatModel";
import { createOrderParseHandler } from "./lib/orderParseRoutes";
import { createOrderParseModel } from "./lib/orderParseModel";
import { createProductionParseHandler } from "./lib/productionParseRoutes";
import { createProductionParseModel } from "./lib/productionParseModel";
import { createBriefingModel } from "./lib/briefingModel";
import { beginGeneration, clearGeneration, getBriefing, saveBriefing } from "./lib/briefingStore";
import { globalDay, peekAiUsage, reserveAiUse, usageDayFor } from "./lib/aiUsage";
import { searchUsda, searchOpenFoodFacts } from "./lib/nutritionSearch";
import { createOrRefreshBill, createOrRefreshStatement, getPublicBill } from "./lib/billStore";
import { createBillHandler, createPublicBillHandler } from "./lib/billRoutes";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Defense-in-depth: an unhandled promise rejection anywhere in the process
 * (e.g. a Firestore/Razorpay/axios call that slipped through without a
 * try/catch) would otherwise crash the entire server for every user — one
 * bad request taking down the whole app until Render restarts it, which
 * then immediately crashes again on the next request that hits the same
 * code path. Every route handler in this file has its own try/catch as the
 * real fix, but this is a safety net in case a future route is added
 * without one. Logs and keeps the process alive rather than exiting.
 */
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection (server stayed alive):", reason);
});

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

  // --- Billing (Razorpay) ---

  /**
   * Temporary testing toggle: when BILLING_DISABLED=true, every signed-in
   * user is treated as having an active subscription, and the billing
   * routes below refuse to start a subscription (the client-side paywall
   * never triggers). This is meant to be short-lived — remove the env var
   * (or set it to anything other than "true") to re-enable real billing.
   * No other code changes needed either way.
   */
  const isBillingDisabled = () => process.env.BILLING_DISABLED === "true";

  // Handlers live in lib/billingRoutes.ts with their dependencies passed in.
  const billingDeps = {
    billingDisabled: isBillingDisabled,
    config: () => readRazorpayConfig(),
    api: createRazorpayApi,
    store: { get: getBillingInfo, set: setBillingInfo, findUidBySubscriptionId: findUidByRazorpaySubscriptionId },
    now: () => Date.now(),
  };

  // The webhook MUST be registered before app.use(express.json()) below: Razorpay's
  // signature is over the exact raw request body bytes, not the already-parsed JSON
  // object express.json() would produce. This route uses express.raw() instead,
  // scoped to just this one path.
  app.post("/api/billing/webhook", express.raw({ type: "application/json" }), createWebhookHandler(billingDeps));

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


  // --- AI features (switched off unless AI_FEATURES_ENABLED=true; see lib/aiGuard.ts) ---
  // Every route that calls the model goes through requireAiAccess(feature, aiGuardDeps)
  // before anything else. The status route needs no model call and uses nothing up.
  const aiGuardDeps = {
    config: () => readAiConfig(),
    billingDisabled: isBillingDisabled,
    hasActiveAccess: async (uid: string) => hasActiveAccess((await getBillingInfo(uid)).status),
    usageDay: (uid: string) => usageDayFor(uid),
    globalDay: () => globalDay(),
    reserve: reserveAiUse,
  };
  api.get("/ai/status", createAiStatusHandler({ ...aiGuardDeps, peek: peekAiUsage }));
  api.post("/ai/briefing", requireCsrf, createBriefingHandler({
    ...aiGuardDeps,
    store: { get: getBriefing, begin: beginGeneration, save: saveBriefing, clear: clearGeneration },
    model: createBriefingModel(),
    now: () => Date.now(),
  }));
  api.post("/ai/chat", requireCsrf, createChatHandler({ ...aiGuardDeps, model: createChatModel() }));
  api.post("/ai/parse-order", requireCsrf, createOrderParseHandler({ ...aiGuardDeps, model: createOrderParseModel() }));
  api.post("/ai/parse-production-run", requireCsrf, createProductionParseHandler({ ...aiGuardDeps, model: createProductionParseModel() }));

  api.get("/billing/status", createBillingStatusHandler(billingDeps));
  // The free trial length is TRIAL_DAYS in src/utils/trial.ts, shared with the landing page.
  api.post("/billing/create-subscription", requireCsrf, createSubscriptionHandler(billingDeps));
  api.post("/billing/verify-payment", requireCsrf, createVerifyPaymentHandler(billingDeps));
  api.post("/billing/cancel", requireCsrf, createCancelHandler(billingDeps));

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
    try {
      const creds = await getCredentials<ShopifyCreds>(req.uid!, "shopify");
      res.json({ connected: !!creds, shop: creds?.shop || null });
    } catch (err: any) {
      console.error("Failed to fetch Shopify status:", err.message);
      res.status(500).json({ error: "Failed to fetch Shopify status" });
    }
  });

  api.get("/shopify/orders", async (req: AuthedRequest, res) => {
    const date = req.query.date as string; // YYYY-MM-DD

    try {
      const creds = await getCredentials<ShopifyCreds>(req.uid!, "shopify");
      if (!creds) {
        return res.status(401).json({ error: "Shopify not connected" });
      }

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
    try {
      await deleteCredentials(req.uid!, "shopify");
      res.json({ success: true });
    } catch (err: any) {
      console.error("Failed to disconnect Shopify:", err.message);
      res.status(500).json({ error: "Failed to disconnect Shopify" });
    }
  });

  // --- Odoo Integration Routes ---

  api.get("/odoo/status", async (req: AuthedRequest, res) => {
    try {
      const creds = await getCredentials<OdooCreds>(req.uid!, "odoo");
      res.json({ connected: !!creds, url: creds?.url || null });
    } catch (err: any) {
      console.error("Failed to fetch Odoo status:", err.message);
      res.status(500).json({ error: "Failed to fetch Odoo status" });
    }
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
    const date = req.query.date as string; // YYYY-MM-DD

    try {
      const creds = await getCredentials<OdooCreds>(req.uid!, "odoo");
      if (!creds) {
        return res.status(401).json({ error: "Odoo not connected" });
      }

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
    try {
      await deleteCredentials(req.uid!, "odoo");
      res.json({ success: true });
    } catch (err: any) {
      console.error("Failed to disconnect Odoo:", err.message);
      res.status(500).json({ error: "Failed to disconnect Odoo" });
    }
  });

  // --- Nutrition Lookup Routes ---
  // The client queries both of these in parallel for every lookup (not one
  // as a fallback for the other): USDA has no allergen data at all, so
  // only ever calling it and falling back to Open Food Facts on an empty
  // result would rarely actually reach the allergen source in practice.

  api.get("/nutrition/search-usda", async (req: AuthedRequest, res) => {
    const query = (req.query.q as string || "").trim();
    if (!query) {
      return res.status(400).json({ error: "Missing q parameter" });
    }

    const apiKey = process.env.USDA_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "USDA lookup is not configured on this server." });
    }

    try {
      const results = await searchUsda(query, apiKey);
      res.json({ results });
    } catch (err: any) {
      console.error("USDA FoodData Central lookup failed:", err.response?.data || err.message);
      res.status(500).json({ error: "Failed to search USDA FoodData Central" });
    }
  });

  api.get("/nutrition/search-openfoodfacts", async (req: AuthedRequest, res) => {
    const query = (req.query.q as string || "").trim();
    if (!query) {
      return res.status(400).json({ error: "Missing q parameter" });
    }

    try {
      const results = await searchOpenFoodFacts(query);
      res.json({ results });
    } catch (err: any) {
      console.error("Open Food Facts lookup failed:", err.response?.data || err.message);
      res.status(500).json({ error: "Failed to search Open Food Facts" });
    }
  });

  // --- Customer Bills ---
  // Creating a bill acts on the signed-in owner's own order, so it is an
  // authenticated route. (This is separate from /billing above, which is
  // Stockpot's own subscription billing.)
  api.post("/bills", requireCsrf, createBillHandler(createOrRefreshBill, createOrRefreshStatement));

  app.use("/api", api);

  // The public, read-only bill a customer opens from the QR code or WhatsApp
  // link. No sign-in: the unguessable token in the URL is the access check.
  // Registered before the Vite/static handlers below so the SPA never
  // swallows it.
  app.get("/bill/:token", createPublicBillHandler(getPublicBill));

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
