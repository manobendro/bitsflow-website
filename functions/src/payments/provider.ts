/**
 * Pluggable payment-provider interface.
 *
 * The site is currently in "decide later" mode, so the default provider is
 * `manual` (records an order, emails a payment link out-of-band — no live
 * gateway). When you choose a gateway (SSLCommerz, bKash, Nagad, Stripe…),
 * implement this interface in a new file and register it in `index.ts`.
 */

export interface CheckoutInput {
  orderId: string;
  amount: number; // BDT taka
  currency: 'BDT';
  customer: { uid: string; email: string; name?: string };
  /** Absolute URLs the gateway should redirect the buyer back to. */
  returnUrls: { success: string; cancel: string; fail: string };
}

export interface CheckoutResult {
  /** Hosted payment page to redirect the buyer to, or null for manual flow. */
  paymentUrl: string | null;
  /** Provider-side reference/session id, if any. */
  ref?: string;
}

export interface WebhookResult {
  orderId: string;
  paid: boolean;
  ref?: string;
}

export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  /**
   * Verify and parse a provider webhook/callback. Implement when wiring a live
   * gateway. Throw if the signature/IPN cannot be verified.
   */
  verifyWebhook?(rawBody: string, headers: Record<string, string>): Promise<WebhookResult>;
}
