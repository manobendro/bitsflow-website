import { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  getAdditionalUserInfo,
  updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { CircleAlert, CircleCheck, Eye, EyeOff, Globe, Info } from 'lucide-react';
import { auth, db } from '../../lib/firebase/client';
import { t, type Lang } from '../../lib/i18n';
import { track } from '../../lib/analytics';
import { useLang } from './useLang';
import T from './T';
import Spinner from './flows/Spinner';
import { DEFAULT_AFTER_LOGIN, nextFromLocation } from './flows/safeNext';

type Mode = 'signin' | 'signup';
type Busy = null | 'email' | 'google' | 'reset';

export default function AuthForm() {
  const lang = useLang();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  // Where to go after auth: validated `?next=` (same-origin path) or dashboard.
  const [nextPath, setNextPath] = useState(DEFAULT_AFTER_LOGIN);

  useEffect(() => {
    setNextPath(nextFromLocation());
  }, []);

  const continuing = nextPath !== DEFAULT_AFTER_LOGIN;
  const continuingToOrder = /^\/products\//.test(nextPath);

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

  function redirect() {
    // Re-read at redirect time in case the effect hasn't run yet.
    window.location.assign(nextFromLocation());
  }

  /** "return" = signed in to get back to a page (e.g. finishing an order). */
  const authContext = () => (nextFromLocation() === DEFAULT_AFTER_LOGIN ? 'direct' : 'return');
  const authErrorCode = (err: unknown) =>
    String((err as { code?: string })?.code ?? 'unknown').replace(/^auth\//, '');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy('email');
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth(), email.trim(), password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
        await ensureProfile(cred.user.uid, email.trim(), name.trim());
        track('sign_up', { method: 'password', context: authContext() });
      } else {
        await signInWithEmailAndPassword(auth(), email.trim(), password);
        track('login', { method: 'password', context: authContext() });
      }
      redirect(); // keep the spinner showing until the page changes
    } catch (err) {
      track('auth_error', { mode, method: 'password', error_code: authErrorCode(err) });
      setError(humanize(err, lang));
      setBusy(null);
    }
  }

  async function onGoogle() {
    setBusy('google');
    setError(null);
    setNotice(null);
    try {
      const cred = await signInWithPopup(auth(), new GoogleAuthProvider());
      await ensureProfile(cred.user.uid, cred.user.email ?? '', cred.user.displayName ?? '');
      const isNew = getAdditionalUserInfo(cred)?.isNewUser === true;
      track(isNew ? 'sign_up' : 'login', { method: 'google', context: authContext() });
      redirect();
    } catch (err) {
      track('auth_error', { mode, method: 'google', error_code: authErrorCode(err) });
      setError(humanize(err, lang));
      setBusy(null);
    }
  }

  async function onForgot() {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError(
        t(
          'Type your email above first, then tap "Forgot password?" again.',
          'আগে উপরে তোমার ইমেইল লেখো, তারপর আবার "পাসওয়ার্ড ভুলে গেছ?" চাপো।',
          lang
        )
      );
      document.getElementById('auth-email')?.focus();
      return;
    }
    setBusy('reset');
    try {
      // After resetting, the email's "Continue" button returns to our sign-in
      // page (the domain must be an authorized Auth domain — bitsflow.cc is).
      await sendPasswordResetEmail(auth(), email.trim(), {
        url: `${window.location.origin}/login`,
      });
      track('password_reset_requested');
      setNotice(
        t(
          'Check your inbox — we sent a link to reset your password.',
          'ইনবক্স দেখো — পাসওয়ার্ড রিসেট করার লিংক পাঠিয়ে দিয়েছি।',
          lang
        )
      );
    } catch (err) {
      setError(humanize(err, lang));
    } finally {
      setBusy(null);
    }
  }

  function switchMode() {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
    setNotice(null);
    setShowPassword(false);
  }

  const isSignup = mode === 'signup';

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-black/5 bg-white p-6 shadow-[var(--shadow-lift)] sm:p-8">
      <h1 className="text-2xl font-extrabold tracking-tight">
        {isSignup ? (
          <T en="Create your account" bn="তোমার অ্যাকাউন্ট খোলো" />
        ) : (
          <T en="Welcome back" bn="আবার স্বাগতম" />
        )}
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        {isSignup ? (
          <T
            en="Join to reserve boards and keep track of your orders."
            bn="বোর্ড রিজার্ভ করতে আর অর্ডারের খবর রাখতে যোগ দাও।"
          />
        ) : (
          <T
            en="Sign in to track your orders and reservations."
            bn="অর্ডার আর রিজার্ভেশন দেখতে লগ ইন করো।"
          />
        )}
      </p>

      {continuing && (
        <p className="mt-4 flex items-start gap-2 rounded-md bg-brand-50 px-3 py-2.5 text-sm text-brand-800">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {continuingToOrder ? (
            <T
              en="Sign in to finish your order — we'll take you right back to it."
              bn="অর্ডারটা শেষ করতে লগ ইন করো — তারপর সোজা ওখানেই ফিরিয়ে নেব।"
            />
          ) : (
            <T
              en="Sign in to continue — we'll take you right back."
              bn="চালিয়ে যেতে লগ ইন করো — তারপর আগের জায়গায় ফিরিয়ে নেব।"
            />
          )}
        </p>
      )}

      <button
        type="button"
        onClick={onGoogle}
        disabled={busy !== null}
        className="btn btn-secondary mt-6 min-h-11 w-full"
      >
        {busy === 'google' ? <Spinner size={16} /> : <Globe size={16} aria-hidden="true" />}
        <T en="Continue with Google" bn="Google দিয়ে ঢোকো" />
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-ink-soft/80" aria-hidden="true">
        <span className="h-px flex-1 bg-black/10" />
        <T en="or with email" bn="অথবা ইমেইল দিয়ে" />
        <span className="h-px flex-1 bg-black/10" />
      </div>

      <form onSubmit={onSubmit} className="space-y-4" aria-describedby="auth-feedback">
        {isSignup && (
          <div>
            <label htmlFor="auth-name" className="label">
              <T en="Full name" bn="পুরো নাম" />
            </label>
            <input
              id="auth-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              maxLength={100}
              className="input"
              placeholder={t('e.g. Nusrat Jahan', 'যেমন: নুসরাত জাহান', lang)}
            />
          </div>
        )}
        <div>
          <label htmlFor="auth-email" className="label">
            <T en="Email" bn="ইমেইল" />
          </label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete={isSignup ? 'email' : 'username'}
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            className="input"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="auth-password" className="label">
              <T en="Password" bn="পাসওয়ার্ড" />
            </label>
            {!isSignup && (
              <button
                type="button"
                onClick={onForgot}
                disabled={busy !== null}
                className="mb-1.5 text-xs font-semibold text-brand-700 hover:underline disabled:opacity-60"
              >
                <T en="Forgot password?" bn="পাসওয়ার্ড ভুলে গেছ?" />
              </button>
            )}
          </div>
          <div className="relative">
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              aria-describedby={isSignup ? 'auth-password-hint' : undefined}
              className="input pr-12"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={t('Show password', 'পাসওয়ার্ড দেখাও', lang)}
              aria-pressed={showPassword}
              aria-controls="auth-password"
              className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-ink-soft transition-colors hover:text-ink"
            >
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          {isSignup && (
            <p id="auth-password-hint" className="mt-1.5 text-xs text-ink-soft">
              <T en="At least 6 characters." bn="অন্তত ৬ অক্ষর।" />
            </p>
          )}
        </div>

        <div id="auth-feedback" aria-live="polite" role="status">
          {error && (
            <p className="flex items-start gap-2 rounded-md bg-accent-500/10 px-3 py-2 text-sm text-accent-600">
              <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}
          {notice && (
            <p className="flex items-start gap-2 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-800">
              <CircleCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{notice}</span>
            </p>
          )}
        </div>

        <button type="submit" disabled={busy !== null} className="btn btn-lg btn-primary w-full">
          {busy === 'email' && <Spinner size={18} />}
          {busy === 'email'
            ? t('Please wait…', 'একটু অপেক্ষা করো…', lang)
            : isSignup
              ? t('Create account', 'অ্যাকাউন্ট খোলো', lang)
              : t('Sign in', 'লগ ইন', lang)}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        {isSignup ? (
          <T en="Already have an account?" bn="অ্যাকাউন্ট আছে?" />
        ) : (
          <T en="Don't have an account?" bn="অ্যাকাউন্ট নেই?" />
        )}{' '}
        <button
          type="button"
          onClick={switchMode}
          className="inline-flex min-h-11 items-center font-semibold text-brand-700 hover:underline"
        >
          {isSignup ? t('Sign in', 'লগ ইন', lang) : t('Sign up', 'সাইন আপ', lang)}
        </button>
      </p>
    </div>
  );
}

