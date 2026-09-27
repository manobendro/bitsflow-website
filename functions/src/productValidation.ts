/**
 * Pure (Firestore-free) validation + sanitisation for admin product writes.
 * The server is authoritative: every field is whitelisted, trimmed, type- and
 * range-checked here before anything is written to `products/{id}`.
 *
 * Allowed values mirror `src/lib/catalog.ts` (PRODUCT_STATUSES, CATEGORIES,
 * ICONS, SLUG_PATTERN, RESERVED_SLUGS) — keep them in sync.
 */

export const PRODUCT_STATUSES = ['available', 'prebook', 'sold_out'] as const;
export const PRODUCT_CATEGORIES = ['boards', 'kits', 'accessories'] as const;
export const PRODUCT_ICONS = [
  'board',
  'starter',
  'robotics',
  'sensor',
  'battery',
  'cable',
  'classroom',
  'case',
] as const;
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
export const RESERVED_SLUGS = ['view'];

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export type ProductIcon = (typeof PRODUCT_ICONS)[number];

const DEFAULT_ICON: Record<ProductCategory, ProductIcon> = {
  boards: 'board',
  kits: 'starter',
  accessories: 'cable',
};

export const MAX_PRICE = 10_000_000;
const MAX_HIGHLIGHTS = 12;
const MAX_IN_BOX = 20;

/** Stored shape of a product document (minus server timestamps). */
export interface ProductDoc {
  id: string;
  slug: string;
  name: string;
  nameBn: string;
  tagline: string;
  taglineBn: string;
  descriptionEn?: string;
  descriptionBn?: string;
  price: number;
  compareAtPrice?: number;
  currency: 'BDT';
  status: ProductStatus;
  category: ProductCategory;
  icon: ProductIcon;
  hue: number;
  featured: boolean;
  active: boolean;
  sortOrder: number;
  highlights: string[];
  highlightsBn: string[];
  inBox: { en: string; bn: string }[];
  image?: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; fields: string[] };

/** A validated partial update. `clear` lists optional fields to delete. */
export interface ProductPatch {
  set: Partial<ProductDoc>;
  clear: (keyof ProductDoc)[];
}

type Raw = Record<string, unknown>;

// --- field helpers (push onto `errs` and return undefined when invalid) ---

class Errors {
  list: { field: string; msg: string }[] = [];
  add(field: string, msg: string) {
    this.list.push({ field, msg });
  }
  get any() {
    return this.list.length > 0;
  }
  fail<T>(): ValidationResult<T> {
    const fields = [...new Set(this.list.map((e) => e.field))];
    return {
      ok: false,
      fields,
      error: `Invalid product: ${this.list.map((e) => e.msg).join('; ')}`,
    };
  }
}

function isBlank(v: unknown) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

/** Optional string: undefined/null → undefined; else trimmed, length-checked. */
function text(errs: Errors, field: string, v: unknown, max: number): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' && typeof v !== 'number') {
    errs.add(field, `${field} must be text`);
    return undefined;
  }
  const s = String(v).trim();
  if (s.length > max) {
    errs.add(field, `${field} must be at most ${max} characters`);
    return undefined;
  }
  return s;
}

function int(
  errs: Errors,
  field: string,
  v: unknown,
  min: number,
  max: number
): number | undefined {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    errs.add(field, `${field} must be a number`);
    return undefined;
  }
  const r = Math.round(n);
  if (r < min || r > max) {
    errs.add(field, `${field} must be between ${min} and ${max}`);
    return undefined;
  }
  return r;
}

function bool(errs: Errors, field: string, v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  errs.add(field, `${field} must be true or false`);
  return undefined;
}

function oneOf<T extends string>(
  errs: Errors,
  field: string,
  v: unknown,
  allowed: readonly T[]
): T | undefined {
  const s = typeof v === 'string' ? v.trim() : v;
  if (typeof s === 'string' && (allowed as readonly string[]).includes(s)) return s as T;
  errs.add(field, `${field} must be one of ${allowed.join(', ')}`);
  return undefined;
}

