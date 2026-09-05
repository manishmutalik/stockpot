/**
 * stripe.ts
 *
 * Lazily initializes a single shared Stripe client from STRIPE_SECRET_KEY.
 * Deliberately NOT initialized at module-import time: if billing isn't
 * configured yet (e.g. during initial setup, or a deployment that hasn't
 * enabled payments), the rest of the server should still boot and serve
 * every non-billing route normally. Only an actual billing request fails,
 * with a clear error, rather than the whole process refusing to start.
 */
import Stripe from 'stripe';

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (client) return client;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      'STRIPE_SECRET_KEY environment variable is required for billing. ' +
      'Get it from https://dashboard.stripe.com/apikeys (use a test-mode key while developing).'
    );
  }

  client = new Stripe(secretKey);
  return client;
}
