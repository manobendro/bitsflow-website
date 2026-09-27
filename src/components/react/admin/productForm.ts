/**
 * Admin product editor model: the editable draft shape, conversions to/from
 * `CatalogProduct` / `ProductInput`, client validation (mirrors the API) and
 * the "changed fields only" diff used for PATCH.
 */
import {
  PRODUCTS,
  RESERVED_SLUGS,
  SLUG_PATTERN,
  type CatalogProduct,
  type ProductCategory,
  type ProductIcon,
  type ProductStatus,
} from '../../../lib/catalog';
import type { ProductInput } from '../../../lib/api';

export const MAX_HIGHLIGHTS = 12;
export const MAX_IN_BOX = 20;

export interface Pair {
  /** Stable React key (never sent to the server). */
  key: string;
  en: string;
  bn: string;
}

export interface Draft {
  name: string;
  nameBn: string;
  slug: string;
  category: ProductCategory;
  icon: ProductIcon;
  hue: number;
  price: string;
  compareAtPrice: string;
  status: ProductStatus;
  active: boolean;
  featured: boolean;
  sortOrder: string;
  tagline: string;
  taglineBn: string;
  descriptionEn: string;
  descriptionBn: string;
  image: string;
  highlights: Pair[];
  inBox: Pair[];
}

let keySeq = 0;
export function newKey(): string {
  keySeq += 1;
  return `k${keySeq}`;
}

export function pair(en = '', bn = ''): Pair {
  return { key: newKey(), en, bn };
}

/** "Robotics Add-on Kit (×10)" → "robotics-add-on-kit-10" (a-z0-9-, max 64). */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}

export const DEFAULT_ICON_FOR: Record<ProductCategory, ProductIcon> = {
  boards: 'board',
  kits: 'starter',
  accessories: 'cable',
};

export function emptyDraft(sortOrder = 1000): Draft {
  return {
    name: '',
    nameBn: '',
    slug: '',
    category: 'accessories',
    icon: 'cable',
    hue: 160,
    price: '',
    compareAtPrice: '',
    status: 'available',
    active: true,
    featured: false,
    sortOrder: String(sortOrder),
    tagline: '',
    taglineBn: '',
    descriptionEn: '',
    descriptionBn: '',
    image: '',
    highlights: [pair()],
    inBox: [],
  };
}

export function productToDraft(p: CatalogProduct): Draft {
  const hl = p.highlights ?? [];
  const hlBn = p.highlightsBn ?? [];
  return {
    name: p.name ?? '',
    nameBn: p.nameBn ?? '',
    slug: p.slug ?? '',
    category: p.category,
    icon: p.icon,
    hue: Number.isFinite(p.hue) ? p.hue : 160,
    price: String(p.price ?? ''),
    compareAtPrice: p.compareAtPrice != null ? String(p.compareAtPrice) : '',
    status: p.status,
    active: p.active !== false,
    featured: p.featured === true,
    sortOrder: String(p.sortOrder ?? 1000),
    tagline: p.tagline ?? '',
    taglineBn: p.taglineBn ?? '',
    descriptionEn: p.descriptionEn ?? '',
    descriptionBn: p.descriptionBn ?? '',
    image: p.image ?? '',
    highlights: hl.map((en, i) => pair(en, hlBn[i] ?? '')),
    inBox: (p.inBox ?? []).map((b) => pair(b.en, b.bn)),
  };
}

/** Parse a whole-taka amount ("4,500" → 4500). NaN when not a whole number. */
export function parseTaka(v: string): number {
  const s = v.replace(/[,\s]/g, '');
  if (!/^\d+$/.test(s)) return NaN;
  return Number(s);
}

function parseIntLoose(v: string): number {
  const s = v.trim();
  if (!/^-?\d+$/.test(s)) return NaN;
  return Number(s);
}

/** Rows with no text at all are dropped; BN falls back to EN. */
function cleanPairs(list: Pair[]): { en: string; bn: string }[] {
  return list
    .map((p) => ({ en: p.en.trim(), bn: p.bn.trim() }))
    .filter((p) => p.en || p.bn)
    .map((p) => ({ en: p.en, bn: p.bn || p.en }));
}

/**
 * Normalized, server-shaped values. Optional fields use their "cleared"
 * representation (compareAtPrice: null, strings: '') so a diff can clear them.
 */
export type NormalizedProduct = Omit<ProductInput, 'compareAtPrice' | 'id'> & {
  compareAtPrice: number | null;
};

export function normalizeDraft(d: Draft): NormalizedProduct {
  const compare = parseTaka(d.compareAtPrice);
  const sort = parseIntLoose(d.sortOrder);
  const hl = cleanPairs(d.highlights);
  return {
    slug: d.slug.trim(),
    name: d.name.trim(),
    nameBn: d.nameBn.trim() || d.name.trim(),
    tagline: d.tagline.trim(),
    taglineBn: d.taglineBn.trim() || d.tagline.trim(),
    price: parseTaka(d.price),
    compareAtPrice: d.compareAtPrice.trim() && Number.isFinite(compare) ? compare : null,
    status: d.status,
    category: d.category,
    featured: d.featured,
    icon: d.icon,
    hue: Math.round(Math.min(360, Math.max(0, d.hue))),
    image: d.image.trim(),
    highlights: hl.map((h) => h.en),
    highlightsBn: hl.map((h) => h.bn),
    inBox: cleanPairs(d.inBox),
    descriptionEn: d.descriptionEn.trim(),
    descriptionBn: d.descriptionBn.trim(),
    active: d.active,
    sortOrder: Number.isFinite(sort) ? sort : 1000,
    currency: 'BDT',
  };
}

