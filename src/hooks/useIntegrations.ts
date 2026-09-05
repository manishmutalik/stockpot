/**
 * useIntegrations.ts
 *
 * Owns all Shopify / Odoo integration state and actions: connection status,
 * connect/disconnect flows, and order import (including matching imported
 * line items to local menu items and writing new Order docs to Firestore).
 *
 * Extracted out of the monolithic App.tsx as the first piece of the Phase 4
 * breakup. Behavior is preserved exactly from the original inline
 * implementation — this is a relocation, not a rewrite. The only functional
 * change is that all requests now go through `apiFetch` (src/utils/apiClient)
 * instead of raw `fetch`, so they carry the Firebase auth token and CSRF
 * header the server has required since the Phase 1 security fix.
 */
import { useState, useEffect } from 'react';
import { auth, db, doc, setDoc } from '../firebase';
import { apiFetch } from '../utils/apiClient';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { MenuItem, Order } from '../types';

export interface ShopifyStatus {
  connected: boolean;
  shop: string | null;
}

export interface OdooStatus {
  connected: boolean;
  url: string | null;
}

export interface ShopifyConfig {
  hasEnvCredentials: boolean;
}

/**
 * @param menu      Current menu items, used to match imported order line items by name.
 * @param orderDate The date (YYYY-MM-DD) to import orders for — matches the
 *                  Orders view's date picker.
 * @param showAlert Shared alert-modal function from App.tsx, used for user-facing
 *                  success/error messaging (kept as a dependency rather than
 *                  duplicated here, since it's App-wide UI state).
 * @param authReady True once Firebase auth state has resolved AND a user is
 *                  signed in. The bootstrap status fetch waits for this so it
 *                  doesn't fire (and 401) before login, and correctly re-fires
 *                  once the user actually signs in.
 */
