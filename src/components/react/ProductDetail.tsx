/**
 * Live product detail page (PDP) + ordering.
 *
 * - Pre-rendered seed pages pass `slug` + `initialProduct` (SSR content for SEO),
 *   then refresh from Firestore after hydration (price/status/copy stay live).
 * - The client-rendered `/products/view` page passes `slug=""` +
 *   `initialProduct={null}`; the slug is read from `?slug=` or the last path
 *   segment (production rewrites `/products/**` → `/products/view`).
 * Hydration: first client render = server render (state from props + the seed
 * catalog only); URL + live data are read in effects.
 * Test hooks: `data-testid="product-detail"` + `data-slug`;
 * `data-testid="product-unavailable"`; `data-testid="mobile-buy-bar"`.
 *
 * Ordering lives entirely in <ShopActions/> (price, quantity, CTAs, id="buy").
 * The mobile bottom bar only scrolls to it.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Info,
  Package,
  PackageX,
  RotateCcw,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import T from './T';
import ProductArt from './ProductArt';
import ProductCard, { STATUS_BADGE } from './ProductCard';
import ShopActions from './ShopActions';
import { useLang } from './useLang';
import { t } from '../../lib/i18n';
import { formatBDT } from '../../lib/format';
import { fetchLiveProducts } from '../../lib/productsClient';
import { productItem, track } from '../../lib/analytics';
import { PRODUCTS, type CatalogProduct } from '../../lib/catalog';
import {
  bnDigits,
  categoryInfo,
  relatedProducts,
  savePercent,
  scrollBehavior,
} from './store/storeUtils';

function slugFromUrl(): string {
  const q = new URLSearchParams(window.location.search).get('slug');
  if (q) return q;
  const last = window.location.pathname.replace(/\/+$/, '').split('/').pop() ?? '';
  return last === 'view' || last === 'products' ? '' : decodeURIComponent(last);
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; product: CatalogProduct; related: CatalogProduct[] }
  | { kind: 'missing' };

export default function ProductDetail({
  slug,
  initialProduct,
}: {
  slug: string;
  initialProduct: CatalogProduct | null;
}) {
  const [state, setState] = useState<State>(() =>
    initialProduct
      ? {
          kind: 'ready',
          product: initialProduct,
          related: relatedProducts(initialProduct, PRODUCTS),
        }
      : { kind: 'loading' }
  );

  useEffect(() => {
    let alive = true;
    const wanted = slug || slugFromUrl();
    if (!wanted) {
      setState({ kind: 'missing' });
      return;
    }
    fetchLiveProducts().then(({ products }) => {
      if (!alive) return;
      const product = products.find((p) => p.slug === wanted) ?? null;
      if (product) {
        setState({ kind: 'ready', product, related: relatedProducts(product, products) });
        if (product.active !== false) {
          track('view_item', { currency: 'BDT', value: product.price, items: [productItem(product)] });
        } else {
          track('view_unavailable_product', { item_id: product.id, reason: 'hidden' });
        }
      } else {
        // Unknown slug, or a seed page whose product was deleted from the live catalog.
        track('view_unavailable_product', { slug: wanted, reason: 'not_found' });
        setState({ kind: 'missing' });
      }
    });
    return () => {
      alive = false;
    };
  }, [slug]);

  if (state.kind === 'loading') return <DetailSkeleton />;
  if (state.kind === 'missing') return <Unavailable />;

  const { product, related } = state;
  if (product.active === false) {
    return <Unavailable name={product.name} nameBn={product.nameBn} />;
  }

  return (
    <Detail
      product={product}
      related={related}
      updateTitle={!initialProduct}
    />
  );
}

/* ------------------------------------------------------------------------ */

