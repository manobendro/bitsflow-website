import { useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { Hand, Plus } from 'lucide-react';
import { db } from '../../lib/firebase/client';
import { useAuth } from './useAuth';
import { useLang } from './useLang';
import { cancelOrder } from '../../lib/api';
import { formatBDT, formatDate } from '../../lib/format';
import { t } from '../../lib/i18n';
import {
  CUSTOMER_CANCELLABLE,
  type Order,
  type OrderStatus,
} from '../../lib/types';

type OrderRow = Order & { createdAt: number };

function toMs(v: unknown): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  const ts = v as Timestamp;
  return typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  processing: 'bg-blue-100 text-blue-700',
  shipped: 'bg-indigo-100 text-indigo-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-ink/10 text-ink-soft',
  refunded: 'bg-ink/10 text-ink-soft',
};

const TYPE_LABEL: Record<string, { en: string; bn: string }> = {
  reserve: { en: 'Reservation', bn: 'রিজার্ভেশন' },
  preorder: { en: 'Pre-order', bn: 'প্রি-অর্ডার' },
  order: { en: 'Order', bn: 'অর্ডার' },
};

// Friendly Bengali for each order status (the English is shown as-is in EN mode).
const STATUS_LABEL: Record<string, { en: string; bn: string }> = {
  pending: { en: 'pending', bn: 'অপেক্ষায়' },
  confirmed: { en: 'confirmed', bn: 'নিশ্চিত' },
  paid: { en: 'paid', bn: 'পেমেন্ট হয়েছে' },
  processing: { en: 'processing', bn: 'প্রস্তুত হচ্ছে' },
  shipped: { en: 'shipped', bn: 'পাঠানো হয়েছে' },
  delivered: { en: 'delivered', bn: 'পৌঁছে গেছে' },
  cancelled: { en: 'cancelled', bn: 'বাতিল' },
  refunded: { en: 'refunded', bn: 'রিফান্ড হয়েছে' },
};

