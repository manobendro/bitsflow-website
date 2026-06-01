/**
 * Pluggable payment-provider interface.
 *
 * The site is currently in "decide later" mode, so the default provider is
 * `manual` (records an order, emails a payment link out-of-band — no live
 * gateway). When you choose a gateway (SSLCommerz, bKash, Nagad, Stripe…),
 * implement this interface in a new file and register it in `index.ts`.
 */
export {};
//# sourceMappingURL=provider.js.map