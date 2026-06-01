/**
 * Grant (or revoke) the `admin: true` custom claim on a user by email.
 *
 * Usage (from the functions/ directory, after `npm run build`):
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json \
 *     node lib/scripts/setAdmin.js you@example.com
 *   # revoke:
 *   node lib/scripts/setAdmin.js you@example.com --revoke
 *
 * Against the Auth emulator instead of production:
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node lib/scripts/setAdmin.js you@example.com
 *
 * The user must sign out and back in (or refresh their ID token) for the claim
 * to take effect on the client.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
const email = process.argv[2];
const revoke = process.argv.includes('--revoke');
if (!email) {
    console.error('Usage: node lib/scripts/setAdmin.js <email> [--revoke]');
    process.exit(1);
}
// Against the Auth emulator, no credential is needed (and passing one is
// invalid). Against production, use Application Default Credentials.
const projectId = process.env.GCLOUD_PROJECT ?? 'bitsflow-21443';
if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    initializeApp({ projectId });
}
else {
    initializeApp({ credential: applicationDefault(), projectId });
}
async function main() {
    const auth = getAuth();
    const user = await auth.getUserByEmail(email);
    await auth.setCustomUserClaims(user.uid, revoke ? {} : { admin: true });
    console.log(`${revoke ? 'Revoked admin from' : 'Granted admin to'} ${email} (uid ${user.uid}).`);
    console.log('They must sign out/in for the change to take effect.');
}
main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
});
//# sourceMappingURL=setAdmin.js.map