export function useIntegrations(
  menu: MenuItem[],
  orderDate: string,
  showAlert: (title: string, message: string) => void,
  authReady: boolean
) {
  // ── Shopify Integration State ────────────────────────────────────────────
  const [shopifyStatus, setShopifyStatus] = useState<ShopifyStatus>({ connected: false, shop: null });
  const [shopifyShopInput, setShopifyShopInput] = useState('');
  const [isConnectingShopify, setIsConnectingShopify] = useState(false);
  const [isImportingShopify, setIsImportingShopify] = useState(false);
  const [shopifyConfig, setShopifyConfig] = useState<ShopifyConfig>({ hasEnvCredentials: false });

  // ── Odoo Integration State ───────────────────────────────────────────────
  const [odooStatus, setOdooStatus] = useState<OdooStatus>({ connected: false, url: null });
  const [odooUrlInput, setOdooUrlInput] = useState('');
  const [odooDbInput, setOdooDbInput] = useState('');
  const [odooUsernameInput, setOdooUsernameInput] = useState('');
  const [odooPasswordInput, setOdooPasswordInput] = useState('');
  const [isConnectingOdoo, setIsConnectingOdoo] = useState(false);
  const [isImportingOdoo, setIsImportingOdoo] = useState(false);

  // ── Integration Bootstrap ────────────────────────────────────────────────
  // Polls /api/shopify/status and /api/odoo/status once on mount to hydrate
  // connection state before the user visits the Integrations settings panel.
  useEffect(() => {
    if (!authReady) return;

    apiFetch('/api/shopify/status')
      .then(res => res.json())
      .then(data => {
        setShopifyStatus(data);
        if (data.hasEnvCredentials !== undefined) {
          setShopifyConfig({ hasEnvCredentials: data.hasEnvCredentials });
        }
      })
      .catch(err => console.error('Failed to fetch Shopify status', err));

    apiFetch('/api/odoo/status')
      .then(res => res.json())
      .then(data => setOdooStatus(data))
      .catch(err => console.error('Failed to fetch Odoo status', err));
  }, [authReady]);

  // Listens for the OAuth callback message posted by the Shopify auth popup.
  // On SHOPIFY_AUTH_SUCCESS, refreshes the stored connection status.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SHOPIFY_AUTH_SUCCESS') {
        apiFetch('/api/shopify/status')
          .then(res => res.json())
          .then(data => setShopifyStatus(data));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  /**
   * Starts the Shopify OAuth flow by opening a popup to the server-side
   * `/api/auth/shopify` endpoint. Requires the server to have
   * SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET configured (one Shopify app for
   * the whole deployment — each store owner still does their own separate
   * OAuth authorization and gets their own access token, so this supports
   * any number of stores/tenants without needing per-tenant app credentials).
   * A polling interval monitors the popup until it closes, then refreshes status.
   */
  const connectShopify = async () => {
    if (!shopifyConfig.hasEnvCredentials) {
      showAlert("Not Configured", "Shopify integration isn't configured on this server yet. Ask an administrator to set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.");
      return;
    }
    if (!shopifyShopInput) {
      showAlert("Missing Shop Name", "Please enter your Shopify shop name first.");
      return;
    }

    // Clean the shop name: remove protocol and trailing slashes
    const shop = shopifyShopInput.trim()
      .replace('https://', '')
      .replace('http://', '')
      .replace(/\/$/, '');

    setIsConnectingShopify(true);

    try {
      const url = `/api/auth/shopify?shop=${encodeURIComponent(shop)}`;
      const res = await apiFetch(url);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to start connection");
      }

      const data = await res.json();
      if (data.url) {
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        const popup = window.open(
          data.url,
          'shopify_auth',
          `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no`
        );

        if (!popup) {
          showAlert("Popup Blocked", "Please allow popups for this site to connect your Shopify store.");
          setIsConnectingShopify(false);
          return;
        }

        const timer = setInterval(() => {
          if (popup.closed) {
            clearInterval(timer);
            setIsConnectingShopify(false);
            apiFetch('/api/shopify/status')
              .then(res => res.json())
              .then(data => setShopifyStatus(data));
          }
        }, 1000);
      }
    } catch (err: any) {
      showAlert("Connection Error", err.message || "Failed to start Shopify connection.");
      setIsConnectingShopify(false);
    }
  };

  /**
   * Calls the server-side disconnect endpoint to revoke the stored Shopify token,
   * then resets local connection state.
   */
  const disconnectShopify = async () => {
    try {
      await apiFetch('/api/shopify/disconnect', { method: 'POST' });
      setShopifyStatus({ connected: false, shop: null });
    } catch (err) {
      showAlert("Error", "Failed to disconnect Shopify.");
    }
  };

  /**
   * Authenticates against the Odoo JSON-RPC API via the server proxy.
   * Credentials are forwarded to `/api/odoo/connect` and stored server-side;
   * this app only tracks connected/disconnected status.
   */
  const connectOdoo = async () => {
    if (!odooUrlInput || !odooDbInput || !odooUsernameInput || !odooPasswordInput) {
      showAlert("Missing Information", "Please fill in all Odoo connection details.");
      return;
    }

    setIsConnectingOdoo(true);
    try {
      const res = await apiFetch('/api/odoo/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: odooUrlInput,
          db: odooDbInput,
          username: odooUsernameInput,
          password: odooPasswordInput
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to connect to Odoo");
      }

      await res.json();
      setOdooStatus({ connected: true, url: odooUrlInput });
      showAlert("Success", "Odoo connected successfully!");
    } catch (err: any) {
      showAlert("Connection Error", err.message);
    } finally {
      setIsConnectingOdoo(false);
    }
  };

  /**
   * Calls the server-side disconnect endpoint to clear the stored Odoo session,
   * then resets local connection state.
   */
  const disconnectOdoo = async () => {
    try {
      await apiFetch('/api/odoo/disconnect', { method: 'POST' });
      setOdooStatus({ connected: false, url: null });
    } catch (err) {
      showAlert("Error", "Failed to disconnect Odoo.");
    }
  };

  /**
   * Fetches orders from Shopify for `orderDate`, matches line items to the local
   * menu by exact name (case-insensitive), and writes matched orders to Firestore
   * at `users/{userId}/orders`. Unmatched items are reported in an alert.
   */
  const importShopifyOrders = async () => {
    if (!shopifyStatus.connected) {
      showAlert("Not Connected", "Please connect your Shopify store in Settings first.");
      return;
    }

    setIsImportingShopify(true);
    try {
      const res = await apiFetch(`/api/shopify/orders?date=${orderDate}`);
      const shopifyOrders = await res.json();

      if (shopifyOrders.error) {
        throw new Error(shopifyOrders.error);
      }

      if (shopifyOrders.length === 0) {
        showAlert("No Orders", `No Shopify orders found for ${orderDate}.`);
        setIsImportingShopify(false);
        return;
      }

      const newOrders: Order[] = [];
      let matchedCount = 0;
      const unmatchedItems: string[] = [];

      shopifyOrders.forEach((so: any) => {
        so.line_items.forEach((li: any) => {
          const menuItem = menu.find(m => m.name.toLowerCase() === li.title.toLowerCase());
          if (menuItem) {
            newOrders.push({
              id: Math.random().toString(36).substr(2, 9),
              menuItemId: menuItem.id,
              quantity: li.quantity,
              date: orderDate,
              customerName: so.customer ? `${so.customer.first_name || ''} ${so.customer.last_name || ''}`.trim() : '',
              customerPhone: so.customer?.phone || so.phone || ''
            });
            matchedCount++;
          } else {
            unmatchedItems.push(li.title);
          }
        });
      });

      if (newOrders.length > 0) {
        if (!auth.currentUser) return;
        const userId = auth.currentUser.uid;
        for (const order of newOrders) {
          await setDoc(doc(db, 'users', userId, 'orders', order.id), order);
        }
        showAlert("Import Successful", `Imported ${matchedCount} items from ${shopifyOrders.length} Shopify orders.`);
      } else {
        const uniqueUnmatched = Array.from(new Set(unmatchedItems));
        showAlert("Import Result", `Found ${shopifyOrders.length} orders, but none of the items matched your local menu names. Unmatched items: ${uniqueUnmatched.slice(0, 5).join(', ')}${uniqueUnmatched.length > 5 ? '...' : ''}`);
      }
    } catch (err: any) {
      showAlert("Import Error", err.message || "Failed to import orders from Shopify.");
    } finally {
      setIsImportingShopify(false);
    }
  };

  /**
   * Fetches sale orders from Odoo for `orderDate` via `/api/odoo/orders`.
   * Odoo's `product_id` field is a tuple `[id, name]`; the name is matched
   * against local menu items. Matched orders are written to Firestore.
   */
  const importOdooOrders = async () => {
    if (!odooStatus.connected) {
      showAlert("Not Connected", "Please connect your Odoo instance in Settings first.");
      return;
    }

    setIsImportingOdoo(true);
    try {
      const res = await apiFetch(`/api/odoo/orders?date=${orderDate}`);
      const odooOrders = await res.json();

      if (odooOrders.error) {
        throw new Error(odooOrders.error);
      }

      if (odooOrders.length === 0) {
        showAlert("No Orders", `No Odoo orders found for ${orderDate}.`);
        return;
      }

      const newOrders: Order[] = [];
      let matchedCount = 0;
      const unmatchedItems: string[] = [];

      odooOrders.forEach((oo: any) => {
        oo.line_items.forEach((li: any) => {
          // Odoo product_id is [id, name]
          const productName = li.product_id[1];
          const menuItem = menu.find(m => m.name.toLowerCase() === productName.toLowerCase());

          if (menuItem) {
            newOrders.push({
              id: `odoo-${oo.id}-${li.id}`,
              menuItemId: menuItem.id,
              quantity: li.product_uom_qty,
              date: orderDate,
              customerName: oo.partner_id ? oo.partner_id[1] : '',
              customerPhone: ''
            });
            matchedCount++;
          } else {
            if (!unmatchedItems.includes(productName)) {
              unmatchedItems.push(productName);
            }
          }
        });
      });

      if (newOrders.length > 0) {
        if (!auth.currentUser) return;
        const userId = auth.currentUser.uid;
        try {
          for (const order of newOrders) {
            await setDoc(doc(db, 'users', userId, 'orders', order.id), order);
          }

          let msg = `Successfully imported ${matchedCount} items from ${odooOrders.length} Odoo orders.`;
          if (unmatchedItems.length > 0) {
            msg += `\n\nNote: Some items were skipped because they don't match your menu: ${unmatchedItems.join(', ')}`;
          }
          showAlert("Import Complete", msg);
        } catch (err: any) {
          handleFirestoreError(err, OperationType.WRITE, `users/${userId}/orders`);
        }
      } else {
        showAlert("Import Failed", "No items in the Odoo orders matched your menu items.");
      }
    } catch (err: any) {
      showAlert("Error", err.message || "Failed to import Odoo orders.");
    } finally {
      setIsImportingOdoo(false);
    }
  };

  return {
    // Shopify
    shopifyStatus,
    shopifyConfig,
    shopifyShopInput,
    setShopifyShopInput,
    isConnectingShopify,
    connectShopify,
    disconnectShopify,
    isImportingShopify,
    importShopifyOrders,

    // Odoo
    odooStatus,
    odooUrlInput,
    setOdooUrlInput,
    odooDbInput,
    setOdooDbInput,
    odooUsernameInput,
    setOdooUsernameInput,
    odooPasswordInput,
    setOdooPasswordInput,
    isConnectingOdoo,
    connectOdoo,
    disconnectOdoo,
    isImportingOdoo,
    importOdooOrders,
  };
}
