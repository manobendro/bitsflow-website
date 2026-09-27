/**
 * Product artwork. Shows `product.image` when set (a real photo added in the
 * admin); otherwise a hue-tinted gradient with a dark tile — the board keeps its
 * signature 5×5 RGB grid, everything else shows its category icon.
 * Fills its parent: give the parent an aspect ratio (e.g. `aspect-[4/3]`).
 *
 * Optional extras (additive — `{ product, big? }` stays the stable contract):
 *   - `variant` 0–3: alternate placeholder "shots" for the detail-page gallery
 *     (0 = hero, 1 = angled, 2 = close-up, 3 = flat-lay). Deterministic, so the
 *     server and client render identical markup.
 *   - `thumb`: tiny sizing for gallery thumbnails.
 *   - `eager`: load a real photo eagerly (above-the-fold main image).
 */
import { useState, type CSSProperties } from 'react';
import {
  Cpu,
  PackageOpen,
  Bot,
  Radar,
  BatteryCharging,
  Cable,
  GraduationCap,
  Briefcase,
  type LucideIcon,
} from 'lucide-react';
import type { CatalogProduct, ProductIcon } from '../../lib/catalog';

const ICONS: Record<ProductIcon, LucideIcon> = {
  board: Cpu,
  starter: PackageOpen,
  robotics: Bot,
  sensor: Radar,
  battery: BatteryCharging,
  cable: Cable,
  classroom: GraduationCap,
  case: Briefcase,
};

/** Number of placeholder gallery variants ProductArt can draw. */
export const ART_VARIANTS = 4;

type ArtProduct = Pick<CatalogProduct, 'icon' | 'hue' | 'name'> & { image?: string };

type Size = 'thumb' | 'card' | 'big';

function background(H: number, variant: number): CSSProperties {
  switch (variant) {
    case 1: {
      const h = (H + 28) % 360;
      return {
        background: `radial-gradient(120% 90% at 80% 10%, hsl(${h} 60% 88%), transparent 60%), linear-gradient(215deg, hsl(${h} 45% 84%), hsl(${H} 55% 52%))`,
      };
    }
    case 2:
      return {
        background: `radial-gradient(90% 90% at 50% 45%, hsl(${H} 55% 62%), hsl(${H} 50% 34%))`,
      };
    case 3:
      return {
        backgroundColor: `hsl(${H} 30% 94%)`,
        backgroundImage: `radial-gradient(hsl(${H} 30% 70% / 0.55) 1px, transparent 1.5px)`,
        backgroundSize: '14px 14px',
      };
    default:
      return {
        background: `linear-gradient(135deg, hsl(${H} 48% 90%), hsl(${H} 58% 58%))`,
      };
  }
}

/** Transform for the dark tile per variant (angle / zoom / flat-lay). */
function tileTransform(variant: number): string | undefined {
  switch (variant) {
    case 1:
      return 'rotate(-12deg) translateY(-2%)';
    case 2:
      return 'scale(1.65)';
    case 3:
      return 'rotate(6deg) scale(0.82)';
    default:
      return undefined;
  }
}

export default function ProductArt({
  product,
  big = false,
  thumb = false,
  variant = 0,
  eager = false,
}: {
  product: ArtProduct;
  big?: boolean;
  thumb?: boolean;
  variant?: number;
  eager?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  if (product.image && !imgFailed) {
    return (
      <img
        src={product.image}
        alt={product.name}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setImgFailed(true)}
        className="h-full w-full object-cover"
      />
    );
  }

  const size: Size = thumb ? 'thumb' : big ? 'big' : 'card';
  const v = ((Math.floor(variant) % ART_VARIANTS) + ART_VARIANTS) % ART_VARIANTS;
  const H = product.hue;
  const Icon = ICONS[product.icon] ?? Cpu;
  const tileStyle: CSSProperties = {
    transform: tileTransform(v),
    boxShadow:
      v === 3
        ? `0 10px 18px -8px hsl(${H} 40% 25% / 0.45)`
        : '0 25px 50px -12px rgb(0 0 0 / 0.35)',
  };

  const grid = {
    thumb: { wrap: 'gap-[2px] p-1.5', cell: 'h-1.5 w-1.5' },
    card: { wrap: 'gap-1 p-4', cell: 'h-3 w-3' },
    big: { wrap: 'gap-2 p-6', cell: 'h-6 w-6' },
  }[size];

  const tile = {
    thumb: { box: 'h-9 w-9', icon: 20 },
    card: { box: 'h-16 w-16', icon: 36 },
    big: { box: 'h-28 w-28', icon: 64 },
  }[size];

  return (
    <div
      className="relative grid h-full w-full place-items-center overflow-hidden"
      style={background(H, v)}
      aria-hidden="true"
    >
      {/* Soft floor shadow for the angled shot. */}
      {v === 1 && size !== 'thumb' && (
        <span
          className="absolute bottom-[14%] left-1/2 h-[6%] w-[46%] -translate-x-1/2 rounded-[50%] bg-black/20 blur-md"
          aria-hidden="true"
        />
      )}
      {product.icon === 'board' ? (
        <div
          className={`relative grid grid-cols-5 rounded-lg bg-ink/80 ${grid.wrap}`}
          style={tileStyle}
        >
          {Array.from({ length: 25 }).map((_, i) => {
            const c = `hsl(${(i * 14) % 360} 90% 60%)`;
            return (
              <span
                key={i}
                className={`rounded-sm ${grid.cell}`}
                style={{ background: c, boxShadow: size === 'thumb' ? undefined : `0 0 6px ${c}` }}
              />
            );
          })}
        </div>
      ) : (
        <span
          className={`relative grid place-items-center rounded-xl bg-ink/80 text-white ${tile.box}`}
          style={tileStyle}
        >
          <Icon size={tile.icon} strokeWidth={1.5} />
        </span>
      )}
    </div>
  );
}
