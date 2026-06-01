/**
 * Admin allowlist. An authenticated request counts as admin if either:
 *  - the user's token has the custom claim `admin: true`, or
 *  - the user's email is in ADMIN_EMAILS below (handy before claims are set).
 *
 * To grant the durable custom claim, run `npm run set-admin -- <email>` in the
 * functions directory (see scripts/setAdmin.ts), or add the email here.
 */
export const ADMIN_EMAILS = [
    'mr.manob7@gmail.com',
    // add more admin emails here, or set the `admin` custom claim instead
];
export function isAdmin(token) {
    if (!token)
        return false;
    if (token.admin === true)
        return true;
    const email = (token.email ?? '').toLowerCase();
    return ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email);
}
//# sourceMappingURL=admin.js.map