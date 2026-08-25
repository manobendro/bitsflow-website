import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Globe } from 'lucide-react';
import { auth, db } from '../../lib/firebase/client';
import { t, type Lang } from '../../lib/i18n';
import { useLang } from './useLang';

type Mode = 'signin' | 'signup';

const REDIRECT_AFTER = '/dashboard';

export default function AuthForm() {
  const lang = useLang();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ensureProfile(uid: string, email: string, displayName?: string) {
    await setDoc(
      doc(db(), 'users', uid),
      {
        uid,
        email,
        displayName: displayName ?? '',
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth(), email, password);
        if (name) await updateProfile(cred.user, { displayName: name });
        await ensureProfile(cred.user.uid, email, name);
      } else {
        await signInWithEmailAndPassword(auth(), email, password);
      }
      window.location.assign(REDIRECT_AFTER);
    } catch (err) {
      setError(humanize(err, lang));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBusy(true);
    setError(null);
    try {
      const cred = await signInWithPopup(auth(), new GoogleAuthProvider());
      await ensureProfile(
        cred.user.uid,
        cred.user.email ?? '',
        cred.user.displayName ?? ''
      );
      window.location.assign(REDIRECT_AFTER);
    } catch (err) {
      setError(humanize(err, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-black/5 bg-white p-8 shadow-[0_2px_4px_rgb(20_39_31_/_0.05),0_18px_40px_-16px_rgb(20_39_31_/_0.18)]">
      <h1 className="text-2xl font-extrabold">
        {mode === 'signin'
          ? t('Welcome back', 'আবার স্বাগতম', lang)
          : t('Create your account', 'তোমার অ্যাকাউন্ট খোলো', lang)}
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        {mode === 'signin'
          ? t(
              'Sign in to track your orders and pre-books.',
              'অর্ডার আর প্রি-বুক দেখতে লগ ইন করো।',
              lang
            )
          : t(
              'Join to pre-book and manage your orders.',
              'প্রি-বুক করতে আর অর্ডার সামলাতে যোগ দাও।',
              lang
            )}
      </p>

      <button
        onClick={onGoogle}
        disabled={busy}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-black/10 px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-sand disabled:opacity-60"
      >
        <Globe size={16} /> {t('Continue with Google', 'Google দিয়ে ঢোকো', lang)}
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-ink-soft/70">
        <span className="h-px flex-1 bg-black/10" /> {t('or', 'অথবা', lang)}{' '}
        <span className="h-px flex-1 bg-black/10" />
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        {mode === 'signup' && (
          <Field label={t('Full name', 'পুরো নাম', lang)}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className={inputCls}
              placeholder={t('Ada Lovelace', 'তোমার নাম', lang)}
            />
          </Field>
        )}
        <Field label={t('Email', 'ইমেইল', lang)}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className={inputCls}
            placeholder="you@example.com"
          />
        </Field>
        <Field label={t('Password', 'পাসওয়ার্ড', lang)}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className={inputCls}
            placeholder="••••••••"
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-accent-500/10 px-3 py-2 text-sm text-accent-500">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {busy
            ? t('Please wait…', 'একটু অপেক্ষা করো…', lang)
            : mode === 'signin'
              ? t('Sign in', 'লগ ইন', lang)
              : t('Create account', 'অ্যাকাউন্ট খোলো', lang)}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-ink-soft">
        {mode === 'signin'
          ? t("Don't have an account? ", 'অ্যাকাউন্ট নেই? ', lang)
          : t('Already have an account? ', 'অ্যাকাউন্ট আছে? ', lang)}
        <button
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
          }}
          className="font-semibold text-brand-700 hover:underline"
        >
          {mode === 'signin'
            ? t('Sign up', 'সাইন আপ', lang)
            : t('Sign in', 'লগ ইন', lang)}
        </button>
      </p>
    </div>
  );
}

const inputCls =
  'w-full rounded-md border border-black/10 px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-200';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

function humanize(err: unknown, lang: Lang): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return t('Incorrect email or password.', 'ইমেইল বা পাসওয়ার্ড ঠিক হয়নি।', lang);
    case 'auth/email-already-in-use':
      return t(
        'That email is already registered. Try signing in.',
        'এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট খোলা আছে। লগ ইন করে দেখো।',
        lang
      );
    case 'auth/weak-password':
      return t(
        'Password should be at least 6 characters.',
        'পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।',
        lang
      );
    case 'auth/popup-closed-by-user':
      return t(
        'Sign-in popup closed before completing.',
        'শেষ হওয়ার আগেই সাইন-ইন উইন্ডোটা বন্ধ হয়ে গেছে।',
        lang
      );
    default:
      return t(
        'Something went wrong. Please try again.',
        'কিছু একটা সমস্যা হয়েছে। আরেকবার চেষ্টা করো।',
        lang
      );
  }
}