function slugLike(errs: Errors, field: string, v: unknown): string | undefined {
  if (typeof v !== 'string') {
    errs.add(field, `${field} is required`);
    return undefined;
  }
  const s = v.trim().toLowerCase();
  if (!SLUG_PATTERN.test(s)) {
    errs.add(
      field,
      `${field} must be 2-64 characters of lowercase letters, numbers and dashes, starting with a letter or number`
    );
    return undefined;
  }
  if (RESERVED_SLUGS.includes(s)) {
    errs.add(field, `${field} "${s}" is reserved`);
    return undefined;
  }
  return s;
}

/** Image URL: must be https:// or a site-relative path (not protocol-relative). */
function imageUrl(errs: Errors, v: unknown): string | undefined {
  const s = text(errs, 'image', v, 500);
  if (s === undefined || s === '') return s;
  const ok = s.startsWith('https://') || (s.startsWith('/') && !s.startsWith('//'));
  if (!ok || /\s/.test(s)) {
    errs.add('image', "image must start with 'https://' or '/'");
    return undefined;
  }
  return s;
}

function stringArray(errs: Errors, field: string, v: unknown): string[] | undefined {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    errs.add(field, `${field} must be a list`);
    return undefined;
  }
  const out: string[] = [];
  let bad = false;
  for (const item of v) {
    if (item === undefined || item === null) {
      out.push('');
      continue;
    }
    if (typeof item !== 'string' && typeof item !== 'number') {
      bad = true;
      out.push('');
      continue;
    }
    const s = String(item).trim();
    if (s.length > 200) bad = true;
    out.push(s.slice(0, 200));
  }
  if (bad) {
    errs.add(field, `each ${field} item must be text of at most 200 characters`);
    return undefined;
  }
  return out; // raw-index aligned; empties dropped by alignHighlights
}

/**
 * Drop empty EN highlights (and their BN counterparts) and align BN to EN;
 * missing / empty BN items fall back to the EN text.
 */
function alignHighlights(
  errs: Errors,
  en: string[],
  bn: string[]
): { highlights: string[]; highlightsBn: string[] } | undefined {
  const highlights: string[] = [];
  const highlightsBn: string[] = [];
  en.forEach((e, i) => {
    if (!e) return;
    highlights.push(e);
    highlightsBn.push(bn[i] || e);
  });
  if (highlights.length > MAX_HIGHLIGHTS) {
    errs.add('highlights', `highlights can have at most ${MAX_HIGHLIGHTS} items`);
    return undefined;
  }
  return { highlights, highlightsBn };
}

function inBoxList(errs: Errors, v: unknown): { en: string; bn: string }[] | undefined {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    errs.add('inBox', 'inBox must be a list');
    return undefined;
  }
  const out: { en: string; bn: string }[] = [];
  let bad = false;
  for (const item of v) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      if (item !== null && item !== undefined && item !== '') bad = true;
      continue;
    }
    const r = item as Raw;
    const en = typeof r.en === 'string' || typeof r.en === 'number' ? String(r.en).trim() : '';
    const bn = typeof r.bn === 'string' || typeof r.bn === 'number' ? String(r.bn).trim() : '';
    if (en.length > 120 || bn.length > 120) {
      bad = true;
      continue;
    }
    if (!en) continue;
    out.push({ en, bn: bn || en });
  }
  if (bad) {
    errs.add('inBox', 'each inBox item must be { en, bn } text of at most 120 characters');
    return undefined;
  }
  if (out.length > MAX_IN_BOX) {
    errs.add('inBox', `inBox can have at most ${MAX_IN_BOX} items`);
    return undefined;
  }
  return out;
}

function priceField(errs: Errors, v: unknown, field = 'price') {
  return int(errs, field, v, 0, MAX_PRICE);
}

// --- create ---

