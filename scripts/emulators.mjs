/**
 * `npm run emulators` — starts the Firebase emulator suite with a longer
 * Functions discovery timeout.
 *
 * firebase-tools gives the functions source 10s to report its backend spec.
 * On this Windows machine that load regularly takes longer when the emulators
 * boot alongside the Astro dev server, failing with "Cannot determine backend
 * specification. Timeout after 10000" and leaving /api unserved (404). The CLI
 * honours FUNCTIONS_DISCOVERY_TIMEOUT (seconds); a wrapper keeps that
 * cross-platform, since `VAR=x cmd` doesn't work in npm scripts on Windows.
 *
 * Extra args are forwarded, e.g. `npm run emulators -- --only functions`.
 */
import { spawn } from 'node:child_process';

const env = {
  ...process.env,
  FUNCTIONS_DISCOVERY_TIMEOUT: process.env.FUNCTIONS_DISCOVERY_TIMEOUT || '60',
};

const child = spawn('firebase', ['emulators:start', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32', // resolve firebase.cmd on Windows
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
