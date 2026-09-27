/**
 * Storefront product card (home featured grid, /products listing, "you might
 * also like", admin preview).
 * Props contract is shared across agents/pages — keep `{ product, href? }` stable
 * (`showCategory` / `popular` are optional extras).
 * Test hooks: `data-testid="product-card"` + `data-slug`.
 *
 * The whole card is one link. Hover: gentle lift (from .card-soft) + a slow art
 * zoom, both disabled under prefers-reduced-motion.
 */
import { ArrowRight, Star } from 'lucide-react';
import T from './T';
import ProductArt from './ProductArt';
import { formatBDT } from '../../lib/format';
import { productHref, type CatalogProduct } from '../../lib/catalog';
import { bnDigits, categoryInfo, savePercent } from './store/storeUtils';
import { productItem, track } from '../../lib/analytics';

export const STATUS_BADGE: Record<
  CatalogProduct['status'],
  { en: string; bn: string; cls: string }
> = {
  available: { en: 'In stock', bn: 'স্টকে আছে', cls: 'bg-brand-100 text-brand-700' },
  prebook: { en: 'Pre-book', bn: 'প্রি-বুক', cls: 'bg-amber-100 text-amber-700' },
  sold_out: { en: 'Sold out', bn: 'স্টক শেষ', cls: 'bg-ink/10 text-ink-soft' },
};

export default function ProductCard({
  product,
  href,
  showCategory = false,
  popular = false,
  listId,
  listName,
  index,
}: {
  product: CatalogProduct;
  /** Override the link (e.g. `#` in the admin preview). */
  href?: string;
  /** Show the category as a small eyebrow above the name (flat/mixed grids). */
  showCategory?: boolean;
  /** Show a small "Popular" tag (featured products in the full listing). */
  popular?: boolean;
  /** Analytics list context — when set, a click logs GA4 `select_item`. */
  listId?: string;
  listName?: string;
  index?: number;
}) {
  function onSelect() {
    if (!listId) return;
    track('select_item', {
      item_list_id: listId,
      item_list_name: listName ?? listId,
      items: [productItem(product, { index, item_list_id: listId, item_list_name: listName })],
    });
  }
  const badge = STATUS_BADGE[product.status];
  const soldOut = product.status === 'sold_out';
  const save = savePercent(product);
  const cat = categoryInfo(product.category);

  return (
    <a
      href={href ?? productHref(product.slug)}
      data-testid="product-card"
      data-slug={product.slug}
      onClick={onSelect}
      className="card-soft group flex flex-col overflow-hidden"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-sand">
        <div
          className={`h-full w-full transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.05] ${
            soldOut ? 'opacity-60 grayscale' : ''
          }`}
        >
          <ProductArt product={product} />
        </div>
        <span className={`chip absolute left-3 top-3 shadow-sm ${badge.cls}`}>
          <T en={badge.en} bn={badge.bn} />
        </span>
        {save > 0 && !soldOut && (
          <span className="chip absolute right-3 top-3 bg-accent-500 text-white shadow-sm">
            <T en={`Save ${save}%`} bn={`${bnDigits(save)}% ছাড়`} />
          </span>
        )}
        {popular && (
          <span className="chip absolute bottom-3 left-3 bg-white/90 text-ink shadow-sm backdrop-blur-sm">
            <Star size={12} strokeWidth={2.5} className="fill-accent-500 text-accent-500" aria-hidden="true" />
            <T en="Popular" bn="জনপ্রিয়" />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        {showCategory && (
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft/80">
            <T en={cat.en} bn={cat.bn} />
          </p>
        )}
        <h3
          className={`text-lg font-bold leading-snug transition-colors group-hover:text-brand-700 ${
            soldOut ? 'text-ink-soft' : 'text-ink'
          }`}
        >
          <T en={product.name} bn={product.nameBn} />
        </h3>
        <p className="mt-1 flex-1 text-sm leading-relaxed text-ink-soft">
          <T en={product.tagline} bn={product.taglineBn} />
        </p>

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-black/5 pt-4">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={`text-xl font-extrabold tabular-nums tracking-tight ${
                soldOut ? 'text-ink-soft' : 'text-ink'
              }`}
            >
              {formatBDT(product.price)}
            </span>
            {save > 0 && (
              <span className="text-sm tabular-nums text-ink-soft/60 line-through">
                {formatBDT(product.compareAtPrice!)}
              </span>
            )}
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700"
            aria-hidden="true"
          >
            {soldOut ? <T en="Details" bn="বিস্তারিত" /> : <T en="View" bn="দেখো" />}
            <ArrowRight
              size={15}
              className="transition-transform duration-200 motion-safe:group-hover:translate-x-0.5"
            />
          </span>
        </div>
      </div>
    </a>
  );
}
