import { useEffect, useRef, useState } from 'react';
import {
  CalendarClock,
  CircleCheck,
  CircleX,
  LayoutDashboard,
  LogIn,
  Minus,
  PackageCheck,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from './useAuth';
import { useLang } from './useLang';
import OrderForm from './OrderForm';
import T from './T';
import { STATUS_BADGE } from './ProductCard';
import { bnDigits } from './store/storeUtils';
import { loginHrefForHere } from './flows/safeNext';
import { formatBDT, percentOff } from '../../lib/format';
import { t } from '../../lib/i18n';
import { track } from '../../lib/analytics';
import type { CreateOrderResult } from '../../lib/api';
import type { OrderType, Product } from '../../lib/types';

const MIN_QTY = 1;
const MAX_QTY = 20; // mirrors the server clamp in functions/src/index.ts

/**
 * Buy box: price, stock status, quantity, and the Reserve / Pre-order / Buy
 * actions. An action opens the OrderForm dialog (personal + shipping info);
 * the backend creates a `pending` order the customer can cancel from their
 * dashboard until an admin confirms it.
 */
export default function ShopActions({ product }: { product: Product }) {
  const { user, loading } = useAuth();
  const lang = useLang();
  const [qty, setQty] = useState(MIN_QTY);
  const [formType, setFormType] = useState<OrderType | null>(null);
  const [done, setDone] = useState<{ orderId: string; type: OrderType } | null>(null);
  const successRef = useRef<HTMLDivElement>(null);

  const isPrebook = product.status === 'prebook';
  const soldOut = product.status === 'sold_out';
  const save = percentOff(product.price, product.compareAtPrice);
  const total = product.price * qty;

  // Bring the confirmation into view + focus so screen readers announce it.
  useEffect(() => {
    if (!done || !successRef.current) return;
    successRef.current.focus({ preventScroll: true });
    successRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [done]);

  /** GA4 e-commerce payload for the current quantity. */
  const checkoutParams = (type: OrderType) => ({
    currency: 'BDT',
    value: total,
    order_type: type,
    items: [
      {
        item_id: product.id,
        item_name: product.name,
        item_category: (product as { category?: string }).category,
        price: product.price,
        quantity: qty,
      },
    ],
  });

  function open(type: OrderType) {
    if (!user) {
      track('checkout_login_prompt', { order_type: type, item_id: product.id });
      // Come back to this exact product after signing in.
      window.location.assign(loginHrefForHere());
      return;
    }
    track('begin_checkout', checkoutParams(type));
    setDone(null);
    setFormType(type);
  }

  function onSuccess(res: CreateOrderResult) {
    setFormType(null);
    // Reservations carry no payment intent, so they're a separate event and
    // don't inflate revenue; orders and pre-orders are GA4 purchases.
    track(res.type === 'reserve' ? 'reserve' : 'purchase', {
      transaction_id: res.orderId,
      ...checkoutParams(res.type),
    });
    if (res.paymentUrl) {
      window.location.assign(res.paymentUrl); // hand off to payment provider
      return;
    }
    setDone({ orderId: res.orderId, type: res.type });
  }

  const clampQty = (n: number) => Math.max(MIN_QTY, Math.min(MAX_QTY, Math.round(n) || MIN_QTY));

  return (
    <div
      id="buy"
      className="scroll-mt-24 rounded-xl border border-black/5 bg-white p-5 shadow-[var(--shadow-lift)] sm:p-6"
    >
      {/* Status + price */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={product.status} />
        {save > 0 && (
          <span className="chip bg-accent-500 text-white">
            <T en={`Save ${save}%`} bn={`${bnDigits(save)}% ছাড়`} />
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          data-testid="product-price"
          className="text-4xl font-extrabold tracking-tight text-brand-700 tabular-nums"
        >
          {formatBDT(product.price)}
        </span>
        {save > 0 && product.compareAtPrice && (
          <span className="text-lg text-ink-soft/70 tabular-nums">
            <span className="sr-only">
              <T en="Regular price" bn="আসল দাম" />{' '}
            </span>
            <s>{formatBDT(product.compareAtPrice)}</s>
          </span>
        )}
      </div>

      {isPrebook && (
        <p className="mt-2 flex items-start gap-2 text-sm text-ink-soft">
          <CalendarClock size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
          <T
            en="Ships with the first batch. Reserving is free — no payment now."
            bn="প্রথম ব্যাচের সাথে পাঠানো হবে। রিজার্ভ করা একদম ফ্রি — এখন টাকা লাগবে না।"
          />
        </p>
      )}

      {done ? (
        <SuccessCard
          ref={successRef}
          done={done}
          onAgain={() => {
            setDone(null);
            setQty(MIN_QTY);
          }}
        />
      ) : (
        <>
          {/* Quantity */}
          {!soldOut && (
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
              <label htmlFor="qty" id="qty-label" className="text-sm font-medium text-ink">
                <T en="Quantity" bn="পরিমাণ" />
              </label>
              <div
                role="group"
                aria-labelledby="qty-label"
                className="flex h-11 items-stretch overflow-hidden rounded-md border border-black/10 bg-white"
              >
                <button
                  type="button"
                  onClick={() => setQty((q) => clampQty(q - 1))}
                  disabled={qty <= MIN_QTY}
                  aria-label={t('Decrease quantity', 'পরিমাণ কমাও', lang)}
                  className="grid w-11 place-items-center text-ink-soft transition-colors hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <Minus size={18} aria-hidden="true" />
                </button>
                <input
                  id="qty"
                  type="number"
                  inputMode="numeric"
                  min={MIN_QTY}
                  max={MAX_QTY}
                  step={1}
                  value={qty}
                  onChange={(e) => setQty(clampQty(Number(e.target.value)))}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-full w-14 border-x border-black/10 text-center text-base font-semibold tabular-nums outline-none [appearance:textfield] focus:bg-brand-50/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => setQty((q) => clampQty(q + 1))}
                  disabled={qty >= MAX_QTY}
                  aria-label={t('Increase quantity', 'পরিমাণ বাড়াও', lang)}
                  className="grid w-11 place-items-center text-ink-soft transition-colors hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <Plus size={18} aria-hidden="true" />
                </button>
              </div>
              <p className="ml-auto text-sm text-ink-soft" aria-live="polite">
                <T en="Total" bn="মোট" />{' '}
                <strong className="text-lg text-ink tabular-nums">{formatBDT(total)}</strong>
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 grid gap-3">
            {soldOut ? (
              <button type="button" disabled className="btn btn-lg btn-secondary w-full">
                <CircleX size={18} aria-hidden="true" />
                <T en="Sold out" bn="স্টক শেষ" />
              </button>
            ) : isPrebook ? (
              <>
                <button
                  type="button"
                  onClick={() => open('reserve')}
                  disabled={loading}
                  className="btn btn-lg btn-primary w-full"
                >
                  <T en="Reserve (no payment now)" bn="রিজার্ভ করো (এখন টাকা লাগবে না)" />
                </button>
                <button
                  type="button"
                  onClick={() => open('preorder')}
                  disabled={loading}
                  className="btn btn-lg btn-secondary w-full"
                >
                  <T en="Pre-order & pay later" bn="প্রি-অর্ডার করো, পরে টাকা দাও" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => open('order')}
                disabled={loading}
                className="btn btn-lg btn-primary w-full"
              >
                <T en="Buy now" bn="এখনই কিনে ফেলো" />
              </button>
            )}
          </div>

          {!soldOut && !user && !loading && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-sm text-ink-soft">
              <LogIn size={15} aria-hidden="true" className="shrink-0" />
              <T
                en="You'll sign in first — we'll bring you right back here."
                bn="আগে লগ ইন করবে — তারপর আবার এখানেই ফিরে আসবে।"
              />
            </p>
          )}

          {!soldOut && (
            <p className="mt-4 flex items-center justify-center gap-1.5 border-t border-black/5 pt-4 text-center text-xs text-ink-soft">
              <ShieldCheck size={14} aria-hidden="true" className="shrink-0 text-brand-600" />
              <T
                en="Cancel free anytime until we confirm your order."
                bn="আমরা কনফার্ম করার আগে যেকোনো সময় ফ্রিতে বাতিল করতে পারবে।"
              />
            </p>
          )}
        </>
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

/** Same badge (text + colours) as the storefront cards, plus an icon. */
function StatusChip({ status }: { status: Product['status'] }) {
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.sold_out;
  const Icon = status === 'prebook' ? CalendarClock : status === 'available' ? PackageCheck : CircleX;
  return (
    <span className={`chip ${badge.cls}`}>
      <Icon size={13} aria-hidden="true" />
      <T en={badge.en} bn={badge.bn} />
    </span>
  );
}

const SUCCESS_TITLE: Record<OrderType, { en: string; bn: string }> = {
  reserve: { en: 'Reservation confirmed!', bn: 'রিজার্ভেশন কনফার্ম!' },
  preorder: { en: 'Pre-order placed!', bn: 'প্রি-অর্ডার হয়ে গেছে!' },
  order: { en: 'Order placed!', bn: 'অর্ডার হয়ে গেছে!' },
};

function SuccessCard({
  ref,
  done,
  onAgain,
}: {
  ref: React.Ref<HTMLDivElement>;
  done: { orderId: string; type: OrderType };
  onAgain: () => void;
}) {
  const title = SUCCESS_TITLE[done.type] ?? SUCCESS_TITLE.order;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      data-testid="order-success"
      className="mt-6 rounded-lg border border-brand-200 bg-brand-50 p-5 outline-none"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brand-600 text-white">
          <CircleCheck size={22} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-bold text-brand-800">
            <T en={title.en} bn={title.bn} />
          </p>
          <p className="mt-0.5 text-sm text-brand-800/80">
            <T en="Order" bn="অর্ডার" />{' '}
            <span className="font-mono text-xs">#{done.orderId.slice(0, 8)}</span>{' '}
            <T en="is waiting for our confirmation." bn="এখন আমাদের কনফার্মেশনের অপেক্ষায়।" />
          </p>
        </div>
      </div>

      <ol className="mt-4 space-y-2 text-sm text-ink">
        <NextStep n={1}>
          <T
            en="We'll check your details and confirm soon — keep your phone nearby."
            bn="আমরা তোমার তথ্য দেখে শিগগিরই কনফার্ম করব — ফোনটা কাছে রেখো।"
          />
        </NextStep>
        <NextStep n={2}>
          <T
            en="Track it (or cancel while it's still pending) from your dashboard."
            bn="ড্যাশবোর্ড থেকে অর্ডারের খবর দেখো (অপেক্ষায় থাকা পর্যন্ত বাতিলও করতে পারবে)।"
          />
        </NextStep>
      </ol>

      <div className="mt-5 flex flex-wrap gap-2">
        <a href="/dashboard" className="btn btn-primary">
          <LayoutDashboard size={16} aria-hidden="true" />
          <T en="Go to my dashboard" bn="আমার ড্যাশবোর্ডে যাও" />
        </a>
        <button type="button" onClick={onAgain} className="btn btn-ghost">
          <T en="Order another" bn="আরেকটা অর্ডার করো" />
        </button>
      </div>
    </div>
  );
}

function NextStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white text-[11px] font-bold text-brand-700 ring-1 ring-brand-200">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}
