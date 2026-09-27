/** Capture key pages in Bengali to verify the translation pass. */
import puppeteer from 'puppeteer';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5000';
const CHROME_PATH =
  process.env.CHROME_PATH ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = new URL('./shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: CHROME_PATH,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 2 });

// Pre-seed Bengali so the very first paint is BN.
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('lang', 'bn');
  } catch {}
});

async function shot(path, name) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: `${OUT}bn-${name}.png` });
  console.log(`shot bn-${name}`);
}

await shot('/', 'home');
await shot('/specs', 'specs');
await shot('/shop', 'shop');
await shot('/blog', 'blog');
await browser.close();
console.log('done');
