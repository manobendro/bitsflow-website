# Bitsflow website

Marketing site, blog, shop/pre-book flow and user dashboard for the **Bitsflow**
learning board — a micro:bit–inspired board with BLE, Wi-Fi and a 5×5 RGB matrix.
(Bitsflow is its own board, not a micro:bit and not compatible with micro:bit hardware.)

## Stack

- **Astro 5** (static output) — home, blog, product/shop pages pre-rendered.
- **React islands** — 3D hero, auth, checkout/pre-book, dashboard (hydrated in
  the browser).
- **Three.js** via `@react-three/fiber` + `drei` — interactive 3D board hero.
- **Tailwind CSS v4** — styling + typography.
- **Firebase** — Auth, Firestore, Cloud Functions, Hosting, Storage.

## Project layout

```
src/
  components/         Astro components + react/ islands
  content/blog/       Markdown/MDX blog posts (Astro content collections)
  layouts/            BaseLayout.astro
  lib/                firebase client, api client, types, formatting
  pages/              index, shop, login, blog/, dashboard/
  styles/global.css   Tailwind v4 + design tokens
public/models/        drop bitsflow.glb here (see its README)
functions/            Firebase Functions API (orders + payments)
firestore.rules       security rules
```

## Getting started

```bash
npm install
cp .env.example .env          # fill with your Firebase web config
npm run dev                   # http://localhost:4321
```

### Backend (Functions)

```bash
cd functions && npm install && npm run build
```

### Local Firebase emulators

```bash
# set PUBLIC_USE_EMULATORS=true in .env first
npm run emulators
```

## Configure before going live

1. `.firebaserc` → set your Firebase **project ID**.
2. `.env` → Firebase web SDK config (Console → Project settings → Web app).
3. `astro.config.mjs` → set `site` to your real domain.
4. `public/models/bitsflow.glb` → add the model, then set `MODEL_URL` in
   `src/pages/index.astro`.
5. Payments: implement a `PaymentProvider` in `functions/src/payments/` and set
   `PAYMENT_PROVIDER`. Default is `manual` (no live gateway).

## Deploy

```bash
npm run deploy            # builds the site + deploys hosting, functions, rules
# or just the static site:
npm run deploy:hosting
```
