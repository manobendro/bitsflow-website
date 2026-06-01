import { useEffect, useMemo, useState } from 'react';
import {
  Lock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react';
import { useAuth } from './useAuth';
import { adminListOrders, adminUpdateOrder } from '../../lib/api';
import { formatBDT, formatDate } from '../../lib/format';
import { ORDER_STATUSES, type Order, type OrderStatus } from '../../lib/types';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  processing: 'bg-blue-100 text-blue-700',
  shipped: 'bg-indigo-100 text-indigo-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-200 text-slate-600',
  refunded: 'bg-slate-200 text-slate-600',
};

const TYPE_LABEL: Record<string, string> = {
  reserve: 'Reservation',
  preorder: 'Pre-order',
  order: 'Order',
};

type Filter = 'all' | OrderStatus;

export default function AdminOrders() {
  const { user, loading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      window.location.assign('/login?next=/admin');
    }
  }, [loading, user]);

  async function load() {
    if (!user) return;
    setDataLoading(true);
    setError(null);
    try {
      const { orders } = await adminListOrders();
      setOrders(orders);
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

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [orders]);

  const visible = useMemo(
    () => (filter === 'all' ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter]
  );

  function applyLocal(id: string, patch: Partial<Order>) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  if (loading || (dataLoading && authorized === null)) {
    return <CenteredSpinner label="Loading admin…" />;
  }

  if (authorized === false) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-black/5 bg-white p-8 text-center shadow-[0_2px_4px_rgb(20_39_31_/_0.05),0_18px_40px_-16px_rgb(20_39_31_/_0.18)]">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-md bg-brand-50 text-brand-600">
          <Lock size={26} />
        </div>
        <h1 className="mt-4 text-xl font-bold">Admins only</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Your account ({user?.email}) doesn't have admin access. If this is a
          mistake, make sure the admin claim is set, then sign out and back in.
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Orders admin</h1>
          <p className="mt-1 text-ink-soft">
            {orders.length} order{orders.length === 1 ? '' : 's'} total
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-md border border-brand-200 bg-white px-4 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </header>

      {error && (
        <p className="rounded-lg bg-accent-500/10 px-4 py-3 text-sm text-accent-500">
          {error}
        </p>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(['all', ...ORDER_STATUSES] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1 text-sm font-medium capitalize transition ${
              filter === f
                ? 'bg-brand-600 text-white'
                : 'bg-sand text-ink-soft hover:bg-brand-50'
            }`}
          >
            {f} {counts[f] ? `(${counts[f]})` : ''}
          </button>
        ))}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/10 bg-sand p-8 text-center text-ink-soft">
          No orders in this view.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((o) => (
            <AdminOrderCard
              key={o.id}
              order={o}
              expanded={expanded === o.id}
              onToggle={() => setExpanded(expanded === o.id ? null : o.id)}
              onApplyLocal={(patch) => applyLocal(o.id, patch)}
              onError={setError}
            />
          ))}
        </div>
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
  order: Order;
  expanded: boolean;
  onToggle: () => void;
  onApplyLocal: (patch: Partial<Order>) => void;
  onError: (msg: string) => void;
}) {
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [notes, setNotes] = useState(order.adminNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = status !== order.status || notes !== (order.adminNotes ?? '');

  async function save() {
    setSaving(true);
    setSaved(false);
    onError('');
    try {
      const patch: { status?: OrderStatus; adminNotes?: string } = {};
      if (status !== order.status) patch.status = status;
      if (notes !== (order.adminNotes ?? '')) patch.adminNotes = notes;
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

  return (
    <div className="rounded-lg border border-black/5 bg-white shadow-[0_1px_2px_rgb(20_39_31_/_0.04)] transition hover:shadow-[0_8px_24px_-12px_rgb(20_39_31_/_0.12)]">
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="rounded bg-sand px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink-soft">
            {TYPE_LABEL[order.type] ?? order.type}
          </span>
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[order.status] ?? 'bg-slate-100'}`}
          >
            {order.status}
          </span>
          <span className="font-semibold">{order.customer?.name || '—'}</span>
          <span className="hidden text-sm text-ink-soft sm:inline">
            {order.items?.map((it) => `${it.name} ×${it.quantity}`).join(', ')}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-ink-soft">
          <span>{formatBDT(order.total)}</span>
          <span>{order.createdAt ? formatDate(order.createdAt) : '—'}</span>
          <span className="text-slate-400">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </div>
      </button>

      {/* Details */}
      {expanded && (
        <div className="space-y-5 border-t border-black/5 bg-paper p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-ink-soft/60">
                Customer
              </h4>
              <dl className="mt-2 space-y-1 text-sm">
                <Row k="Name" v={order.customer?.name} />
                <Row k="Phone" v={order.customer?.phone} />
                <Row k="Occupation" v={order.customer?.occupation} />
                <Row k="School" v={order.customer?.school} />
                <Row k="Email" v={(order as Order & { customerEmail?: string }).customerEmail} />
              </dl>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-ink-soft/60">
                Shipping
              </h4>
              <dl className="mt-2 space-y-1 text-sm">
                <Row k="Address" v={order.shipping?.line1} />
                <Row k="" v={order.shipping?.line2} />
                <Row k="City" v={order.shipping?.city} />
                <Row k="District" v={order.shipping?.district} />
                <Row k="Postcode" v={order.shipping?.postcode} />
              </dl>
            </div>
          </div>

          {order.note && (
            <p className="rounded-lg border border-black/5 bg-white px-3 py-2 text-sm">
              <strong>Customer note:</strong> {order.note}
            </p>
          )}

          {/* Editing controls */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as OrderStatus)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm capitalize outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              >
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">
                Extra info / internal notes
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Shown to the customer on their dashboard"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="rounded-md bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                <Check size={15} /> Saved
              </span>
            )}
          </div>

          {/* History */}
          {order.history?.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-ink-soft">
                History ({order.history.length})
              </summary>
              <ul className="mt-2 space-y-1 border-l-2 border-brand-100 pl-3">
                {order.history.map((h, i) => (
                  <li key={i} className="text-xs text-ink-soft">
                    <span className="text-slate-400">
                      {h.at ? formatDate(h.at) : ''}
                    </span>{' '}
                    — {h.action}
                    {h.status ? ` → ${h.status}` : ''}
                    {h.byEmail ? ` by ${h.byEmail}` : ''}
                    {h.note ? ` (${h.note})` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string | number }) {
  if (!v) return null;
  return (
    <div className="flex gap-2">
      {k && <dt className="min-w-20 text-slate-400">{k}</dt>}
      <dd className="text-ink">{v}</dd>
    </div>
  );
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="grid place-items-center py-24 text-ink-soft">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      <p className="mt-3 text-sm">{label}</p>
    </div>
  );
}
