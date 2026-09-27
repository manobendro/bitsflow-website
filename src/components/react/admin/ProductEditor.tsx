/**
 * Slide-over product editor (create + edit) with a live storefront preview.
 * Admin chrome is English; product content fields are bilingual (EN / বাংলা).
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowUp,
  BatteryCharging,
  Bot,
  Briefcase,
  Cable,
  Check,
  ChevronDown,
  CircleAlert,
  Cpu,
  Eye,
  ExternalLink,
  GraduationCap,
  ListChecks,
  Package,
  PackageOpen,
  Plus,
  Radar,
  Tag,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react';
import ProductCard from '../ProductCard';
import {
  CATEGORIES,
  PRODUCT_ICONS,
  PRODUCT_STATUSES,
  productHref,
  type CatalogProduct,
  type ProductCategory,
  type ProductIcon,
  type ProductStatus,
} from '../../../lib/catalog';
import { adminCreateProduct, adminUpdateProduct, type ProductInput } from '../../../lib/api';
import { formatBDT } from '../../../lib/format';
import {
  DEFAULT_ICON_FOR,
  MAX_HIGHLIGHTS,
  MAX_IN_BOX,
  compareAtInfo,
  diffForUpdate,
  draftSignature,
  draftToCreateInput,
  draftToPreview,
  emptyDraft,
  pair,
  productToDraft,
  relativeTime,
  slugify,
  validateDraft,
  type Draft,
  type FieldErrors,
  type Pair,
} from './productForm';
import { Field, LangTag, Section, Spinner, Switch, useModal } from './ui';

export const ICON_META: Record<ProductIcon, { label: string; Icon: LucideIcon }> = {
  board: { label: 'Board', Icon: Cpu },
  starter: { label: 'Starter', Icon: PackageOpen },
  robotics: { label: 'Robotics', Icon: Bot },
  sensor: { label: 'Sensor', Icon: Radar },
  battery: { label: 'Battery', Icon: BatteryCharging },
  cable: { label: 'Cable', Icon: Cable },
  classroom: { label: 'Classroom', Icon: GraduationCap },
  case: { label: 'Case', Icon: Briefcase },
};

export const STATUS_META: Record<ProductStatus, { label: string; hint: string }> = {
  available: { label: 'In stock', hint: 'Customers see “Buy now”.' },
  prebook: { label: 'Pre-book', hint: 'Customers can reserve or pre-order.' },
  sold_out: { label: 'Sold out', hint: 'Still visible, but it can’t be ordered.' },
};

/** Error keys in on-screen order (for "jump to first problem"). */
const FIELD_ORDER = ['name', 'slug', 'price', 'compareAtPrice', 'sortOrder', 'image'];

export interface SavedInfo {
  id: string;
  name: string;
  active: boolean;
  created: boolean;
}

