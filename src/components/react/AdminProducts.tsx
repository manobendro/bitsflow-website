/**
 * Admin product manager (/admin/products): list, filter, quick toggles, seed,
 * create/edit (slide-over editor with live preview) and delete.
 * Staff tool — English UI; product content is edited bilingually.
 * All writes go through the Functions API; the backend enforces admin access.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import {
  Boxes,
  CircleAlert,
  EyeOff,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from './useAuth';
import ProductArt from './ProductArt';
import { STATUS_BADGE } from './ProductCard';
import {
  adminDeleteProduct,
  adminListProducts,
  adminSeedProducts,
  adminUpdateProduct,
} from '../../lib/api';
import {
  CATEGORIES,
  PRODUCTS,
  PRODUCT_STATUSES,
  sortProducts,
  type CatalogProduct,
  type ProductCategory,
  type ProductStatus,
} from '../../lib/catalog';
import { invalidateLiveProducts } from '../../lib/productsClient';
import { formatBDT } from '../../lib/format';
import ProductEditor, { STATUS_META, type SavedInfo } from './admin/ProductEditor';
import { relativeTime, seedInputs } from './admin/productForm';
import { AdminStyles, Spinner, Switch, Toasts, isModalOpen, useModal, type Toast } from './admin/ui';

type Visibility = 'all' | 'live' | 'hidden';

const CATEGORY_LABEL: Record<ProductCategory, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.en])
) as Record<ProductCategory, string>;

/** Desktop column template (header + rows must match). */
const COLS =
  'xl:grid-cols-[minmax(0,1fr)_6rem_7.25rem_6rem_4rem_3.75rem_6.25rem_5.75rem]';

let toastSeq = 0;

