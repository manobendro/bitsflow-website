/**
 * End-to-end browser test for the Bitsflow site, driven by Puppeteer.
 *
 * Exercises the real React islands against the Astro dev server + Firebase
 * emulators (Auth/Firestore/Functions). Requires those to be running:
 *   - dev server at BASE_URL (default http://localhost:4322)
 *   - emulators (auth 9099, firestore 8080, functions 5001)
 *   - the app built with PUBLIC_USE_EMULATORS=true
 *
 * Run:  node tests/e2e.mjs
 * Headed (watch it):  HEADLESS=false node tests/e2e.mjs
 */
import puppeteer from 'puppeteer';

const BASE = process.env.BASE_URL ?? 'http://localhost:4322';
const HEADLESS = process.env.HEADLESS !== 'false';
// Use a system Chrome if Puppeteer's bundled Chromium isn't available.
// Forward slashes work on Windows and avoid shell/escaping pitfalls.
const CHROME_PATH =
  process.env.CHROME_PATH ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = new URL('./shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// Unique accounts per run so reruns don't collide in the emulator.
const STAMP = process.argv[2] ?? `${Math.floor(Math.random() * 1e6)}`;
const CUST = { email: `cust_${STAMP}@test.com`, pass: 'test1234', name: 'Test Customer' };
const ADMIN = { email: 'mr.manob7@gmail.com', pass: 'admin1234', name: 'Site Admin' };

let passed = 0;
let failed = 0;
const results = [];

function ok(name) {
  passed++;
  results.push(`  ✓ ${name}`);
  console.log(`  ✓ ${name}`);
}
function bad(name, err) {
  failed++;
  results.push(`  ✗ ${name} — ${err}`);
  console.log(`  ✗ ${name} — ${err}`);
}
async function step(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    bad(name, err.message ?? String(err));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait until an element whose text matches appears; returns the handle. */
async function findByText(page, selector, text, timeout = 10000) {
  const start = Date.now();
  const re = text instanceof RegExp ? text : null;
  while (Date.now() - start < timeout) {
    const handle = await page.evaluateHandle(
      (sel, txt, isRe) => {
        const els = Array.from(document.querySelectorAll(sel));
        return (
          els.find((e) => {
            const t = (e.textContent || '').trim();
            return isRe ? new RegExp(txt).test(t) : t.includes(txt);
          }) || null
        );
      },
      selector,
      re ? re.source : text,
      !!re
    );
    const el = handle.asElement();
    if (el) return el;
    await sleep(150);
  }
  throw new Error(`timeout waiting for ${selector} containing "${text}"`);
}

async function clickByText(page, selector, text, timeout = 10000) {
  const el = await findByText(page, selector, text, timeout);
  await el.click();
  return el;
}

async function typeInto(page, selector, value) {
  await page.waitForSelector(selector, { visible: true, timeout: 10000 });
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, value);
}

async function main() {
  console.log(`\n🧪 Bitsflow E2E — base=${BASE} headless=${HEADLESS} run=${STAMP}\n`);

  const fsmod = await import('node:fs');
  const launchOpts = {
    headless: HEADLESS,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
    defaultViewport: { width: 1280, height: 900 },
  };
  if (fsmod.existsSync(CHROME_PATH)) launchOpts.executablePath = CHROME_PATH;
  const browser = await puppeteer.launch(launchOpts);

  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`);
  });

  try {
    // ---------- 1. Home / hero / 3D ----------
    await step('home page loads with hero headline', async () => {
      await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
      await findByText(page, 'h1', /Make something/i);
    });

    await step('3D hero canvas renders (WebGL)', async () => {
      await page.waitForSelector('canvas', { timeout: 15000 });
      const has = await page.$$eval('canvas', (cs) => cs.length > 0);
      if (!has) throw new Error('no canvas found');
    });

    await step('experience sections present (Why / Create / Journey)', async () => {
      // innerText is uppercased by CSS for some headings, so match case-insensitively.
      const body = (await page.$eval('body', (b) => b.innerText)).toLowerCase();
      for (const s of ['why bitsflow', 'what you can create', 'whole coding journey']) {
        if (!body.includes(s)) throw new Error(`missing section: ${s}`);
      }
    });

    await step('language toggle switches EN → বাংলা and back', async () => {
      // Click the বাংলা button in the header toggle.
      await clickByText(page, 'button', /বাংলা/);
      await sleep(600);
      const dataLang = await page.$eval('html', (h) => h.getAttribute('data-lang'));
      if (dataLang !== 'bn') throw new Error('data-lang did not become bn');
      const bnVisible = await page.evaluate(() =>
        document.body.innerText.includes('দারুণ')
      );
      if (!bnVisible) throw new Error('Bangla hero text not visible after switch');
      // Switch back to EN.
      await clickByText(page, 'button', /^EN$/);
      await sleep(600);
      const back = await page.$eval('html', (h) => h.getAttribute('data-lang'));
      if (back !== 'en') throw new Error('did not switch back to en');
    });

    // ---------- 2. Specs page ----------
    await step('specs page loads with grouped specs', async () => {
      await page.goto(BASE + '/specs', { waitUntil: 'networkidle2' });
      const body = await page.$eval('body', (b) => b.innerText);
      if (!/Tech specs/i.test(body) || !/Bluetooth Low Energy/i.test(body))
        throw new Error('specs content missing');
    });

    // ---------- 3. Blog ----------
    await step('blog index lists posts and opens one', async () => {
      await page.goto(BASE + '/blog', { waitUntil: 'networkidle2' });
      await clickByText(page, 'a', /Meet Bitsflow|first project/i);
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
      const body = await page.$eval('body', (b) => b.innerText);
      if (body.length < 200) throw new Error('post body too short');
    });

    // ---------- 4. Auth: sign up ----------
    await step('sign up a new customer', async () => {
      // Reset to English so the remaining English-text assertions are stable
      // (a prior step may have switched the UI to Bangla).
      await page.evaluate(() => {
        try {
          localStorage.setItem('lang', 'en');
        } catch {}
      });
      await page.goto(BASE + '/login', { waitUntil: 'networkidle2' });
      // switch to sign-up mode
      await clickByText(page, 'button', /Sign up/i);
      await typeInto(page, 'input[type="text"]', CUST.name);
      await typeInto(page, 'input[type="email"]', CUST.email);
      await typeInto(page, 'input[type="password"]', CUST.pass);
      await clickByText(page, 'button', /Create account/i);
      // redirected to dashboard
      await page.waitForFunction(() => location.pathname.startsWith('/dashboard'), {
        timeout: 15000,
      });
    });

    await step('dashboard greets the signed-in user', async () => {
      await findByText(page, 'h1', /Hi /i);
      const body = await page.$eval('body', (b) => b.innerText);
      if (!body.includes(CUST.email)) throw new Error('email not shown on dashboard');
    });

    await step('dashboard shows empty state initially', async () => {
      // The dashboard shows a loading skeleton first, then resolves the orders
      // query. Wait for it to settle rather than reading the DOM mid-load.
      await page.waitForFunction(
        () => /Nothing here yet|No orders/i.test(document.body.innerText),
        { timeout: 10000 }
      );
    });

    // ---------- 5. Shop: reserve via the order form ----------
    await step('open shop and launch the reserve form', async () => {
      await page.goto(BASE + '/shop', { waitUntil: 'networkidle2' });
      await clickByText(page, 'button', /Reserve \(no payment now\)/i);
      // modal appears
      await findByText(page, 'h2', /Reserve your Bitsflow/i);
    });

    await step('fill and submit the order form', async () => {
      // The modal is the last form on the page.
      await typeInto(page, 'input[placeholder="Your full name"]', CUST.name);
      await typeInto(page, 'input[placeholder="01XXXXXXXXX"]', '01712345678');
      // occupation select -> Student is default; set school
      await typeInto(page, 'input[placeholder="Optional"]', 'Test School');
      await typeInto(page, 'input[placeholder="House / road / area"]', '123 Test Road');
      await typeInto(page, 'input[placeholder="City"]', 'Dhaka');
      await typeInto(page, 'input[placeholder="District"]', 'Dhaka');
      await clickByText(page, 'button', /Confirm reservation/i);
      // success message in ShopActions
      await findByText(page, 'div', /Reservation confirmed/i, 15000);
    });

    // ---------- 6. Dashboard: order appears + cancel ----------
    await step('reserved order appears on dashboard', async () => {
      await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle2' });
      await findByText(page, 'li', /Bitsflow Board ×1/i, 15000);
      const body = await page.$eval('body', (b) => b.innerText);
      if (!/pending/i.test(body)) throw new Error('order not pending');
    });

    await step('cancel the pending order (no reason → was the 500 bug)', async () => {
      // auto-accept the confirm() dialog
      page.on('dialog', async (d) => {
        await d.accept();
      });
      await clickByText(page, 'button', /^Cancel$/i);
      await findByText(page, 'body', /cancelled/i, 15000);
    });

    // ---------- 7. Admin gating for non-admin ----------
    await step('non-admin hitting /admin sees "Admins only"', async () => {
      await page.goto(BASE + '/admin', { waitUntil: 'networkidle2' });
      await findByText(page, 'body', /Admins only/i, 15000);
    });

    // ---------- 8. Sign out ----------
    await step('sign out returns to signed-out nav', async () => {
      await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle2' });
      await clickByText(page, 'button', /Sign out/i);
      await sleep(1500);
      // header should show Sign in again
      await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
      await findByText(page, 'a', /Sign in/i, 10000);
    });

    // ---------- 9. Admin journey ----------
    await step('sign up/in the admin account', async () => {
      // Poll for the dashboard after an auth attempt (returns true if reached).
      const reachedDashboard = async (ms) => {
        try {
          await page.waitForFunction(
            () => location.pathname.startsWith('/dashboard'),
            { timeout: ms }
          );
          return true;
        } catch {
          return false;
        }
      };

      // Attempt 1: sign in (the admin account may already exist from a prior run).
      await page.goto(BASE + '/login', { waitUntil: 'networkidle2' });
      await typeInto(page, 'input[type="email"]', ADMIN.email);
      await typeInto(page, 'input[type="password"]', ADMIN.pass);
      await clickByText(page, 'button', /^Sign in$/i);
      if (await reachedDashboard(6000)) return;

      // Attempt 2: account doesn't exist yet → sign up.
      await page.goto(BASE + '/login', { waitUntil: 'networkidle2' });
      await clickByText(page, 'button', /Sign up/i);
      await typeInto(page, 'input[type="text"]', ADMIN.name);
      await typeInto(page, 'input[type="email"]', ADMIN.email);
      await typeInto(page, 'input[type="password"]', ADMIN.pass);
      await clickByText(page, 'button', /Create account/i);
      if (await reachedDashboard(8000)) return;

      throw new Error('admin could neither sign in nor sign up');
    });

    // mr.manob7@gmail.com is in the backend ADMIN_EMAILS allowlist, so it is
    // authorized by email — no custom claim / token refresh needed.
    await step('admin can view all orders at /admin', async () => {
      await page.goto(BASE + '/admin', { waitUntil: 'networkidle2' });
      await sleep(1500);
      const body = await page.$eval('body', (b) => b.innerText);
      if (/Admins only/i.test(body)) {
        throw new Error('admin not authorized');
      }
      await findByText(page, 'h1', /Orders admin/i, 15000);
    });

    await step('admin sees at least one order row', async () => {
      const body = await page.$eval('body', (b) => b.innerText);
      if (!/order(s)? total/i.test(body)) throw new Error('no order count shown');
    });

    // ---------- screenshots ----------
    await step('capture screenshots', async () => {
      const fs = await import('node:fs');
      fs.mkdirSync(SHOTS, { recursive: true });
      for (const [name, path] of [
        ['home', '/'],
        ['specs', '/specs'],
        ['shop', '/shop'],
      ]) {
        await page.goto(BASE + path, { waitUntil: 'networkidle2' });
        await sleep(800);
        await page.screenshot({ path: SHOTS + name + '.png', fullPage: true });
      }
    });
  } finally {
    // surface any uncaught browser errors as a soft check
    if (pageErrors.length) {
      console.log('\n⚠️  Browser console/page errors observed:');
      [...new Set(pageErrors)].slice(0, 15).forEach((e) => console.log('   - ' + e));
    }
    await browser.close();
  }

  console.log('\n──────── RESULTS ────────');
  console.log(results.join('\n'));
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
