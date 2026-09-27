/**
 * Admin section tabs (Orders | Products). Stateless — render it from Astro with
 * no client directive and it ships as plain static HTML.
 */
import { Boxes, ClipboardList, type LucideIcon } from 'lucide-react';

type Section = 'orders' | 'products';

const TABS: { key: Section; label: string; href: string; Icon: LucideIcon }[] = [
  { key: 'orders', label: 'Orders', href: '/admin', Icon: ClipboardList },
  { key: 'products', label: 'Products', href: '/admin/products', Icon: Boxes },
];

export default function AdminNav({ active }: { active: Section }) {
  return (
    <nav aria-label="Admin sections" data-testid="admin-nav" className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-bold uppercase tracking-wider text-ink-soft/70">Admin</span>
      <ul className="inline-flex rounded-lg border border-black/5 bg-white p-1 shadow-[0_1px_2px_rgb(20_39_31_/_0.04)]">
        {TABS.map(({ key, label, href, Icon }) => {
          const current = key === active;
          return (
            <li key={key}>
              <a
                href={href}
                aria-current={current ? 'page' : undefined}
                data-testid={`admin-nav-${key}`}
                className={`inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors lg:min-h-9 ${
                  current
                    ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/20'
                    : 'text-ink-soft hover:bg-sand hover:text-ink'
                }`}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
