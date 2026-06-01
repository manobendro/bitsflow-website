import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase/client';
import { useAuth } from './useAuth';
import { useLang } from './useLang';
import { t } from '../../lib/i18n';

// Mirror of functions/src/admin.ts ADMIN_EMAILS — controls whether the Admin
// link is shown. The backend still enforces admin access independently, so this
// is only a UI hint (showing the link to a non-admin would just 403).
const ADMIN_EMAILS = ['mr.manob7@gmail.com'];

/** Header auth control: shows Sign in, or avatar + dashboard/logout (+ admin). */
export default function AuthNav() {
  const { user, loading } = useAuth();
  const lang = useLang();
  const [isAdmin, setIsAdmin] = useState(false);

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

  // Reserve the exact footprint of the resolved "Sign in" button so the header
  // doesn't shift when auth resolves.
  if (loading) {
    return (
      <div
        className="h-9 w-[84px] animate-pulse rounded-md bg-brand-100/70"
        aria-hidden="true"
      />
    );
  }

  if (!user) {
    return (
      <a
        href="/login"
        className="inline-flex h-9 items-center rounded-md bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
      >
        {t('Sign in', 'লগ ইন', lang)}
      </a>
    );
  }

  const initial = (user.displayName || user.email || '?').charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2.5">
      {isAdmin && (
        <a
          href="/admin"
          className="hidden h-9 items-center rounded-md bg-ink px-3 text-sm font-semibold text-white transition-colors hover:bg-ink/85 sm:inline-flex"
        >
          {t('Admin', 'অ্যাডমিন', lang)}
        </a>
      )}
      <a
        href="/dashboard"
        className="hidden h-9 items-center px-1 text-sm font-medium text-ink-soft transition-colors hover:text-brand-700 sm:inline-flex"
      >
        {t('Dashboard', 'ড্যাশবোর্ড', lang)}
      </a>
      <a
        href="/dashboard"
        title={user.email ?? undefined}
        className="grid h-9 w-9 place-items-center overflow-hidden rounded-md bg-brand-100 text-sm font-bold text-brand-700 transition-colors hover:bg-brand-200"
      >
        {user.photoURL ? (
          <img src={user.photoURL} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </a>
      <button
        onClick={() => signOut(auth())}
        className="inline-flex h-9 items-center rounded-md border border-black/10 px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-sand hover:text-ink"
      >
        {t('Sign out', 'লগ আউট', lang)}
      </button>
    </div>
  );
}
