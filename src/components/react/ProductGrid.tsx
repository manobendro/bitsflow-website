/**
 * Live product grid.
 *   mode="featured" — the home page's 6 featured products
 *   mode="all"      — the full /products storefront: category chips, search,
 *                     sort, URL-synced (?category=&q=&sort=)
 *
 * Server-renders `initialProducts` (the seed) so the HTML has real content for
 * SEO and first paint, then swaps in live Firestore data after hydration.
 * The first client render MUST equal the server render: initial state comes
 * from props only; URL params + live data are applied in effects.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUpDown, Search, SearchX, X } from 'lucide-react';
import ProductCard from './ProductCard';
import T from './T';
import { useLang } from './useLang';
import { t, type Lang } from '../../lib/i18n';
import { fetchLiveProducts } from '../../lib/productsClient';
import { productItem, track } from '../../lib/analytics';
import {
  CATEGORIES,
  getFeaturedProducts,
  getProductsByCategory,
  publishedOnly,
  sortProducts,
  type CatalogProduct,
  type ProductCategory,
} from '../../lib/catalog';
import {
  CATEGORY_BLURB,
  bnDigits,
  isCategory,
  matchesQuery,
  scrollBehavior,
} from './store/storeUtils';

type SortKey = 'recommended' | 'price-asc' | 'price-desc' | 'name';
const SORT_KEYS: SortKey[] = ['recommended', 'price-asc', 'price-desc', 'name'];
const SORT_LABELS: Record<SortKey, { en: string; bn: string }> = {
  recommended: { en: 'Recommended', bn: 'আমাদের পছন্দ' },
  'price-asc': { en: 'Price: low to high', bn: 'দাম: কম থেকে বেশি' },
  'price-desc': { en: 'Price: high to low', bn: 'দাম: বেশি থেকে কম' },
  name: { en: 'Name: A–Z', bn: 'নাম: অ থেকে হ' },
};

function isSortKey(v: string | null): v is SortKey {
  return !!v && (SORT_KEYS as string[]).includes(v);
}

function applySort(list: CatalogProduct[], sort: SortKey, lang: Lang): CatalogProduct[] {
  const base = sortProducts(list);
  switch (sort) {
    case 'price-asc':
      return [...base].sort((a, b) => a.price - b.price);
    case 'price-desc':
      return [...base].sort((a, b) => b.price - a.price);
    case 'name':
      return [...base].sort((a, b) =>
        lang === 'bn'
          ? (a.nameBn || a.name).localeCompare(b.nameBn || b.name, 'bn')
          : a.name.localeCompare(b.name, 'en')
      );
    default:
      return base;
  }
}

function useLiveProducts(initialProducts: CatalogProduct[]) {
  const [products, setProducts] = useState<CatalogProduct[]>(initialProducts);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchLiveProducts().then(({ products }) => {
      if (!alive) return;
      setProducts(products);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { products, loaded };
}

/** GA4 `view_item_list` — once per page, after the live catalog has loaded. */
function useListView(listId: string, listName: string, items: CatalogProduct[], ready: boolean) {
  const sent = useRef(false);
  useEffect(() => {
    if (!ready || sent.current || items.length === 0) return;
    sent.current = true;
    track('view_item_list', {
      item_list_id: listId,
      item_list_name: listName,
      items: items.map((p, index) =>
        productItem(p, { index, item_list_id: listId, item_list_name: listName })
      ),
    });
  }, [ready, items, listId, listName]);
}

const GRID = 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3';

export default function ProductGrid({
  mode,
  initialProducts,
}: {
  mode: 'featured' | 'all';
  initialProducts: CatalogProduct[];
}) {
  if (mode === 'featured') return <FeaturedGrid initialProducts={initialProducts} />;
  return <Storefront initialProducts={initialProducts} />;
}

const FEATURED_LIST = { id: 'home_featured', name: 'Home — featured' };
const SHOP_LIST = { id: 'shop_all', name: 'Shop — all products' };

function FeaturedGrid({ initialProducts }: { initialProducts: CatalogProduct[] }) {
  const { products, loaded } = useLiveProducts(initialProducts);
  const featured = useMemo(() => getFeaturedProducts(products).slice(0, 6), [products]);
  useListView(FEATURED_LIST.id, FEATURED_LIST.name, featured, loaded);
  return (
    <div className={GRID}>
      {featured.map((p, i) => (
        <ProductCard
          key={p.id}
          product={p}
          listId={FEATURED_LIST.id}
          listName={FEATURED_LIST.name}
          index={i}
        />
      ))}
    </div>
  );
}

