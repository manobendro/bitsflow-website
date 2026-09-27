import type { OrderStatus, OrderType } from '../../../lib/types';

/** The happy-path journey an order moves through, in order. */
export const ORDER_STEPS: OrderStatus[] = [
  'pending',
  'confirmed',
  'paid',
  'processing',
  'shipped',
  'delivered',
];

/** End states that sit outside the stepper. */
export const TERMINAL_STATUSES: OrderStatus[] = ['cancelled', 'refunded'];

/** Orders that are still "in flight" (not finished, not cancelled). */
export function isActiveStatus(s: OrderStatus): boolean {
  return s !== 'delivered' && !TERMINAL_STATUSES.includes(s);
}

/** English status word as-is (lowercase, matches the stored value) + friendly Bangla. */
export const STATUS_LABEL: Record<OrderStatus, { en: string; bn: string }> = {
  pending: { en: 'pending', bn: 'অপেক্ষায়' },
  confirmed: { en: 'confirmed', bn: 'নিশ্চিত' },
  paid: { en: 'paid', bn: 'পেমেন্ট হয়েছে' },
  processing: { en: 'processing', bn: 'প্রস্তুত হচ্ছে' },
  shipped: { en: 'shipped', bn: 'পাঠানো হয়েছে' },
  delivered: { en: 'delivered', bn: 'পৌঁছে গেছে' },
  cancelled: { en: 'cancelled', bn: 'বাতিল' },
  refunded: { en: 'refunded', bn: 'রিফান্ড হয়েছে' },
};

/** Squared status chip colours — warm, readable, distinct per state. */
export const STATUS_CHIP: Record<OrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200',
  paid: 'bg-brand-100 text-brand-800',
  processing: 'bg-sky-100 text-sky-800',
  shipped: 'bg-violet-100 text-violet-800',
  delivered: 'bg-brand-600 text-white',
  cancelled: 'bg-accent-500/10 text-accent-600',
  refunded: 'bg-ink/10 text-ink-soft',
};

/** Small dot colour for filter chips / legends. */
export const STATUS_DOT: Record<OrderStatus, string> = {
  pending: 'bg-amber-500',
  confirmed: 'bg-brand-400',
  paid: 'bg-brand-600',
  processing: 'bg-sky-500',
  shipped: 'bg-violet-500',
  delivered: 'bg-brand-800',
  cancelled: 'bg-accent-500',
  refunded: 'bg-ink-soft',
};

export const TYPE_LABEL: Record<OrderType, { en: string; bn: string }> = {
  reserve: { en: 'Reservation', bn: 'রিজার্ভেশন' },
  preorder: { en: 'Pre-order', bn: 'প্রি-অর্ডার' },
  order: { en: 'Order', bn: 'অর্ডার' },
};

/** Timestamp-ish (number | Firestore Timestamp | ISO string) → epoch ms. */
export function toMs(v: unknown): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Date.parse(v);
    return Number.isNaN(n) ? 0 : n;
  }
  const ts = v as { toMillis?: () => number; _seconds?: number; seconds?: number };
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  const secs = ts._seconds ?? ts.seconds;
  return typeof secs === 'number' ? secs * 1000 : 0;
}
