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
- **Saved checkout / pre-fill**: every successful order also writes
  `users/{uid}.checkout = { customer, shipping, updatedAt }` server-side
  (best-effort, in `handleCreateOrder`). `OrderForm` loads it via
  `src/lib/savedCheckout.ts` and fills only still-empty / auto-filled fields
  (never overwrites typing), shows a "from your last order" note with "Use a
  different address" (clears shipping only). The "pristine" check compares
  against auto-filled values, so pre-filled data doesn't block backdrop-close.

## Store / catalog (LIVE, admin-managed)
- **Products live in Firestore `products/{id}`** and are managed in the admin at
  **`/admin/products`** (`AdminProducts.tsx`; tabs via `AdminNav.tsx`). Edits show
  on the storefront immediately — no redeploy.
- **`src/lib/catalog.ts` is the seed + fallback + shared model**: the
  `CatalogProduct` type, the 8 seed `PRODUCTS`, allowed values
  (`PRODUCT_STATUSES/CATEGORIES/ICONS`, `SLUG_PATTERN`, `RESERVED_SLUGS`=`view`),
  and helpers (`productHref`, `sortProducts`, `publishedOnly`,
  `getFeaturedProducts(list)`, `getProductsByCategory(list)`, `STATIC_SLUGS`).
  The admin "Seed default catalog" action copies the seed into Firestore.
- **Reads**: `src/lib/productsClient.ts` — `fetchLiveProducts()` /
  `fetchLiveProductBySlug()` read the public `products` collection (browser only,
  one cached fetch per page) and fall back to the seed if Firestore is
  empty/unreachable. Call `invalidateLiveProducts()` after admin writes.
- **Writes**: only via the Functions API (Admin SDK, server-validated), admin-only:
  `GET/POST /api/admin/products`, `PATCH/DELETE /api/admin/products/:id`,
  `POST /api/admin/products/seed` — client wrappers in `src/lib/api.ts`,
  server in `functions/src/products.ts`. **`id` and `slug` are immutable.**
- **Pricing is server-authoritative**: order creation resolves the product via
  `getProduct()` in `functions/src/catalog.ts` → Firestore doc (rejects
  `active:false` with 409) → falls back to its static copy of the seed (keep that
  copy in sync with the seed when you change seed prices).
- **Rendering (SSR + live hydration)**: storefront islands (`ProductGrid`
  featured/all, `ProductDetail`) server-render the seed for SEO/first paint, then
  swap in live data after hydration — the first client render must equal the
  server render (state from props; fetch in `useEffect`). Seed products get
  pre-rendered `/products/<slug>` pages (`getStaticPaths`); products created later
  use the client-rendered **`/products/view?slug=…`** (`productHref()` picks the
  right URL; Firebase Hosting also rewrites `/products/**` → `/products/view` for
  any path without a static file).
- **`/shop` is retired** (redirect → `/products` in `astro.config.mjs`). Header
  "Shop" → `/products`; flagship board = `/products/bitsflow-board`.
- **Art**: `ProductArt.tsx` shows `product.image` when set (admin image URL),
  else a hue gradient + dark tile (board keeps its 5×5 RGB grid). Shared card:
  `ProductCard.tsx` (exports `STATUS_BADGE`).
- **React bilingual text**: `src/components/react/T.tsx` emits both languages
  (CSS shows the active one) — use it for display text in islands so SSR never
  flashes the wrong language; use `useLang()` + `t()` only for attributes/strings.
- `prebook` products show Reserve + Pre-order; `available` show Buy now; the API
  validates `productId` and quantity server-side.

## Shared UI primitives (`global.css`, `@layer components`)
`.btn` + `.btn-primary | .btn-secondary | .btn-ghost | .btn-danger` (+ `.btn-lg`,
`.btn-sm`), `.label`, `.input` (styles `aria-invalid="true"`), `.skeleton`
(shimmer). Utilities on the same element override them. Prefer these over
hand-rolled button/input classes. Page scaffolding: `.section`, `.eyebrow`,
`.section-title`, `.section-lede`, `.card-static` (card look, no hover lift),
`.prose-bitsflow` (blog posts), `.skip-link`.
- **Header**: inline nav from `lg` up; below `lg` a hamburger (`#menu-toggle`)
  opens `#mobile-menu` (script in `Header.astro`). `LangToggle` has a
  `variant="block"` for the menu panel.
