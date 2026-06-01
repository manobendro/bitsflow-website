/**
 * Server-side catalog — the *authoritative* price list. Never trust prices sent
 * by the client; look them up here (or, later, from the Firestore `products`
 * collection) when creating orders.
 */
export interface CatalogProduct {
  id: string;
  name: string;
  price: number; // BDT taka
  status: 'available' | 'prebook' | 'sold_out';
}

const CATALOG: Record<string, CatalogProduct> = {
  'bitsflow-v1': {
    id: 'bitsflow-v1',
    name: 'Bitsflow Board',
    price: 4500,
    status: 'prebook',
  },
};

export function getProduct(id: string): CatalogProduct | undefined {
  return CATALOG[id];
}
