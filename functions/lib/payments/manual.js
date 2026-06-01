/**
 * Default provider while no live gateway is configured.
 *
 * It does NOT take money. It simply acknowledges the order; staff follow up with
 * a payment link (bank transfer / bKash / Nagad / cash on delivery, etc.).
 */
export const manualProvider = {
    name: 'manual',
    async createCheckout(_input) {
        return { paymentUrl: null };
    },
};
//# sourceMappingURL=manual.js.map