export default function ProductEditor({
  product,
  products,
  defaultSortOrder,
  onClose,
  onSaved,
}: {
  /** null = create a new product. */
  product: CatalogProduct | null;
  /** All products (for slug uniqueness). */
  products: CatalogProduct[];
  defaultSortOrder: number;
  onClose: () => void;
  onSaved: (info: SavedInfo) => void;
}) {
  const isNew = product === null;
  const [draft, setDraft] = useState<Draft>(() =>
    product ? productToDraft(product) : emptyDraft(defaultSortOrder)
  );
  const [initialSig] = useState(() => draftSignature(draft));
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [iconTouched, setIconTouched] = useState(!isNew);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [slugConflict, setSlugConflict] = useState<{ slug: string; msg: string } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [previewLang, setPreviewLang] = useState<'en' | 'bn'>('en');
  const [previewOpen, setPreviewOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const previewId = useId();

  const dirty = draftSignature(draft) !== initialSig;

  const errors: FieldErrors = useMemo(() => {
    const e = validateDraft(draft, {
      isNew,
      others: products.filter((p) => p.id !== product?.id),
    });
    if (isNew && !e.slug && slugConflict && slugConflict.slug === draft.slug.trim()) {
      e.slug = slugConflict.msg;
    }
    return e;
  }, [draft, isNew, products, product, slugConflict]);
  const errorKeys = Object.keys(errors);
  const isValid = errorKeys.length === 0;
  const canSave = isValid && !saving && (isNew || dirty);

  const err = (key: string) => (showAll || touched.has(key) ? errors[key] : undefined);
  const touch = (...keys: string[]) =>
    setTouched((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => next.add(k));
      return next;
    });

  function update(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function requestClose() {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  const dialogRef = useModal<HTMLDivElement>(true, requestClose);

  // Ctrl/Cmd + S saves.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!confirmDiscard) void save();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  function focusField(key: string) {
    requestAnimationFrame(() => {
      const el = dialogRef.current?.querySelector<HTMLElement>(`[data-field="${CSS.escape(key)}"]`);
      el?.focus();
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  function revealErrors() {
    setShowAll(true);
    const first =
      FIELD_ORDER.find((k) => errors[k]) ??
      errorKeys.find((k) => k.startsWith('highlights.')) ??
      errorKeys.find((k) => k.startsWith('inBox.')) ??
      errorKeys[0];
    if (first) focusField(first);
  }

  async function save() {
    if (saving) return;
    if (!isValid) {
      revealErrors();
      return;
    }
    if (!isNew && !dirty) return;
    setSaving(true);
    setServerError(null);
    try {
      if (isNew) {
        const input = draftToCreateInput(draft);
        const res = await adminCreateProduct(input);
        onSaved({ id: res.id || input.id, name: input.name, active: input.active !== false, created: true });
      } else {
        const patch = diffForUpdate(product, draft);
        await adminUpdateProduct(product.id, patch as unknown as Partial<ProductInput>);
        onSaved({ id: product.id, name: draft.name.trim(), active: draft.active, created: false });
      }
    } catch (e) {
      const msg = (e as Error).message || 'Something went wrong while saving.';
      setServerError(msg);
      if (isNew && /slug|already exists/i.test(msg)) {
        setSlugConflict({ slug: draft.slug.trim(), msg });
        touch('slug');
      }
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      setSaving(false);
    }
  }

  const preview = useMemo(
    () => draftToPreview(draft, product?.id ?? 'preview'),
    [draft, product?.id]
  );
  const cmp = compareAtInfo(draft);
  const hueGradient = `linear-gradient(135deg, hsl(${draft.hue} 48% 90%), hsl(${draft.hue} 58% 58%))`;

  const title = isNew ? 'New product' : `Edit ${product.name}`;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <div
        className="ap-fade absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={requestClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="product-editor"
        className="ap-slide absolute inset-y-0 right-0 flex w-full flex-col bg-paper shadow-[0_0_0_1px_rgb(20_39_31_/_0.06),-24px_0_60px_-20px_rgb(20_39_31_/_0.35)] outline-none sm:max-w-[1080px] sm:border-l sm:border-black/5"
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-black/5 bg-white px-5 py-4 sm:px-8">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
              {isNew ? 'Create' : 'Editing'}
            </p>
            <h2 id={titleId} className="truncate text-xl font-extrabold tracking-tight">
              {title}
            </h2>
            {!isNew && (
              <p className="mt-0.5 truncate text-xs text-ink-soft">
                <span className="font-mono">/{product.slug}</span>
                {product.updatedAt ? ` · Updated ${relativeTime(product.updatedAt)}` : ''}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!isNew && (
              <a
                href={productHref(product.slug)}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="view-on-store"
                className="btn btn-ghost btn-sm min-h-11 lg:min-h-9"
              >
                <ExternalLink size={15} aria-hidden="true" />
                <span className="hidden sm:inline">View on store</span>
                <span className="sr-only sm:hidden">View on store (opens in a new tab)</span>
              </a>
            )}
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close editor"
              data-testid="close-editor"
              className="grid h-11 w-11 place-items-center rounded-md text-ink-soft transition-colors hover:bg-sand hover:text-ink"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* Body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
          <div className="flex flex-col gap-6 px-5 py-6 sm:px-8 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
            <form
              id="product-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
              className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1"
            >
              {serverError && (
                <div
                  role="alert"
                  data-testid="editor-error"
                  className="flex items-start gap-3 rounded-lg border border-accent-500/30 bg-accent-500/[0.07] px-4 py-3 text-sm text-ink"
                >
                  <CircleAlert size={18} className="mt-px shrink-0 text-accent-500" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">Couldn’t save this product</p>
                    <p className="mt-0.5 text-ink-soft">{serverError}</p>
                  </div>
                </div>
              )}

              {/* ---------------- Basics ---------------- */}
              <Section icon={<Type size={18} />} title="Basics" description="What it’s called and how it looks.">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Name" lang="en" error={err('name')}>
                    {(ids) => (
                      <input
                        {...ids}
                        name="name"
                        data-field="name"
                        data-autofocus
                        className="input"
                        autoComplete="off"
                        placeholder="e.g. Sensor Expansion Pack"
                        value={draft.name}
                        onChange={(e) => {
                          const name = e.target.value;
                          update(isNew && !slugTouched ? { name, slug: slugify(name) } : { name });
                        }}
                        onBlur={() => touch('name', ...(slugTouched ? [] : ['slug']))}
                      />
                    )}
                  </Field>
                  <Field label="Name" lang="bn" optional hint="Falls back to the English name.">
                    {(ids) => (
                      <input
                        {...ids}
                        name="nameBn"
                        lang="bn"
                        className="input"
                        autoComplete="off"
                        placeholder="যেমন: সেন্সর এক্সপ্যানশন প্যাক"
                        value={draft.nameBn}
                        onChange={(e) => update({ nameBn: e.target.value })}
                      />
                    )}
                  </Field>
                </div>

                <Field
                  label="Slug"
                  error={isNew ? err('slug') : undefined}
                  hint={
                    isNew ? (
                      <>
                        The product link:{' '}
                        <span className="font-mono text-ink">/products/{draft.slug || '…'}</span>
                        {slugTouched ? '' : ' — generated from the name.'} Slugs are permanent so
                        links never break.
                      </>
                    ) : (
                      'Slugs are permanent so links never break.'
                    )
                  }
                >
                  {(ids) => (
                    <div className="relative">
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-xs text-ink-soft/70"
                      >
                        /products/
                      </span>
                      <input
                        {...ids}
                        name="slug"
                        data-field="slug"
                        className="input pl-[5.6rem] font-mono read-only:cursor-not-allowed read-only:bg-sand read-only:text-ink-soft"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={64}
                        readOnly={!isNew}
                        aria-readonly={!isNew || undefined}
                        placeholder="sensor-pack"
                        value={draft.slug}
                        onChange={(e) => {
                          const v = e.target.value.toLowerCase().replace(/\s+/g, '-');
                          // Clearing the field hands control back to the auto slug.
                          setSlugTouched(v !== '');
                          update({ slug: v });
                        }}
                        onBlur={() => {
                          touch('slug');
                          if (draft.slug !== slugify(draft.slug) && slugify(draft.slug)) {
                            update({ slug: slugify(draft.slug) });
                          }
                        }}
                      />
                    </div>
                  )}
                </Field>

                <Field label="Category">
                  {(ids) => (
                    <select
                      {...ids}
                      name="category"
                      className="input"
                      value={draft.category}
                      onChange={(e) => {
                        const category = e.target.value as ProductCategory;
                        update(
                          iconTouched ? { category } : { category, icon: DEFAULT_ICON_FOR[category] }
                        );
                      }}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.en} · {c.bn}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>

                <fieldset>
                  <legend className="label">Placeholder icon</legend>
                  <div className="grid grid-cols-4 gap-2">
                    {PRODUCT_ICONS.map((key) => {
                      const { label, Icon } = ICON_META[key];
                      const checked = draft.icon === key;
                      return (
                        <label key={key} className="relative block">
                          <input
                            type="radio"
                            name="icon"
                            value={key}
                            checked={checked}
                            onChange={() => {
                              setIconTouched(true);
                              update({ icon: key });
                            }}
                            className="peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none rounded-md opacity-0"
                          />
                          <span
                            className={`flex min-h-[4.75rem] flex-col items-center justify-center gap-1.5 rounded-md border px-1 py-2.5 text-center text-xs font-medium transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500 ${
                              checked
                                ? 'border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600'
                                : 'border-black/10 bg-white text-ink-soft peer-hover:border-brand-300 peer-hover:text-ink'
                            }`}
                          >
                            <span
                              className="grid h-9 w-9 place-items-center rounded-md text-white"
                              style={{ background: checked ? hueGradient : undefined }}
                            >
                              <span
                                className={`grid h-7 w-7 place-items-center rounded-sm ${
                                  checked ? 'bg-ink/80' : 'bg-ink/[0.07] text-ink-soft'
                                }`}
                              >
                                <Icon size={16} strokeWidth={1.75} />
                              </span>
                            </span>
                            {label}
                          </span>
                          {checked && (
                            <span
                              aria-hidden="true"
                              className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-sm bg-brand-600 text-white"
                            >
                              <Check size={11} strokeWidth={3} />
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <Field label="Colour" hint="Tints the placeholder art so every product feels distinct.">
                  {(ids) => (
                    <div className="flex items-center gap-4">
                      <span
                        aria-hidden="true"
                        className="h-11 w-11 shrink-0 rounded-md border border-black/10"
                        style={{ background: hueGradient }}
                      />
                      <input
                        {...ids}
                        type="range"
                        name="hue"
                        min={0}
                        max={360}
                        step={1}
                        value={draft.hue}
                        aria-valuetext={`Hue ${draft.hue} degrees`}
                        onChange={(e) => update({ hue: Number(e.target.value) })}
                        className="ap-range w-full cursor-pointer"
                        style={{
                          background:
                            'linear-gradient(90deg, hsl(0 58% 58%), hsl(60 58% 58%), hsl(120 58% 58%), hsl(180 58% 58%), hsl(240 58% 58%), hsl(300 58% 58%), hsl(360 58% 58%))',
                        }}
                      />
                      <span className="w-10 shrink-0 text-right font-mono text-sm tabular-nums text-ink-soft">
                        {draft.hue}°
                      </span>
                    </div>
                  )}
                </Field>
              </Section>

              {/* ---------------- Pricing & availability ---------------- */}
              <Section
                icon={<Tag size={18} />}
                title="Pricing & availability"
                description="Whole taka only. The server always re-checks prices at checkout."
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Price" error={err('price')}>
                    {(ids) => (
                      <TakaInput
                        {...ids}
                        name="price"
                        value={draft.price}
                        placeholder="4500"
                        onChange={(v) => update({ price: v })}
                        onBlur={() => touch('price')}
                      />
                    )}
                  </Field>
                  <Field
                    label="Compare-at price"
                    optional
                    error={err('compareAtPrice')}
                    hint={
                      cmp?.kind === 'save' ? (
                        <span className="font-semibold text-brand-700">
                          Customers save {cmp.pct}% ({formatBDT(cmp.amount)})
                        </span>
                      ) : cmp?.kind === 'warn' ? (
                        <span className="font-medium text-amber-700">
                          Should be higher than the price — otherwise it won’t be shown.
                        </span>
                      ) : (
                        'The “was” price, shown crossed out.'
                      )
                    }
                  >
                    {(ids) => (
                      <TakaInput
                        {...ids}
                        name="compareAtPrice"
                        value={draft.compareAtPrice}
                        placeholder="5500"
                        onChange={(v) => update({ compareAtPrice: v })}
                        onBlur={() => touch('compareAtPrice')}
                      />
                    )}
                  </Field>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Status" hint={STATUS_META[draft.status].hint}>
                    {(ids) => (
                      <select
                        {...ids}
                        name="status"
                        className="input"
                        value={draft.status}
                        onChange={(e) => update({ status: e.target.value as ProductStatus })}
                      >
                        {PRODUCT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_META[s].label}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <Field label="Sort order" error={err('sortOrder')} hint="Lower numbers show first.">
                    {(ids) => (
                      <input
                        {...ids}
                        name="sortOrder"
                        data-field="sortOrder"
                        inputMode="numeric"
                        className="input tabular-nums"
                        value={draft.sortOrder}
                        onChange={(e) => update({ sortOrder: e.target.value })}
                        onBlur={() => touch('sortOrder')}
                      />
                    )}
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <ToggleRow
                    name="active"
                    title="Visibility"
                    label="Live on store"
                    checked={draft.active}
                    onChange={(active) => update({ active })}
                    onText="Live on store"
                    offText="Hidden"
                    description={draft.active ? 'Customers can see and order it.' : 'Only admins can see it.'}
                  />
                  <ToggleRow
                    name="featured"
                    title="Show on home page"
                    label="Show on home page"
                    checked={draft.featured}
                    onChange={(featured) => update({ featured })}
                    onText="Featured"
                    offText="Not featured"
                    description="Appears in the home page product grid."
                  />
                </div>
              </Section>

              {/* ---------------- Content ---------------- */}
              <Section
                icon={<Package size={18} />}
                title="Content"
                description="Friendly, simple words — written for students, parents and teachers."
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Tagline" lang="en" optional>
                    {(ids) => (
                      <input
                        {...ids}
                        name="tagline"
                        className="input"
                        placeholder="One short line that sells it"
                        value={draft.tagline}
                        onChange={(e) => update({ tagline: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="Tagline" lang="bn" optional>
                    {(ids) => (
                      <input
                        {...ids}
                        name="taglineBn"
                        lang="bn"
                        className="input"
                        placeholder="এক লাইনে মজার করে বলো"
                        value={draft.taglineBn}
                        onChange={(e) => update({ taglineBn: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="Description" lang="en" optional>
                    {(ids) => (
                      <textarea
                        {...ids}
                        name="descriptionEn"
                        rows={5}
                        className="input resize-y leading-relaxed"
                        value={draft.descriptionEn}
                        onChange={(e) => update({ descriptionEn: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="Description" lang="bn" optional>
                    {(ids) => (
                      <textarea
                        {...ids}
                        name="descriptionBn"
                        lang="bn"
                        rows={5}
                        className="input resize-y leading-relaxed"
                        value={draft.descriptionBn}
                        onChange={(e) => update({ descriptionBn: e.target.value })}
                      />
                    )}
                  </Field>
                </div>
                <Field
                  label="Image URL"
                  optional
                  error={err('image')}
                  hint="Replaces the placeholder art. Must start with https:// or /"
                >
                  {(ids) => (
                    <input
                      {...ids}
                      name="image"
                      data-field="image"
                      type="url"
                      inputMode="url"
                      spellCheck={false}
                      className="input font-mono text-[13px]"
                      placeholder="https://… or /images/…"
                      value={draft.image}
                      onChange={(e) => update({ image: e.target.value })}
                      onBlur={() => touch('image')}
                    />
                  )}
                </Field>
              </Section>

              {/* ---------------- Highlights ---------------- */}
              <Section
                icon={<ListChecks size={18} />}
                title="Highlights"
                description="Short bullet points shown on the product page."
              >
                <PairList
                  kind="highlights"
                  noun="highlight"
                  items={draft.highlights}
                  max={MAX_HIGHLIGHTS}
                  onChange={(highlights) => update({ highlights })}
                  errorFor={(k) => err(`highlights.${k}`)}
                  onBlurRow={(k) => touch(`highlights.${k}`)}
                  placeholders={['e.g. USB-C charging', 'যেমন: USB-C দিয়ে চার্জ']}
                />
              </Section>

              {/* ---------------- In the box ---------------- */}
              <Section icon={<PackageOpen size={18} />} title="In the box" description="What ships with it.">
                <PairList
                  kind="inBox"
                  noun="item"
                  items={draft.inBox}
                  max={MAX_IN_BOX}
                  onChange={(inBox) => update({ inBox })}
                  errorFor={(k) => err(`inBox.${k}`)}
                  onBlurRow={(k) => touch(`inBox.${k}`)}
                  placeholders={['e.g. USB-C cable', 'যেমন: USB-C কেবল']}
                />
              </Section>
            </form>
            {/* Preview (sticky on desktop, collapsible above the form on mobile) */}
            <aside className="order-first lg:order-none lg:col-start-2 lg:row-start-1">
              <div className="lg:sticky lg:top-0">
                <button
                  type="button"
                  onClick={() => setPreviewOpen((o) => !o)}
                  aria-expanded={previewOpen}
                  aria-controls={previewId}
                  className="flex min-h-11 w-full items-center justify-between rounded-md border border-black/5 bg-white px-4 text-sm font-semibold lg:hidden"
                >
                  <span className="inline-flex items-center gap-2">
                    <Eye size={16} className="text-brand-600" aria-hidden="true" /> Live preview
                  </span>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={`transition-transform motion-reduce:transition-none ${previewOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                <div id={previewId} className={`${previewOpen ? 'mt-3 block' : 'hidden'} lg:mt-0 lg:block`}>
                  <PreviewPanel
                    preview={preview}
                    draft={draft}
                    lang={previewLang}
                    onLang={setPreviewLang}
                  />
                </div>
              </div>
            </aside>
          </div>
        </div>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 bg-white px-5 py-3 sm:px-8">
          <div className="min-w-0 text-sm" aria-live="polite">
            {!isValid ? (
              <button
                type="button"
                onClick={revealErrors}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 font-medium text-accent-600 hover:underline lg:min-h-0"
              >
                <CircleAlert size={15} aria-hidden="true" />
                {errorKeys.length} {errorKeys.length === 1 ? 'field needs' : 'fields need'} attention
              </button>
            ) : dirty ? (
              <span className="inline-flex items-center gap-2 text-ink-soft">
                <span aria-hidden="true" className="h-2 w-2 rounded-sm bg-amber-500" />
                Unsaved changes
              </span>
            ) : (
              <span className="text-ink-soft">{isNew ? 'Ready when you are' : 'No changes yet'}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={requestClose} disabled={saving} className="btn btn-ghost min-h-11 lg:min-h-0">
              Cancel
            </button>
            <button
              type="submit"
              form="product-form"
              disabled={!canSave}
              data-testid="save-product"
              title="Save (Ctrl+S)"
              className="btn btn-primary min-h-11 min-w-36 lg:min-h-0"
            >
              {saving ? (
                <>
                  <Spinner size={15} /> Saving…
                </>
              ) : (
                <>
                  <Check size={16} aria-hidden="true" /> {isNew ? 'Create product' : 'Save changes'}
                </>
              )}
            </button>
          </div>
        </footer>
      </div>

      {confirmDiscard && (
        <DiscardDialog
          name={draft.name.trim() || (isNew ? 'this new product' : product.name)}
          onKeep={() => setConfirmDiscard(false)}
          onDiscard={onClose}
        />
      )}
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------

function TakaInput({
  value,
  onChange,
  onBlur,
  name,
  placeholder,
  ...aria
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  name: string;
  placeholder?: string;
  id: string;
  'aria-invalid': boolean | undefined;
  'aria-describedby': string | undefined;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-ink-soft"
      >
        ৳
      </span>
      <input
        {...aria}
        name={name}
        data-field={name}
        inputMode="numeric"
        autoComplete="off"
        className="input pl-7 tabular-nums"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  );
}

function ToggleRow({
  name,
  title,
  label,
  checked,
  onChange,
  onText,
  offText,
  description,
}: {
  name: string;
  title: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  onText: string;
  offText: string;
  description: string;
}) {
  const id = useId();
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-md border px-4 py-3 transition-colors ${
        checked ? 'border-brand-200 bg-brand-50/60' : 'border-black/5 bg-paper'
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p id={`${id}-d`} className="text-xs text-ink-soft">
          <span className={checked ? 'font-semibold text-brand-700' : 'font-semibold text-ink-soft'}>
            {checked ? onText : offText}
          </span>{' '}
          · {description}
        </p>
      </div>
      <Switch name={name} checked={checked} onChange={onChange} label={label} describedBy={`${id}-d`} />
    </div>
  );
}

function PairList({
  kind,
  noun,
  items,
  max,
  onChange,
  errorFor,
  onBlurRow,
  placeholders,
}: {
  kind: 'highlights' | 'inBox';
  noun: string;
  items: Pair[];
  max: number;
  onChange: (items: Pair[]) => void;
  errorFor: (key: string) => string | undefined;
  onBlurRow: (key: string) => void;
  placeholders: [string, string];
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const cap = noun.charAt(0).toUpperCase() + noun.slice(1);

  const focusSel = (sel: string) =>
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(sel)?.focus());

  function add() {
    if (items.length >= max) return;
    const p = pair();
    onChange([...items, p]);
    focusSel(`[data-field="${kind}.${p.key}"]`);
  }
  function remove(i: number) {
    const next = items.filter((_, j) => j !== i);
    onChange(next);
    requestAnimationFrame(() => {
      const target = next[Math.min(i, next.length - 1)];
      if (target) listRef.current?.querySelector<HTMLElement>(`[data-remove="${target.key}"]`)?.focus();
      else addRef.current?.focus();
    });
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    const key = items[i].key;
    const edge = (dir === -1 && j === 0) || (dir === 1 && j === items.length - 1);
    focusSel(`[data-move="${key}:${edge ? (dir === -1 ? 'down' : 'up') : dir === -1 ? 'up' : 'down'}"]`);
  }

  const enName = kind === 'highlights' ? 'highlights' : 'inBox';
  const bnName = kind === 'highlights' ? 'highlightsBn' : 'inBoxBn';

  return (
    <div>
      {items.length > 0 && (
        <div className="mb-2 hidden grid-cols-[1.75rem_1fr_1fr_7.5rem] gap-2 px-3 text-xs text-ink-soft sm:grid">
          <span />
          <span>
            <LangTag lang="en" />
          </span>
          <span>
            <LangTag lang="bn" />
          </span>
          <span />
        </div>
      )}
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-black/10 bg-paper px-4 py-5 text-center text-sm text-ink-soft">
          No {noun}s yet.
        </p>
      ) : (
        <ol ref={listRef} className="space-y-2">
          {items.map((p, i) => {
            const error = errorFor(p.key);
            const errId = `${kind}-${p.key}-err`;
            const set = (patch: Partial<Pair>) =>
              onChange(items.map((x) => (x.key === p.key ? { ...x, ...patch } : x)));
            return (
              <li
                key={p.key}
                data-testid={`${kind === 'highlights' ? 'highlight' : 'inbox'}-row`}
                className="grid grid-cols-[1.75rem_1fr_auto] items-start gap-2 rounded-md border border-black/5 bg-paper p-2 sm:grid-cols-[1.75rem_1fr_1fr_7.5rem] sm:p-3"
              >
                <span
                  aria-hidden="true"
                  className="mt-2 grid h-6 w-6 place-items-center rounded-sm bg-white text-xs font-bold tabular-nums text-ink-soft"
                >
                  {i + 1}
                </span>
                <div className="col-start-2 space-y-2 sm:contents">
                  <div className="sm:col-start-2">
                    <input
                      name={`${enName}[${i}]`}
                      data-field={`${kind}.${p.key}`}
                      aria-label={`${cap} ${i + 1}, English`}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errId : undefined}
                      className="input"
                      placeholder={placeholders[0]}
                      value={p.en}
                      onChange={(e) => set({ en: e.target.value })}
                      onBlur={() => onBlurRow(p.key)}
                    />
                    {error && (
                      <p id={errId} className="mt-1 text-xs font-medium text-accent-600">
                        {error}
                      </p>
                    )}
                  </div>
                  <input
                    name={`${bnName}[${i}]`}
                    lang="bn"
                    aria-label={`${cap} ${i + 1}, Bangla`}
                    className="input sm:col-start-3"
                    placeholder={placeholders[1]}
                    value={p.bn}
                    onChange={(e) => set({ bn: e.target.value })}
                    onBlur={() => onBlurRow(p.key)}
                  />
                </div>
                <div className="col-start-3 row-start-1 flex flex-col items-center gap-1 sm:col-start-4 sm:flex-row sm:justify-end">
                  <IconBtn
                    label={`Move ${noun} ${i + 1} up`}
                    data-move={`${p.key}:up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp size={15} />
                  </IconBtn>
                  <IconBtn
                    label={`Move ${noun} ${i + 1} down`}
                    data-move={`${p.key}:down`}
                    disabled={i === items.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown size={15} />
                  </IconBtn>
                  <IconBtn
                    label={`Remove ${noun} ${i + 1}`}
                    data-remove={p.key}
                    danger
                    onClick={() => remove(i)}
                  >
                    <Trash2 size={15} />
                  </IconBtn>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          ref={addRef}
          type="button"
          onClick={add}
          disabled={items.length >= max}
          data-testid={kind === 'highlights' ? 'add-highlight' : 'add-inbox'}
          className="btn btn-secondary btn-sm min-h-11 lg:min-h-9"
        >
          <Plus size={15} aria-hidden="true" /> Add {noun}
        </button>
        <span className="text-xs tabular-nums text-ink-soft">
          {items.length} / {max}
          {items.length >= max ? ' — that’s the limit' : ''}
        </span>
      </div>
    </div>
  );
}

function IconBtn({
  label,
  children,
  danger,
  ...rest
}: {
  label: string;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  [data: `data-${string}`]: string | undefined;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={`grid h-11 w-11 place-items-center rounded-md text-ink-soft transition-colors disabled:pointer-events-none disabled:opacity-30 sm:h-9 sm:w-9 ${
        danger ? 'hover:bg-accent-500/10 hover:text-accent-600' : 'hover:bg-white hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function PreviewPanel({
  preview,
  draft,
  lang,
  onLang,
}: {
  preview: CatalogProduct;
  draft: Draft;
  lang: 'en' | 'bn';
  onLang: (l: 'en' | 'bn') => void;
}) {
  const hl = draft.highlights.filter((h) => h.en.trim() || h.bn.trim());
  const box = draft.inBox.filter((b) => b.en.trim() || b.bn.trim());
  const coverage: { label: string; done: boolean; detail?: string }[] = [
    { label: 'Name', done: !!draft.nameBn.trim() },
    { label: 'Tagline', done: !draft.tagline.trim() || !!draft.taglineBn.trim() },
    { label: 'Description', done: !draft.descriptionEn.trim() || !!draft.descriptionBn.trim() },
    {
      label: 'Highlights',
      done: hl.every((h) => h.bn.trim()),
      detail: `${hl.filter((h) => h.bn.trim()).length}/${hl.length}`,
    },
    {
      label: 'In the box',
      done: box.every((b) => b.bn.trim()),
      detail: `${box.filter((b) => b.bn.trim()).length}/${box.length}`,
    },
  ];
  const doneCount = coverage.filter((c) => c.done).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="hidden text-sm font-bold lg:block">Live preview</h3>
        <div
          role="group"
          aria-label="Preview language"
          className="inline-flex rounded-md border border-black/10 bg-white p-0.5"
        >
          {(['en', 'bn'] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              data-testid={`preview-lang-${l}`}
              onClick={() => onLang(l)}
              className={`min-h-9 rounded-sm px-3 text-xs font-semibold transition-colors ${
                lang === l ? 'bg-brand-600 text-white' : 'text-ink-soft hover:bg-sand hover:text-ink'
              }`}
            >
              {l === 'en' ? 'EN' : <span lang="bn">বাংলা</span>}
            </button>
          ))}
        </div>
      </div>

      <div data-preview-lang={lang} data-testid="product-preview" className="mx-auto max-w-[300px]" inert>
        <ProductCard product={preview} href="#" />
      </div>

      <ul className="flex flex-wrap gap-1.5 text-xs">
        <li
          className={`chip ${draft.active ? 'bg-brand-100 text-brand-700' : 'bg-ink/10 text-ink-soft'}`}
        >
          {draft.active ? 'Live on store' : 'Hidden'}
        </li>
        {draft.featured && <li className="chip bg-amber-100 text-amber-700">On home page</li>}
        <li className="chip bg-sand text-ink-soft">{STATUS_META[draft.status].label}</li>
      </ul>

      <div className="rounded-lg border border-black/5 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">
            <span lang="bn">বাংলা</span> coverage
          </p>
          <span className="text-xs tabular-nums text-ink-soft">
            {doneCount}/{coverage.length}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-sand" aria-hidden="true">
          <div
            className="h-full bg-brand-500 transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${(doneCount / coverage.length) * 100}%` }}
          />
        </div>
        <ul className="mt-3 space-y-1.5 text-sm">
          {coverage.map((c) => (
            <li key={c.label} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`grid h-4 w-4 place-items-center rounded-sm ${
                  c.done ? 'bg-brand-600 text-white' : 'border border-black/15 bg-white'
                }`}
              >
                {c.done && <Check size={11} strokeWidth={3} />}
              </span>
              <span className={c.done ? 'text-ink' : 'text-ink-soft'}>{c.label}</span>
              {c.detail && <span className="ml-auto text-xs tabular-nums text-ink-soft">{c.detail}</span>}
              <span className="sr-only">{c.done ? '(translated)' : '(needs Bangla)'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DiscardDialog({
  name,
  onKeep,
  onDiscard,
}: {
  name: string;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const ref = useModal<HTMLDivElement>(true, onKeep);
  const titleId = useId();
  const descId = useId();
  return (
    <div className="fixed inset-0 z-[110] grid place-items-center p-4">
      <div className="ap-fade absolute inset-0 bg-ink/30" aria-hidden="true" onClick={onKeep} />
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        data-testid="discard-dialog"
        className="ap-pop relative w-full max-w-sm rounded-lg border border-black/5 bg-white p-6 shadow-[0_2px_4px_rgb(20_39_31_/_0.05),0_24px_60px_-16px_rgb(20_39_31_/_0.35)] outline-none"
      >
        <h2 id={titleId} className="text-lg font-bold">
          Discard unsaved changes?
        </h2>
        <p id={descId} className="mt-1.5 text-sm text-ink-soft">
          Your edits to {name} haven’t been saved yet. If you leave now, they’ll be lost.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onKeep} data-autofocus className="btn btn-secondary min-h-11 lg:min-h-0">
            Keep editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            data-testid="discard-changes"
            className="btn btn-danger min-h-11 lg:min-h-0"
          >
            Discard changes
          </button>
        </div>
      </div>
    </div>
  );
}
