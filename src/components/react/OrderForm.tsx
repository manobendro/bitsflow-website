import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, Eraser, History, MapPin, MessageSquareText, UserRound, X } from 'lucide-react';
import { createOrder, type CreateOrderResult } from '../../lib/api';
import { loadSavedCheckout } from '../../lib/savedCheckout';
import { track } from '../../lib/analytics';
import { formatBDT } from '../../lib/format';
import { t, type Lang } from '../../lib/i18n';
import type { CatalogProduct } from '../../lib/catalog';
import type { OrderType, Product } from '../../lib/types';
import { useAuth } from './useAuth';
import { useLang } from './useLang';
import T from './T';
import Spinner from './flows/Spinner';
import { normalizeBDPhone } from './flows/phone';

// Occupation values are stored in English; labels are localized for display.
const OCCUPATIONS: { value: string; bn: string }[] = [
  { value: 'Student', bn: 'শিক্ষার্থী' },
  { value: 'Teacher / Educator', bn: 'শিক্ষক / শিক্ষাবিদ' },
  { value: 'Engineer / Developer', bn: 'ইঞ্জিনিয়ার / ডেভেলপার' },
  { value: 'Hobbyist / Maker', bn: 'শখের কারিগর / মেকার' },
  { value: 'Parent', bn: 'অভিভাবক' },
  { value: 'Other', bn: 'অন্যান্য' },
];

interface Props {
  product: Product;
  quantity: number;
  /** 'reserve' = no payment now; 'preorder'/'order' = goes to payment step. */
  type: OrderType;
  onClose: () => void;
  onSuccess: (res: CreateOrderResult) => void;
}

interface FormValues {
  name: string;
  phone: string;
  occupation: string;
  occupationOther: string;
  school: string;
  line1: string;
  line2: string;
  city: string;
  district: string;
  postcode: string;
  note: string;
}

const EMPTY_FORM: FormValues = {
  name: '',
  phone: '',
  occupation: 'Student',
  occupationOther: '',
  school: '',
  line1: '',
  line2: '',
  city: '',
  district: '',
  postcode: '',
  note: '',
};

const SHIPPING_KEYS = ['line1', 'line2', 'city', 'district', 'postcode'] as const;

type ErrorCode = 'required' | 'phone';
/** Fields that can fail validation, in on-screen order (for focusing the first). */
const VALIDATED = ['name', 'phone', 'occupationOther', 'line1', 'city', 'district'] as const;
type ValidatedKey = (typeof VALIDATED)[number];
type Errors = Partial<Record<ValidatedKey, ErrorCode>>;

function validate(v: FormValues): Errors {
  const e: Errors = {};
  if (!v.name.trim()) e.name = 'required';
  if (!v.phone.trim()) e.phone = 'required';
  else if (!normalizeBDPhone(v.phone)) e.phone = 'phone';
  if (v.occupation === 'Other' && !v.occupationOther.trim()) e.occupationOther = 'required';
  if (!v.line1.trim()) e.line1 = 'required';
  if (!v.city.trim()) e.city = 'required';
  if (!v.district.trim()) e.district = 'required';
  return e;
}

function errorText(key: ValidatedKey, code: ErrorCode, lang: Lang): string {
  if (code === 'phone') {
    return t(
      'Please enter an 11-digit mobile number like 01712345678 (+880 is fine too).',
      '১১ সংখ্যার মোবাইল নম্বর দাও, যেমন 01712345678 (+880 দিয়েও লিখতে পারো)।',
      lang
    );
  }
  const what: Record<ValidatedKey, [string, string]> = {
    name: ['your name', 'তোমার নাম'],
    phone: ['a phone number', 'ফোন নম্বর'],
    occupationOther: ['your occupation', 'তোমার পেশা'],
    line1: ['your address', 'তোমার ঠিকানা'],
    city: ['your city or town', 'শহর বা থানা'],
    district: ['your district', 'জেলা'],
  };
  const [en, bn] = what[key];
  return t(`Please add ${en}.`, `${bn} লিখে দাও।`, lang);
}

