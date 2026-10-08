/**
 * onlinePayments.ts
 *
 * The owner's "Online payments" settings, as the Settings screen sees them: which gateways can be set up and what each asks for,
 * how a saved setup is described, and the checks done before keys are sent. The server (lib/gatewayRoutes.ts) decides what is
 * accepted and checks the keys with the gateway; these checks only save a round trip for an obvious slip. The secret is never in
 * what comes back, only its last four characters.
 */

export type GatewayProviderId = 'razorpay' | 'cashfree' | 'link';

/** GET /api/payments/gateway, and what PUT and DELETE answer. */
export interface GatewayStatus {
  /** False when the server has no encryption key, so keys cannot be kept yet (a pasted link still can). */
  serverReady: boolean;
  configured: boolean;
  provider?: GatewayProviderId;
  keyId?: string;
  secretLast4?: string;
  environment?: 'sandbox' | 'production';
  /** The gateway said these keys are for its test service, so no real money moves. */
  test?: boolean;
  link?: string;
  updatedAt?: number;
}

export interface ProviderInfo {
  id: GatewayProviderId;
  label: string;
  /** One line for the choice. */
  blurb: string;
  keyIdLabel?: string;
  keyIdPlaceholder?: string;
  secretLabel?: string;
  /** Where in the gateway's dashboard the keys are. */
  whereToFind?: string;
  /** Cashfree has a separate test service, so it has to be told which these keys are for. */
  needsEnvironment?: boolean;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'razorpay', label: 'Razorpay', blurb: 'Cards, UPI, netbanking and wallets. Payment is made on Razorpay\'s page.',
    keyIdLabel: 'Key ID', keyIdPlaceholder: 'rzp_live_…', secretLabel: 'Key Secret',
    whereToFind: 'In your Razorpay dashboard: Account & Settings › API Keys › Generate Key. Start with Test Mode keys (they begin rzp_test_).',
  },
  {
    id: 'cashfree', label: 'Cashfree', blurb: 'Cards, UPI and netbanking through Cashfree Payment Links.',
    keyIdLabel: 'App ID', keyIdPlaceholder: 'Your Cashfree App ID', secretLabel: 'Secret Key', needsEnvironment: true,
    whereToFind: 'In your Cashfree dashboard: Developers › API Keys. Start with the Test (sandbox) keys.',
  },
  {
    id: 'link', label: 'Another gateway (payment link)', blurb: 'Paste a payment link from any gateway. Customers get a button to it; you mark the order paid yourself.',
  },
];

export const providerInfo = (id: GatewayProviderId | undefined): ProviderInfo => PROVIDERS.find(p => p.id === id) ?? PROVIDERS[0];

export interface GatewayForm {
  provider: GatewayProviderId;
  keyId: string;
  keySecret: string;
  environment: 'sandbox' | 'production' | '';
  link: string;
}

export const emptyForm = (provider: GatewayProviderId = 'razorpay'): GatewayForm => ({ provider, keyId: '', keySecret: '', environment: '', link: '' });

/** What is wrong with the form, in words, or null if it can be sent. */
export function validateForm(form: GatewayForm): string | null {
  if (form.provider === 'link') {
    let url: URL | null = null;
    try { url = new URL(form.link.trim()); } catch { /* not an address */ }
    return url && url.protocol === 'https:' ? null : 'Paste the payment link as a full address starting with https://';
  }
  const info = providerInfo(form.provider);
  if (form.keyId.trim().length < 6) return `Enter your ${info.keyIdLabel}.`;
  if (/\s/.test(form.keyId.trim())) return `The ${info.keyIdLabel} should not have spaces in it.`;
  if (form.provider === 'razorpay' && !/^rzp_(test|live)_/.test(form.keyId.trim())) return 'A Razorpay Key ID starts with rzp_test_ or rzp_live_.';
  if (form.keySecret.trim().length < 8) return `Enter your ${info.secretLabel}.`;
  if (/\s/.test(form.keySecret.trim())) return `The ${info.secretLabel} should not have spaces in it.`;
  if (info.needsEnvironment && !form.environment) return 'Say whether these keys are for the test (sandbox) or the live service.';
  return null;
}

/** The body for PUT /api/payments/gateway. */
export function requestBody(form: GatewayForm): Record<string, string> {
  if (form.provider === 'link') return { provider: 'link', link: form.link.trim() };
  return {
    provider: form.provider, keyId: form.keyId.trim(), keySecret: form.keySecret.trim(),
    ...(providerInfo(form.provider).needsEnvironment && form.environment && { environment: form.environment }),
  };
}

export interface GatewaySummary {
  title: string;
  /** Lines under the title. */
  details: string[];
  /** 'test' is keys for the gateway's test service: nothing a customer pays is real money. */
  mode: 'live' | 'test' | 'link';
}

/** How a saved setup is described. Never more of the secret than its last four characters. */
export function summarize(status: GatewayStatus): GatewaySummary | null {
  if (!status.configured || !status.provider) return null;
  const info = providerInfo(status.provider);
  if (status.provider === 'link') return { title: info.label, details: [status.link ?? ''], mode: 'link' };
  const details = [`${info.keyIdLabel}: ${status.keyId ?? ''}`];
  if (status.secretLast4) details.push(`${info.secretLabel}: saved, ends ${status.secretLast4}`);
  return { title: info.label, details, mode: status.test ? 'test' : 'live' };
}

/** A line of advice when the setup is saved but not yet proven with real money. */
export const TEST_MODE_NOTE = 'These are test keys: nothing a customer pays is real money. When you have tried a ₹1 bill end to end, replace them with your live keys.';
