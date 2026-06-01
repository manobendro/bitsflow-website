# Bitsflow website — notes for Claude

## What this is
Astro 5 (static) marketing site + blog + shop/pre-book + user dashboard for the
Bitsflow learning board. Backend is Firebase (Auth, Firestore, Functions,
Hosting, Storage). Primary market: **Bangladesh, currency BDT (৳)**.

**Product positioning (important for copy):** Bitsflow is **inspired by** the BBC
micro:bit and has comparable features (sensors, buttons, BLE/Wi-Fi, plus a 5×5
**RGB** matrix). It is **NOT a micro:bit, NOT compatible** with micro:bit
accessories/add-ons/edge-connector/pin layout, and has **its own** accessory
ecosystem. Never write "micro:bit-compatible", "micro:bit-class edge connector",
or imply shared accessories. Acceptable: "micro:bit-inspired", "as approachable
as a micro:bit".

## Architecture decisions
- **Static + islands**: pages are pre-rendered; interactivity is React islands
  (`src/components/react/*`) hydrated via the Firebase **web** SDK.
- Auth/Firestore reads happen client-side in islands. Anything authoritative
  (order creation, payment) goes through the Functions API at `/api/**`
  (rewrite → `api` function) using the Admin SDK.
- **Payments are pluggable** and currently in "decide later" mode: the default
  provider is `manual` (no live gateway). Implement `PaymentProvider`
  (`functions/src/payments/provider.ts`) and register in `payments/index.ts`.
  BD-friendly candidates: SSLCommerz, bKash, Nagad.
- Server-side prices are authoritative (`functions/src/catalog.ts`); never trust
  client-sent prices.

## Orders & admin
- **Unified `orders` collection** (no more `prebooks`). Each order has a `type`:
  `reserve` (no payment) | `preorder` | `order`, a `status` (pending → confirmed
  → paid → processing → shipped → delivered, or cancelled/refunded), embedded
  `customer` (name/phone/occupation/school) and `shipping` info, optional
  customer `note`, admin `adminNotes`, and a `history[]` audit trail.
- **All order writes go through the Functions API** (`/api/...`); Firestore rules
  deny client writes entirely. Clients only READ their own orders.
  - `POST /api/orders` — create (validates required fields, looks up authoritative price)
  - `POST /api/orders/:id/cancel` — customer self-cancel (only while `pending`; admins anytime)
  - `GET /api/admin/orders` — admin: list all
  - `PATCH /api/admin/orders/:id` — admin: change status / set adminNotes
- **Admin auth**: `functions/src/admin.ts` — `admin:true` custom claim OR email in
  `ADMIN_EMAILS` (currently `mr.manob7@gmail.com`). UI mirror in `AuthNav.tsx`
  shows the Admin link; backend independently enforces. Grant the durable claim:
  `cd functions && npm run set-admin -- <email>` (prod), or for emulator:
  `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=bitsflow-21443 node lib/scripts/setAdmin.js <email>`.
  User must sign out/in for the claim to take effect.
- Order form: `src/components/react/OrderForm.tsx` (modal opened by `ShopActions`).
  Admin UI: `src/components/react/AdminOrders.tsx` at `/admin`.

## Design system
- **Palette = Bangladesh flag**: brand = flag **green** (`--color-brand-600` =
  `#006a4e`), accent = flag **red** (`--color-accent-500` = `#f42a41`). Defined in
  `src/styles/global.css` `@theme`. Use `brand-*` for primary UI, `accent-*` for
  emphasis/destructive.
- **Lyra-style shapes**: crisp, squared corners — NOT pill/blobby. The radius
  scale is tightened in `src/styles/global.css` `@theme` (`--radius-*`), so
  existing `rounded-*` utilities render sharp. Use `rounded-md` for
  buttons/inputs/badges/chips, `rounded-lg` for cards, `rounded-xl` max for big
  panels. **Never use `rounded-full` for chips/badges** (squared only); keep it
  only for spinners. Helpers: `.chip` (squared badge) and `.icon-tile`.
- **Icons: Lucide only, no emoji.** Astro files import from `lucide-astro`
  (`<Icon size={n} />`); React islands import from `lucide-react`. Note Lucide is
  on v1.x here — brand icons like `Chrome` were removed (use `Globe` etc.);
  verify a name exists before importing.
- Brand color tokens `--color-brand-*`, `--color-accent-*`, `--color-ink*` in
  the same `@theme` block.
- **Warm, friendly tone** (audience = non-technical students, teachers, parents
  — not engineers). Page background is `bg-paper` (warm off-white `#fbfaf6`);
  sections alternate paper ↔ `bg-sand` (`#f4f1e9`) — avoid stark white and avoid
  the old dark `bg-ink` section. Cards use the `.card-soft` helper (soft shadow +
  gentle hover lift). Base font-size is 17px for easy reading. Primary buttons
  lift slightly on hover. Ink is a soft green-black, not pure black.