function humanize(err: unknown, lang: Lang): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return t('Incorrect email or password.', 'ইমেইল বা পাসওয়ার্ড ঠিক হয়নি।', lang);
    case 'auth/invalid-email':
      return t(
        "That email doesn't look right — please check it.",
        'ইমেইলটা ঠিক মনে হচ্ছে না — একবার দেখে নাও।',
        lang
      );
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
    case 'auth/too-many-requests':
      return t(
        'Too many tries. Please wait a minute and try again.',
        'অনেকবার চেষ্টা হয়ে গেছে। এক মিনিট পরে আবার চেষ্টা করো।',
        lang
      );
    case 'auth/network-request-failed':
      return t(
        'No internet connection. Check your network and try again.',
        'ইন্টারনেট সংযোগ নেই। নেটওয়ার্ক দেখে আবার চেষ্টা করো।',
        lang
      );
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return t(
        'Sign-in popup closed before completing.',
        'শেষ হওয়ার আগেই সাইন-ইন উইন্ডোটা বন্ধ হয়ে গেছে।',
        lang
      );
    case 'auth/popup-blocked':
      return t(
        'Your browser blocked the sign-in popup. Please allow popups and try again.',
        'ব্রাউজার সাইন-ইন উইন্ডোটা আটকে দিয়েছে। পপআপ চালু করে আবার চেষ্টা করো।',
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