/** Validate a full product for creation. Applies defaults. */
export function validateNewProduct(input: unknown): ValidationResult<ProductDoc> {
  const errs = new Errors();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    errs.add('body', 'product must be an object');
    return errs.fail();
  }
  const raw = input as Raw;

  const slug = slugLike(errs, 'slug', raw.slug);
  const id = isBlank(raw.id) ? slug : slugLike(errs, 'id', raw.id);

  const name = text(errs, 'name', raw.name, 120);
  if (name === '' || (name === undefined && !errs.list.some((e) => e.field === 'name'))) {
    errs.add('name', 'name is required');
  }
  const nameBn = text(errs, 'nameBn', raw.nameBn, 120);
  const tagline = text(errs, 'tagline', raw.tagline, 200);
  const taglineBn = text(errs, 'taglineBn', raw.taglineBn, 200);
  const descriptionEn = text(errs, 'descriptionEn', raw.descriptionEn, 2000);
  const descriptionBn = text(errs, 'descriptionBn', raw.descriptionBn, 2000);

  let price: number | undefined;
  if (isBlank(raw.price)) errs.add('price', 'price is required');
  else price = priceField(errs, raw.price);
  const compareAtPrice = isBlank(raw.compareAtPrice)
    ? undefined
    : priceField(errs, raw.compareAtPrice, 'compareAtPrice');

  const status = oneOf(errs, 'status', raw.status, PRODUCT_STATUSES);
  const category = oneOf(errs, 'category', raw.category, PRODUCT_CATEGORIES);
  const icon = isBlank(raw.icon)
    ? category && DEFAULT_ICON[category]
    : oneOf(errs, 'icon', raw.icon, PRODUCT_ICONS);
  const hue = isBlank(raw.hue) ? 160 : int(errs, 'hue', raw.hue, 0, 360);
  const featured = isBlank(raw.featured) ? false : bool(errs, 'featured', raw.featured);
  const active = isBlank(raw.active) ? true : bool(errs, 'active', raw.active);
  const sortOrder = isBlank(raw.sortOrder)
    ? 1000
    : int(errs, 'sortOrder', raw.sortOrder, -1_000_000, 1_000_000);

  const en = stringArray(errs, 'highlights', raw.highlights);
  const bn = stringArray(errs, 'highlightsBn', raw.highlightsBn);
  const hl = en && bn ? alignHighlights(errs, en, bn) : undefined;
  const inBox = inBoxList(errs, raw.inBox);
  const image = imageUrl(errs, raw.image);

  if (errs.any) return errs.fail();

  const doc: ProductDoc = {
    id: id!,
    slug: slug!,
    name: name!,
    nameBn: nameBn || name!,
    tagline: tagline ?? '',
    taglineBn: taglineBn || tagline || '',
    price: price!,
    currency: 'BDT',
    status: status!,
    category: category!,
    icon: icon!,
    hue: hue!,
    featured: featured!,
    active: active!,
    sortOrder: sortOrder!,
    highlights: hl!.highlights,
    highlightsBn: hl!.highlightsBn,
    inBox: inBox!,
  };
  if (compareAtPrice !== undefined && compareAtPrice > price!) doc.compareAtPrice = compareAtPrice;
  if (descriptionEn) doc.descriptionEn = descriptionEn;
  if (descriptionBn) doc.descriptionBn = descriptionBn;
  if (image) doc.image = image;
  return { ok: true, value: doc };
}

// --- patch ---

/**
 * Validate a partial update against the stored document. Only fields present
 * in `input` are touched. `id` / `slug` are immutable.
 */