const TITLES: Record<OrderType, (en: string, bn: string) => { en: string; bn: string }> = {
  reserve: (en, bn) => ({ en: `Reserve your ${en}`, bn: `তোমার ${bn} রিজার্ভ করো` }),
  preorder: (en, bn) => ({ en: `Pre-order your ${en}`, bn: `তোমার ${bn} প্রি-অর্ডার করো` }),
  order: (en, bn) => ({ en: `Order your ${en}`, bn: `তোমার ${bn} অর্ডার করো` }),
};

const SUBMIT_LABEL: Record<OrderType, { en: string; bn: string }> = {
  reserve: { en: 'Confirm reservation', bn: 'রিজার্ভেশন কনফার্ম করো' },
  preorder: { en: 'Place pre-order', bn: 'প্রি-অর্ডার করো' },
  order: { en: 'Place order', bn: 'অর্ডার করো' },
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Order dialog. Mobile: full-screen sheet. Desktop: centred dialog with a
 * sticky header + footer and a scrollable body. Traps focus, closes on Esc,
 * locks page scroll, validates inline, and returns focus to the trigger.
 */
export default function OrderForm({ product, quantity, type, onClose, onSuccess }: Props) {
  const lang = useLang();
  const { user } = useAuth();
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const panelRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<ValidatedKey, boolean>>>({});
  const [v, setV] = useState<FormValues>(EMPTY_FORM);
  /** Values we filled in automatically — the baseline for "has the user typed?". */
  const autoFilled = useRef<FormValues>(EMPTY_FORM);
  /** True once the saved address from the customer's last order was applied. */
  const [usedSaved, setUsedSaved] = useState(false);

  // Prefill the name once auth resolves (only if the field is still empty).
  useEffect(() => {
    const dn = user?.displayName?.trim();
    if (!dn) return;
    setV((prev) => {
      if (prev.name) return prev;
      const next = { ...prev, name: dn };
      autoFilled.current = { ...autoFilled.current, name: dn };
      return next;
    });
  }, [user]);

  // Prefill contact + shipping details from the customer's last order (saved on
  // their profile by the server). Only fills fields that are still empty or
  // still hold an automatic value, so it never overwrites anything the customer
  // typed while it was loading.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    loadSavedCheckout(user.uid).then((saved) => {
      if (!alive || !saved) return;
      setV((prev) => {
        const auto = autoFilled.current;
        const untouched = (k: keyof FormValues) =>
          !prev[k].trim() || prev[k] === auto[k];
        const next = { ...prev };
        const nextAuto = { ...auto }; // only the fields WE fill join the baseline
        const put = (k: keyof FormValues, value: string) => {
          if (value && untouched(k)) next[k] = nextAuto[k] = value;
        };
        put('name', saved.customer.name);
        put('phone', saved.customer.phone);
        put('school', saved.customer.school);
        const occ = saved.customer.occupation;
        if (occ && prev.occupation === auto.occupation && prev.occupationOther === auto.occupationOther) {
          const known = OCCUPATIONS.some((o) => o.value === occ && o.value !== 'Other');
          next.occupation = nextAuto.occupation = known ? occ : 'Other';
          next.occupationOther = nextAuto.occupationOther = known ? '' : occ;
        }
        for (const k of SHIPPING_KEYS) put(k, saved.shipping[k]);
        autoFilled.current = nextAuto;
        return next;
      });
      setUsedSaved(true);
      track('address_prefilled', { order_type: type });
    });
    return () => {
      alive = false;
    };
  }, [user]);

  /** "Use a different address": clear the pre-filled shipping fields. */
  function clearShipping() {
    track('use_different_address', { order_type: type });
    setV((prev) => {
      const next = { ...prev };
      for (const k of SHIPPING_KEYS) next[k] = '';
      autoFilled.current = { ...autoFilled.current, ...Object.fromEntries(SHIPPING_KEYS.map((k) => [k, ''])) };
      return next;
    });
    setUsedSaved(false);
    requestAnimationFrame(() => document.getElementById(`${uid}-line1`)?.focus());
  }

  const errors = useMemo(() => validate(v), [v]);
  const visibleError = (k: ValidatedKey): ErrorCode | undefined =>
    submitted || touched[k] ? errors[k] : undefined;
  // Show the "from your last order" note only while a pre-filled address value
  // is still in place (it disappears if the customer replaces it all).
  const showSavedNote =
    usedSaved && SHIPPING_KEYS.some((k) => autoFilled.current[k] && v[k] === autoFilled.current[k]);
  // Pristine = nothing changed beyond what we filled in automatically.
  const pristine = (Object.keys(v) as (keyof FormValues)[]).every(
    (k) => v[k] === autoFilled.current[k]
  );

  const isReserve = type === 'reserve';
  const total = product.price * quantity;
  const nameBn = (product as Partial<CatalogProduct>).nameBn || product.name;
  const title = TITLES[type](product.name, nameBn);
  const submitLabel = SUBMIT_LABEL[type];

  // Keep the latest close handler + busy flag reachable from the mount effect.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  /** Set once the order is created, so closing afterwards isn't an "abandon". */
  const completedRef = useRef(false);
  const typeRef = useRef(type);
  typeRef.current = type;

  // Mount: lock scroll, focus first field, Esc to close; restore on unmount.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    firstFieldRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) {
        e.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      // Closed without placing the order (X, Esc, backdrop, navigation).
      if (!completedRef.current) track('checkout_abandon', { order_type: typeRef.current });
      window.removeEventListener('keydown', onKey);
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  // Simple focus trap: Tab / Shift+Tab cycle inside the dialog.
  function onPanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const set =
    (k: keyof FormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setV((prev) => ({ ...prev, [k]: e.target.value }));
  const blur = (k: ValidatedKey) => () => setTouched((prev) => ({ ...prev, [k]: true }));

  /** Common a11y props for a validated input. */
  function a11y(k: ValidatedKey, hint = false) {
    const err = visibleError(k);
    const described = [err ? `${uid}-${k}-error` : null, hint ? `${uid}-${k}-hint` : null]
      .filter(Boolean)
      .join(' ');
    return {
      id: `${uid}-${k}`,
      'aria-invalid': err ? (true as const) : undefined,
      'aria-describedby': described || undefined,
      'aria-required': true as const,
      onBlur: blur(k),
    };
  }

  function requestClose() {
    if (!busy) onClose();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    const firstBad = VALIDATED.find((k) => errors[k]);
    if (firstBad) {
      // Which fields trip people up (field names only — never their values).
      track('checkout_form_error', {
        order_type: type,
        fields: VALIDATED.filter((k) => errors[k]).join(','),
      });
      document.getElementById(`${uid}-${firstBad}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await createOrder({
        productId: product.id,
        quantity,
        type,
        customer: {
          name: v.name.trim(),
          phone: normalizeBDPhone(v.phone) ?? v.phone.trim(),
          occupation: v.occupation === 'Other' ? v.occupationOther.trim() : v.occupation,
          school: v.school.trim() || undefined,
        },
        shipping: {
          line1: v.line1.trim(),
          line2: v.line2.trim() || undefined,
          city: v.city.trim(),
          district: v.district.trim(),
          postcode: v.postcode.trim() || undefined,
          country: 'Bangladesh',
        },
        note: v.note.trim() || undefined,
      });
      completedRef.current = true;
      onSuccess(res);
    } catch (err) {
      track('checkout_error', { order_type: type, message: (err as Error).message || 'unknown' });
      setServerError((err as Error).message || t('Something went wrong.', 'কিছু একটা সমস্যা হয়েছে।', lang));
      setBusy(false);
    }
  }

  const errorCount = VALIDATED.filter((k) => errors[k]).length;

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex justify-center bg-ink/60 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => {
        // Backdrop click closes only if nothing has been typed yet (no lost work).
        if (e.target === e.currentTarget && pristine) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onKeyDown={onPanelKeyDown}
        className="flex h-[100dvh] w-full flex-col bg-white shadow-2xl motion-safe:animate-[rise_0.28s_cubic-bezier(0.22,1,0.36,1)] sm:h-auto sm:max-h-[min(92dvh,900px)] sm:max-w-xl sm:rounded-xl"
      >
        {/* Header (sticky) */}
        <div className="flex flex-none items-start gap-3 border-b border-black/5 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-extrabold leading-snug text-ink sm:text-xl">
              <T en={title.en} bn={title.bn} />
            </h2>
            <p id={descId} className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
              <span>
                <T en={product.name} bn={nameBn} /> × {quantity} ={' '}
                <strong className="text-ink tabular-nums">{formatBDT(total)}</strong>
              </span>
              {isReserve ? (
                <span className="chip bg-brand-50 text-brand-700">
                  <T en="No payment now" bn="এখন টাকা লাগবে না" />
                </span>
              ) : type === 'preorder' ? (
                <span className="chip bg-amber-100 text-amber-800">
                  <T en="Pay later" bn="পরে টাকা দেবে" />
                </span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            aria-label={t('Close', 'বন্ধ করো', lang)}
            className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-md text-ink-soft transition-colors hover:bg-sand hover:text-ink disabled:opacity-50"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          {/* Body (scrolls) */}
          <div className="min-h-0 flex-1 space-y-7 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            {/* Personal information */}
            <fieldset className="space-y-4">
              <Legend icon={<UserRound size={15} aria-hidden="true" />}>
                <T en="Your details" bn="তোমার তথ্য" />
              </Legend>
              <Field
                htmlFor={`${uid}-name`}
                label={<T en="Full name" bn="পুরো নাম" />}
                required
                error={visibleError('name') && errorText('name', visibleError('name')!, lang)}
                errorId={`${uid}-name-error`}
              >
                <input
                  ref={firstFieldRef}
                  {...a11y('name')}
                  className="input"
                  value={v.name}
                  onChange={set('name')}
                  autoComplete="name"
                  maxLength={100}
                  placeholder={t('Your full name', 'তোমার পুরো নাম', lang)}
                />
              </Field>
              <Field
                htmlFor={`${uid}-phone`}
                label={<T en="Phone number" bn="ফোন নম্বর" />}
                required
                hint={
                  <T
                    en="We'll call or text this number about your order."
                    bn="অর্ডারের ব্যাপারে এই নম্বরে ফোন বা মেসেজ করব।"
                  />
                }
                hintId={`${uid}-phone-hint`}
                error={visibleError('phone') && errorText('phone', visibleError('phone')!, lang)}
                errorId={`${uid}-phone-error`}
              >
                <input
                  {...a11y('phone', true)}
                  className="input tabular-nums"
                  type="tel"
                  value={v.phone}
                  onChange={set('phone')}
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={20}
                  placeholder="01XXXXXXXXX"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  htmlFor={`${uid}-occupation`}
                  label={<T en="Occupation" bn="পেশা" />}
                  required
                >
                  <select
                    id={`${uid}-occupation`}
                    className="input"
                    value={v.occupation}
                    onChange={set('occupation')}
                  >
                    {OCCUPATIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {t(o.value, o.bn, lang)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  htmlFor={`${uid}-school`}
                  label={<T en="School / institution" bn="স্কুল / প্রতিষ্ঠান" />}
                >
                  <input
                    id={`${uid}-school`}
                    className="input"
                    value={v.school}
                    onChange={set('school')}
                    autoComplete="organization"
                    maxLength={120}
                    placeholder={t('Optional', 'ঐচ্ছিক', lang)}
                  />
                </Field>
              </div>
              {v.occupation === 'Other' && (
                <Field
                  htmlFor={`${uid}-occupationOther`}
                  label={<T en="Please specify" bn="লিখে দাও" />}
                  required
                  error={
                    visibleError('occupationOther') &&
                    errorText('occupationOther', visibleError('occupationOther')!, lang)
                  }
                  errorId={`${uid}-occupationOther-error`}
                >
                  <input
                    {...a11y('occupationOther')}
                    className="input"
                    value={v.occupationOther}
                    onChange={set('occupationOther')}
                    maxLength={80}
                    placeholder={t('Your occupation', 'তোমার পেশা', lang)}
                  />
                </Field>
              )}
            </fieldset>

            {/* Shipping */}
            <fieldset className="space-y-4">
              <Legend icon={<MapPin size={15} aria-hidden="true" />}>
                <T en="Shipping address" bn="ডেলিভারির ঠিকানা" />
              </Legend>
              {showSavedNote ? (
                <div
                  role="status"
                  data-testid="saved-address-note"
                  className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-3 text-sm text-brand-800"
                >
                  <History size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {/* basis-[14rem]: on narrow screens the button wraps below the text
                      instead of squeezing it into a thin column. */}
                  <p className="min-w-0 flex-1 basis-[14rem] leading-relaxed">
                    <T
                      en="We filled in the address from your last order. Check it, or change anything you like."
                      bn="তোমার আগের অর্ডারের ঠিকানাটা বসিয়ে দিয়েছি। একবার দেখে নাও, চাইলে যা খুশি বদলাও।"
                    />
                  </p>
                  <button
                    type="button"
                    onClick={clearShipping}
                    data-testid="use-different-address"
                    className="btn btn-sm btn-ghost -my-1 min-h-9 text-brand-700 hover:bg-brand-100 hover:text-brand-800 max-sm:ml-4"
                  >
                    <Eraser size={15} aria-hidden="true" />
                    <T en="Use a different address" bn="অন্য ঠিকানা দেবো" />
                  </button>
                </div>
              ) : (
                <p className="-mt-1 text-xs text-ink-soft">
                  <T
                    en="We'll remember this address to make your next order quicker."
                    bn="পরের অর্ডার আরও সহজ করতে ঠিকানাটা মনে রাখব।"
                  />
                </p>
              )}
              <Field
                htmlFor={`${uid}-line1`}
                label={<T en="Address line 1" bn="ঠিকানা লাইন ১" />}
                required
                error={visibleError('line1') && errorText('line1', visibleError('line1')!, lang)}
                errorId={`${uid}-line1-error`}
              >
                <input
                  {...a11y('line1')}
                  className="input"
                  value={v.line1}
                  onChange={set('line1')}
                  autoComplete="address-line1"
                  maxLength={200}
                  placeholder={t('House / road / area', 'বাসা / রোড / এলাকা', lang)}
                />
              </Field>
              <Field htmlFor={`${uid}-line2`} label={<T en="Address line 2" bn="ঠিকানা লাইন ২" />}>
                <input
                  id={`${uid}-line2`}
                  className="input"
                  value={v.line2}
                  onChange={set('line2')}
                  autoComplete="address-line2"
                  maxLength={200}
                  placeholder={t('Optional', 'ঐচ্ছিক', lang)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  htmlFor={`${uid}-city`}
                  label={<T en="City / town" bn="শহর / থানা" />}
                  required
                  error={visibleError('city') && errorText('city', visibleError('city')!, lang)}
                  errorId={`${uid}-city-error`}
                >
                  <input
                    {...a11y('city')}
                    className="input"
                    value={v.city}
                    onChange={set('city')}
                    autoComplete="address-level2"
                    maxLength={80}
                    placeholder={t('City', 'শহর', lang)}
                  />
                </Field>
                <Field
                  htmlFor={`${uid}-district`}
                  label={<T en="District" bn="জেলা" />}
                  required
                  hint={<T en="e.g. Dhaka, Chattogram, Sylhet" bn="যেমন: ঢাকা, চট্টগ্রাম, সিলেট" />}
                  hintId={`${uid}-district-hint`}
                  error={
                    visibleError('district') && errorText('district', visibleError('district')!, lang)
                  }
                  errorId={`${uid}-district-error`}
                >
                  <input
                    {...a11y('district', true)}
                    className="input"
                    value={v.district}
                    onChange={set('district')}
                    autoComplete="address-level1"
                    maxLength={80}
                    placeholder={t('District', 'জেলা', lang)}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field htmlFor={`${uid}-postcode`} label={<T en="Postcode" bn="পোস্টকোড" />}>
                  <input
                    id={`${uid}-postcode`}
                    className="input tabular-nums"
                    value={v.postcode}
                    onChange={set('postcode')}
                    inputMode="numeric"
                    autoComplete="postal-code"
                    maxLength={10}
                    placeholder={t('Optional', 'ঐচ্ছিক', lang)}
                  />
                </Field>
                <Field htmlFor={`${uid}-country`} label={<T en="Country" bn="দেশ" />}>
                  <input
                    id={`${uid}-country`}
                    className="input"
                    value={t('Bangladesh', 'বাংলাদেশ', lang)}
                    autoComplete="country-name"
                    disabled
                  />
                </Field>
              </div>
            </fieldset>

            {/* Note */}
            <fieldset className="space-y-4">
              <Legend icon={<MessageSquareText size={15} aria-hidden="true" />}>
                <T en="Anything else?" bn="আর কিছু?" />
              </Legend>
              <Field
                htmlFor={`${uid}-note`}
                label={<T en="Note for us (optional)" bn="আমাদের জন্য নোট (ঐচ্ছিক)" />}
              >
                <textarea
                  id={`${uid}-note`}
                  className="input resize-y"
                  value={v.note}
                  onChange={set('note')}
                  rows={2}
                  maxLength={500}
                  placeholder={t('Anything we should know?', 'আমাদের কিছু জানানোর আছে?', lang)}
                />
              </Field>
            </fieldset>
          </div>

          {/* Footer (sticky) */}
          <div className="flex-none border-t border-black/5 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:rounded-b-xl sm:px-6 sm:pb-5">
            <div aria-live="polite" role="status">
              {serverError ? (
                <p className="mb-3 flex items-start gap-2 rounded-md bg-accent-500/10 px-3 py-2 text-sm text-accent-600">
                  <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{serverError}</span>
                </p>
              ) : submitted && errorCount > 0 ? (
                <p className="mb-3 flex items-start gap-2 rounded-md bg-accent-500/10 px-3 py-2 text-sm text-accent-600">
                  <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    {errorCount === 1
                      ? t('Please fix the highlighted field.', 'লাল দাগ দেওয়া ঘরটা ঠিক করে দাও।', lang)
                      : t(
                          `Please fix the ${errorCount} highlighted fields.`,
                          `লাল দাগ দেওয়া ${errorCount}টা ঘর ঠিক করে দাও।`,
                          lang
                        )}
                  </span>
                </p>
              ) : null}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={requestClose}
                disabled={busy}
                className="btn btn-ghost min-h-11"
              >
                {t('Cancel', 'বাতিল', lang)}
              </button>
              <button type="submit" disabled={busy} className="btn btn-lg btn-primary w-full sm:w-auto">
                {busy ? (
                  <>
                    <Spinner size={18} />
                    <T en="Submitting…" bn="পাঠানো হচ্ছে…" />
                  </>
                ) : (
                  <T en={submitLabel.en} bn={submitLabel.bn} />
                )}
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-ink-soft sm:text-right">
              {isReserve ? (
                <T
                  en="You can cancel anytime before we confirm your reservation."
                  bn="রিজার্ভেশন কনফার্ম করার আগে যেকোনো সময় বাতিল করতে পারবে।"
                />
              ) : (
                <T
                  en="You can cancel anytime before we confirm your order."
                  bn="অর্ডার কনফার্ম করার আগে যেকোনো সময় বাতিল করতে পারবে।"
                />
              )}
            </p>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
}

function Legend({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <legend className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-700">
      <span className="icon-tile h-6 w-6">{icon}</span>
      {children}
    </legend>
  );
}

function Field({
  htmlFor,
  label,
  required,
  hint,
  hintId,
  error,
  errorId,
  children,
}: {
  htmlFor: string;
  label: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  hintId?: string;
  error?: string | false;
  errorId?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">
        {label}
        {required && (
          <span className="text-accent-500" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={errorId} className="mt-1.5 flex items-start gap-1.5 text-sm text-accent-600">
          <CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-ink-soft">
          {hint}
        </p>
      )}
    </div>
  );
}
