/**
 * Bitsflow backend API.
 *
 * A single HTTPS function (`api`) routed by path, exposed to the site under
 * `/api/**` via the Firebase Hosting rewrite in firebase.json. Keeps order
 * creation, cancellation and admin updates authoritative on the server.
 */
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  FieldValue,
  type DocumentData,
} from 'firebase-admin/firestore';
import { getProduct } from './catalog.js';
import { getPaymentProvider } from './payments/index.js';
import { isAdmin, requireUser } from './admin.js';
import {
  handleAdminListProducts,
  handleAdminCreateProduct,
  handleAdminUpdateProduct,
  handleAdminDeleteProduct,
  handleAdminSeedProducts,
} from './products.js';

initializeApp();
const db = getFirestore();

// Statuses a customer may self-cancel at.
const CUSTOMER_CANCELLABLE = ['pending'];
const VALID_STATUSES = [
  'pending',
  'confirmed',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
];
const VALID_TYPES = ['reserve', 'preorder', 'order'];

// Allowed site origin(s) for CORS.
const ALLOWED_ORIGINS = [
  'https://bitsflow.cc',
  'https://www.bitsflow.cc',
  'https://bitsflow-21443.web.app',
  'https://bitsflow-21443.firebaseapp.com',
  'http://localhost:4321',
  'http://localhost:4322',
  'http://127.0.0.1:5000',
];

export const api = onRequest(
  { region: 'asia-southeast1', cors: true, maxInstances: 10 },
  async (req, res) => {
    const origin = req.headers.origin ?? '';
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.status(204).send('');
      return;
    }

    // Strip the /api prefix that the hosting rewrite leaves in place.
    const path = req.path.replace(/^\/api/, '') || '/';

    try {
      // --- customer endpoints ---
      if (req.method === 'POST' && path === '/orders') {
        await handleCreateOrder(req, res);
        return;
      }
      // /orders/:id/cancel
      const cancelMatch = path.match(/^\/orders\/([^/]+)\/cancel$/);
      if (req.method === 'POST' && cancelMatch) {
        await handleCancelOrder(req, res, cancelMatch[1]);
        return;
      }

      // --- admin endpoints ---
      if (req.method === 'GET' && path === '/admin/orders') {
        await handleAdminListOrders(req, res);
        return;
      }
      const adminOrderMatch = path.match(/^\/admin\/orders\/([^/]+)$/);
      if (req.method === 'PATCH' && adminOrderMatch) {
        await handleAdminUpdateOrder(req, res, adminOrderMatch[1]);
        return;
      }

      // --- admin: products (live catalog) ---
      if (path === '/admin/products') {
        if (req.method === 'GET') {
          await handleAdminListProducts(req, res);
          return;
        }
        if (req.method === 'POST') {
          await handleAdminCreateProduct(req, res);
          return;
        }
      }
      if (req.method === 'POST' && path === '/admin/products/seed') {
        await handleAdminSeedProducts(req, res);
        return;
      }
      const adminProductMatch = path.match(/^\/admin\/products\/([^/]+)$/);
      if (adminProductMatch && adminProductMatch[1] !== 'seed') {
        const productId = safeDecode(adminProductMatch[1]);
        if (req.method === 'PATCH') {
          await handleAdminUpdateProduct(req, res, productId);
          return;
        }
        if (req.method === 'DELETE') {
          await handleAdminDeleteProduct(req, res, productId);
          return;
        }
      }

      if (req.method === 'POST' && path === '/payments/webhook') {
        await handlePaymentWebhook(req, res);
        return;
      }

      res.status(404).json({ error: 'Not found' });
    } catch (err) {
      logger.error('api error', err);
      res.status(500).json({ error: 'Internal error' });
    }
  }
);

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// --- helpers ---

function str(v: unknown, max = 200): string {
  return String(v ?? '').trim().slice(0, max);
}

function cleanCustomer(raw: DocumentData) {
  return {
    name: str(raw?.name, 120),
    phone: str(raw?.phone, 40),
    occupation: str(raw?.occupation, 80),
    school: str(raw?.school, 160),
  };
}