export default function Dashboard() {
  const { user, loading } = useAuth();
  const lang = useLang();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      window.location.assign('/login?next=/dashboard');
    }
  }, [loading, user]);

  async function load() {
    if (!user) return;
    setDataLoading(true);
    setError(null);
    try {
      const snap = await getDocs(
        query(
          collection(db(), 'orders'),
          where('uid', '==', user.uid),
          orderBy('createdAt', 'desc')
        )
      );
      setOrders(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Order, 'id'>),
          createdAt: toMs(d.data().createdAt),
        }))
      );
    } catch {
      setError(
        t(
          'Could not load your orders. Please refresh and try again.',
          'তোমার অর্ডার লোড করা গেল না। একটু রিফ্রেশ করে আবার চেষ্টা করো।',
          lang
        )
      );
    } finally {
      setDataLoading(false);
    }
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function onCancel(orderId: string) {
    if (
      !confirm(
        t(
          'Cancel this order? This cannot be undone.',
          'এই অর্ডার বাতিল করবে? এটা আর ফেরানো যাবে না।',
          lang
        )
      )
    )
      return;
    setCancelling(orderId);
    setError(null);
    try {
      await cancelOrder(orderId);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: 'cancelled' as OrderStatus } : o
        )
      );
    } catch {
      setError(
        t(
          'Could not cancel the order. Please try again.',
          'অর্ডারটা বাতিল করা গেল না। আরেকবার চেষ্টা করো।',
          lang
        )
      );
    } finally {
      setCancelling(null);
    }
  }

  if (loading || !user) {
    return <CenteredSpinner label={t('Loading your dashboard…', 'তোমার ড্যাশবোর্ড লোড হচ্ছে…', lang)} />;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          {t('Hi', 'হাই', lang)} {user.displayName?.split(' ')[0] || t('there', 'বন্ধু', lang)}
          <Hand className="text-amber-400" size={26} />
        </h1>
        <p className="mt-1 text-ink-soft">{user.email}</p>
      </header>

      {error && (
        <p className="rounded-lg bg-accent-500/10 px-4 py-3 text-sm text-accent-500">
          {error}
        </p>
      )}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">
            {t('Your orders & reservations', 'তোমার অর্ডার ও রিজার্ভেশন', lang)}
          </h2>
          <a
            href="/shop"
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
          >
            <Plus size={16} /> {t('New order', 'নতুন অর্ডার', lang)}
          </a>
        </div>

        {dataLoading ? (
          <SkeletonRows />
        ) : orders.length === 0 ? (
          <EmptyState
            title={t('Nothing here yet', 'এখনো কিছু নেই', lang)}
            body={t(
              "Reserve or pre-order a board and it'll show up here.",
              'একটা বোর্ড রিজার্ভ বা প্রি-অর্ডার করো, এখানে দেখা যাবে।',
              lang
            )}
            cta={{ href: '/shop', label: t('Visit the shop', 'দোকান ঘুরে দেখো', lang) }}
          />
        ) : (
          <ul className="mt-4 space-y-4">
            {orders.map((o) => {
              const canCancel = CUSTOMER_CANCELLABLE.includes(o.status);
              return (
                <li
                  key={o.id}
                  className="rounded-lg border border-black/5 bg-white p-5 shadow-[0_1px_2px_rgb(20_39_31_/_0.04),0_8px_24px_-12px_rgb(20_39_31_/_0.12)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-sand px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink-soft">
                          {TYPE_LABEL[o.type]
                            ? t(TYPE_LABEL[o.type].en, TYPE_LABEL[o.type].bn, lang)
                            : o.type}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[o.status] ?? 'bg-ink/10 text-ink-soft'}`}
                        >
                          {STATUS_LABEL[o.status]
                            ? t(STATUS_LABEL[o.status].en, STATUS_LABEL[o.status].bn, lang)
                            : o.status}
                        </span>
                      </div>
                      <p className="mt-2 font-semibold">
                        {o.items?.map((it) => `${it.name} ×${it.quantity}`).join(', ')}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-soft">
                        {formatBDT(o.total)} · {t('placed', 'তারিখ', lang)}{' '}
                        {o.createdAt ? formatDate(o.createdAt, lang) : '—'} ·{' '}
                        <span className="font-mono text-xs">{o.id.slice(0, 8)}…</span>
                      </p>
                    </div>

                    {canCancel ? (
                      <button
                        onClick={() => onCancel(o.id)}
                        disabled={cancelling === o.id}
                        className="rounded-md border border-accent-500/40 px-3 py-1.5 text-sm font-medium text-accent-500 transition hover:bg-accent-500/10 disabled:opacity-60"
                      >
                        {cancelling === o.id
                          ? t('Cancelling…', 'বাতিল হচ্ছে…', lang)
                          : t('Cancel', 'বাতিল', lang)}
                      </button>
                    ) : o.status === 'cancelled' ? (
                      <span className="text-sm text-ink-soft/60">
                        {t('Cancelled', 'বাতিল হয়েছে', lang)}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-soft/70">
                        {t('Confirmed — contact us to change', 'কনফার্মড — বদলাতে চাইলে যোগাযোগ করো', lang)}
                      </span>
                    )}
                  </div>

                  {o.shipping && (
                    <p className="mt-3 border-t border-black/5 pt-3 text-xs text-ink-soft">
                      {t('Ship to:', 'ডেলিভারি:', lang)} {o.shipping.line1}
                      {o.shipping.line2 ? `, ${o.shipping.line2}` : ''},{' '}
                      {o.shipping.city}, {o.shipping.district}
                    </p>
                  )}

                  {o.adminNotes && (
                    <p className="mt-2 rounded-md border-l-4 border-brand-500 bg-brand-50 px-3 py-2 text-xs text-brand-800">
                      <strong>{t('Update from us:', 'আমাদের আপডেট:', lang)}</strong>{' '}
                      {o.adminNotes}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="grid place-items-center py-24 text-ink-soft">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-100 border-t-brand-600" />
      <p className="mt-3 text-sm">{label}</p>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="mt-4 space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-lg bg-sand" />
      ))}
    </div>
  );
}

function EmptyState({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-black/10 bg-sand p-8 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{body}</p>
      <a
        href={cta.href}
        className="mt-4 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brand-700"
      >
        {cta.label}
      </a>
    </div>
  );
}
