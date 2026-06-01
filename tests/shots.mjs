/** Quick visual capture for the design pass. Shoots header + hero in EN/BN. */
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
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });

async function shot(name, lang) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  if (lang === 'bn') {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-lang', 'bn');
      localStorage.setItem('lang', 'bn');
    });
  }
  await new Promise((r) => setTimeout(r, 700));
  // header strip
  const header = await page.$('header');
  await header.screenshot({ path: `${OUT}header-${name}.png` });
  // full hero viewport
  await page.screenshot({ path: `${OUT}hero-${name}.png` });
  console.log(`shot ${name}`);
}

await shot('en', 'en');
await shot('bn', 'bn');
await browser.close();
console.log('done');
