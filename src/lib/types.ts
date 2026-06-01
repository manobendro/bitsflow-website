/** Domain types shared across the site (client islands + content). */

export interface Product {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  /** Price in BDT taka. */
  price: number;
  /** Optional crossed-out original price (taka). */
  compareAtPrice?: number;
  currency: 'BDT';
  /** Whether the product is purchasable now vs. pre-book only. */
  status: 'available' | 'prebook' | 'sold_out';
  image?: string;
  highlights: string[];
}

/**
 * How the order was placed:
 * - `reserve`  — reserved a unit, no payment intent yet
 * - `preorder` — committed pre-order, will pay when invoiced
 * - `order`    — a normal purchase of an in-stock unit
 */
export type OrderType = 'reserve' | 'preorder' | 'order';

export type OrderStatus =
  | 'pending' // created, awaiting admin confirmation
  | 'confirmed' // admin confirmed; customer can no longer self-cancel
  | 'paid' // payment received
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

/** Statuses at which the customer may still cancel the order themselves. */
export const CUSTOMER_CANCELLABLE: OrderStatus[] = ['pending'];

export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
];

export interface OrderItem {
  productId: string;
  name: string;
  /** Unit price in taka at time of purchase. */
  unitPrice: number;
  quantity: number;
}

/** Personal details collected on the order form. */
export interface CustomerInfo {
  name: string;
  phone: string;
  /** Resolved occupation (free value if "Other" was chosen). */
  occupation: string;
  /** School / institution / company — optional. */
  school?: string;
}

export interface ShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  district: string;
  postcode?: string;
  country: string; // default "Bangladesh"
}

/** One entry in an order's audit trail. */
export interface OrderEvent {
  at: number; // epoch ms
  by: string; // uid, or "system"
  byEmail?: string;
  action: 'created' | 'status_changed' | 'note_added' | 'cancelled';
  status?: OrderStatus;
  note?: string;
}

export interface Order {
  id: string;
  uid: string;
  type: OrderType;
  items: OrderItem[];
  /** Grand total in taka. */
  total: number;
  currency: 'BDT';
  status: OrderStatus;
  customer: CustomerInfo;
  shipping: ShippingAddress;
  /** Optional note left by the customer at checkout. */
  note?: string;
  /** Free-form internal notes / extra info added by an admin. */
  adminNotes?: string;
  /** Which payment provider processed this (e.g. "sslcommerz", "manual"). */
  paymentProvider?: string;
  paymentRef?: string;
  history: OrderEvent[];
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  phone?: string;
  createdAt: number;
}
