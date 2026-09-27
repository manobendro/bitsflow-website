/**
 * Admin product management — the live catalog in Firestore `products/{id}`.
 *
 *   GET    /admin/products          → { products }            (all, incl. inactive)
 *   POST   /admin/products          → { ok: true, id }        (409 if id/slug taken)
 *   PATCH  /admin/products/:id      → { ok: true }            (id & slug immutable)
 *   DELETE /admin/products/:id      → { ok: true }            (404 if missing)
 *   POST   /admin/products/seed     → { ok: true, seeded, skipped }
 *
 * Every route: 401 { error: 'Sign in required' } without a valid ID token,
 * 403 { error: 'Admin only' } for non-admins. Errors are JSON { error }.
 * Validation lives in ./productValidation.ts (pure, unit-testable).
 */
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { getFirestore, FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { isAdmin, requireUser, type DecodedishToken } from './admin.js';
import {
  SLUG_PATTERN,
  validateNewProduct,
  validateProductPatch,
  type ProductDoc,
} from './productValidation.js';

const MAX_SEED = 100;

const products = () => getFirestore().collection('products');

/** Sends 401/403 and returns null unless the caller is a signed-in admin. */
async function requireAdmin(req: Request, res: Response): Promise<DecodedishToken | null> {
  const user = await requireUser(req);
  if (!user) {
    res.status(401).json({ error: 'Sign in required' });
    return null;
  }
  if (!isAdmin(user)) {
    res.status(403).json({ error: 'Admin only' });
    return null;
  }
  return user;
}

function tsToMs(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const ts = v as { toMillis?: () => number };
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function serialize(id: string, data: DocumentData): DocumentData {
  return {
    ...data,
    id,
    slug: typeof data.slug === 'string' && data.slug ? data.slug : id,
    currency: 'BDT',
    createdAt: tsToMs(data.createdAt),
    updatedAt: tsToMs(data.updatedAt),
  };
}

/** Guard for a path id before it touches a Firestore doc path. */
function validPathId(id: string): boolean {
  return SLUG_PATTERN.test(id);
}

// --- GET /admin/products ---

export async function handleAdminListProducts(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  const snap = await products().get();
  const list = snap.docs.map((d) => serialize(d.id, d.data()));
  list.sort((a, b) => {
    const sa = typeof a.sortOrder === 'number' ? a.sortOrder : 1000;
    const sb = typeof b.sortOrder === 'number' ? b.sortOrder : 1000;
    return sa - sb || String(a.name ?? '').localeCompare(String(b.name ?? ''));
  });
  res.json({ products: list });
}

// --- POST /admin/products ---

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function handleAdminCreateProduct(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  const result = validateNewProduct(req.body);
  if (!result.ok) {
    res.status(400).json({ error: result.error, fields: result.fields });
    return;
  }
  const product = result.value;
  const db = getFirestore();
  const ref = products().doc(product.id);
  const now = Date.now();

  try {
    await db.runTransaction(async (tx) => {
      const [existing, sameSlug] = await Promise.all([
        tx.get(ref),
        tx.get(products().where('slug', '==', product.slug).limit(1)),
      ]);
      if (!sameSlug.empty || (existing.exists && product.id === product.slug)) {
        throw new HttpError(409, 'A product with that slug already exists');
      }
      if (existing.exists) {
        throw new HttpError(409, 'A product with that id already exists');
      }
      tx.create(ref, { ...product, createdAt: now, updatedAt: now });
    });
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }

  res.json({ ok: true, id: product.id });
}

// --- PATCH /admin/products/:id ---

export async function handleAdminUpdateProduct(req: Request, res: Response, id: string) {
  if (!(await requireAdmin(req, res))) return;
  if (!validPathId(id)) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  const ref = products().doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  const stored = snap.data() as DocumentData;
  // Docs written outside the API may lack these; fall back to the doc id.
  const existing = { ...stored, id, slug: stored.slug ?? id };

  const result = validateProductPatch(req.body, existing);
  if (!result.ok) {
    res.status(400).json({ error: result.error, fields: result.fields });
    return;
  }
  const { set, clear } = result.value;
  if (Object.keys(set).length === 0 && clear.length === 0) {
    res.status(400).json({ error: 'Nothing to update' });
    return;
  }

  const update: DocumentData = { ...set, updatedAt: Date.now() };
  for (const k of clear) update[k] = FieldValue.delete();
  // Backfill identity fields for docs created outside the API.
  if (stored.id !== id) update.id = id;
  if (!stored.slug) update.slug = id;
  if (stored.currency !== 'BDT') update.currency = 'BDT';

  await ref.update(update);
  res.json({ ok: true });
}

// --- DELETE /admin/products/:id ---

export async function handleAdminDeleteProduct(req: Request, res: Response, id: string) {
  if (!(await requireAdmin(req, res))) return;
  if (!validPathId(id)) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  const ref = products().doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  await ref.delete();
  res.json({ ok: true });
}

// --- POST /admin/products/seed ---

export async function handleAdminSeedProducts(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  const list = (req.body ?? {}).products;
  if (!Array.isArray(list)) {
    res.status(400).json({ error: 'products must be a list' });
    return;
  }
  if (list.length > MAX_SEED) {
    res.status(400).json({ error: `At most ${MAX_SEED} products can be seeded at once` });
    return;
  }

  const snap = await products().get();
  const takenIds = new Set<string>();
  const takenSlugs = new Set<string>();
  for (const d of snap.docs) {
    takenIds.add(d.id);
    const slug = d.get('slug');
    takenSlugs.add(typeof slug === 'string' && slug ? slug : d.id);
  }

  const toCreate: ProductDoc[] = [];
  let skipped = 0;
  for (const raw of list) {
    const r = validateNewProduct(raw);
    if (!r.ok || takenIds.has(r.value.id) || takenSlugs.has(r.value.slug)) {
      skipped++;
      continue;
    }
    takenIds.add(r.value.id);
    takenSlugs.add(r.value.slug);
    toCreate.push(r.value);
  }

  if (toCreate.length) {
    const now = Date.now();
    const batch = getFirestore().batch();
    for (const p of toCreate) {
      batch.create(products().doc(p.id), { ...p, createdAt: now, updatedAt: now });
    }
    await batch.commit();
  }

  res.json({ ok: true, seeded: toCreate.length, skipped });
}
