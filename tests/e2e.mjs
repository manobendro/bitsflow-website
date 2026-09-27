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

/** Clear a field reliably (works for type="number" too), then type. */
async function replaceInput(page, selector, value) {
  await page.waitForSelector(selector, { visible: true, timeout: 10000 });
  await page.focus(selector);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type(selector, value);
}

/** Wait until a button is enabled, then click it. */
async function clickWhenEnabled(page, selector, timeout = 10000) {
  await page.waitForFunction(
    (s) => {
      const b = document.querySelector(s);
      return b && !b.disabled;
    },
    { timeout },
    selector
  );
  await page.click(selector);
}

// --- analytics (dev server runs analytics in "debug" mode: events are logged
// to sessionStorage["bf:analytics"] instead of being sent to GA) ---
async function analyticsLog(page) {
  return page.evaluate(() => {
    try {
      return JSON.parse(sessionStorage.getItem('bf:analytics') || '[]');
    } catch {
      return [];
    }
  });
}

/** Wait for an analytics event whose params satisfy `match`. */
async function expectEvent(page, name, match = () => true, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const hit = (await analyticsLog(page)).find(
      (e) => e.name === name && match(e.params || {})
    );
    if (hit) return hit;
    await sleep(200);
  }
  const seen = [...new Set((await analyticsLog(page)).map((e) => e.name))].join(', ');
  throw new Error(`analytics: no matching "${name}" event (seen: ${seen})`);
}