function cleanShipping(raw: DocumentData) {
  return {
    line1: str(raw?.line1, 200),
    line2: str(raw?.line2, 200),
    city: str(raw?.city, 80),
    district: str(raw?.district, 80),
    postcode: str(raw?.postcode, 20),
    country: str(raw?.country, 80) || 'Bangladesh',
  };
}

// --- order creation ---

async function handleCreateOrder(
  req: import('firebase-functions/v2/https').Request,
  res: import('express').Response
) {
  const user = await requireUser(req);
  if (!user) {
    res.status(401).json({ error: 'Sign in required' });
    return;
  }

  const body = req.body ?? {};
  const qty = Math.max(1, Math.min(20, Number(body.quantity) || 1));
  const lookup = await getProduct(String(body.productId ?? ''));
  if (!lookup.found) {
    if (lookup.reason === 'inactive') {
      res.status(409).json({ error: 'This product is no longer available' });
    } else {
      res.status(400).json({ error: 'Unknown product' });
    }
    return;
  }
  const product = lookup.product;
  if (product.status === 'sold_out') {
    res.status(409).json({ error: 'This product is sold out' });
    return;
  }

  const type = VALID_TYPES.includes(body.type) ? body.type : 'order';
  const customer = cleanCustomer(body.customer ?? {});
  const shipping = cleanShipping(body.shipping ?? {});

  // Required-field validation.
  const missing: string[] = [];
  if (!customer.name) missing.push('name');
  if (!customer.phone) missing.push('phone');
  if (!shipping.line1) missing.push('address');
  if (!shipping.city) missing.push('city');
  if (!shipping.district) missing.push('district');
  if (missing.length) {
    res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    return;
  }

  const total = product.price * qty;
  const nowMs = Date.now();
  const now = FieldValue.serverTimestamp();

  const orderRef = db.collection('orders').doc();
  await orderRef.set({
    uid: user.uid,
    type,
    items: [
      { productId: product.id, name: product.name, unitPrice: product.price, quantity: qty },
    ],
    total,
    currency: 'BDT',
    status: 'pending',
    customer,
    shipping,
    note: str(body.note, 500),
    adminNotes: '',
    customerEmail: user.email ?? '',
    history: [
      {
        at: nowMs,
        by: user.uid,
        byEmail: user.email ?? '',
        action: 'created',
        status: 'pending',
      },
    ],
    createdAt: now,
    updatedAt: now,
  });

  // Remember this checkout on the user's profile so their next order form can be
  // pre-filled. cleanCustomer/cleanShipping return every field (blanks included),
  // so the merge fully replaces the previous address. Best-effort: a profile
  // write failure must never fail an order that was already created.
  try {
    await db
      .collection('users')
      .doc(user.uid)
      .set({ checkout: { customer, shipping, updatedAt: nowMs } }, { merge: true });
  } catch (err) {
    logger.warn('could not save checkout details to profile', { uid: user.uid, err });
  }

  // Hand off to the payment provider only for committed purchases (not reserves).
  let paymentUrl: string | null = null;
  if (type !== 'reserve') {
    const provider = getPaymentProvider();
    const baseUrl = process.env.SITE_URL ?? 'http://localhost:4322';
    const checkout = await provider.createCheckout({
      orderId: orderRef.id,
      amount: total,
      currency: 'BDT',
      customer: { uid: user.uid, email: user.email ?? '', name: customer.name },
      returnUrls: {
        success: `${baseUrl}/dashboard?order=${orderRef.id}&status=success`,
        cancel: `${baseUrl}/products?order=${orderRef.id}&status=cancel`,
        fail: `${baseUrl}/products?order=${orderRef.id}&status=fail`,
      },
    });
    paymentUrl = checkout.paymentUrl;
    if (checkout.ref) {
      await orderRef.update({
        paymentProvider: provider.name,
        paymentRef: checkout.ref,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  res.json({ orderId: orderRef.id, paymentUrl, status: 'pending', type });
}

// --- customer cancel ---

async function handleCancelOrder(
  req: import('firebase-functions/v2/https').Request,
  res: import('express').Response,
  orderId: string
) {
  const user = await requireUser(req);
  if (!user) {
    res.status(401).json({ error: 'Sign in required' });
    return;
  }

  const ref = db.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  const order = snap.data() as DocumentData;
  const admin = isAdmin(user);

  if (order.uid !== user.uid && !admin) {
    res.status(403).json({ error: 'Not your order' });
    return;
  }
  if (order.status === 'cancelled') {
    // Idempotent: already cancelled.
    res.json({ ok: true, status: 'cancelled' });
    return;
  }
  if (!admin && !CUSTOMER_CANCELLABLE.includes(order.status)) {
    res.status(409).json({
      error: 'This order can no longer be cancelled. Please contact support.',
    });
    return;
  }

  // Firestore arrayUnion rejects `undefined` inside an element, so only
  // include `note` when the customer actually gave a reason.
  const reason = str(req.body?.reason, 300);
  const event: DocumentData = {
    at: Date.now(),
    by: user.uid,
    byEmail: user.email ?? '',
    action: 'cancelled',
    status: 'cancelled',
  };
  if (reason) event.note = reason;

  await ref.update({
    status: 'cancelled',
    updatedAt: FieldValue.serverTimestamp(),
    history: FieldValue.arrayUnion(event),
  });

  res.json({ ok: true, status: 'cancelled' });
}

// --- admin: list orders ---

async function handleAdminListOrders(
  req: import('firebase-functions/v2/https').Request,
  res: import('express').Response
) {
  const user = await requireUser(req);
  if (!isAdmin(user)) {
    res.status(403).json({ error: 'Admin only' });
    return;
  }

  const snap = await db
    .collection('orders')
    .orderBy('createdAt', 'desc')
    .limit(500)
    .get();

  const orders = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: tsToMs(data.createdAt),
      updatedAt: tsToMs(data.updatedAt),
    };
  });

  res.json({ orders });
}

// --- admin: update order (status and/or notes) ---

async function handleAdminUpdateOrder(
  req: import('firebase-functions/v2/https').Request,
  res: import('express').Response,
  orderId: string
) {
  const user = await requireUser(req);
  if (!isAdmin(user)) {
    res.status(403).json({ error: 'Admin only' });
    return;
  }

  const ref = db.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  const body = req.body ?? {};
  const update: DocumentData = { updatedAt: FieldValue.serverTimestamp() };
  const events: DocumentData[] = [];
  const nowMs = Date.now();

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    update.status = body.status;
    events.push({
      at: nowMs,
      by: user!.uid,
      byEmail: user!.email ?? '',
      action: 'status_changed',
      status: body.status,
    });
  }

  if (body.adminNotes !== undefined) {
    update.adminNotes = str(body.adminNotes, 2000);
    events.push({
      at: nowMs,
      by: user!.uid,
      byEmail: user!.email ?? '',
      action: 'note_added',
    });
  }

  if (events.length === 0) {
    res.status(400).json({ error: 'Nothing to update' });
    return;
  }

  update.history = FieldValue.arrayUnion(...events);
  await ref.update(update);

  res.json({ ok: true });
}

function tsToMs(v: unknown): number {
  if (!v) return 0;
  const ts = v as { toMillis?: () => number };
  return typeof ts.toMillis === 'function' ? ts.toMillis() : Number(v) || 0;
}

// --- payment webhook (unchanged) ---

async function handlePaymentWebhook(
  req: import('firebase-functions/v2/https').Request,
  res: import('express').Response
) {
  const provider = getPaymentProvider();
  if (!provider.verifyWebhook) {
    res.status(501).json({ error: 'No webhook for current provider' });
    return;
  }
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers[k] = v;
  }
  const raw =
    (req as unknown as { rawBody?: Buffer }).rawBody?.toString() ??
    JSON.stringify(req.body);
  const result = await provider.verifyWebhook(raw, headers);

  await db
    .collection('orders')
    .doc(result.orderId)
    .update({
      status: result.paid ? 'paid' : 'pending',
      paymentRef: result.ref ?? null,
      updatedAt: FieldValue.serverTimestamp(),
      history: FieldValue.arrayUnion({
        at: Date.now(),
        by: 'system',
        action: 'status_changed',
        status: result.paid ? 'paid' : 'pending',
        note: 'payment webhook',
      }),
    });

  res.json({ ok: true });
}