function Detail({
  product,
  related,
  updateTitle,
}: {
  product: CatalogProduct;
  related: CatalogProduct[];
  updateTitle: boolean;
}) {
  const lang = useLang();
  const buyRef = useRef<HTMLDivElement>(null);
  const [barVisible, setBarVisible] = useState(false);

  const cat = categoryInfo(product.category);
  const badge = STATUS_BADGE[product.status];
  const save = savePercent(product);
  const isBoard = product.icon === 'board';

  // Client-rendered (view) page: reflect the product in the tab title.
  useEffect(() => {
    if (!updateTitle) return;
    document.title = `${t(product.name, product.nameBn || product.name, lang)} — Bitsflow`;
  }, [updateTitle, product.name, product.nameBn, lang]);

  // Mobile bottom bar: only while the buy box is out of view.
  useEffect(() => {
    const el = buyRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      ([entry]) => setBarVisible(!entry.isIntersecting),
      { rootMargin: '-64px 0px 0px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  function scrollToBuy() {
    const target = document.getElementById('buy') ?? buyRef.current;
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: scrollBehavior() });
    const btn = target.querySelector<HTMLElement>('button:not([disabled])');
    btn?.focus({ preventScroll: true });
  }

  return (
    <div data-testid="product-detail" data-slug={product.slug}>
      {/* Breadcrumb */}
      <nav aria-label={t('Breadcrumb', 'ব্রেডক্রাম্ব', lang)} className="text-sm">
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-ink-soft">
          <Crumb href="/">
            <T en="Home" bn="হোম" />
          </Crumb>
          <Crumb href="/products">
            <T en="Shop" bn="শপ" />
          </Crumb>
          <Crumb href={`/products?category=${product.category}`}>
            <T en={cat.en} bn={cat.bn} />
          </Crumb>
          <li className="min-w-0 font-medium text-ink" aria-current="page">
            <span className="line-clamp-1">
              <T en={product.name} bn={product.nameBn} />
            </span>
          </li>
        </ol>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-10">
        {/* Gallery */}
        <div className="lg:col-span-7 lg:row-start-1">
          <Gallery product={product} />
        </div>

        {/* Buy column — sticky on desktop */}
        <div
          ref={buyRef}
          className="scroll-mt-24 lg:sticky lg:top-24 lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1 lg:self-start"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${badge.cls}`}>
              <T en={badge.en} bn={badge.bn} />
            </span>
            <a
              href={`/products?category=${product.category}`}
              className="chip border border-black/10 bg-white text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
            >
              <T en={cat.en} bn={cat.bn} />
            </a>
            {save > 0 && product.status !== 'sold_out' && (
              <span className="chip bg-accent-500 text-white">
                <T en={`Save ${save}%`} bn={`${bnDigits(save)}% ছাড়`} />
              </span>
            )}
          </div>

          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            <T en={product.name} bn={product.nameBn} />
          </h1>
          {product.tagline && (
            <p className="mt-3 text-lg leading-relaxed text-ink-soft">
              <T en={product.tagline} bn={product.taglineBn} />
            </p>
          )}

          <div className="mt-6">
            <ShopActions product={product} />
          </div>

          <ul className="mt-5 grid gap-2.5 text-sm text-ink-soft sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <TrustItem icon={<Truck size={17} />}>
              <T en="Delivery across Bangladesh" bn="সারা দেশে ডেলিভারি" />
            </TrustItem>
            <TrustItem icon={<RotateCcw size={17} />}>
              <T en="30-day returns" bn="৩০ দিনে রিটার্ন" />
            </TrustItem>
            <TrustItem icon={<ShieldCheck size={17} />}>
              <T en="1-year warranty" bn="১ বছরের ওয়ারেন্টি" />
            </TrustItem>
          </ul>
        </div>

        {/* Details */}
        <div className="space-y-10 lg:col-span-7 lg:row-start-2">
          {product.descriptionEn && (
            <section>
              <h2 className="text-xl font-extrabold tracking-tight">
                <T en="About this product" bn="এই পণ্যটা সম্পর্কে" />
              </h2>
              <p className="mt-3 max-w-prose leading-relaxed text-ink-soft">
                <T en={product.descriptionEn} bn={product.descriptionBn} />
              </p>
            </section>
          )}

          {product.highlights.length > 0 && (
            <section>
              <h2 className="text-xl font-extrabold tracking-tight">
                <T en="Why you'll love it" bn="কেন তোমার ভালো লাগবে" />
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {product.highlights.map((h, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-black/5 bg-white p-3.5 text-[15px] leading-snug"
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-brand-100 text-brand-700">
                      <Check size={14} strokeWidth={3} aria-hidden="true" />
                    </span>
                    <span>
                      <T en={h} bn={product.highlightsBn[i]} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {product.inBox && product.inBox.length > 0 && (
            <section className="rounded-xl border border-black/5 bg-sand p-5 sm:p-6">
              <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
                <Package size={20} className="text-brand-600" aria-hidden="true" />
                <T en="What's in the box" bn="বক্সে যা যা আছে" />
              </h2>
              <ul className="mt-4 grid gap-x-6 gap-y-2.5 text-[15px] text-ink-soft sm:grid-cols-2">
                {product.inBox.map((item, i) => (
                  <li key={i} className="flex items-center gap-2.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-sm bg-brand-500" aria-hidden="true" />
                    <T en={item.en} bn={item.bn} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {isBoard && (
            <section className="rounded-lg border-y border-l-4 border-r border-amber-200 border-l-amber-400 bg-amber-50 p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-amber-800">
                <Info size={16} aria-hidden="true" />
                <T en="A note on compatibility" bn="কম্প্যাটিবিলিটি নিয়ে একটা কথা" />
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-amber-900/80">
                <T
                  en="Bitsflow is inspired by the BBC micro:bit but is its own board — not a micro:bit and not compatible with micro:bit add-ons or pin layout. It has its own accessory range."
                  bn="বিটসফ্লো BBC micro:bit থেকে অনুপ্রেরণা নেওয়া, তবে এটা সম্পূর্ণ নিজস্ব একটা বোর্ড — micro:bit নয়, আর micro:bit-এর অ্যাড-অন বা পিন লেআউটের সাথে চলে না। এর নিজস্ব এক্সেসরিজ আছে।"
                />
              </p>
            </section>
          )}
        </div>
      </div>

      {/* You might also like */}
      {related.length > 0 && (
        <section className="mt-16 border-t border-black/5 pt-12" aria-labelledby="related-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="related-heading" className="text-2xl font-extrabold tracking-tight">
              <T en="You might also like" bn="এগুলোও তোমার ভালো লাগতে পারে" />
            </h2>
            <a
              href="/products"
              className="group inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
            >
              <T en="See all products" bn="সব পণ্য দেখো" />
              <ArrowRight
                size={15}
                className="transition-transform motion-safe:group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </a>
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p, i) => (
              <ProductCard
                key={p.id}
                product={p}
                showCategory
                listId="related"
                listName="Product page — you might also like"
                index={i}
              />
            ))}
          </div>
        </section>
      )}

      {/* Mobile: sticky price + jump-to-buy bar (ordering stays in ShopActions) */}
      <div className="h-20 lg:hidden" aria-hidden="true" />
      <div
        data-testid="mobile-buy-bar"
        aria-hidden={!barVisible}
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-12px_rgb(20_39_31/0.25)] backdrop-blur transition-[transform,visibility] duration-200 motion-reduce:transition-none lg:hidden ${
          barVisible ? 'visible translate-y-0' : 'invisible translate-y-full'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">
              <T en={product.name} bn={product.nameBn} />
            </p>
            <p className="flex items-baseline gap-2">
              <span className="text-lg font-extrabold tabular-nums text-brand-700">
                {formatBDT(product.price)}
              </span>
              {save > 0 && (
                <span className="text-xs tabular-nums text-ink-soft/60 line-through">
                  {formatBDT(product.compareAtPrice!)}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={scrollToBuy}
            tabIndex={barVisible ? 0 : -1}
            className="btn btn-primary min-h-11 shrink-0"
          >
            {product.status === 'prebook' ? (
              <T en="Pre-book" bn="প্রি-বুক করো" />
            ) : product.status === 'available' ? (
              <T en="Order now" bn="অর্ডার করো" />
            ) : (
              <T en="See options" bn="বিস্তারিত দেখো" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Crumb({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <a
        href={href}
        className="inline-flex min-h-8 items-center rounded-sm hover:text-brand-700 hover:underline"
      >
        {children}
      </a>
      <ChevronRight size={14} className="text-ink-soft/50" aria-hidden="true" />
    </li>
  );
}

function TrustItem({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 rounded-md bg-sand/70 px-3 py-2.5">
      <span className="shrink-0 text-brand-600" aria-hidden="true">
        {icon}
      </span>
      <span className="leading-snug">{children}</span>
    </li>
  );
}

/* ------------------------------------------------------------------------ */

const VIEW_LABELS = [
  { en: 'Main view', bn: 'মূল ছবি' },
  { en: 'Angled view', bn: 'পাশ থেকে' },
  { en: 'Close-up', bn: 'কাছ থেকে' },
  { en: 'Flat lay', bn: 'ওপর থেকে' },
];

type Slide = { key: string; label: { en: string; bn: string }; photo: boolean; variant: number };

function Gallery({ product }: { product: CatalogProduct }) {
  const lang = useLang();
  const [active, setActive] = useState(0);

  const slides: Slide[] = product.image
    ? [
        { key: 'photo', label: { en: 'Photo', bn: 'ছবি' }, photo: true, variant: 0 },
        ...[0, 1, 2].map((v) => ({
          key: `art-${v}`,
          label: VIEW_LABELS[v],
          photo: false,
          variant: v,
        })),
      ]
    : VIEW_LABELS.map((label, v) => ({ key: `art-${v}`, label, photo: false, variant: v }));

  const idx = Math.min(active, slides.length - 1);
  const art = { ...product, image: undefined };

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-xl border border-black/5 bg-sand shadow-[var(--shadow-soft)]">
        {slides.map((s, i) => (
          <div
            key={s.key}
            className={`absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${
              i === idx ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
            aria-hidden={i !== idx}
          >
            <ProductArt
              product={s.photo ? product : art}
              big
              variant={s.variant}
              eager={s.photo}
            />
          </div>
        ))}
        {product.status === 'sold_out' && (
          <span className="chip absolute left-4 top-4 bg-ink/80 text-white">
            <T en="Sold out" bn="স্টক শেষ" />
          </span>
        )}
      </div>

      <div
        className="mt-3 grid grid-cols-4 gap-3"
        role="group"
        aria-label={t('Product views', 'পণ্যের ছবি', lang)}
      >
        {slides.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setActive(i)}
            aria-pressed={i === idx}
            aria-label={t(s.label.en, s.label.bn, lang)}
            title={t(s.label.en, s.label.bn, lang)}
            className={`aspect-square min-h-11 overflow-hidden rounded-lg border-2 transition-[border-color,opacity] ${
              i === idx
                ? 'border-brand-600'
                : 'border-transparent opacity-75 hover:border-brand-200 hover:opacity-100'
            }`}
          >
            <ProductArt product={s.photo ? product : art} thumb variant={s.variant} />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">
        <T en="Loading product…" bn="পণ্য লোড হচ্ছে…" />
      </span>
      <div className="skeleton h-5 w-64 max-w-full" />
      <div className="mt-6 grid gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-7">
          <div className="skeleton aspect-square rounded-xl" />
          <div className="mt-3 grid grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton aspect-square rounded-lg" />
            ))}
          </div>
        </div>
        <div className="space-y-4 lg:col-span-5">
          <div className="flex gap-2">
            <div className="skeleton h-6 w-20" />
            <div className="skeleton h-6 w-24" />
          </div>
          <div className="skeleton h-10 w-3/4" />
          <div className="skeleton h-5 w-full" />
          <div className="skeleton h-5 w-5/6" />
          <div className="skeleton mt-6 h-72 w-full rounded-xl" />
          <div className="skeleton h-12 w-full" />
        </div>
      </div>
    </div>
  );
}

function Unavailable({ name, nameBn }: { name?: string; nameBn?: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center" data-testid="product-unavailable">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-lg bg-sand text-ink-soft">
        <PackageX size={30} strokeWidth={1.5} aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-2xl font-extrabold">
        {name ? (
          <T
            en={`${name} is no longer available`}
            bn={`${nameBn || name} এখন আর পাওয়া যাচ্ছে না`}
          />
        ) : (
          <T en="We couldn't find that product" bn="পণ্যটা খুঁজে পাওয়া গেল না" />
        )}
      </h1>
      <p className="mt-2 text-ink-soft">
        <T
          en="It may have been removed or renamed. Have a look at the rest of the range."
          bn="হয়তো সরিয়ে ফেলা হয়েছে বা নাম বদলেছে। বাকি পণ্যগুলো ঘুরে দেখো।"
        />
      </p>
      <a href="/products" className="btn btn-primary mt-6 min-h-11">
        <T en="Browse all products" bn="সব পণ্য দেখো" />
      </a>
    </div>
  );
}
