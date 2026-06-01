/**
 * Admin allowlist. An authenticated request counts as admin if either:
 *  - the user's token has the custom claim `admin: true`, or
 *  - the user's email is in ADMIN_EMAILS below (handy before claims are set).
 *
 * To grant the durable custom claim, run `npm run set-admin -- <email>` in the
 * functions directory (see scripts/setAdmin.ts), or add the email here.
 */
export const ADMIN_EMAILS: string[] = [
  'mr.manob7@gmail.com',
  // add more admin emails here, or set the `admin` custom claim instead
];

export interface DecodedishToken {
  uid: string;
  email?: string;
  admin?: boolean;
  [k: string]: unknown;
}

export function isAdmin(token: DecodedishToken | null): boolean {
  if (!token) return false;
  if (token.admin === true) return true;
  const email = (token.email ?? '').toLowerCase();
  return ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email);
}