export function validateProductPatch(
  input: unknown,
  existing: Raw
): ValidationResult<ProductPatch> {
  const errs = new Errors();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    errs.add('body', 'update must be an object');
    return errs.fail();
  }
  const raw = input as Raw;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(raw, k) && raw[k] !== undefined;
  const set: Partial<ProductDoc> = {};
  const clear: (keyof ProductDoc)[] = [];

  // Immutable keys.
  for (const k of ['id', 'slug'] as const) {
    if (!has(k)) continue;
    const given = typeof raw[k] === 'string' ? (raw[k] as string).trim().toLowerCase() : raw[k];
    if (given !== existing[k]) errs.add(k, `${k} can't be changed`);
  }

  // `has(k)` is true for any provided value, including null (= reset to default).
  if (has('name')) {
    const name = text(errs, 'name', raw.name, 120);
    if (isBlank(raw.name)) errs.add('name', 'name is required');
    else if (name !== undefined) set.name = name;
  }
  const effName = set.name ?? String(existing.name ?? '');
  if (has('nameBn')) set.nameBn = text(errs, 'nameBn', raw.nameBn, 120) || effName;
  if (has('tagline')) set.tagline = text(errs, 'tagline', raw.tagline, 200) ?? '';
  const effTagline = set.tagline ?? String(existing.tagline ?? '');
  if (has('taglineBn')) set.taglineBn = text(errs, 'taglineBn', raw.taglineBn, 200) || effTagline;
  for (const k of ['descriptionEn', 'descriptionBn'] as const) {
    if (!has(k)) continue;
    const v = text(errs, k, raw[k], 2000);
    if (isBlank(raw[k])) clear.push(k);
    else if (v !== undefined) set[k] = v;
  }

  // Prices.
  if (has('price')) {
    if (isBlank(raw.price)) errs.add('price', 'price is required');
    else set.price = priceField(errs, raw.price);
  }
  const effPrice = set.price ?? Number(existing.price ?? 0);
  if (has('compareAtPrice')) {
    if (isBlank(raw.compareAtPrice)) clear.push('compareAtPrice');
    else {
      const c = priceField(errs, raw.compareAtPrice, 'compareAtPrice');
      if (c !== undefined) {
        if (c > effPrice) set.compareAtPrice = c;
        else clear.push('compareAtPrice');
      }
    }
  } else if (set.price !== undefined && existing.compareAtPrice !== undefined) {
    const stored = Number(existing.compareAtPrice);
    if (!(Number.isFinite(stored) && stored > set.price)) clear.push('compareAtPrice');
  }

  if (has('status')) set.status = oneOf(errs, 'status', raw.status, PRODUCT_STATUSES);
  if (has('category')) set.category = oneOf(errs, 'category', raw.category, PRODUCT_CATEGORIES);
  if (has('icon')) set.icon = oneOf(errs, 'icon', raw.icon, PRODUCT_ICONS);
  if (has('hue')) set.hue = int(errs, 'hue', raw.hue, 0, 360);
  if (has('featured')) set.featured = bool(errs, 'featured', raw.featured);
  if (has('active')) set.active = bool(errs, 'active', raw.active);
  if (has('sortOrder')) set.sortOrder = int(errs, 'sortOrder', raw.sortOrder, -1_000_000, 1_000_000);

  if (has('highlights') || has('highlightsBn')) {
    const storedEn = Array.isArray(existing.highlights) ? existing.highlights.map(String) : [];
    const storedBn = Array.isArray(existing.highlightsBn)
      ? existing.highlightsBn.map(String)
      : [];
    const en = has('highlights') ? stringArray(errs, 'highlights', raw.highlights) : storedEn;
    const bn = has('highlightsBn')
      ? stringArray(errs, 'highlightsBn', raw.highlightsBn)
      : storedBn;
    if (en && bn) {
      const hl = alignHighlights(errs, en, bn);
      if (hl) {
        set.highlights = hl.highlights;
        set.highlightsBn = hl.highlightsBn;
      }
    }
  }
  if (has('inBox')) {
    const v = inBoxList(errs, raw.inBox);
    if (v) set.inBox = v;
  }
  if (has('image')) {
    if (isBlank(raw.image)) clear.push('image');
    else {
      const v = imageUrl(errs, raw.image);
      if (v) set.image = v;
    }
  }

  if (errs.any) return errs.fail();
  // Strip keys whose validator returned undefined (only possible on error paths).
  for (const k of Object.keys(set) as (keyof ProductDoc)[]) {
    if (set[k] === undefined) delete set[k];
  }
  return { ok: true, value: { set, clear: [...new Set(clear)] } };
}