- **Motion**: `.reveal` + `.stagger-1..5` = one-time on-load fade-up (used in the
  hero). `.scroll-reveal` on a grid fades its children up as they scroll into
  view (IntersectionObserver in `BaseLayout.astro`). Both respect
  `prefers-reduced-motion`. `::selection` is brand-green; focus-visible rings are
  brand-500.
- **Bangladesh flag**: use `<Flag size={n} />` (`src/components/Flag.astro`,
  inline SVG) — NOT the 🇧🇩 emoji, which renders as plain "BD" text on Windows.

## Bilingual (EN / বাংলা)
- **Language toggle** in the header (`LangToggle.tsx`); choice saved to
  `localStorage.lang` and reflected on `<html data-lang="en|bn">`. An inline
  script in `BaseLayout.astro` applies it before first paint (no flash).
- **Both languages are rendered into the HTML**; CSS in `global.css`
  (`.lang-en` / `.lang-bn`, keyed on `data-lang`) shows only the active one.
  Default = English.
- In **Astro**, wrap text with `<T en="…" bn="…" />` (`src/components/T.astro`),
  or inline `<span class="lang-en">…</span><span class="lang-bn" lang="bn">…</span>`
  for mixed markup.
- In **React islands**, use `const lang = useLang()` (`useLang.ts`, reactive via
  MutationObserver) + `t('en','bn',lang)` from `src/lib/i18n.ts`. Needed because
  islands don't re-render on the CSS-only switch.
- **Tone**: friendly informal *deshi* Bangla using "tumi" (তুমি), not formal
  "apni". Keep it warm and youthful.
- The **admin UI** (`AdminOrders.tsx`) is intentionally left English-only (staff
  tool). Fonts (loaded in BaseLayout via Google Fonts, set in `--font-sans`):
  **Roboto** for Latin/English, **Noto Sans Bengali** for Bengali (glyph fallback
  picks the right one per script). Bengali headings get tighter line-heights in
  `global.css` (h1 1.2, h2/h3 1.3, body 1.5) — keyed on `html[data-lang='bn']`.

## Conventions
- Money is stored/handled in **BDT taka** (whole units), formatted via
  `src/lib/format.ts` (`formatBDT`).
- Firestore collections: `users`, `products`, `posts`, `orders`.
  Rules in `firestore.rules` — orders are server-write-only; users read only
  their own orders.
- Blog posts: Markdown/MDX in `src/content/blog/`, schema in
  `src/content.config.ts`.
- Path alias `@/*` → `src/*`.
- **Firestore emulator runs on port 9080** (not the default 8080 — that port is
  inside a Windows/Hyper-V reserved exclusion range on this machine and can't be
  bound). Set in `firebase.json` and `src/lib/firebase/client.ts`; keep them in
  sync.

## Commands
- `npm run dev` — Astro dev server (4321)
- `npm run build` / `npm run preview`
- `npm run emulators` — Firebase emulators
- `cd functions && npm run build` — typecheck/build functions
- `npm run deploy` — build + deploy everything
- `node tests/e2e.mjs` — full Puppeteer E2E (needs dev server + emulators running)

## Emulators vs production (`PUBLIC_USE_EMULATORS`)
The web app connects to local emulators iff `PUBLIC_USE_EMULATORS === 'true'`
(gated in `firebase/client.ts` and `lib/api.ts`). This is split by Vite mode so a
production build can never accidentally ship emulator wiring:
- **`.env`** has `PUBLIC_USE_EMULATORS=false` — the value baked into `astro build`
  / `npm run deploy`. **Keep it false.**
- **`.env.development`** has `=true` and is loaded **only** by `astro dev`.
So plain `npm run dev` already talks to emulators; plain `npm run build` does not.

## Still TODO (needs user input / assets)
- ~~Real Firebase project ID + web config~~ — **done** (`.firebaserc` →
  `bitsflow-21443`, `.env` populated; only optional `MEASUREMENT_ID` blank).
- `public/og-default.png` (1200×630) — referenced as the default OG image in
  `BaseLayout`; missing, so social-share previews have no image.
- `public/models/bitsflow.glb` + set `MODEL_URL` in `src/pages/index.astro`
  (3D hero currently renders a procedural fallback — works, just not the real board).
- Choose + implement a payment provider (default is still `manual`).
- Real product photos, copy/pricing review.
- Before first prod use: enable **Email/Password + Google** sign-in providers in the
  Firebase console, and grant the durable admin claim (`cd functions && npm run
  set-admin -- <email>`).
