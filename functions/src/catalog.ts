/**
 * Server-side catalog — the *authoritative* price lookup. Never trust prices
 * sent by the client. Orders resolve prices from the live Firestore `products`
 * collection (admin-managed), falling back to the static copy below for ids
 * that have no Firestore doc yet (e.g. before the catalog is seeded).
 */
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { SLUG_PATTERN } from './productValidation.js';

export interface CatalogProduct {
  id: string;
  name: string;
  price: number; // BDT taka
  status: 'available' | 'prebook' | 'sold_out';
}

// Keep IDs, prices and statuses in sync with the storefront catalog in
// `src/lib/catalog.ts`. This copy is authoritative for order pricing.
const CATALOG: Record<string, CatalogProduct> = {
  'bitsflow-v1': {
    id: 'bitsflow-v1',
    name: 'Bitsflow Board',
    price: 4500,
    status: 'prebook',
  },
  'bitsflow-starter-kit': {
    id: 'bitsflow-starter-kit',
    name: 'Starter Kit',
    price: 6900,
    status: 'prebook',
  },
  'bitsflow-robotics-kit': {
    id: 'bitsflow-robotics-kit',
    name: 'Robotics Add-on Kit',
    price: 3200,
    status: 'available',
  },
  'bitsflow-sensor-pack': {
    id: 'bitsflow-sensor-pack',
    name: 'Sensor Expansion Pack',
    price: 1800,
    status: 'available',
  },
  'bitsflow-battery-pack': {
    id: 'bitsflow-battery-pack',
    name: 'Rechargeable Battery Pack',
    price: 950,
    status: 'available',
  },
  'bitsflow-usbc-cable': {
    id: 'bitsflow-usbc-cable',
    name: 'USB-C Cable',
    price: 250,
    status: 'available',
  },
  'bitsflow-classroom-pack': {
    id: 'bitsflow-classroom-pack',
    name: 'Classroom Pack (×10)',
    price: 39000,
    status: 'prebook',
  },
  'bitsflow-carry-case': {
    id: 'bitsflow-carry-case',
    name: 'Carry Case',
    price: 650,
    status: 'available',
  },
};

export type ProductLookup =
  | { found: true; product: CatalogProduct }
  | { found: false; reason: 'unknown' | 'inactive' };

const STATUSES: CatalogProduct['status'][] = ['available', 'prebook', 'sold_out'];

/**
 * Resolve the authoritative product for an order. The live Firestore doc
 * `products/{id}` wins when it exists (inactive → not orderable); otherwise we
 * fall back to the static CATALOG above (mirrors the seed).
 */
export async function getProduct(id: string): Promise<ProductLookup> {
  // Guard the doc path (no slashes / reserved names) before touching Firestore.
  if (!SLUG_PATTERN.test(id)) return { found: false, reason: 'unknown' };

  const snap = await getFirestore().collection('products').doc(id).get();
  if (snap.exists) {
    const data = snap.data() ?? {};
    if (data.active === false) return { found: false, reason: 'inactive' };
    const price = Number(data.price);
    if (!Number.isInteger(price) || price < 0) {
      logger.error('product has invalid price; refusing to sell', { id, price: data.price });
      return { found: false, reason: 'inactive' };
    }
    const fallback = CATALOG[id];
    return {
      found: true,
      product: {
        id,
        name:
          typeof data.name === 'string' && data.name.trim()
            ? data.name.trim()
            : (fallback?.name ?? id),
        price,
        status: STATUSES.includes(data.status) ? data.status : (fallback?.status ?? 'available'),
      },
    };
  }

  const product = CATALOG[id];
  return product ? { found: true, product } : { found: false, reason: 'unknown' };
}