function Storefront({ initialProducts }: { initialProducts: CatalogProduct[] }) {
  const { products, loaded } = useLiveProducts(initialProducts);
  const lang = useLang();
  const rootRef = useRef<HTMLDivElement>(null);

  const [category, setCategory] = useState<ProductCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recommended');
  // URL is read after hydration; only then do we start writing it back.
  const [urlReady, setUrlReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get('category');
    const s = params.get('sort');
    if (isCategory(c)) setCategory(c);
    setQuery(params.get('q') ?? '');
    if (isSortKey(s)) setSort(s);
    setUrlReady(true);
  }, []);

  useEffect(() => {
    if (!urlReady) return;
    const url = new URL(window.location.href);
    const set = (k: string, v: string) =>
      v ? url.searchParams.set(k, v) : url.searchParams.delete(k);
    set('category', category === 'all' ? '' : category);
    set('q', query.trim());
    set('sort', sort === 'recommended' ? '' : sort);
    const next = url.pathname + url.search + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(window.history.state, '', next);
    }
  }, [urlReady, category, query, sort]);

  const published = useMemo(() => publishedOnly(products), [products]);
  useListView(SHOP_LIST.id, SHOP_LIST.name, published, loaded);
  const searched = useMemo(
    () => published.filter((p) => matchesQuery(p, query)),
    [published, query]
  );

  // GA4 `search` — debounced so a query is logged once the customer pauses,
  // with the result count (0 = a search we should cater for).
  const lastSearch = useRef('');
  useEffect(() => {
    if (!urlReady) return;
    const q = query.trim();
    if (q.length < 2 || q === lastSearch.current) return;
    const id = window.setTimeout(() => {
      lastSearch.current = q;
      track('search', { search_term: q, results: searched.length });
    }, 900);
    return () => window.clearTimeout(id);
  }, [query, urlReady, searched.length]);
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: searched.length };
    for (const c of CATEGORIES) m[c.key] = searched.filter((p) => p.category === c.key).length;
    return m;
  }, [searched]);
  const results = useMemo(
    () =>
      applySort(
        category === 'all' ? searched : searched.filter((p) => p.category === category),
        sort,
        lang
      ),
    [searched, category, sort, lang]
  );

  const filtering = category !== 'all' || query.trim() !== '' || sort !== 'recommended';
  const groups = filtering ? [] : getProductsByCategory(published);

  function clearAll() {
    track('clear_filters', { category, sort, had_query: query.trim() !== '' });
    setCategory('all');
    setQuery('');
    setSort('recommended');
  }

  function pickCategory(c: ProductCategory | 'all') {
    if (c !== category) track('filter_products', { category: c });
    setCategory(c);
    // If the user has scrolled into the list, bring the results back into view.
    const el = rootRef.current;
    if (el && el.getBoundingClientRect().top < 0) {
      el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    }
  }

  const n = results.length;

  return (
    <div ref={rootRef} className="scroll-mt-16" data-testid="product-storefront">
      {/* Toolbar — sticks just below the 64px header */}
      <div className="sticky top-16 z-30 -mx-5 border-b border-black/5 bg-paper/90 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-paper/75 sm:-mx-8 sm:px-8">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="store-search" className="sr-only">
              {t('Search products', 'পণ্য খোঁজো', lang)}
            </label>
            <Search
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/60"
              aria-hidden="true"
            />
            <input
              id="store-search"
              type="search"
              inputMode="search"
              autoComplete="off"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(
                'Search boards, kits, cables…',
                'বোর্ড, কিট, কেবল — খুঁজে দেখো…',
                lang
              )}
              className="input min-h-11 pl-10 pr-10 text-base sm:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-ink-soft hover:bg-sand hover:text-ink"
                aria-label={t('Clear search', 'খোঁজা মুছে দাও', lang)}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <label
              htmlFor="store-sort"
              className="hidden items-center gap-1.5 text-sm font-medium text-ink-soft sm:inline-flex"
            >
              <ArrowUpDown size={16} aria-hidden="true" />
              {t('Sort', 'সাজাও', lang)}
            </label>
            <select
              id="store-sort"
              value={sort}
              onChange={(e) => {
                const next = e.target.value as SortKey;
                track('sort_products', { sort: next });
                setSort(next);
              }}
              aria-label={t('Sort products', 'পণ্য সাজাও', lang)}
              className="input min-h-11 w-36 cursor-pointer py-2 text-sm sm:w-52"
            >
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(SORT_LABELS[k].en, SORT_LABELS[k].bn, lang)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          role="group"
          aria-label={t('Filter by category', 'ক্যাটাগরি অনুযায়ী দেখো', lang)}
          className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <CategoryChip
            active={category === 'all'}
            onClick={() => pickCategory('all')}
            count={counts.all}
          >
            <T en="All" bn="সব" />
          </CategoryChip>
          {CATEGORIES.map((c) => (
            <CategoryChip
              key={c.key}
              active={category === c.key}
              onClick={() => pickCategory(c.key)}
              count={counts[c.key] ?? 0}
            >
              <T en={c.en} bn={c.bn} />
            </CategoryChip>
          ))}
        </div>
      </div>

      {/* Result summary */}
      <div className="mt-4 flex min-h-11 items-center justify-between gap-3 text-sm">
        <p className="text-ink-soft" aria-live="polite" data-testid="result-count">
          {filtering ? (
            <T en={`${n} ${n === 1 ? 'product' : 'products'} found`} bn={`${bnDigits(n)}টি পণ্য পাওয়া গেছে`} />
          ) : (
            <T en={`${n} ${n === 1 ? 'product' : 'products'}`} bn={`মোট ${bnDigits(n)}টি পণ্য`} />
          )}
        </p>
        {filtering && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-semibold text-brand-700 hover:bg-brand-50 sm:min-h-9"
          >
            <X size={14} aria-hidden="true" />
            <T en="Clear filters" bn="ফিল্টার মুছে দাও" />
          </button>
        )}
      </div>

      {/* Results */}
      <div className="pt-6">
        {n === 0 ? (
          <EmptyState onClear={clearAll} />
        ) : filtering ? (
          <div className={GRID}>
            {results.map((p, i) => (
              <ProductCard
                key={p.id}
                product={p}
                showCategory
                listId={SHOP_LIST.id}
                listName={SHOP_LIST.name}
                index={i}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-16">
            {groups.map((g) => (
              <section key={g.key} aria-labelledby={`cat-${g.key}`}>
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 id={`cat-${g.key}`} className="text-2xl font-extrabold tracking-tight">
                        <T en={g.en} bn={g.bn} />
                      </h2>
                      <span className="chip bg-sand tabular-nums text-ink-soft">
                        <T en={String(g.items.length)} bn={bnDigits(g.items.length)} />
                      </span>
                    </div>
                    {CATEGORY_BLURB[g.key] && (
                      <p className="mt-1 text-ink-soft">
                        <T en={CATEGORY_BLURB[g.key].en} bn={CATEGORY_BLURB[g.key].bn} />
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => pickCategory(g.key)}
                    className="btn btn-ghost btn-sm min-h-11 px-2 text-brand-700 sm:min-h-0"
                  >
                    <T en={`Only ${g.en.toLowerCase()}`} bn={`শুধু ${g.bn}`} />
                  </button>
                </div>
                <div className={`mt-6 ${GRID}`}>
                  {g.items.map((p, i) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      listId={SHOP_LIST.id}
                      listName={SHOP_LIST.name}
                      index={i}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border px-3.5 text-sm font-semibold transition-colors sm:min-h-9 ${
        active
          ? 'border-brand-600 bg-brand-600 text-white shadow-sm shadow-brand-600/20'
          : 'border-black/10 bg-white text-ink-soft hover:border-brand-300 hover:text-brand-700'
      }`}
    >
      {children}
      <span
        className={`rounded-sm px-1.5 text-xs tabular-nums ${
          active ? 'bg-white/20 text-white' : 'bg-sand text-ink-soft'
        }`}
      >
        <T en={String(count)} bn={bnDigits(count)} />
      </span>
    </button>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="mx-auto max-w-md py-12 text-center" data-testid="store-empty">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-lg bg-sand text-ink-soft">
        <SearchX size={30} strokeWidth={1.5} aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-xl font-extrabold">
        <T en="Nothing matches that — yet" bn="এর সাথে মেলে এমন কিছু পেলাম না" />
      </h2>
      <p className="mt-2 text-ink-soft">
        <T
          en="Try a different word or another category. Or clear the filters to see everything."
          bn="অন্য কোনো শব্দ বা ক্যাটাগরি দিয়ে চেষ্টা করো। নয়তো ফিল্টার মুছে সব দেখে নাও।"
        />
      </p>
      <button type="button" onClick={onClear} className="btn btn-primary mt-6 min-h-11">
        <X size={16} aria-hidden="true" />
        <T en="Clear filters" bn="ফিল্টার মুছে দাও" />
      </button>
    </div>
  );
}
