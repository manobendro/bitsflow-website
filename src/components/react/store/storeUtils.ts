/**
 * Small pure helpers shared by the storefront islands (grid, card, detail).
 * Everything here is deterministic so it is safe to call during render
 * (server and client produce identical output).
 */
import {
  CATEGORIES,
  PRODUCT_CATEGORIES,
  publishedOnly,
  sortProducts,
  type CatalogProduct,
  type ProductCategory,
} from '../../../lib/catalog';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** 12 -> "১২" (Bengali numerals, for counts in Bengali copy). */
export function bnDigits(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/** Whole-percent saving when a compare-at price is set, else 0. */
export function savePercent(p: Pick<CatalogProduct, 'price' | 'compareAtPrice'>): number {
  if (!p.compareAtPrice || p.compareAtPrice <= p.price || p.compareAtPrice <= 0) return 0;
  return Math.round((1 - p.price / p.compareAtPrice) * 100);
}

export function categoryInfo(key: ProductCategory) {
  return CATEGORIES.find((c) => c.key === key) ?? { key, en: key, bn: key };
}

export function isCategory(v: string | null | undefined): v is ProductCategory {
  return !!v && (PRODUCT_CATEGORIES as string[]).includes(v);
}

/** Friendly one-liners under each category heading on /products. */
export const CATEGORY_BLURB: Record<ProductCategory, { en: string; bn: string }> = {
  boards: {
    en: 'The pocket-sized heart of every project.',
    bn: 'প্রতিটা প্রজেক্টের পকেট সাইজের প্রাণ।',
  },
  kits: {
    en: 'Everything in one box — just open it and start building.',
    bn: 'সব কিছু এক বাক্সে — খোলো আর বানানো শুরু করো।',
  },
  accessories: {
    en: 'Extras that take your builds further.',
    bn: 'তোমার প্রজেক্টকে আরও এগিয়ে নেওয়ার বাড়তি জিনিস।',
  },
};

/** Case-insensitive match on EN + BN name and tagline. */
export function matchesQuery(p: CatalogProduct, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [p.name, p.nameBn, p.tagline, p.taglineBn].some((s) =>
    (s || '').toLowerCase().includes(needle)
  );
}

/**
 * Up to `limit` published products related to `product`: same category first
 * (storefront order), then the rest of the range.
 */
export function relatedProducts(
  product: CatalogProduct,
  all: CatalogProduct[],
  limit = 3
): CatalogProduct[] {
  const others = sortProducts(publishedOnly(all)).filter(
    (p) => p.slug !== product.slug && p.id !== product.id
  );
  const same = others.filter((p) => p.category === product.category);
  const rest = others.filter((p) => p.category !== product.category);
  return [...same, ...rest].slice(0, limit);
}

/** Smooth-scroll unless the user prefers reduced motion. */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined' || !window.matchMedia) return 'auto';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
