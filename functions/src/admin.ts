/**
 * Admin allowlist. An authenticated request counts as admin if either:
 *  - the user's token has the custom claim `admin: true`, or
 *  - the user's email is in ADMIN_EMAILS below (handy before claims are set).
 *
 * To grant the durable custom claim, run `npm run set-admin -- <email>` in the
 * functions directory (see scripts/setAdmin.ts), or add the email here.
 */
import { getAuth } from 'firebase-admin/auth';

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

/** Verify the Firebase ID token from the `Authorization: Bearer …` header. */
export async function requireUser(req: {
  headers: { authorization?: string };
}): Promise<DecodedishToken | null> {
  const header = req.headers.authorization ?? '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  try {
    return (await getAuth().verifyIdToken(match[1])) as DecodedishToken;
  } catch {
    return null;
  }
}

export function isAdmin(token: DecodedishToken | null): boolean {
  if (!token) return false;
  if (token.admin === true) return true;
  const email = (token.email ?? '').toLowerCase();
  return ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email);
}
