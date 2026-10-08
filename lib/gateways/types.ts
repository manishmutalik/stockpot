/**
 * The few things Stockpot needs from a payment gateway an owner has an account with: check the keys, make a payment link for an
 * amount, and ask whether a link has been paid. Each gateway is one file behind this, so another is added without touching the
 * bill page or the settings. The gateways' own errors are turned into plain sentences here; keys never appear in one.
 */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

/** Gateways whose links Stockpot makes itself. ('link' is separate: a link the owner pasted, which nothing is made or checked for.) */
export type GatewayId = 'razorpay' | 'cashfree';

export interface GatewayCredentials {
  keyId: string;
  secret: string;
  /** Cashfree has a separate test ("sandbox") service; Razorpay tells test keys by their prefix. */
  environment?: 'sandbox' | 'production';
}

export interface NewLink {
  /** In rupees, two decimals at most. */
  amount: number;
  /** Shown to the customer: who they are paying and for what. */
  description: string;
  /** Our own reference, unique for each link made. */
  reference: string;
  customer: { name?: string; phone?: string };
  /** The business's own number, for a gateway that insists on one when the customer has given none. */
  businessPhone?: string;
  /** Where the gateway sends the customer after they pay. Nothing on it is trusted: the link is asked about afterwards. */
  returnUrl: string;
  /** Unix seconds. */
  expiresAt: number;
}

export interface CreatedLink { id: string; url: string }

export interface LinkState {
  status: 'paid' | 'unpaid' | 'expired' | 'cancelled' | 'partial';
  /** In rupees. */
  amountPaid: number;
  paymentId?: string;
}

export interface KeyCheck {
  ok: boolean;
  /** Plain words for the owner when it is not ok. */
  message?: string;
  /** Whether the keys are for the gateway's test service (no real money moves). */
  test?: boolean;
}

export interface Gateway {
  id: GatewayId;
  label: string;
  check(creds: GatewayCredentials, fetchFn: FetchLike): Promise<KeyCheck>;
  createLink(creds: GatewayCredentials, link: NewLink, fetchFn: FetchLike): Promise<CreatedLink>;
  getLink(creds: GatewayCredentials, linkId: string, fetchFn: FetchLike): Promise<LinkState>;
}

/** Something the gateway refused or could not do, with words that are safe to show the owner. */
export class GatewayError extends Error {
  constructor(message: string, readonly httpStatus = 0) { super(message); this.name = 'GatewayError'; }
}

export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);
export const paiseToRupees = (paise: number): number => Math.round(paise) / 100;
