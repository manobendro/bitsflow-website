/**
 * Thin client for the Bitsflow backend (Firebase Functions, exposed under /api
 * via the hosting rewrite). Automatically attaches the signed-in user's ID
 * token so the function can verify identity server-side.
 */
import { auth } from './firebase/client';

const useEmulators = import.meta.env.PUBLIC_USE_EMULATORS === 'true';
const projectId = import.meta.env.PUBLIC_FIREBASE_PROJECT_ID;
// Keep in sync with the region set on the `api` function in functions/src/index.ts.
const FUNCTIONS_REGION = 'asia-southeast1';

/**
 * Base URL for the API.
 * - In production the site is served through Firebase Hosting, whose `/api/**`
 *   rewrite forwards to the `api` function — so a relative `/api` works.
 * - The Astro dev server has no such rewrite, so when emulators are enabled we
 *   call the Functions emulator directly. The function strips the leading
 *   `/api` segment, so the path layout stays identical in both modes.
 */
const API_BASE = useEmulators
  ? `http://127.0.0.1:5001/${projectId}/${FUNCTIONS_REGION}/api`
  : '/api';

async function authHeader(): Promise<Record<string, string>> {
  const user = auth().currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeader()),
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

import type { CustomerInfo, Order, OrderStatus, OrderType, ShippingAddress } from './types';
import type { CatalogProduct } from './catalog';

export interface CreateOrderInput {
  productId: string;
  quantity: number;
  type: OrderType;
  customer: CustomerInfo;
  shipping: ShippingAddress;
  note?: string;
}

export interface CreateOrderResult {
  orderId: string;
  /** Hosted payment URL when a live provider is configured; null otherwise. */
  paymentUrl: string | null;
  status: string;
  type: OrderType;
}

export function createOrder(input: CreateOrderInput) {
  return request<CreateOrderResult>('/orders', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Customer cancels their own (still-pending) order. */
export function cancelOrder(orderId: string, reason?: string) {
  return request<{ ok: boolean; status: string }>(
    `/orders/${orderId}/cancel`,
    { method: 'POST', body: JSON.stringify({ reason }) }
  );
}

// --- admin ---

export function adminListOrders() {
  return request<{ orders: Order[] }>('/admin/orders');
}

export function adminUpdateOrder(
  orderId: string,
  patch: { status?: OrderStatus; adminNotes?: string }
) {
  return request<{ ok: boolean }>(`/admin/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

// --- admin: products (live catalog in Firestore `products`) ---
//
// Contract (implemented in functions/src/products.ts):
//   GET    /admin/products          → { products: CatalogProduct[] }  (all, incl. inactive)
//   POST   /admin/products          → { ok: true, id }                (409 if id/slug taken)
//   PATCH  /admin/products/:id      → { ok: true }                    (id & slug immutable)
//   DELETE /admin/products/:id      → { ok: true }
//   POST   /admin/products/seed     → { ok: true, seeded, skipped }   (creates missing ids only)
// Errors: non-2xx with { error: string } — surfaced as Error.message.

/** Writable product fields (server stamps createdAt/updatedAt). */
export type ProductInput = Omit<CatalogProduct, 'createdAt' | 'updatedAt' | 'currency'> & {
  currency?: 'BDT';
};

export function adminListProducts() {
  return request<{ products: CatalogProduct[] }>('/admin/products');
}

export function adminCreateProduct(product: ProductInput) {
  return request<{ ok: boolean; id: string }>('/admin/products', {
    method: 'POST',
    body: JSON.stringify(product),
  });
}

/**
 * Partial update. Send `null` (or '') to CLEAR an optional field —
 * compareAtPrice, image, descriptionEn, descriptionBn. id/slug are immutable.
 */
export type ProductPatch = Partial<
  Omit<ProductInput, 'compareAtPrice' | 'image' | 'descriptionEn' | 'descriptionBn'>
> & {
  compareAtPrice?: number | null;
  image?: string | null;
  descriptionEn?: string | null;
  descriptionBn?: string | null;
};

export function adminUpdateProduct(id: string, patch: ProductPatch) {
  return request<{ ok: boolean }>(`/admin/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function adminDeleteProduct(id: string) {
  return request<{ ok: boolean }>(`/admin/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function adminSeedProducts(products: ProductInput[]) {
  return request<{ ok: boolean; seeded: number; skipped: number }>(
    '/admin/products/seed',
    { method: 'POST', body: JSON.stringify({ products }) }
  );
}
