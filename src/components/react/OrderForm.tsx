import { useEffect, useState } from 'react';
import { createOrder, type CreateOrderResult } from '../../lib/api';
import { formatBDT } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useLang } from './useLang';
import type { OrderType, Product } from '../../lib/types';

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

export default function OrderForm({ product, quantity, type, onClose, onSuccess }: Props) {
  const lang = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Personal
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [occupation, setOccupation] = useState('Student');
  const [occupationOther, setOccupationOther] = useState('');
  const [school, setSchool] = useState('');

  // Shipping
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [postcode, setPostcode] = useState('');

  const [note, setNote] = useState('');

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const total = product.price * quantity;
  const isReserve = type === 'reserve';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const resolvedOccupation =
        occupation === 'Other' ? occupationOther.trim() : occupation;
      const res = await createOrder({
        productId: product.id,
        quantity,
        type,
        customer: {
          name: name.trim(),
          phone: phone.trim(),
          occupation: resolvedOccupation,
          school: school.trim() || undefined,
        },
        shipping: {
          line1: line1.trim(),
          line2: line2.trim() || undefined,
          city: city.trim(),
          district: district.trim(),
          postcode: postcode.trim() || undefined,
          country: 'Bangladesh',
        },
        note: note.trim() || undefined,
      });
      onSuccess(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/60 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="my-auto w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-black/5 p-6">
          <div>
            <h2 className="text-xl font-extrabold">
              {isReserve
                ? t('Reserve your Bitsflow', 'তোমার বিটসফ্লো রিজার্ভ করো', lang)
                : t('Pre-order your Bitsflow', 'তোমার বিটসফ্লো প্রি-অর্ডার করো', lang)}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              {product.name} · {t('Qty', 'পরিমাণ', lang)} {quantity} ·{' '}
              <strong className="text-ink">{formatBDT(total)}</strong>
              {isReserve && t(' · no payment now', ' · এখন টাকা লাগবে না', lang)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-md text-2xl leading-none text-ink-soft transition-colors hover:bg-sand hover:text-ink"
          >
            ×
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-6 p-6">
          {/* Personal information */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-bold uppercase tracking-wide text-brand-700">
              {t('Your details', 'তোমার তথ্য', lang)}
            </legend>
            <Field label={t('Full name', 'পুরো নাম', lang)} required>
              <input
                className={input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder={t('Your full name', 'তোমার পুরো নাম', lang)}
              />
            </Field>
            <Field label={t('Phone number', 'ফোন নম্বর', lang)} required>
              <input
                className={input}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                inputMode="tel"
                placeholder="01XXXXXXXXX"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('Occupation', 'পেশা', lang)} required>
                <select
                  className={input}
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                >
                  {OCCUPATIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {t(o.value, o.bn, lang)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('School / institution', 'স্কুল / প্রতিষ্ঠান', lang)}>
                <input
                  className={input}
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                  placeholder={t('Optional', 'ঐচ্ছিক', lang)}
                />
              </Field>
            </div>
            {occupation === 'Other' && (
              <Field label={t('Please specify', 'লিখে দাও', lang)} required>
                <input
                  className={input}
                  value={occupationOther}
                  onChange={(e) => setOccupationOther(e.target.value)}
                  required
                  placeholder={t('Your occupation', 'তোমার পেশা', lang)}
                />
              </Field>
            )}
          </fieldset>

          {/* Shipping */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-bold uppercase tracking-wide text-brand-700">
              {t('Shipping address', 'ডেলিভারির ঠিকানা', lang)}
            </legend>
            <Field label={t('Address line 1', 'ঠিকানা লাইন ১', lang)} required>
              <input
                className={input}
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
                required
                placeholder={t('House / road / area', 'বাসা / রোড / এলাকা', lang)}
              />
            </Field>
            <Field label={t('Address line 2', 'ঠিকানা লাইন ২', lang)}>
              <input
                className={input}
                value={line2}
                onChange={(e) => setLine2(e.target.value)}
                placeholder={t('Optional', 'ঐচ্ছিক', lang)}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('City / town', 'শহর / থানা', lang)} required>
                <input
                  className={input}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                  placeholder={t('City', 'শহর', lang)}
                />
              </Field>
              <Field label={t('District', 'জেলা', lang)} required>
                <input
                  className={input}
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  required
                  placeholder={t('District', 'জেলা', lang)}
                  title={t(
                    'e.g. Dhaka, Chattogram, Khulna, Rajshahi, Sylhet, Barishal, Rangpur, Mymensingh',
                    'যেমন: ঢাকা, চট্টগ্রাম, খুলনা, রাজশাহী, সিলেট, বরিশাল, রংপুর, ময়মনসিংহ',
                    lang
                  )}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('Postcode', 'পোস্টকোড', lang)}>
                <input
                  className={input}
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  placeholder={t('Optional', 'ঐচ্ছিক', lang)}
                />
              </Field>
              <Field label={t('Country', 'দেশ', lang)}>
                <input
                  className={`${input} cursor-not-allowed bg-sand text-ink-soft`}
                  value="Bangladesh"
                  disabled
                />
              </Field>
            </div>
          </fieldset>

          {/* Note */}
          <Field label={t('Note for us (optional)', 'আমাদের জন্য নোট (ঐচ্ছিক)', lang)}>
            <textarea
              className={input}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={t('Anything we should know?', 'আমাদের কিছু জানানোর আছে?', lang)}
            />
          </Field>

          {error && (
            <p className="rounded-lg bg-accent-500/10 px-3 py-2 text-sm text-accent-500">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-black/10 px-5 py-3 font-semibold text-ink transition-colors hover:bg-sand"
            >
              {t('Cancel', 'বাতিল', lang)}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-brand-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {busy
                ? t('Submitting…', 'পাঠানো হচ্ছে…', lang)
                : isReserve
                  ? t('Confirm reservation', 'রিজার্ভেশন কনফার্ম করো', lang)
                  : t('Place pre-order', 'প্রি-অর্ডার করো', lang)}
            </button>
          </div>

          <p className="text-center text-xs text-ink-soft">
            {isReserve
              ? t(
                  'You can cancel anytime before we confirm your reservation.',
                  'রিজার্ভেশন কনফার্ম করার আগে যেকোনো সময় বাতিল করতে পারবে।',
                  lang
                )
              : t(
                  'You can cancel anytime before we confirm your order.',
                  'অর্ডার কনফার্ম করার আগে যেকোনো সময় বাতিল করতে পারবে।',
                  lang
                )}
          </p>
        </form>
      </div>
    </div>
  );
}

const input =
  'w-full rounded-md border border-black/10 px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-200';

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-accent-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