/** Full payload for POST /admin/products (empty optionals omitted). */
export function draftToCreateInput(d: Draft): ProductInput {
  const n = normalizeDraft(d);
  const { compareAtPrice, image, descriptionEn, descriptionBn, ...rest } = n;
  const input: ProductInput = { ...rest, id: n.slug };
  if (compareAtPrice != null) input.compareAtPrice = compareAtPrice;
  if (image) input.image = image;
  if (descriptionEn) input.descriptionEn = descriptionEn;
  if (descriptionBn) input.descriptionBn = descriptionBn;
  return input;
}

/**
 * Changed fields only, for PATCH. `compareAtPrice: null` clears it and
 * `image: ''` clears the photo. Slug/id are immutable and never sent.
 */
export function diffForUpdate(original: CatalogProduct, d: Draft): Record<string, unknown> {
  const before = normalizeDraft(productToDraft(original));
  const after = normalizeDraft(d);
  const patch: Record<string, unknown> = {};
  (Object.keys(after) as (keyof NormalizedProduct)[]).forEach((k) => {
    if (k === 'slug' || k === 'currency') return;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) patch[k] = after[k];
  });
  return patch;
}

/** Stable serialization for the unsaved-changes guard (ignores React keys). */
export function draftSignature(d: Draft): string {
  return JSON.stringify({
    ...d,
    highlights: d.highlights.map((p) => [p.en, p.bn]),
    inBox: d.inBox.map((p) => [p.en, p.bn]),
  });
}

/** Draft rendered as a product for the live preview card. */
export function draftToPreview(d: Draft, id: string): CatalogProduct {
  const n = normalizeDraft(d);
  return {
    ...n,
    id,
    name: n.name || 'Untitled product',
    nameBn: d.nameBn.trim() || n.name || 'নাম নেই',
    slug: n.slug || 'new-product',
    price: Number.isFinite(n.price) ? n.price : 0,
    compareAtPrice: n.compareAtPrice ?? undefined,
    image: n.image && isValidImage(n.image) ? n.image : undefined,
    currency: 'BDT',
  };
}

export function isValidImage(v: string): boolean {
  return v.startsWith('https://') || v.startsWith('/');
}

export type FieldErrors = Partial<Record<string, string>>;

/**
 * Client validation mirroring the server. Keys are field names
 * (`highlights.<key>` / `inBox.<key>` for list rows).
 */
export function validateDraft(
  d: Draft,
  opts: { isNew: boolean; others: CatalogProduct[] }
): FieldErrors {
  const e: FieldErrors = {};
  if (!d.name.trim()) e.name = 'Give the product a name.';
  else if (d.name.trim().length > 120) e.name = 'Keep the name under 120 characters.';

  if (opts.isNew) {
    const slug = d.slug.trim();
    if (!slug) e.slug = 'A slug is required — it becomes the product link.';
    else if (!SLUG_PATTERN.test(slug))
      e.slug = 'Use 2–64 lowercase letters, numbers and dashes, starting with a letter or number.';
    else if (RESERVED_SLUGS.includes(slug)) e.slug = `“${slug}” is reserved — pick another slug.`;
    else if (opts.others.some((p) => p.slug === slug || p.id === slug))
      e.slug = 'Another product already uses this slug.';
  }

  if (!d.price.trim()) e.price = 'Price is required.';
  else if (!Number.isFinite(parseTaka(d.price)))
    e.price = 'Use whole taka with no decimals, e.g. 4500.';

  if (d.compareAtPrice.trim() && !Number.isFinite(parseTaka(d.compareAtPrice)))
    e.compareAtPrice = 'Use whole taka, or leave it empty.';

  if (d.sortOrder.trim() && !Number.isFinite(parseIntLoose(d.sortOrder)))
    e.sortOrder = 'Use a whole number (lower shows first).';

  const img = d.image.trim();
  if (img && !isValidImage(img)) e.image = 'Image links must start with https:// or /';

  if (d.highlights.length > MAX_HIGHLIGHTS) e.highlights = `Up to ${MAX_HIGHLIGHTS} highlights.`;
  d.highlights.forEach((h) => {
    if (!h.en.trim() && h.bn.trim()) e[`highlights.${h.key}`] = 'Add the English text too.';
  });
  if (d.inBox.length > MAX_IN_BOX) e.inBox = `Up to ${MAX_IN_BOX} items.`;
  d.inBox.forEach((b) => {
    if (!b.en.trim() && b.bn.trim()) e[`inBox.${b.key}`] = 'Add the English text too.';
  });
  return e;
}

/** compare-at advice: savings % or a warning. */
export function compareAtInfo(
  d: Draft
): { kind: 'save'; pct: number; amount: number } | { kind: 'warn' } | null {
  const price = parseTaka(d.price);
  const compare = parseTaka(d.compareAtPrice);
  if (!d.compareAtPrice.trim() || !Number.isFinite(compare) || !Number.isFinite(price)) return null;
  if (compare <= price) return { kind: 'warn' };
  return {
    kind: 'save',
    pct: Math.round(((compare - price) / compare) * 100),
    amount: compare - price,
  };
}

/** Seed payload: the built-in catalog without server-stamped fields. */
export function seedInputs(): ProductInput[] {
  return PRODUCTS.map(({ createdAt: _c, updatedAt: _u, ...rest }) => rest);
}

/** "3 min ago" style relative time for list rows. */
export function relativeTime(ms?: number): string {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  const s = Math.round(diff / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? '' : 's'} ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(ms)
  );
}
