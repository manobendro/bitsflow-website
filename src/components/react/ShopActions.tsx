import { useState } from 'react';
import { useAuth } from './useAuth';
import { useLang } from './useLang';
import OrderForm from './OrderForm';
import { formatBDT } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { CreateOrderResult } from '../../lib/api';
import type { OrderType, Product } from '../../lib/types';

/**
 * Buy / pre-book / reserve actions. Clicking an action opens the detailed
 * OrderForm modal (personal + shipping info). The form submits to the backend,
 * which creates a `pending` order the user can later cancel from their
 * dashboard until an admin confirms it.
 */
export default function ShopActions({ product }: { product: Product }) {
  const { user, loading } = useAuth();
  const lang = useLang();
  const [qty, setQty] = useState(1);
  const [formType, setFormType] = useState<OrderType | null>(null);
  const [done, setDone] = useState<{ orderId: string; type: OrderType } | null>(null);

  const isPrebook = product.status === 'prebook';

  function open(type: OrderType) {
    if (!user) {
      window.location.assign('/login?next=/shop');
      return;
    }
    setDone(null);
    setFormType(type);
  }

  function onSuccess(res: CreateOrderResult & { paymentUrl?: string | null }) {
    setFormType(null);
    if (res.paymentUrl) {
      window.location.assign(res.paymentUrl); // hand off to payment provider
      return;
    }
    setDone({ orderId: res.orderId, type: res.type });
  }

  const total = product.price * qty;

  return (
    <div className="rounded-xl border border-black/5 bg-white p-6 shadow-[0_2px_4px_rgb(20_39_31_/_0.05),0_18px_40px_-16px_rgb(20_39_31_/_0.18)]">
      <div className="flex items-baseline gap-3">
        <span className="text-4xl font-extrabold text-brand-700">
          {formatBDT(product.price)}
        </span>
        {product.compareAtPrice && (
          <span className="text-lg text-ink-soft/60 line-through">
            {formatBDT(product.compareAtPrice)}
          </span>
        )}
      </div>

      <span
        className={`mt-3 inline-block rounded-md px-3 py-1 text-xs font-semibold ${
          isPrebook
            ? 'bg-amber-100 text-amber-700'
            : product.status === 'available'
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-ink/10 text-ink-soft'
        }`}
      >
        {isPrebook
          ? t('Pre-book — first batch', 'প্রি-বুক — প্রথম ব্যাচ', lang)
          : product.status === 'available'
            ? t('In stock', 'স্টকে আছে', lang)
            : t('Sold out', 'স্টক শেষ', lang)}
      </span>

      {/* Quantity */}
      <div className="mt-6 flex items-center gap-3">
        <label htmlFor="qty" className="text-sm font-medium">
          {t('Quantity', 'পরিমাণ', lang)}
        </label>
        <div className="flex h-10 items-stretch overflow-hidden rounded-md border border-black/10">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="flex items-center px-3.5 text-lg leading-none text-ink-soft transition-colors hover:bg-brand-50 hover:text-brand-700"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <input
            id="qty"
            type="number"
            min={1}
            max={20}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className="h-full w-12 border-x border-black/10 text-center text-sm font-semibold outline-none focus:bg-brand-50/40"
          />
          <button
            type="button"
            onClick={() => setQty((q) => Math.min(20, q + 1))}
            className="flex items-center px-3.5 text-lg leading-none text-ink-soft transition-colors hover:bg-brand-50 hover:text-brand-700"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
        <span className="ml-auto text-sm text-ink-soft">
          {t('Total', 'মোট', lang)}{' '}
          <strong className="text-ink">{formatBDT(total)}</strong>
        </span>
      </div>

      {/* Actions */}
      <div className="mt-6 space-y-3">
        {isPrebook ? (
          <>
            <button
              onClick={() => open('reserve')}
              disabled={loading || product.status === 'sold_out'}
              className="w-full rounded-md bg-brand-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:-translate-y-0.5 hover:bg-brand-700 disabled:translate-y-0 disabled:opacity-60"
            >
              {t('Reserve (no payment now)', 'রিজার্ভ করো (এখন টাকা লাগবে না)', lang)}
            </button>
            <button
              onClick={() => open('preorder')}
              disabled={loading}
              className="w-full rounded-md border border-brand-200 bg-white px-6 py-3.5 font-semibold text-brand-700 transition hover:bg-brand-50 disabled:opacity-60"
            >
              {t('Pre-order & pay later', 'প্রি-অর্ডার করো, পরে টাকা দাও', lang)}
            </button>
          </>
        ) : (
          <button
            onClick={() => open('order')}
            disabled={loading || product.status === 'sold_out'}
            className="w-full rounded-md bg-brand-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:-translate-y-0.5 hover:bg-brand-700 disabled:translate-y-0 disabled:opacity-60"
          >
            {t('Buy now', 'এখনই কিনে ফেলো', lang)}
          </button>
        )}
      </div>

      {!user && !loading && (
        <p className="mt-3 text-center text-xs text-ink-soft">
          {t("You'll be asked to sign in first.", 'আগে লগ ইন করতে বলা হবে।', lang)}
        </p>
      )}

      {done && (
        <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">
            {done.type === 'reserve'
              ? t('Reservation confirmed!', 'রিজার্ভেশন কনফার্ম!', lang)
              : t('Pre-order placed!', 'প্রি-অর্ডার হয়ে গেছে!', lang)}
          </p>
          <p className="mt-1">
            {t('Order', 'অর্ডার', lang)}{' '}
            <span className="font-mono">{done.orderId.slice(0, 8)}…</span>{' '}
            {t(
              'is now pending our confirmation. You can view or cancel it from your',
              'এখন আমাদের কনফার্মেশনের অপেক্ষায়। তোমার',
              lang
            )}{' '}
            <a href="/dashboard" className="font-semibold underline">
              {t('dashboard', 'ড্যাশবোর্ড', lang)}
            </a>
            {t('.', ' থেকে এটা দেখতে বা বাতিল করতে পারবে।', lang)}
          </p>
        </div>
      )}

      {formType && (
        <OrderForm
          product={product}
          quantity={qty}
          type={formType}
          onClose={() => setFormType(null)}
          onSuccess={onSuccess}
        />
      )}
    </div>
  );
}
