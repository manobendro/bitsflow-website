/** Capture the new multi-product store (EN + a BN storefront). */
import puppeteer from 'puppeteer';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const CHROME_PATH =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = new URL('./shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: CHROME_PATH,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 2 });

async function shot(path, name, lang) {
  if (lang === 'bn') {
    await page.evaluateOnNewDocument(() => {
      try { localStorage.setItem('lang', 'bn'); } catch {}
    });
  }
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: `${OUT}store-${name}.png`, fullPage: name === 'home' || name === 'products' });
  console.log(`shot store-${name}`);
}

await shot('/', 'home', 'en');
await shot('/products', 'products', 'en');
await shot('/products/robotics-kit', 'detail', 'en');
await shot('/products', 'products-bn', 'bn');
await browser.close();
console.log('done');
