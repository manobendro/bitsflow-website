/**
 * Live product reads for storefront islands.
 *
 * Reads the public Firestore `products` collection (rules allow public read) and
 * normalizes each doc into a `CatalogProduct`. Falls back to the seed catalog in
 * `catalog.ts` when the collection is empty (not seeded yet) or unreachable, so
 * the storefront is never blank.
 *
 * One fetch is shared per page load (islands on the same page reuse it).
 * Browser-only — call from effects/handlers, never during SSR.
 */
import { collection, getDocsFromServer } from 'firebase/firestore';
import { db } from './firebase/client';
import {
  PRODUCTS,
  PRODUCT_CATEGORIES,
  PRODUCT_ICONS,
  PRODUCT_STATUSES,
  sortProducts,
  type CatalogProduct,
  type ProductCategory,
  type ProductIcon,
  type ProductStatus,
} from './catalog';

export type ProductsSource = 'live' | 'fallback';

const DEFAULT_ICON: Record<ProductCategory, ProductIcon> = {
  boards: 'board',
  kits: 'starter',
  accessories: 'cable',
};

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean) : [];
}

function toMs(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  const ts = v as { toMillis?: () => number } | null;
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : undefined;
}

/** Coerce a raw Firestore doc into a safe CatalogProduct (or null if unusable). */
export function normalizeProduct(raw: Record<string, unknown>, id: string): CatalogProduct | null {
  const name = str(raw.name).trim();
  const slug = str(raw.slug).trim() || id;
  const price = Number(raw.price);
  if (!name || !slug || !Number.isFinite(price)) return null;

  const category = PRODUCT_CATEGORIES.includes(raw.category as ProductCategory)
    ? (raw.category as ProductCategory)
    : 'accessories';
  const status = PRODUCT_STATUSES.includes(raw.status as ProductStatus)
    ? (raw.status as ProductStatus)
    : 'available';
  const icon = PRODUCT_ICONS.includes(raw.icon as ProductIcon)
    ? (raw.icon as ProductIcon)
    : DEFAULT_ICON[category];
  const compare = Number(raw.compareAtPrice);
  const hue = Number(raw.hue);

  const highlights = strList(raw.highlights);
  const highlightsBn = strList(raw.highlightsBn);
  const inBox = Array.isArray(raw.inBox)
    ? (raw.inBox as Record<string, unknown>[])
        .map((i) => ({ en: str(i?.en), bn: str(i?.bn) || str(i?.en) }))
        .filter((i) => i.en)
    : [];

  return {
    id: str(raw.id) || id,
    slug,
    name,
    nameBn: str(raw.nameBn) || name,
    tagline: str(raw.tagline),
    taglineBn: str(raw.taglineBn) || str(raw.tagline),
    price: Math.max(0, Math.round(price)),
    compareAtPrice:
      Number.isFinite(compare) && compare > price ? Math.round(compare) : undefined,
    currency: 'BDT',
    status,
    category,
    featured: raw.featured === true,
    icon,
    hue: Number.isFinite(hue) ? Math.min(360, Math.max(0, hue)) : 160,
    image: str(raw.image) || undefined,
    highlights,
    highlightsBn: highlights.map((h, i) => highlightsBn[i] || h),
    inBox,
    descriptionEn: str(raw.descriptionEn) || undefined,
    descriptionBn: str(raw.descriptionBn) || undefined,
    active: raw.active !== false,
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : 1000,
    createdAt: toMs(raw.createdAt),
    updatedAt: toMs(raw.updatedAt),
  };
}

let inflight: Promise<{ products: CatalogProduct[]; source: ProductsSource }> | null = null;

/**
 * All products (INCLUDING inactive ones — filter with `publishedOnly` for the
 * storefront). Falls back to the seed catalog if Firestore is empty/unreachable.
 */
export function fetchLiveProducts(): Promise<{
  products: CatalogProduct[];
  source: ProductsSource;
}> {
  if (!inflight) {
    inflight = (async () => {
      try {
        // FromServer: offline must mean "fall back to the seed", never an empty
        // cached result mistaken for an unseeded catalog.
        const snap = await getDocsFromServer(collection(db(), 'products'));
        const products = snap.docs
          .map((d) => normalizeProduct(d.data(), d.id))
          .filter((p): p is CatalogProduct => p !== null);
        if (products.length === 0) {
          return { products: sortProducts(PRODUCTS), source: 'fallback' as const };
        }
        return { products: sortProducts(products), source: 'live' as const };
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[products] live fetch failed, using seed catalog', err);
        inflight = null; // allow a retry on the next call
        return { products: sortProducts(PRODUCTS), source: 'fallback' as const };
      }
    })();
  }
  return inflight;
}

/**
 * One product by slug. Returns `product: null` when the live catalog exists but
 * no longer contains that slug (deleted). Inactive products ARE returned (with
 * `active: false`) so the page can show a "no longer available" state.
 */
export async function fetchLiveProductBySlug(slug: string): Promise<{
  product: CatalogProduct | null;
  source: ProductsSource;
}> {
  const { products, source } = await fetchLiveProducts();
  return { product: products.find((p) => p.slug === slug) ?? null, source };
}

/** Drop the shared cache (e.g. after an admin edit in the same tab). */
export function invalidateLiveProducts() {
  inflight = null;
}
