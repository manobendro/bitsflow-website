import { manualProvider } from './manual.js';
/**
 * Provider registry. Select via the PAYMENT_PROVIDER env var (defaults to
 * "manual"). To add a gateway:
 *   1. Implement PaymentProvider in e.g. ./sslcommerz.ts
 *   2. Register it in the `providers` map below
 *   3. Set PAYMENT_PROVIDER=sslcommerz (+ its secrets) in functions config
 */
const providers = {
    manual: manualProvider,
    // sslcommerz: sslcommerzProvider,
    // bkash: bkashProvider,
    // stripe: stripeProvider,
};
export function getPaymentProvider() {
    const key = process.env.PAYMENT_PROVIDER ?? 'manual';
    const provider = providers[key];
    if (!provider) {
        throw new Error(`Unknown PAYMENT_PROVIDER "${key}"`);
    }
    return provider;
}
//# sourceMappingURL=index.js.map