- **lucide-astro icons take `stroke-width={n}`, not `strokeWidth`** — props are
  spread onto the `<svg>`, so camelCase is silently ignored.

## Analytics (Firebase Analytics → GA4 `G-XCNXR9CT73`)
- One module: **`src/lib/analytics.ts`** — `track(name, params)`, `setUserProps`,
  `productItem(p)`; `initAnalytics()` runs from `BaseLayout.astro`.
- **Modes**: *live* only in the production build (+ measurement ID, supported
  browser, no GPC/Do-Not-Track); *debug* under `astro dev` — nothing is sent,
  events go to the console + `sessionStorage["bf:analytics"]` (the E2E asserts on
  it); *off* for emulator builds, privacy signals and **all `/admin` pages**.
- **Privacy** (audience includes children): Google signals + ad personalisation
  disabled; `track()` drops PII keys (email/phone/name/address/…) and any value
  that looks like an email or BD phone number. **Never put PII in params.**
- **Declarative tags**: add `data-track="<cta_id>"` to any clickable element →
  `cta_click {cta_id, location, link_url}`; `data-track-<x>` adds params,
  `data-track-event` renames the event; `<details data-track>` fires on open.
- **Event catalogue**: `page_view` (auto), `language_change`, `sign_up`/`login`
  {method, context}, `auth_error`, `password_reset_requested`, `view_item_list`,
  `select_item`, `search` {search_term, results}, `filter_products`,
  `sort_products`, `clear_filters`, `view_item`, `view_unavailable_product`,
  `checkout_login_prompt`, `begin_checkout`, `purchase` (orders + pre-orders) /
  `reserve` (reservations, kept out of revenue), `checkout_form_error` {fields},
  `checkout_error`, `checkout_abandon`, `address_prefilled`,
  `use_different_address`, `order_cancel`, `menu_open`, `faq_open`, `cta_click`
  (hero/featured/CTA/nav/footer). User property: `ui_language`.
- Live debugging: open any page with `?ga_debug=1` → events appear in Firebase /
  GA **DebugView** (sticky for the tab; `?ga_debug=0` to stop).

## Auth domain
- `PUBLIC_FIREBASE_AUTH_DOMAIN=bitsflow.cc` — the Google sign-in popup runs on
  `https://bitsflow.cc/__/auth/handler` (Hosting serves `/__/auth/*` on the custom
  domain; `bitsflow.cc` is an authorized Auth domain and a registered redirect URI
  on the Google OAuth client). Password-reset emails pass
  `url: <origin>/login` so "Continue" returns to our site.

## Firestore client rules (learned the hard way)
- **Never trust `getDocs` for "is it empty?"** — when the backend is unreachable
  it silently resolves from the offline cache. Use `getDocsFromServer` wherever
  an empty result drives UI (the dashboard would otherwise tell a customer with
  orders "Nothing here yet"); it throws, so the error + retry state shows.
- `firebase/client.ts` releases Firestore connections on `pagehide` and resumes
  on `pageshow` (bfcache). Without it, pages parked in the back/forward cache keep
  streams open and exhaust the ~6-connection HTTP/1.1 limit to the emulator
  (and some proxies), making later pages go "offline".

## Admin UI notes
- Toasts render bottom-right over the editor footer, so opening the product
  editor clears pending toasts (otherwise a lingering toast swallows the Save
  click). Editor errors show inline.
- E2E hooks: `data-testid` = `seed-catalog`, `new-product`, `product-editor`,
  `save-product`, `product-row` (+`data-slug`, `data-active`), `edit-product`,
  `toggle-active`, `delete-product` → `delete-dialog` → `confirm-delete`,
  `admin-toast`; storefront `product-card`/`product-detail` (+`data-slug`),
  `product-price`, `order-success`, `product-unavailable`.

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
- `npm run emulators` — Firebase emulators, via `scripts/emulators.mjs`, which
  sets `FUNCTIONS_DISCOVERY_TIMEOUT=60` (the 10s default times out on this
  machine → "Cannot determine backend specification" and `/api` 404s). Start
  emulators first, wait for "api … function initialized", then `npm run dev`.
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
