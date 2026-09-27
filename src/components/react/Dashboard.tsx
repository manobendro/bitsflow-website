import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocsFromServer, orderBy, query, where } from 'firebase/firestore';
import {
  Ban,
  CalendarDays,
  CircleAlert,
  Hand,
  MapPin,
  MessageSquareText,
  PackageCheck,
  PackageOpen,
  Plus,
  RefreshCw,
  ShoppingBag,
  Undo2,
  X,
} from 'lucide-react';
import { db } from '../../lib/firebase/client';
import { useAuth } from './useAuth';
import { useLang } from './useLang';
import T from './T';
import Spinner from './flows/Spinner';
import {
  ORDER_STEPS,
  STATUS_CHIP,
  STATUS_LABEL,
  TYPE_LABEL,
  isActiveStatus,
  toMs,
} from './flows/orderStatus';
import { cancelOrder } from '../../lib/api';
import { track } from '../../lib/analytics';
import { formatBDT, formatDate } from '../../lib/format';
import { t, type Lang } from '../../lib/i18n';
import { CUSTOMER_CANCELLABLE, type Order, type OrderStatus } from '../../lib/types';

type OrderRow = Order & { createdAt: number };

export default function Dashboard() {
  const { user, loading } = useAuth();
  const lang = useLang();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (user) {
      wasSignedIn.current = true;
      return;
    }
    // Just signed out from this page → home. Never signed in → sign in first.
    window.location.assign(wasSignedIn.current ? '/' : '/login?next=/dashboard');
  }, [loading, user]);

  async function load() {
    if (!user) return;
    setDataLoading(true);
    setError(null);
    try {
      // FromServer, not getDocs: when the backend is unreachable, getDocs quietly
      // resolves from the (empty) offline cache and the page would claim
      // "Nothing here yet" to a customer who has orders. This throws instead,
      // so they get the error state with a retry button.
      const snap = await getDocsFromServer(
        query(collection(db(), 'orders'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'))
      );
      setOrders(
        snap.docs.map((d) => ({
          ...(d.data() as Omit<Order, 'id'>),
          id: d.id,
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
      !window.confirm(
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
      const cancelled = orders.find((o) => o.id === orderId);
      track('order_cancel', {
        transaction_id: orderId,
        order_type: cancelled?.type,
        currency: 'BDT',
        value: cancelled?.total,
      });
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: 'cancelled' as OrderStatus } : o))
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

  const summary = useMemo(() => {
    let active = 0;
    let delivered = 0;
    let awaiting = 0;
    for (const o of orders) {
      if (isActiveStatus(o.status)) active++;
      if (o.status === 'delivered') delivered++;
      if (o.status === 'pending') awaiting++;
    }
    return { active, delivered, awaiting };
  }, [orders]);

  if (loading || !user) {
    return <CenteredSpinner label={t('Loading your dashboard…', 'তোমার ড্যাশবোর্ড লোড হচ্ছে…', lang)} />;
  }

  const firstName = user.displayName?.split(' ')[0] || t('there', 'বন্ধু', lang);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            {t('Hi', 'হাই', lang)} {firstName}
            <Hand className="text-amber-500" size={26} aria-hidden="true" />
          </h1>
          <p className="mt-1 truncate text-ink-soft">{user.email}</p>
        </div>
        <a href="/products" className="btn btn-secondary">
          <ShoppingBag size={16} aria-hidden="true" />
          <T en="Browse products" bn="পণ্য দেখো" />
        </a>
      </header>

      {!dataLoading && orders.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('Order summary', 'অর্ডারের সারাংশ', lang)}>
          <SummaryChip tone="brand" count={summary.active} en="active" bn="চলমান" />
          {summary.awaiting > 0 && (
            <SummaryChip tone="amber" count={summary.awaiting} en="awaiting confirmation" bn="কনফার্মেশনের অপেক্ষায়" />
          )}
          {summary.delivered > 0 && (
            <SummaryChip tone="ink" count={summary.delivered} en="delivered" bn="পৌঁছে গেছে" />
          )}
        </ul>
      )}

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg bg-accent-500/10 px-4 py-3 text-sm text-accent-600"
        >
          <CircleAlert size={18} className="shrink-0" aria-hidden="true" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={load} className="btn btn-sm btn-danger">
            <RefreshCw size={14} aria-hidden="true" />
            <T en="Try again" bn="আবার চেষ্টা করো" />
          </button>
        </div>
      )}

      <section aria-labelledby="orders-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="orders-heading" className="text-xl font-bold">
            <T en="Your orders & reservations" bn="তোমার অর্ডার ও রিজার্ভেশন" />
          </h2>
          {orders.length > 0 && (
            <a
              href="/products"
              className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
            >
              <Plus size={16} aria-hidden="true" /> <T en="New order" bn="নতুন অর্ডার" />
            </a>
          )}
        </div>

        {dataLoading ? (
          <SkeletonCards />
        ) : orders.length === 0 ? (
          !error && <EmptyState />
        ) : (
          <ul className="mt-4 space-y-4">
            {orders.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                lang={lang}
                cancelling={cancelling === o.id}
                onCancel={() => onCancel(o.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OrderCard({
  order: o,
  lang,
  cancelling,
  onCancel,
}: {
  order: OrderRow;
  lang: Lang;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const canCancel = CUSTOMER_CANCELLABLE.includes(o.status);
  const status = STATUS_LABEL[o.status] ?? { en: o.status, bn: o.status };
  const type = TYPE_LABEL[o.type] ?? { en: o.type, bn: o.type };

  return (
    <li className="rounded-lg border border-black/5 bg-white p-5 shadow-[var(--shadow-soft)]">
      {/* Top meta */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <span className="chip bg-sand uppercase tracking-wide text-ink-soft">
          <T en={type.en} bn={type.bn} />
        </span>
        <span className={`chip capitalize ${STATUS_CHIP[o.status] ?? 'bg-ink/10 text-ink-soft'}`}>
          <T en={status.en} bn={status.bn} />
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <CalendarDays size={13} aria-hidden="true" />
          {o.createdAt ? formatDate(o.createdAt, lang) : '—'}
        </span>
        <span className="font-mono">#{o.id.slice(0, 8)}</span>
      </div>

      {/* Items + total */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0 space-y-0.5">
          {o.items?.map((it, i) => (
            <p key={i} className="font-semibold text-ink">
              {it.name} ×{it.quantity}
            </p>
          ))}
        </div>
        <p className="text-lg font-extrabold text-ink tabular-nums">{formatBDT(o.total)}</p>
      </div>

      {/* Progress */}
      <div className="mt-4">
        {o.status === 'cancelled' || o.status === 'refunded' ? (
          <p
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
              o.status === 'cancelled' ? 'bg-accent-500/10 text-accent-600' : 'bg-sand text-ink-soft'
            }`}
          >
            {o.status === 'cancelled' ? (
              <Ban size={16} aria-hidden="true" />
            ) : (
              <Undo2 size={16} aria-hidden="true" />
            )}
            {o.status === 'cancelled' ? (
              <T en="This order was cancelled." bn="এই অর্ডারটা বাতিল হয়েছে।" />
            ) : (
              <T en="This order was refunded." bn="এই অর্ডারের টাকা ফেরত দেওয়া হয়েছে।" />
            )}
          </p>
        ) : (
          <Stepper status={o.status} lang={lang} />
        )}
      </div>

      {o.shipping && (
        <p className="mt-4 flex items-start gap-2 border-t border-black/5 pt-3 text-sm text-ink-soft">
          <MapPin size={15} className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
          <span>
            <span className="sr-only">{t('Ship to:', 'ডেলিভারি:', lang)} </span>
            {[o.shipping.line1, o.shipping.line2, o.shipping.city, o.shipping.district]
              .filter(Boolean)
              .join(', ')}
          </span>
        </p>
      )}

      {o.adminNotes && (
        <div className="mt-3 flex items-start gap-2 rounded-md border-l-4 border-brand-500 bg-brand-50 px-3 py-2 text-sm text-brand-800">
          <MessageSquareText size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            <strong>
              <T en="Update from us:" bn="আমাদের আপডেট:" />
            </strong>{' '}
            {o.adminNotes}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-soft">
          {canCancel ? (
            <T
              en="You can cancel until we confirm it."
              bn="আমরা কনফার্ম করার আগ পর্যন্ত বাতিল করতে পারবে।"
            />
          ) : o.status === 'cancelled' || o.status === 'refunded' ? null : o.status === 'delivered' ? (
            <T en="Enjoy building! Need help? Contact us." bn="মজা করে বানাও! সাহায্য লাগলে যোগাযোগ করো।" />
          ) : (
            <T en="Confirmed — contact us to change it." bn="কনফার্মড — বদলাতে চাইলে যোগাযোগ করো।" />
          )}
        </p>
        {canCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="btn btn-sm btn-danger min-h-10"
          >
            {cancelling ? <Spinner size={14} /> : <X size={15} aria-hidden="true" />}
            {cancelling ? t('Cancelling…', 'বাতিল হচ্ছে…', lang) : t('Cancel', 'বাতিল করো', lang)}
          </button>
        )}
      </div>
    </li>
  );
}

/** Compact progress bar: pending → confirmed → paid → processing → shipped → delivered. */
function Stepper({ status, lang }: { status: OrderStatus; lang: Lang }) {
  const current = Math.max(0, ORDER_STEPS.indexOf(status));
  const cur = STATUS_LABEL[ORDER_STEPS[current]];
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-ink-soft sm:hidden">
        {t(`Step ${current + 1} of ${ORDER_STEPS.length}`, `ধাপ ${current + 1} / ${ORDER_STEPS.length}`, lang)}
        {' · '}
        <span className="text-ink">{t(cur.en, cur.bn, lang)}</span>
      </p>
      <ol className="grid grid-cols-6 gap-1" aria-label={t('Order progress', 'অর্ডারের অগ্রগতি', lang)}>
        {ORDER_STEPS.map((s, i) => {
          const reached = i <= current;
          const isCurrent = i === current;
          const label = STATUS_LABEL[s];
          return (
            <li key={s} aria-current={isCurrent ? 'step' : undefined} className="min-w-0">
              <span
                className={`block h-1.5 rounded-sm ${
                  reached ? (isCurrent ? 'bg-brand-500' : 'bg-brand-600') : 'bg-sand'
                }`}
                aria-hidden="true"
              />
              <span
                className={`mt-1.5 hidden truncate text-[11px] capitalize sm:block ${
                  isCurrent ? 'font-semibold text-ink' : reached ? 'text-ink-soft' : 'text-ink-soft/60'
                }`}
              >
                {t(label.en, label.bn, lang)}
              </span>
              <span className="sr-only sm:hidden">
                {t(label.en, label.bn, lang)}
                {reached ? '' : t(' (upcoming)', ' (সামনে)', lang)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SummaryChip({
  tone,
  count,
  en,
  bn,
}: {
  tone: 'brand' | 'amber' | 'ink';
  count: number;
  en: string;
  bn: string;
}) {
  const cls =
    tone === 'brand'
      ? 'bg-brand-50 text-brand-700'
      : tone === 'amber'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-sand text-ink-soft';
  return (
    <li className={`chip text-sm ${cls}`}>
      <strong className="tabular-nums">{count}</strong> <T en={en} bn={bn} />
    </li>
  );
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="grid place-items-center py-24 text-ink-soft" role="status">
      <Spinner size={32} className="text-brand-600" />
      <p className="mt-3 text-sm">{label}</p>
    </div>
  );
}

function SkeletonCards() {
  return (
    <div className="mt-4 space-y-4" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-lg border border-black/5 bg-white p-5">
          <div className="flex gap-2">
            <div className="skeleton h-6 w-24" />
            <div className="skeleton h-6 w-20" />
          </div>
          <div className="mt-4 flex justify-between">
            <div className="skeleton h-5 w-48" />
            <div className="skeleton h-6 w-20" />
          </div>
          <div className="skeleton mt-5 h-1.5 w-full" />
          <div className="skeleton mt-5 h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-black/10 bg-sand px-6 py-10 text-center">
      <div className="icon-tile mx-auto h-14 w-14">
        <PackageOpen size={28} aria-hidden="true" />
      </div>
      <p className="mt-4 text-lg font-bold text-ink">
        <T en="Nothing here yet" bn="এখনো কিছু নেই" />
      </p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
        <T
          en="Reserve a board or grab a kit — your orders will show up right here."
          bn="একটা বোর্ড রিজার্ভ করো বা একটা কিট নাও — তোমার অর্ডার এখানেই দেখা যাবে।"
        />
      </p>
      <a href="/products" className="btn btn-primary mt-5">
        <PackageCheck size={16} aria-hidden="true" />
        <T en="Browse products" bn="পণ্য দেখো" />
      </a>
    </div>
  );
}
