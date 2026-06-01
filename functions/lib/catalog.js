const CATALOG = {
    'bitsflow-v1': {
        id: 'bitsflow-v1',
        name: 'Bitsflow Board',
        price: 4500,
        status: 'prebook',
    },
};
export function getProduct(id) {
    return CATALOG[id];
}
//# sourceMappingURL=catalog.js.map