export default function AdminProducts() {
  const { user, loading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | ProductCategory>('all');
  const [status, setStatus] = useState<'all' | ProductStatus>('all');
  const [visibility, setVisibility] = useState<Visibility>('all');

  const [editing, setEditing] = useState<{ product: CatalogProduct | null } | null>(null);
  const [deleting, setDeleting] = useState<CatalogProduct | null>(null);
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [seeding, setSeeding] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Opening the editor dismisses pending toasts: they refer to the previous list
  // action (seed/toggle/delete), and the toast region sits over the editor
  // footer, where it would swallow clicks on the Save button. The editor
  // reports its own errors inline; its success toast fires after it closes.
  useEffect(() => {
    if (editing) setToasts([]);
  }, [editing]);

  // --- auth gate -----------------------------------------------------------
  useEffect(() => {
    if (!loading && !user) window.location.assign('/login?next=/admin/products');
  }, [loading, user]);

  async function load(silent = false) {
    if (!user) return;
    if (silent) setRefreshing(true);
    else setDataLoading(true);
    setLoadError(null);
    try {
      const { products } = await adminListProducts();
      setProducts(sortProducts(products ?? []));
      setAuthorized(true);
    } catch (err) {
      const msg = (err as Error).message;
      if (/admin only/i.test(msg)) setAuthorized(false);
      else setLoadError(msg || 'Could not load products.');
    } finally {
      setDataLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (user) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // "N" opens a new product (when not typing and no dialog is open).
  useEffect(() => {
    if (!authorized) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.ctrlKey || e.metaKey || e.altKey || isModalOpen()) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      setEditing({ product: null });
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [authorized]);

  // --- helpers -------------------------------------------------------------
  function notify(kind: Toast['kind'], text: string) {
    const id = ++toastSeq;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4200);
  }

  function applyLocal(id: string, patch: Partial<CatalogProduct>) {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function quickToggle(p: CatalogProduct, field: 'featured' | 'active') {
    const key = `${p.id}:${field}`;
    if (pending.has(key)) return;
    const next = field === 'active' ? p.active === false : !p.featured;
    setPending((s) => new Set(s).add(key));
    applyLocal(p.id, { [field]: next, updatedAt: Date.now() });
    try {
      await adminUpdateProduct(p.id, { [field]: next });
      invalidateLiveProducts();
      if (field === 'active') {
        notify('success', next ? `${p.name} is live on the store` : `${p.name} is hidden from the store`);
      }
    } catch (err) {
      applyLocal(p.id, { [field]: field === 'active' ? p.active : p.featured, updatedAt: p.updatedAt });
      notify('error', `Couldn’t update ${p.name}: ${(err as Error).message}`);
    } finally {
      setPending((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  }

  async function seed(onlyMissing: boolean) {
    setSeeding(true);
    try {
      const all = seedInputs();
      const payload = onlyMissing ? all.filter((d) => !products.some((p) => p.id === d.id)) : all;
      const res = await adminSeedProducts(payload);
      invalidateLiveProducts();
      notify(
        'success',
        res.seeded > 0
          ? `Added ${res.seeded} product${res.seeded === 1 ? '' : 's'} to the live catalog${
              res.skipped ? ` (${res.skipped} already there)` : ''
            }`
          : 'Nothing to add — every default product is already in the catalog'
      );
      await load(true);
    } catch (err) {
      notify('error', `Seeding failed: ${(err as Error).message}`);
    } finally {
      setSeeding(false);
    }
  }

  function onSaved(info: SavedInfo) {
    setEditing(null);
    invalidateLiveProducts();
    notify(
      'success',
      info.active ? 'Saved — it’s live on the store now' : 'Saved — it’s hidden from the store for now'
    );
    void load(true);
  }

  // --- derived -------------------------------------------------------------
  const stats = useMemo(() => {
    const live = products.filter((p) => p.active !== false).length;
    return {
      total: products.length,
      live,
      hidden: products.length - live,
      featured: products.filter((p) => p.active !== false && p.featured).length,
    };
  }, [products]);

  const filtersActive = query.trim() !== '' || category !== 'all' || status !== 'all' || visibility !== 'all';

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (status !== 'all' && p.status !== status) return false;
      if (visibility === 'live' && p.active === false) return false;
      if (visibility === 'hidden' && p.active !== false) return false;
      if (!q) return true;
      return [p.name, p.nameBn, p.slug, p.id].some((s) => (s ?? '').toLowerCase().includes(q));
    });
  }, [products, query, category, status, visibility]);

  const missingDefaults = useMemo(
    () => PRODUCTS.filter((d) => !products.some((p) => p.id === d.id)),
    [products]
  );

  const nextSortOrder = useMemo(
    () => products.reduce((m, p) => Math.max(m, p.sortOrder ?? 0), 0) + 10,
    [products]
  );

  function clearFilters() {
    setQuery('');
    setCategory('all');
    setStatus('all');
    setVisibility('all');
  }

  // --- render --------------------------------------------------------------
  if (loading || (dataLoading && authorized === null && !loadError)) {
    return <LoadingSkeleton />;
  }

  if (authorized === false) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-black/5 bg-white p-8 text-center shadow-[0_2px_4px_rgb(20_39_31_/_0.05),0_18px_40px_-16px_rgb(20_39_31_/_0.18)]">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-md bg-brand-50 text-brand-600">
          <Lock size={26} />
        </div>
        <h1 className="mt-4 text-xl font-bold">Admins only</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Your account ({user?.email}) doesn't have admin access. If this is a mistake, make sure
          the admin claim is set, then sign out and back in.
        </p>
        <a
          href="/"
          className="mt-5 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Back to site
        </a>
      </div>
    );
  }

  if (authorized === null && loadError) {
    return (
      <div
        role="alert"
        className="mx-auto max-w-md rounded-lg border border-black/5 bg-white p-8 text-center shadow-[0_2px_4px_rgb(20_39_31_/_0.05),0_18px_40px_-16px_rgb(20_39_31_/_0.18)]"
      >
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-md bg-accent-500/10 text-accent-500">
          <CircleAlert size={26} />
        </div>
        <h1 className="mt-4 text-xl font-bold">Couldn’t load products</h1>
        <p className="mt-2 text-sm text-ink-soft">{loadError}</p>
        <button type="button" onClick={() => void load()} className="btn btn-primary mt-5">
          <RefreshCw size={15} aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminStyles />

      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Products</h1>
          <p className="mt-1 text-ink-soft" data-testid="product-count">
            {stats.total} product{stats.total === 1 ? '' : 's'}
            {stats.total > 0 && (
              <>
                {' '}
                · {stats.live} live
                {stats.hidden > 0 && <> · {stats.hidden} hidden</>} · {stats.featured} featured
              </>
            )}
          </p>
          {stats.total > 0 && stats.featured !== 6 && (
            <p className="mt-1 text-xs font-medium text-amber-700">
              The home page grid is designed for 6 featured products.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="btn btn-secondary min-h-11 lg:min-h-0"
            aria-label={refreshing ? 'Refreshing products' : 'Refresh products'}
          >
            <RefreshCw
              size={15}
              aria-hidden="true"
              className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''}
            />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setEditing({ product: null })}
            data-testid="new-product"
            title="New product (N)"
            className="btn btn-primary min-h-11 lg:min-h-0"
          >
            <Plus size={16} aria-hidden="true" /> New product
          </button>
        </div>
      </header>

      {loadError && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-accent-500/10 px-4 py-3 text-sm text-accent-600">
          <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {loadError}
        </p>
      )}

      {products.length === 0 ? (
        <EmptyCatalog seeding={seeding} onSeed={() => void seed(false)} onNew={() => setEditing({ product: null })} />
      ) : (
        <>
          <Toolbar
            query={query}
            onQuery={setQuery}
            category={category}
            onCategory={setCategory}
            status={status}
            onStatus={setStatus}
            visibility={visibility}
            onVisibility={setVisibility}
            shown={visible.length}
            total={products.length}
            filtersActive={filtersActive}
            onClear={clearFilters}
          />

          {visible.length === 0 ? (
            <div className="rounded-lg border border-dashed border-black/10 bg-sand px-6 py-12 text-center">
              <p className="font-semibold">No products match these filters</p>
              <p className="mt-1 text-sm text-ink-soft">Try a different search, or clear the filters.</p>
              <button type="button" onClick={clearFilters} className="btn btn-secondary btn-sm mt-4 min-h-11 lg:min-h-9">
                <X size={14} aria-hidden="true" /> Clear filters
              </button>
            </div>
          ) : (
            <div>
              <div
                aria-hidden="true"
                className={`hidden gap-3 px-5 pb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft/70 xl:grid ${COLS}`}
              >
                <span>Product</span>
                <span>Price</span>
                <span>Category</span>
                <span>Status</span>
                <span>Featured</span>
                <span>Live</span>
                <span>Updated</span>
                <span />
              </div>
              <ul
                aria-label="Products"
                className={`grid gap-3 md:grid-cols-2 xl:block xl:divide-y xl:divide-black/5 xl:overflow-hidden xl:rounded-lg xl:border xl:border-black/5 xl:bg-white xl:shadow-[var(--shadow-soft)] ${
                  refreshing ? 'opacity-70 transition-opacity' : ''
                }`}
              >
                {visible.map((p) => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    pendingFeatured={pending.has(`${p.id}:featured`)}
                    pendingActive={pending.has(`${p.id}:active`)}
                    onToggleFeatured={() => void quickToggle(p, 'featured')}
                    onToggleActive={() => void quickToggle(p, 'active')}
                    onEdit={() => setEditing({ product: p })}
                    onDelete={() => setDeleting(p)}
                  />
                ))}
              </ul>
            </div>
          )}

          {missingDefaults.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/5 bg-sand px-4 py-3 text-sm">
              <p className="text-ink-soft">
                {missingDefaults.length} built-in default product
                {missingDefaults.length === 1 ? ' isn’t' : 's aren’t'} in your live catalog.
                Restoring only adds the missing ones — nothing you’ve edited is overwritten.
              </p>
              <button
                type="button"
                onClick={() => void seed(true)}
                disabled={seeding}
                data-testid="restore-defaults"
                className="btn btn-ghost btn-sm min-h-11 lg:min-h-9"
              >
                {seeding ? <Spinner size={14} /> : <RotateCcw size={14} aria-hidden="true" />}
                Restore missing defaults
              </button>
            </div>
          )}
        </>
      )}

      {editing && (
        <ProductEditor
          product={editing.product}
          products={products}
          defaultSortOrder={nextSortOrder}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}

      {deleting && (
        <DeleteDialog
          product={deleting}
          onCancel={() => setDeleting(null)}
          onHide={async (p) => {
            setDeleting(null);
            if (p.active !== false) await quickToggle(p, 'active');
          }}
          onDeleted={(removed) => {
            setDeleting(null);
            setProducts((prev) => prev.filter((x) => x.id !== removed.id));
            invalidateLiveProducts();
            notify('success', `Deleted ${removed.name}`);
            void load(true);
          }}
        />
      )}

      <Toasts toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function ProductRow({
  product: p,
  pendingFeatured,
  pendingActive,
  onToggleFeatured,
  onToggleActive,
  onEdit,
  onDelete,
}: {
  product: CatalogProduct;
  pendingFeatured: boolean;
  pendingActive: boolean;
  onToggleFeatured: () => void;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const active = p.active !== false;
  const badge = STATUS_BADGE[p.status];
  const hasCompare = p.compareAtPrice != null && p.compareAtPrice > p.price;
  const price = (
    <div className="text-right xl:text-left">
      <p className="font-semibold tabular-nums">{formatBDT(p.price)}</p>
      {hasCompare && (
        <p className="text-xs tabular-nums text-ink-soft/70 line-through">{formatBDT(p.compareAtPrice!)}</p>
      )}
    </div>
  );

  return (
    <li
      data-testid="product-row"
      data-slug={p.slug}
      data-active={active ? 'true' : 'false'}
      className={`flex flex-col gap-3 rounded-lg border border-black/5 bg-white p-4 shadow-[0_1px_2px_rgb(20_39_31_/_0.04)] transition-colors xl:grid xl:items-center xl:gap-3 xl:rounded-none xl:border-0 xl:px-5 xl:py-3 xl:shadow-none xl:hover:bg-paper ${COLS}`}
    >
      {/* Row 1 (mobile): art + names + price */}
      <div className="flex min-w-0 items-start gap-3 xl:contents">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            tabIndex={-1}
            onClick={onEdit}
            aria-label={`Edit ${p.name}`}
            className={`relative aspect-square w-14 shrink-0 overflow-hidden rounded-md border border-black/5 transition xl:w-12 ${
              active ? '' : 'opacity-50 grayscale'
            }`}
          >
            <ProductArt product={p} thumb />
          </button>
          <div className="min-w-0">
            <p className="flex items-center gap-2">
              <button
                type="button"
                tabIndex={-1}
                onClick={onEdit}
                className="truncate text-left font-semibold hover:text-brand-700 hover:underline"
              >
                {p.name}
              </button>
              {!active && (
                <span className="chip shrink-0 bg-ink/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-soft">
                  Hidden
                </span>
              )}
            </p>
            <p lang="bn" className="truncate text-sm text-ink-soft">
              {p.nameBn}
            </p>
            <p className="truncate font-mono text-xs text-ink-soft/70">/{p.slug}</p>
          </div>
        </div>
        {price}
      </div>

      {/* Row 2+3 (mobile): meta, toggles, updated, actions */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 border-t border-black/5 pt-2 xl:contents">
        <div className="flex flex-wrap items-center gap-1.5 xl:contents">
          <span className="chip bg-sand text-ink-soft xl:bg-transparent xl:px-0 xl:text-sm xl:font-normal">
            {CATEGORY_LABEL[p.category] ?? p.category}
          </span>
          <span>
            <span className={`chip ${badge.cls}`}>{badge.en}</span>
          </span>
        </div>

        <div className="flex items-center justify-end gap-1 xl:contents">
          <button
            type="button"
            onClick={onToggleFeatured}
            disabled={pendingFeatured}
            aria-pressed={p.featured}
            aria-label={`Feature ${p.name} on the home page`}
            title={p.featured ? 'Featured on the home page' : 'Not featured'}
            data-testid="toggle-featured"
            className={`grid h-11 w-11 place-items-center rounded-md transition-colors disabled:cursor-wait xl:h-9 xl:w-9 ${
              p.featured ? 'text-amber-500 hover:bg-amber-50' : 'text-ink-soft/50 hover:bg-sand hover:text-ink-soft'
            }`}
          >
            <Star size={18} fill={p.featured ? 'currentColor' : 'none'} />
          </button>
          <span className="xl:-ml-1.5">
            <Switch
              size="sm"
              checked={active}
              disabled={pendingActive}
              onChange={onToggleActive}
              label={`${p.name} live on store`}
              testId="toggle-active"
            />
          </span>
        </div>

        <p className="text-xs text-ink-soft xl:text-sm">
          <span className="xl:hidden">Updated </span>
          {p.updatedAt ? (
            <time dateTime={new Date(p.updatedAt).toISOString()} title={new Date(p.updatedAt).toLocaleString('en-GB')}>
              {relativeTime(p.updatedAt)}
            </time>
          ) : (
            '—'
          )}
        </p>

        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onEdit}
            data-testid="edit-product"
            aria-label={`Edit ${p.name}`}
            title="Edit"
            className="btn btn-secondary btn-sm min-h-11 xl:h-9 xl:min-h-0 xl:w-9 xl:px-0"
          >
            <Pencil size={14} aria-hidden="true" />
            <span className="xl:hidden">Edit</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            data-testid="delete-product"
            aria-label={`Delete ${p.name}`}
            title="Delete"
            className="grid h-11 w-11 place-items-center rounded-md text-ink-soft transition-colors hover:bg-accent-500/10 hover:text-accent-600 xl:h-9 xl:w-9"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </li>
  );
}

function Toolbar(props: {
  query: string;
  onQuery: (v: string) => void;
  category: 'all' | ProductCategory;
  onCategory: (v: 'all' | ProductCategory) => void;
  status: 'all' | ProductStatus;
  onStatus: (v: 'all' | ProductStatus) => void;
  visibility: Visibility;
  onVisibility: (v: Visibility) => void;
  shown: number;
  total: number;
  filtersActive: boolean;
  onClear: () => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <div role="search" className="grid gap-2 sm:grid-cols-3 lg:grid-cols-[minmax(0,1fr)_11rem_9.5rem_9rem]">
        <div className="relative sm:col-span-3 lg:col-span-1">
          <label htmlFor={`${id}-q`} className="sr-only">
            Search products
          </label>
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/70"
          />
          <input
            id={`${id}-q`}
            type="search"
            data-testid="product-search"
            className="input min-h-11 pl-9 lg:min-h-0"
            placeholder="Search by name (EN / বাংলা) or slug"
            value={props.query}
            onChange={(e) => props.onQuery(e.target.value)}
          />
        </div>
        <FilterSelect
          label="Category"
          testId="filter-category"
          value={props.category}
          onChange={(v) => props.onCategory(v as 'all' | ProductCategory)}
          options={[['all', 'All categories'], ...CATEGORIES.map((c) => [c.key, c.en] as [string, string])]}
        />
        <FilterSelect
          label="Status"
          testId="filter-status"
          value={props.status}
          onChange={(v) => props.onStatus(v as 'all' | ProductStatus)}
          options={[['all', 'Any status'], ...PRODUCT_STATUSES.map((s) => [s, STATUS_META[s].label] as [string, string])]}
        />
        <FilterSelect
          label="Visibility"
          testId="filter-visibility"
          value={props.visibility}
          onChange={(v) => props.onVisibility(v as Visibility)}
          options={[
            ['all', 'Live & hidden'],
            ['live', 'Live only'],
            ['hidden', 'Hidden only'],
          ]}
        />
      </div>
      <div className="flex min-h-7 items-center justify-between gap-3 text-sm text-ink-soft" aria-live="polite">
        <span>
          {props.filtersActive ? `Showing ${props.shown} of ${props.total}` : `${props.total} in the catalog`}
        </span>
        {props.filtersActive && (
          <button
            type="button"
            onClick={props.onClear}
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-medium text-brand-700 hover:bg-brand-50 lg:min-h-7"
          >
            <X size={14} aria-hidden="true" /> Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  testId,
  value,
  onChange,
  options,
}: {
  label: string;
  testId: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`input min-h-11 lg:min-h-0 ${value !== 'all' ? 'border-brand-300 bg-brand-50/60 font-medium text-brand-800' : ''}`}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function EmptyCatalog({
  seeding,
  onSeed,
  onNew,
}: {
  seeding: boolean;
  onSeed: () => void;
  onNew: () => void;
}) {
  return (
    <div data-testid="catalog-empty" className="overflow-hidden rounded-lg border border-black/5 bg-white shadow-[var(--shadow-soft)]">
      <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-center">
        <div>
          <span className="icon-tile h-12 w-12">
            <Boxes size={24} aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight">Your live catalog is empty</h2>
          <p className="mt-2 max-w-prose text-ink-soft">
            The storefront is currently showing the built-in default catalog ({PRODUCTS.length}{' '}
            products). Seed those defaults into the live catalog to start editing them here, or
            build your first product from scratch.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSeed}
              disabled={seeding}
              data-testid="seed-catalog"
              className="btn btn-primary min-h-11"
            >
              {seeding ? <Spinner size={15} /> : <Sparkles size={16} aria-hidden="true" />}
              {seeding ? 'Seeding…' : 'Seed default catalog'}
            </button>
            <button type="button" onClick={onNew} className="btn btn-secondary min-h-11">
              <Plus size={16} aria-hidden="true" /> Start from scratch
            </button>
          </div>
        </div>
        <ul aria-label="Default products" className="grid grid-cols-4 gap-2">
          {PRODUCTS.map((p) => (
            <li key={p.id} title={p.name} className="aspect-square overflow-hidden rounded-md border border-black/5">
              <ProductArt product={p} thumb />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DeleteDialog({
  product,
  onCancel,
  onHide,
  onDeleted,
}: {
  product: CatalogProduct;
  onCancel: () => void;
  onHide: (p: CatalogProduct) => void | Promise<void>;
  onDeleted: (p: CatalogProduct) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useModal<HTMLDivElement>(true, () => {
    if (!busy) onCancel();
  });
  const titleId = useId();
  const descId = useId();
  const active = product.active !== false;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await adminDeleteProduct(product.id);
      onDeleted(product);
    } catch (err) {
      setError((err as Error).message || 'Delete failed.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] grid place-items-end p-0 sm:place-items-center sm:p-4">
      <div className="ap-fade absolute inset-0 bg-ink/40 backdrop-blur-[2px]" aria-hidden="true" onClick={() => !busy && onCancel()} />
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        data-testid="delete-dialog"
        className="ap-pop relative w-full max-w-md rounded-t-lg border border-black/5 bg-white p-6 shadow-[0_2px_4px_rgb(20_39_31_/_0.05),0_24px_60px_-16px_rgb(20_39_31_/_0.35)] outline-none sm:rounded-lg"
      >
        <div className="flex items-start gap-4">
          <div className="aspect-square w-14 shrink-0 overflow-hidden rounded-md border border-black/5">
            <ProductArt product={product} thumb />
          </div>
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold leading-snug">
              Delete “{product.name}”?
            </h2>
            <p className="font-mono text-xs text-ink-soft/70">/{product.slug}</p>
          </div>
        </div>
        <div id={descId} className="mt-4 space-y-2 text-sm text-ink-soft">
          <p>
            This permanently removes it from the live catalog, and its product link will stop
            working. Past orders keep their own copy of the details.
          </p>
          {active && (
            <p className="flex items-start gap-2 rounded-md bg-brand-50 px-3 py-2 text-brand-800">
              <EyeOff size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                <strong>Gentler option:</strong> hide it instead — it disappears from the store but
                you can bring it back any time.
              </span>
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-md bg-accent-500/10 px-3 py-2 text-sm text-accent-600">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={busy} data-autofocus className="btn btn-ghost min-h-11 sm:min-h-0">
            Cancel
          </button>
          {active && (
            <button
              type="button"
              onClick={() => void onHide(product)}
              disabled={busy}
              data-testid="hide-instead"
              className="btn btn-secondary min-h-11 sm:min-h-0"
            >
              <EyeOff size={15} aria-hidden="true" /> Hide instead
            </button>
          )}
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            data-testid="confirm-delete"
            className="btn min-h-11 bg-accent-500 text-white hover:bg-accent-600 sm:min-h-0"
          >
            {busy ? <Spinner size={15} /> : <Trash2 size={15} aria-hidden="true" />}
            {busy ? 'Deleting…' : 'Delete product'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading products">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="skeleton h-9 w-40" />
          <div className="skeleton h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-10 w-28" />
          <div className="skeleton h-10 w-36" />
        </div>
      </div>
      <div className="skeleton h-11 w-full" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-lg border border-black/5 bg-white p-4">
            <div className="skeleton h-12 w-12 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-1/3" />
              <div className="skeleton h-3 w-1/4" />
            </div>
            <div className="skeleton hidden h-5 w-20 sm:block" />
            <div className="skeleton h-8 w-16" />
          </div>
        ))}
      </div>
      <p className="sr-only">Loading admin…</p>
    </div>
  );
}
