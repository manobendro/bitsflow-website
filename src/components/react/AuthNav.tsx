import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { LogIn, LogOut, ShieldCheck } from 'lucide-react';
import { auth } from '../../lib/firebase/client';
import { useAuth } from './useAuth';
import { useLang } from './useLang';
import { t } from '../../lib/i18n';
import T from './T';
import Spinner from './flows/Spinner';

// Mirror of functions/src/admin.ts ADMIN_EMAILS — controls whether the Admin
// link is shown. The backend still enforces admin access independently, so this
// is only a UI hint (showing the link to a non-admin would just 403).
const ADMIN_EMAILS = ['mr.manob7@gmail.com'];

/** Pages where "Sign in" from the header should bring you back afterwards. */
function signInHref(): string {
  if (typeof window === 'undefined') return '/login';
  const { pathname, search } = window.location;
  if (pathname === '/' || pathname.startsWith('/login')) return '/login';
  return `/login?next=${encodeURIComponent(pathname + search)}`;
}

/**
 * Header auth control. Compact on small screens (it sits next to the mobile
 * menu button): avatar + icon-only Sign out. From `lg` up, text labels appear.
 */
export default function AuthNav() {
  const { user, loading } = useAuth();
  const lang = useLang();
  const [isAdmin, setIsAdmin] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [loginHref, setLoginHref] = useState('/login');

  useEffect(() => {
    setLoginHref(signInHref());
  }, []);

  useEffect(() => {
    let active = true;
    if (!user) {
      setIsAdmin(false);
      return;
    }
    // Prefer the custom claim; fall back to the email allowlist.
    user
      .getIdTokenResult()
      .then((res) => {
        if (!active) return;
        const claimAdmin = res.claims.admin === true;
        const emailAdmin = ADMIN_EMAILS.includes((user.email ?? '').toLowerCase());
        setIsAdmin(claimAdmin || emailAdmin);
      })
      .catch(() => active && setIsAdmin(false));
    return () => {
      active = false;
    };
  }, [user]);

  async function onSignOut() {
    setSigningOut(true);
    try {
      await signOut(auth());
    } finally {
      setSigningOut(false);
    }
  }

  // Reserve roughly the footprint of the resolved "Sign in" button so the
  // header doesn't shift when auth resolves.
  if (loading) {
    return <div className="skeleton h-10 w-[84px] sm:h-9" aria-hidden="true" />;
  }

  if (!user) {
    return (
      <a
        href={loginHref}
        className="btn btn-primary h-10 gap-1.5 px-4 py-0 text-sm shadow-none sm:h-9"
      >
        <LogIn size={16} aria-hidden="true" className="hidden sm:block" />
        {t('Sign in', 'লগ ইন', lang)}
      </a>
    );
  }

  const label = user.displayName || user.email || '';
  const initial = (label || '?').charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {isAdmin && (
        <a
          href="/admin"
          aria-label={t('Admin', 'অ্যাডমিন', lang)}
          title={t('Admin', 'অ্যাডমিন', lang)}
          className="inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-md bg-ink px-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink/85 sm:h-9 sm:min-w-9"
        >
          <ShieldCheck size={16} aria-hidden="true" />
          <span className="hidden lg:inline">
            <T en="Admin" bn="অ্যাডমিন" />
          </span>
        </a>
      )}
      <a
        href="/dashboard"
        className="hidden h-9 items-center px-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-brand-700 lg:inline-flex"
      >
        <T en="Dashboard" bn="ড্যাশবোর্ড" />
      </a>
      <a
        href="/dashboard"
        title={user.email ?? undefined}
        aria-label={t('My dashboard', 'আমার ড্যাশবোর্ড', lang)}
        className="grid h-10 w-10 place-items-center overflow-hidden rounded-md bg-brand-100 text-sm font-bold text-brand-700 ring-1 ring-inset ring-brand-200 transition-colors hover:bg-brand-200 sm:h-9 sm:w-9"
      >
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden="true">{initial}</span>
        )}
      </a>
      <button
        type="button"
        onClick={onSignOut}
        disabled={signingOut}
        aria-label={t('Sign out', 'লগ আউট', lang)}
        title={t('Sign out', 'লগ আউট', lang)}
        className="inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-md border border-black/10 px-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-sand hover:text-ink disabled:opacity-60 sm:h-9 sm:min-w-9"
      >
        {signingOut ? <Spinner size={15} /> : <LogOut size={16} aria-hidden="true" />}
        <span className="hidden lg:inline">{t('Sign out', 'লগ আউট', lang)}</span>
      </button>
    </div>
  );
}
