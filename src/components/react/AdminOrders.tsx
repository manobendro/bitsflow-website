import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  History,
  Lock,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Receipt,
  RefreshCw,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { useAuth } from './useAuth';
import Spinner from './flows/Spinner';
import { STATUS_CHIP, STATUS_DOT, TYPE_LABEL, toMs } from './flows/orderStatus';
import { adminListOrders, adminUpdateOrder } from '../../lib/api';
import { formatBDT, formatDate, formatDateTime } from '../../lib/format';
import { ORDER_STATUSES, type Order, type OrderStatus } from '../../lib/types';

type AdminOrder = Order & { customerEmail?: string };
type Filter = 'all' | OrderStatus;
type Sort = 'newest' | 'oldest' | 'total';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'total', label: 'Total: high → low' },
];

/** Admin orders list (English-only staff tool). AdminNav is rendered above by the page. */
export default function AdminOrders() {
  const { user, loading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [expanded, setExpanded] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (user) {
      wasSignedIn.current = true;
      return;
    }
    window.location.assign(wasSignedIn.current ? '/' : '/login?next=/admin');
  }, [loading, user]);

  async function load() {
    if (!user) return;
    setDataLoading(true);
    setError(null);
    try {
      const { orders } = await adminListOrders();
      setOrders(orders as AdminOrder[]);
      setAuthorized(true);
    } catch (err) {
      const msg = (err as Error).message;
      if (/admin only/i.test(msg)) {
        setAuthorized(false);
      } else {
        setError(msg);
      }
    } finally {
      setDataLoading(false);
    }
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // "/" focuses search (unless already typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [orders]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    let list = filter === 'all' ? orders : orders.filter((o) => o.status === filter);
    if (q) {
      list = list.filter((o) => {
        const hay = [
          o.id,
          o.customer?.name,
          o.customer?.phone,
          o.customerEmail,
          o.customer?.school,
          o.shipping?.city,
          o.shipping?.district,
          ...(o.items ?? []).map((it) => `${it.name} ${it.productId}`),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (hay.includes(q)) return true;
        // Match phone numbers regardless of spaces / dashes / +880.
        const phone = (o.customer?.phone ?? '').replace(/\D/g, '');
        return qDigits.length >= 4 && phone.includes(qDigits.replace(/^880/, '0'));
      });
    }
    const sorted = [...list];
    if (sort === 'newest') sorted.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
    else if (sort === 'oldest') sorted.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
    else sorted.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
    return sorted;
  }, [orders, filter, search, sort]);

  function applyLocal(id: string, patch: Partial<AdminOrder>) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  if (loading || (dataLoading && authorized === null)) {
    return <CenteredSpinner label="Loading admin…" />;
  }

  if (authorized === false) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-black/5 bg-white p-8 text-center shadow-[var(--shadow-lift)]">
        <div className="icon-tile mx-auto h-14 w-14">
          <Lock size={26} aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-xl font-bold">Admins only</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Your account ({user?.email}) doesn't have admin access. If this is a mistake, make sure
          the admin claim is set, then sign out and back in.
        </p>
        <a href="/" className="btn btn-primary mt-5">
          Back to site
        </a>
      </div>
    );
  }

  const filtersActive = filter !== 'all' || search.trim() !== '';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Orders admin</h1>
          <p className="mt-1 text-ink-soft">
            {orders.length} order{orders.length === 1 ? '' : 's'} total
            {counts.pending ? (
              <>
                {' · '}
                <span className="font-semibold text-amber-800">{counts.pending} pending</span>
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={dataLoading}
          className="btn btn-secondary"
        >
          <RefreshCw
            size={15}
            aria-hidden="true"
            className={dataLoading ? 'animate-spin motion-reduce:animate-none' : ''}
          />
          {dataLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg bg-accent-500/10 px-4 py-3 text-sm text-accent-600"
        >
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="-m-1 grid h-8 w-8 place-items-center rounded-md hover:bg-accent-500/10"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="space-y-3 rounded-lg border border-black/5 bg-sand/60 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Search orders</span>
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
            />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, email, order id, product…  ( / )"
              className="input pl-9"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-soft sm:w-60">
            <span className="shrink-0">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="input"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {(['all', ...ORDER_STATUSES] as Filter[]).map((f) => {
            const active = filter === f;
            const n = counts[f] ?? 0;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={active}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors ${
                  active
                    ? 'bg-brand-600 text-white'
                    : n === 0
                      ? 'bg-white text-ink-soft/60 ring-1 ring-inset ring-black/5 hover:text-ink-soft'
                      : 'bg-white text-ink-soft ring-1 ring-inset ring-black/10 hover:bg-brand-50 hover:text-brand-700'
                }`}
              >
                {f !== 'all' && (
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 rounded-sm ${active ? 'bg-white' : STATUS_DOT[f]}`}
                  />
                )}
                {f}
                <span
                  className={`rounded-sm px-1 text-xs tabular-nums ${
                    active ? 'bg-white/20' : 'bg-sand'
                  }`}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-ink-soft">
        <span aria-live="polite">
          Showing {visible.length} of {orders.length}
        </span>
        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setFilter('all');
              setSearch('');
            }}
            className="font-semibold text-brand-700 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/10 bg-sand p-8 text-center text-ink-soft">
          {orders.length === 0 ? 'No orders yet.' : 'No orders match this view.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((o) => (
            <AdminOrderCard
              key={`${o.id}:${toMs(o.updatedAt)}`}
              order={o}
              expanded={expanded === o.id}
              onToggle={() => setExpanded(expanded === o.id ? null : o.id)}
              onApplyLocal={(patch) => applyLocal(o.id, patch)}
              onError={setError}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AdminOrderCard({
  order,
  expanded,
  onToggle,
  onApplyLocal,
  onError,
}: {
  order: AdminOrder;
  expanded: boolean;
  onToggle: () => void;
  onApplyLocal: (patch: Partial<AdminOrder>) => void;
  onError: (msg: string | null) => void;
}) {
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [notes, setNotes] = useState(order.adminNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const detailId = `order-${order.id}-detail`;

  const statusDirty = status !== order.status;
  const notesDirty = notes !== (order.adminNotes ?? '');
  const dirty = statusDirty || notesDirty;
  const created = toMs(order.createdAt);
  const items = order.items ?? [];

  async function save() {
    setSaving(true);
    setSaved(false);
    onError(null);
    try {
      const patch: { status?: OrderStatus; adminNotes?: string } = {};
      if (statusDirty) patch.status = status;
      if (notesDirty) patch.adminNotes = notes;
      await adminUpdateOrder(order.id, patch);
      onApplyLocal({ status, adminNotes: notes });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setStatus(order.status);
    setNotes(order.adminNotes ?? '');
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(order.id);
    } catch {
      // Fallback for non-secure contexts.
      const ta = document.createElement('textarea');
      ta.value = order.id;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <li
      className={`rounded-lg border bg-white transition-shadow ${
        expanded
          ? 'border-brand-200 shadow-[var(--shadow-lift)]'
          : 'border-black/5 shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-lift)]'
      }`}
    >
      {/* Summary row */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailId}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 p-4 text-left sm:grid-cols-[minmax(0,1fr)_auto_auto]"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip capitalize ${STATUS_CHIP[order.status] ?? 'bg-ink/10 text-ink-soft'}`}>
              {order.status}
            </span>
            <span className="chip bg-sand uppercase tracking-wide text-ink-soft">
              {TYPE_LABEL[order.type]?.en ?? order.type}
            </span>
            <span className="truncate font-semibold text-ink">{order.customer?.name || '—'}</span>
            {order.customer?.phone && (
              <span className="hidden text-sm tabular-nums text-ink-soft md:inline">
                {order.customer.phone}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-sm text-ink-soft">
            {items.map((it) => `${it.name} ×${it.quantity}`).join(', ') || '—'}
          </p>
        </div>
        <div className="text-right">
          <p className="font-bold tabular-nums text-ink">{formatBDT(order.total ?? 0)}</p>
          <p className="text-xs text-ink-soft">{created ? formatDate(created) : '—'}</p>
        </div>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`hidden text-ink-soft transition-transform sm:block ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Details */}
      {expanded && (
        <div id={detailId} className="space-y-5 border-t border-black/5 bg-paper p-4 sm:p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Panel icon={<UserRound size={14} aria-hidden="true" />} title="Customer">
              <dl className="space-y-1.5 text-sm">
                <Row k="Name" v={order.customer?.name} />
                <Row
                  k="Phone"
                  v={
                    order.customer?.phone && (
                      <a
                        href={`tel:${order.customer.phone}`}
                        className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
                      >
                        <Phone size={13} aria-hidden="true" />
                        {order.customer.phone}
                      </a>
                    )
                  }
                />
                <Row
                  k="Email"
                  v={
                    order.customerEmail && (
                      <a
                        href={`mailto:${order.customerEmail}`}
                        className="inline-flex items-center gap-1 break-all font-medium text-brand-700 hover:underline"
                      >
                        <Mail size={13} aria-hidden="true" className="shrink-0" />
                        {order.customerEmail}
                      </a>
                    )
                  }
                />
                <Row k="Occupation" v={order.customer?.occupation} />
                <Row k="School" v={order.customer?.school} />
              </dl>
            </Panel>

            <Panel icon={<MapPin size={14} aria-hidden="true" />} title="Shipping">
              {order.shipping ? (
                <address className="text-sm not-italic leading-relaxed text-ink">
                  {order.shipping.line1}
                  {order.shipping.line2 && (
                    <>
                      <br />
                      {order.shipping.line2}
                    </>
                  )}
                  <br />
                  {[order.shipping.city, order.shipping.district].filter(Boolean).join(', ')}
                  {order.shipping.postcode ? ` ${order.shipping.postcode}` : ''}
                  <br />
                  <span className="text-ink-soft">{order.shipping.country}</span>
                </address>
              ) : (
                <p className="text-sm text-ink-soft">No shipping info.</p>
              )}
            </Panel>

            <Panel icon={<Receipt size={14} aria-hidden="true" />} title="Order">
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-sm bg-sand px-1.5 py-0.5 text-xs text-ink">
                  {order.id}
                </code>
                <button
                  type="button"
                  onClick={copyId}
                  className="btn btn-sm btn-ghost min-h-8 shrink-0 px-2 py-1 text-xs"
                  aria-label="Copy order id"
                >
                  {copied ? (
                    <Check size={14} aria-hidden="true" className="text-brand-600" />
                  ) : (
                    <Copy size={14} aria-hidden="true" />
                  )}
                  {copied ? 'Copied' : 'Copy order id'}
                </button>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {items.map((it, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {it.name} ×{it.quantity}
                    </span>
                    <span className="tabular-nums text-ink-soft">
                      {formatBDT(it.unitPrice * it.quantity)}
                    </span>
                  </li>
                ))}
                <li className="flex justify-between gap-3 border-t border-black/5 pt-1 font-bold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatBDT(order.total ?? 0)}</span>
                </li>
              </ul>
              <dl className="mt-3 space-y-1 text-xs">
                <Row k="Type" v={TYPE_LABEL[order.type]?.en ?? order.type} />
                <Row k="Placed" v={created ? formatDateTime(created) : undefined} />
                <Row k="Payment" v={order.paymentProvider} />
                <Row k="Pay ref" v={order.paymentRef} />
              </dl>
            </Panel>
          </div>

          {order.note && (
            <div className="flex items-start gap-2 rounded-md border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-ink">
              <MessageSquareText size={15} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
              <p>
                <strong>Customer note:</strong> {order.note}
              </p>
            </div>
          )}

          {/* Editing controls */}
          <div className="rounded-lg border border-black/5 bg-white p-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
              <div>
                <label htmlFor={`${order.id}-status`} className="label">
                  Status
                </label>
                <select
                  id={`${order.id}-status`}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as OrderStatus)}
                  className="input capitalize"
                >
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                      {s === order.status ? ' (current)' : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-ink-soft">
                  Customers can self-cancel only while pending.
                </p>
              </div>
              <div>
                <label htmlFor={`${order.id}-notes`} className="label">
                  Update for customer
                </label>
                <textarea
                  id={`${order.id}-notes`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g. Confirmed — we'll call you before delivery."
                  className="input resize-y"
                />
                <p className="mt-1.5 text-xs text-ink-soft">
                  Shown to the customer on their dashboard.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={!dirty || saving}
                className="btn btn-primary"
              >
                {saving && <Spinner size={15} />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              {dirty && !saving && (
                <button type="button" onClick={discard} className="btn btn-ghost">
                  Discard
                </button>
              )}
              <span aria-live="polite" className="text-sm">
                {saved ? (
                  <span className="inline-flex items-center gap-1 font-medium text-brand-700">
                    <Check size={15} aria-hidden="true" /> Saved
                  </span>
                ) : dirty ? (
                  <span className="inline-flex items-center gap-1.5 text-amber-800">
                    <span className="h-2 w-2 rounded-sm bg-amber-500" aria-hidden="true" />
                    Unsaved changes
                    {statusDirty && (
                      <span className="text-ink-soft">
                        ({order.status} → {status})
                      </span>
                    )}
                  </span>
                ) : null}
              </span>
            </div>
          </div>

          {/* History */}
          {order.history?.length > 0 && (
            <details className="group text-sm">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-semibold text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
                <History size={15} aria-hidden="true" />
                History ({order.history.length})
                <ChevronDown size={14} aria-hidden="true" className="transition-transform group-open:rotate-180" />
              </summary>
              <ol className="mt-3 space-y-2 border-l-2 border-brand-100 pl-4">
                {[...order.history].reverse().map((h, i) => (
                  <li key={i} className="relative text-xs text-ink-soft">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[21px] top-1 h-2 w-2 rounded-sm bg-brand-300"
                    />
                    <span className="font-medium text-ink">
                      {h.action.replace(/_/g, ' ')}
                      {h.status ? ` → ${h.status}` : ''}
                    </span>
                    {h.byEmail ? ` by ${h.byEmail}` : ''}
                    {h.note ? ` — “${h.note}”` : ''}
                    <span className="block text-ink-soft/70">
                      {toMs(h.at) ? formatDateTime(toMs(h.at)) : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}
    </li>
  );
}

function Panel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-black/5 bg-white p-4">
      <h4 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
        <span className="icon-tile h-6 w-6">{icon}</span>
        {title}
      </h4>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v?: React.ReactNode }) {
  if (v === undefined || v === null || v === '' || v === false) return null;
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-ink-soft/70">{k}</dt>
      <dd className="min-w-0 text-ink">{v}</dd>
    </div>
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
