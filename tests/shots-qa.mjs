/**
 * Visual QA capture: key public pages at desktop (1280) and mobile (390),
 * plus the mobile menu opened and a couple of Bengali views.
 * Usage: BASE_URL=http://localhost:4321 node tests/shots-qa.mjs
 */
import puppeteer from 'puppeteer';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const CHROME_PATH =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = new URL('./shots/qa/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const fs = await import('node:fs');
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  ['home', '/'],
  ['products', '/products'],
  ['pdp-board', '/products/bitsflow-board'],
  ['pdp-robotics', '/products/robotics-kit'],
  ['login', '/login'],
  ['specs', '/specs'],
  ['blog', '/blog'],
  ['404', '/definitely-not-a-page'],
];

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: CHROME_PATH,
  args: ['--no-sandbox'],
});

async function capture(width, height, tag, lang = 'en') {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((l) => {
    try {
      localStorage.setItem('lang', l);
    } catch {}
  }, lang);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [name, path] of PAGES) {
    await page.goto(BASE + path, { waitUntil: 'networkidle2' });
    // Reveal scroll-reveal content for a faithful full-page capture.
    await page.evaluate(() =>
      document.querySelectorAll('.scroll-reveal').forEach((el) => el.classList.add('in-view'))
    );
    await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({ path: `${OUT}${tag}-${name}.png`, fullPage: true });
  }
  if (width < 768) {
    // Open the mobile menu (the hamburger exposes aria-expanded).
    await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
    const btn = await page.$('header button[aria-expanded]');
    if (btn) {
      await btn.click();
      await new Promise((r) => setTimeout(r, 500));
      await page.screenshot({ path: `${OUT}${tag}-menu-open.png` });
    } else {
      console.log(`  [${tag}] no header button[aria-expanded] found (mobile menu?)`);
    }
  }
  if (errors.length) console.log(`  [${tag}] page errors:`, [...new Set(errors)].slice(0, 5));
  await page.close();
  console.log(`captured ${tag}`);
}

await capture(1280, 900, 'desk');
await capture(390, 844, 'mob');
await capture(390, 844, 'mob-bn', 'bn');
await browser.close();
console.log('done →', OUT);