/** Fill the checkout form (modal) with valid details. */
async function fillOrderForm(page, name) {
  await replaceInput(page, 'input[placeholder="Your full name"]', name);
  await replaceInput(page, 'input[placeholder="01XXXXXXXXX"]', '01712345678');
  await replaceInput(page, 'input[placeholder="Optional"]', 'Test School');
  await replaceInput(page, 'input[placeholder="House / road / area"]', '123 Test Road');
  await replaceInput(page, 'input[placeholder="City"]', 'Dhaka');
  await replaceInput(page, 'input[placeholder="District"]', 'Dhaka');
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

    await step('analytics: page_view + language_change are logged', async () => {
      await expectEvent(page, 'page_view', (p) => p.page_path === '/');
      await expectEvent(page, 'language_change', (p) => p.language === 'bn' && p.previous_language === 'en');
      await expectEvent(page, 'language_change', (p) => p.language === 'en' && p.previous_language === 'bn');
    });

    await step('mobile menu opens and navigates (390px)', async () => {
      await page.setViewport({ width: 390, height: 844 });
      try {
        await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
        const toggle = await page.waitForSelector('#menu-toggle', { visible: true });
        await toggle.click();
        await page.waitForFunction(
          () => document.getElementById('menu-toggle')?.getAttribute('aria-expanded') === 'true'
        );
        const shop = '#mobile-menu a[href="/products"]';
        await page.waitForSelector(shop, { visible: true });
        await sleep(400); // let the slide-down settle before clicking
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2' }),
          page.click(shop),
        ]);
        const path = await page.evaluate(() => location.pathname);
        if (!path.startsWith('/products'))
          throw new Error(`menu link did not navigate to /products (at ${path})`);
      } finally {
        await page.setViewport({ width: 1280, height: 900 });
      }
    });

    await step('analytics: menu_open + mobile nav tag are logged', async () => {
      await expectEvent(page, 'menu_open', (p) => p.viewport === 'mobile');
      await expectEvent(
        page,
        'cta_click',
        (p) => p.cta_id === 'nav_shop' && p.menu === 'mobile' && p.location === 'header'
      );
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

    await step('analytics: sign_up is logged', async () => {
      await expectEvent(page, 'sign_up', (p) => p.method === 'password' && p.context === 'direct');
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

    // ---------- 5. Store: browse the catalog, then reserve via the order form ----------
    await step('home shows featured products + view all', async () => {
      await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
      await findByText(page, 'a', /View all products/i, 10000);
      await findByText(page, 'h3', /Starter Kit/i);
    });

    await step('analytics: featured list view, FAQ open and CTA tag', async () => {
      await expectEvent(
        page,
        'view_item_list',
        (p) => p.item_list_id === 'home_featured' && (p.items || []).length === 6
      );
      // Opening a <details data-track> fires `toggle` → faq_open with the question.
      await page.evaluate(() => {
        document.querySelector('details[data-track="faq"]').open = true;
      });
      await expectEvent(page, 'faq_open', (p) => typeof p.question === 'string' && p.question.length > 5);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        clickByText(page, 'a', /View all products/i),
      ]);
      await expectEvent(
        page,
        'cta_click',
        (p) => p.cta_id === 'featured_view_all' && p.link_url === '/products'
      );
    });

    await step('storefront lists products across categories', async () => {
      await page.goto(BASE + '/products', { waitUntil: 'networkidle2' });
      await findByText(page, 'h3', /Robotics Add-on Kit/i, 10000);
      await findByText(page, 'h3', /USB-C Cable/i);
    });

    await step('analytics: shop list view, search, select_item and view_item', async () => {
      await expectEvent(
        page,
        'view_item_list',
        (p) => p.item_list_id === 'shop_all' && (p.items || []).length >= 8
      );
      await typeInto(page, 'input[type="search"]', 'robot');
      await expectEvent(page, 'search', (p) => p.search_term === 'robot' && p.results >= 1);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click('[data-testid="product-card"][data-slug="robotics-kit"]'),
      ]);
      await expectEvent(
        page,
        'select_item',
        (p) => p.item_list_id === 'shop_all' && p.items?.[0]?.item_id === 'bitsflow-robotics-kit'
      );
      await expectEvent(
        page,
        'view_item',
        (p) => p.currency === 'BDT' && p.value === 3200 && p.items?.[0]?.item_id === 'bitsflow-robotics-kit'
      );
    });

    await step('available product shows Buy now', async () => {
      await page.goto(BASE + '/products/robotics-kit', { waitUntil: 'networkidle2' });
      await findByText(page, 'button', /Buy now/i, 10000);
    });

    await step('open board product page and launch the reserve form', async () => {
      await page.goto(BASE + '/products/bitsflow-board', { waitUntil: 'networkidle2' });
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

    await step('analytics: begin_checkout + reserve logged, and no PII anywhere', async () => {
      await expectEvent(
        page,
        'begin_checkout',
        (p) => p.order_type === 'reserve' && p.value === 4500 && p.currency === 'BDT'
      );
      await expectEvent(
        page,
        'reserve',
        (p) =>
          typeof p.transaction_id === 'string' &&
          p.transaction_id.length > 5 &&
          p.value === 4500 &&
          p.items?.[0]?.item_id === 'bitsflow-v1'
      );
      const dump = JSON.stringify(await analyticsLog(page));
      for (const secret of [CUST.email, '01712345678', '123 Test Road', 'Test School']) {
        if (dump.includes(secret)) throw new Error(`PII leaked into analytics: "${secret}"`);
      }
    });

    // ---------- 6. Dashboard: order appears + cancel ----------
    await step('reserved order appears on dashboard', async () => {
      await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle2' });
      try {
        await findByText(page, 'li', /Bitsflow Board ×1/i, 15000);
      } catch (e) {
        const why = await page.evaluate(() => ({
          path: location.pathname,
          h1: document.querySelector('h1')?.textContent,
          items: [...document.querySelectorAll('li')]
            .map((l) => (l.textContent || '').trim().slice(0, 60))
            .filter((t) => /×|order|অর্ডার/i.test(t))
            .slice(0, 6),
          alert: document.querySelector('[role="alert"]')?.textContent,
        }));
        await page.screenshot({ path: SHOTS + 'fail-dashboard.png', fullPage: true });
        // Evidence: (1) does a reload show it? (2) emulator ground truth.
        await page.reload({ waitUntil: 'networkidle2' });
        await sleep(4000);
        why.afterReload = await page.evaluate(() => /Bitsflow Board ×1/.test(document.body.innerText));
        try {
          const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
          const acct = await (
            await fetch(
              'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/bitsflow-21443/accounts:lookup',
              { method: 'POST', headers: H, body: JSON.stringify({ email: [CUST.email] }) }
            )
          ).json();
          why.authUids = (acct.users ?? []).map((u) => u.localId);
          const ord = await (
            await fetch(
              'http://127.0.0.1:9080/v1/projects/bitsflow-21443/databases/(default)/documents/orders?pageSize=50',
              { headers: H }
            )
          ).json();
          why.ordersForEmail = (ord.documents ?? [])
            .filter((d) => d.fields?.customerEmail?.stringValue === CUST.email)
            .map((d) => ({ uid: d.fields.uid?.stringValue, created: d.fields.createdAt?.timestampValue }));
        } catch (err) {
          why.groundTruthError = String(err);
        }
        throw new Error(`${e.message} — ${JSON.stringify(why)}`);
      }
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

    await step('analytics: order_cancel logged', async () => {
      await expectEvent(page, 'order_cancel', (p) => p.order_type === 'reserve' && p.value === 4500);
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

    await step('signed-out buyer returns to the product after signing in (?next)', async () => {
      await page.goto(BASE + '/products/robotics-kit', { waitUntil: 'networkidle2' });
      await sleep(800); // let auth resolve so the buy button is enabled
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        clickByText(page, 'button', /Buy now/i),
      ]);
      const url = new URL(page.url());
      if (url.pathname !== '/login' || url.searchParams.get('next') !== '/products/robotics-kit')
        throw new Error(`expected /login?next=/products/robotics-kit, got ${url.pathname}${url.search}`);
      await typeInto(page, 'input[type="email"]', CUST.email);
      await typeInto(page, 'input[type="password"]', CUST.pass);
      await clickByText(page, 'button', /^Sign in$/i);
      await page.waitForFunction(() => location.pathname === '/products/robotics-kit', {
        timeout: 15000,
      });
    });

    await step('order form pre-fills the address saved from the last order', async () => {
      // This customer reserved earlier with 123 Test Road / Dhaka / 01712345678.
      await sleep(800);
      await clickByText(page, 'button', /Buy now/i);
      await page.waitForSelector('[data-testid="saved-address-note"]', {
        visible: true,
        timeout: 15000,
      });
      const val = (ph) => page.$eval(`input[placeholder="${ph}"]`, (el) => el.value);
      const got = {
        name: await val('Your full name'),
        phone: await val('01XXXXXXXXX'),
        school: await val('Optional'),
        line1: await val('House / road / area'),
        city: await val('City'),
        district: await val('District'),
      };
      const want = {
        name: CUST.name,
        phone: '01712345678',
        school: 'Test School',
        line1: '123 Test Road',
        city: 'Dhaka',
        district: 'Dhaka',
      };
      for (const k of Object.keys(want)) {
        if (got[k] !== want[k]) throw new Error(`${k}: expected "${want[k]}", got "${got[k]}"`);
      }
      // "Use a different address" clears only the address, keeping contact details.
      await page.click('[data-testid="use-different-address"]');
      await page.waitForFunction(
        () => document.querySelector('input[placeholder="House / road / area"]')?.value === ''
      );
      if ((await val('City')) !== '' || (await val('01XXXXXXXXX')) !== '01712345678')
        throw new Error('"Use a different address" should clear the address but keep the phone');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
      // Sign out so the admin journey starts clean.
      await clickByText(page, 'button', /Sign out/i);
      await sleep(1500);
    });

    await step('analytics: login-return funnel + pre-fill / abandon events', async () => {
      await expectEvent(page, 'checkout_login_prompt', (p) => p.item_id === 'bitsflow-robotics-kit');
      await expectEvent(page, 'login', (p) => p.method === 'password' && p.context === 'return');
      await expectEvent(page, 'address_prefilled', (p) => p.order_type === 'order');
      await expectEvent(page, 'use_different_address');
      await expectEvent(page, 'checkout_abandon', (p) => p.order_type === 'order');
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

    await step('analytics: admin pages are never tracked', async () => {
      const adminHits = (await analyticsLog(page)).filter((e) => (e.path || '').startsWith('/admin'));
      if (adminHits.length)
        throw new Error(`admin pages logged ${adminHits.length} event(s): ${adminHits[0].name}`);
    });

    // ---------- 10. Admin: live product management ----------
    const NEW_SLUG = `e2e-widget-${STAMP}`;
    const ROW = `[data-testid="product-row"][data-slug="${NEW_SLUG}"]`;
    const EDITOR = '[data-testid="product-editor"]';

    await step('admin opens the product manager and seeds the live catalog', async () => {
      await page.goto(BASE + '/admin/products', { waitUntil: 'networkidle2' });
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="product-row"]') ||
          document.querySelector('[data-testid="seed-catalog"]'),
        { timeout: 15000 }
      );
      // A fresh emulator has an empty catalog → seed it from the defaults.
      if (await page.$('[data-testid="seed-catalog"]')) {
        await page.click('[data-testid="seed-catalog"]');
      }
      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid="product-row"]').length >= 8,
        { timeout: 20000 }
      );
    });

    await step('admin creates a new product', async () => {
      await page.click('[data-testid="new-product"]');
      await page.waitForSelector(EDITOR, { visible: true });
      await replaceInput(page, `${EDITOR} input[name="name"]`, 'E2E Widget');
      await replaceInput(page, `${EDITOR} input[name="slug"]`, NEW_SLUG);
      await replaceInput(page, `${EDITOR} input[name="price"]`, '777');
      await page.select(`${EDITOR} select[name="status"]`, 'available');
      await clickWhenEnabled(page, '[data-testid="save-product"]');
      try {
        await page.waitForSelector(ROW, { timeout: 15000 });
      } catch {
        const why = await page.evaluate(() => ({
          editorOpen: !!document.querySelector('[data-testid="product-editor"]'),
          editorError: document.querySelector('[data-testid="editor-error"]')?.textContent,
          toast: document.querySelector('[data-testid="admin-toast"]')?.textContent,
          dialogs: [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].map(
            (d) => d.getAttribute('data-testid')
          ),
          slug: document.querySelector('[data-testid="product-editor"] input[name="slug"]')?.value,
        }));
        await page.screenshot({ path: SHOTS + 'fail-create-product.png' });
        throw new Error(`row never appeared — ${JSON.stringify(why)}`);
      }
    });

    await step('new product appears on the live storefront', async () => {
      await page.goto(BASE + '/products', { waitUntil: 'networkidle2' });
      await page.waitForSelector(
        `[data-testid="product-card"][data-slug="${NEW_SLUG}"]`,
        { timeout: 15000 }
      );
    });

    await step('new product page renders client-side with its live price', async () => {
      await page.goto(BASE + `/products/view?slug=${NEW_SLUG}`, { waitUntil: 'networkidle2' });
      await page.waitForSelector(
        `[data-testid="product-detail"][data-slug="${NEW_SLUG}"]`,
        { timeout: 15000 }
      );
      const price = await page.$eval('[data-testid="product-price"]', (el) => el.textContent || '');
      if (!/777/.test(price)) throw new Error(`expected ৳777 on the page, got "${price}"`);
    });

    await step('order is charged the authoritative live (Firestore) price', async () => {
      // This product exists ONLY in Firestore (no static fallback), so a
      // successful order at ৳777 proves the server resolved the live price.
      await clickByText(page, 'button', /Buy now/i);
      await page.waitForSelector('[role="dialog"]', { visible: true });
      // The admin has never ordered → nothing saved → no pre-fill.
      await sleep(1200);
      if (await page.$('[data-testid="saved-address-note"]'))
        throw new Error('first-time buyer should not see a saved-address pre-fill');
      await fillOrderForm(page, ADMIN.name);
      await clickByText(page, 'button', /Place order/i);
      await page.waitForSelector('[data-testid="order-success"]', { timeout: 15000 });
      await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle2' });
      const li = await findByText(page, 'li', /E2E Widget ×1/i, 15000);
      const text = await li.evaluate((e) => e.textContent || '');
      if (!/777/.test(text)) throw new Error(`order total is not ৳777: "${text.slice(0, 160)}"`);
    });

    await step('analytics: purchase logged with the live price', async () => {
      await expectEvent(
        page,
        'purchase',
        (p) =>
          p.order_type === 'order' &&
          p.value === 777 &&
          p.currency === 'BDT' &&
          typeof p.transaction_id === 'string' &&
          p.items?.[0]?.item_id === NEW_SLUG
      );
    });

    await step('admin price edit shows up live on the storefront', async () => {
      await page.goto(BASE + '/admin/products', { waitUntil: 'networkidle2' });
      await page.waitForSelector(ROW, { timeout: 15000 });
      await page.click(`${ROW} [data-testid="edit-product"]`);
      await page.waitForSelector(EDITOR, { visible: true });
      await replaceInput(page, `${EDITOR} input[name="price"]`, '999');
      await clickWhenEnabled(page, '[data-testid="save-product"]');
      await findByText(page, '[data-testid="admin-toast"]', /Saved/i, 15000);
      await page.goto(BASE + `/products/view?slug=${NEW_SLUG}`, { waitUntil: 'networkidle2' });
      await page.waitForFunction(
        () => /999/.test(document.querySelector('[data-testid="product-price"]')?.textContent || ''),
        { timeout: 15000 }
      );
    });

    await step('hiding a product takes it off the storefront', async () => {
      await page.goto(BASE + '/admin/products', { waitUntil: 'networkidle2' });
      await page.waitForSelector(`${ROW}[data-active="true"]`, { timeout: 15000 });
      // The toggle is optimistic, so wait for the server to confirm the PATCH.
      const patched = page.waitForResponse(
        (r) =>
          r.request().method() === 'PATCH' &&
          r.url().includes(`/admin/products/${NEW_SLUG}`) &&
          r.ok(),
        { timeout: 15000 }
      );
      await page.click(`${ROW} [data-testid="toggle-active"]`);
      await patched;
      await page.waitForSelector(`${ROW}[data-active="false"]`, { timeout: 10000 });
      await page.goto(BASE + `/products/view?slug=${NEW_SLUG}`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('[data-testid="product-unavailable"]', { timeout: 15000 });
    });

    await step('admin deletes the product', async () => {
      await page.goto(BASE + '/admin/products', { waitUntil: 'networkidle2' });
      await page.waitForSelector(ROW, { timeout: 15000 });
      await page.click(`${ROW} [data-testid="delete-product"]`);
      await page.waitForSelector('[data-testid="delete-dialog"]', { visible: true });
      await page.click('[data-testid="confirm-delete"]');
      await page.waitForFunction((sel) => !document.querySelector(sel), { timeout: 15000 }, ROW);
    });

    // ---------- screenshots ----------
    await step('capture screenshots', async () => {
      const fs = await import('node:fs');
      fs.mkdirSync(SHOTS, { recursive: true });
      for (const [name, path] of [
        ['home', '/'],
        ['specs', '/specs'],
        ['shop', '/products'],
        ['admin-products', '/admin/products'],
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
