/**
 * Seed catalog + shared product model.
 *
 * Products are LIVE in the Firestore `products` collection and managed from the
 * admin panel (`/admin/products`). This file is:
 *   1. the **seed** — the admin "Seed catalog" action writes these into Firestore;
 *   2. the **fallback** — the storefront renders these when Firestore is empty or
 *      unreachable, and they are pre-rendered into the static HTML for SEO;
 *   3. the **shared type + constants** used by the storefront, admin and API.
 *
 * The *authoritative* price for an order is resolved server-side
 * (`functions/src/catalog.ts` → Firestore doc, falling back to its static copy).
 * Everything is bilingual (EN / বাংলা, friendly "tumi" tone).
 */
import type { Product } from './types';

export type ProductCategory = 'boards' | 'kits' | 'accessories';
export type ProductStatus = Product['status'];

/** Icon key → resolved to a Lucide icon in ProductArt. */
export type ProductIcon =
  | 'board'
  | 'starter'
  | 'robotics'
  | 'sensor'
  | 'battery'
  | 'cable'
  | 'classroom'
  | 'case';

// --- Allowed values (shared by the admin form, client validation and the API) ---
export const PRODUCT_STATUSES: ProductStatus[] = ['available', 'prebook', 'sold_out'];
export const PRODUCT_CATEGORIES: ProductCategory[] = ['boards', 'kits', 'accessories'];
export const PRODUCT_ICONS: ProductIcon[] = [
  'board',
  'starter',
  'robotics',
  'sensor',
  'battery',
  'cable',
  'classroom',
  'case',
];
/** Slug/id format. `view` is reserved for the client-rendered product page. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
export const RESERVED_SLUGS = ['view'];

export interface CatalogProduct extends Product {
  /** Bengali name (English lives in `name`). */
  nameBn: string;
  /** Bengali tagline. */
  taglineBn: string;
  /** Bengali mirror of `highlights` (same order). */
  highlightsBn: string[];
  category: ProductCategory;
  /** Shown in the featured grid on the home page (exactly 6). */
  featured: boolean;
  /** Icon key for the placeholder art. */
  icon: ProductIcon;
  /** Base hue (0–360) for the gradient placeholder — keeps each product distinct. */
  hue: number;
  /** What ships in the box (bilingual). */
  inBox?: { en: string; bn: string }[];
  /** Longer blurb for the detail page. */
  descriptionEn?: string;
  descriptionBn?: string;
  /** Published on the storefront. `false` = hidden + not orderable. Default true. */
  active?: boolean;
  /** Display order (ascending). Default 1000. */
  sortOrder?: number;
  /** Epoch ms, set by the server. */
  createdAt?: number;
  updatedAt?: number;
}

export const CATEGORIES: { key: ProductCategory; en: string; bn: string }[] = [
  { key: 'boards', en: 'Boards', bn: 'বোর্ড' },
  { key: 'kits', en: 'Kits & bundles', bn: 'কিট ও বান্ডল' },
  { key: 'accessories', en: 'Accessories', bn: 'এক্সেসরিজ' },
];

export const PRODUCTS: CatalogProduct[] = [
  {
    id: 'bitsflow-v1',
    slug: 'bitsflow-board',
    name: 'Bitsflow Board',
    nameBn: 'বিটসফ্লো বোর্ড',
    tagline: 'micro:bit-inspired learning board with BLE, Wi-Fi & a 5×5 RGB matrix',
    taglineBn:
      'micro:bit থেকে অনুপ্রেরণা নেওয়া লার্নিং বোর্ড — সাথে BLE, Wi-Fi আর ৫×৫ RGB ম্যাট্রিক্স',
    price: 4500,
    compareAtPrice: 5500,
    currency: 'BDT',
    status: 'prebook',
    category: 'boards',
    featured: true,
    icon: 'board',
    hue: 162,
    highlights: [
      '5×5 full-color RGB LED matrix',
      'Bluetooth LE + Wi-Fi built in',
      'Accelerometer, compass, light & temperature sensors',
      '2 buttons, touch logo + GPIO header',
      'Code with blocks, MicroPython or JavaScript',
      'USB-C, with its own accessory ecosystem',
    ],
    highlightsBn: [
      '৫×৫ ফুল-কালার RGB LED ম্যাট্রিক্স',
      'বিল্ট-ইন Bluetooth LE + Wi-Fi',
      'অ্যাক্সিলারোমিটার, কম্পাস, আলো ও তাপমাত্রার সেন্সর',
      '২টি বাটন, টাচ লোগো + GPIO হেডার',
      'ব্লক, MicroPython বা JavaScript-এ কোড করো',
      'USB-C, নিজস্ব এক্সেসরি ইকোসিস্টেমসহ',
    ],
    inBox: [
      { en: 'Bitsflow board', bn: 'বিটসফ্লো বোর্ড' },
      { en: 'USB-C cable', bn: 'USB-C কেবল' },
      { en: 'Quick-start guide', bn: 'কুইক-স্টার্ট গাইড' },
      { en: 'Sticker pack', bn: 'স্টিকার প্যাক' },
    ],
    descriptionEn:
      'The heart of the Bitsflow family. A pocket-sized board that lights up the moment you write your first line of code — and grows with you from blocks all the way to Wi-Fi projects.',
    descriptionBn:
      'বিটসফ্লো পরিবারের প্রাণ। পকেট সাইজের এই বোর্ডটা প্রথম লাইন কোড লিখতেই জ্বলে ওঠে — আর ব্লক থেকে শুরু করে Wi-Fi প্রজেক্ট পর্যন্ত তোমার সাথে সাথে বড় হয়।',
  },
  {
    id: 'bitsflow-starter-kit',
    slug: 'starter-kit',
    name: 'Starter Kit',
    nameBn: 'স্টার্টার কিট',
    tagline: 'The board plus everything you need to start building on day one',
    taglineBn: 'বোর্ডের সাথে প্রথম দিন থেকেই বানানো শুরু করার সব কিছু',
    price: 6900,
    compareAtPrice: 7900,
    currency: 'BDT',
    status: 'prebook',
    category: 'kits',
    featured: true,
    icon: 'starter',
    hue: 150,
    highlights: [
      'Bitsflow board + rechargeable battery pack',
      'Alligator clips, jumper wires & a mini breadboard',
      'LEDs, buzzer and a few starter components',
      'Printed project cards for your first 10 builds',
      'Sturdy carry case for the whole kit',
    ],
    highlightsBn: [
      'বিটসফ্লো বোর্ড + রিচার্জেবল ব্যাটারি প্যাক',
      'অ্যালিগেটর ক্লিপ, জাম্পার তার আর একটা মিনি ব্রেডবোর্ড',
      'LED, বাজার আর কিছু স্টার্টার কম্পোনেন্ট',
      'প্রথম ১০টা প্রজেক্টের প্রিন্ট করা কার্ড',
      'পুরো কিটের জন্য মজবুত ক্যারি কেস',
    ],
    inBox: [
      { en: 'Bitsflow board', bn: 'বিটসফ্লো বোর্ড' },
      { en: 'Battery pack + USB-C cable', bn: 'ব্যাটারি প্যাক + USB-C কেবল' },
      { en: 'Breadboard & wires', bn: 'ব্রেডবোর্ড আর তার' },
      { en: 'Component pack', bn: 'কম্পোনেন্ট প্যাক' },
      { en: 'Project cards', bn: 'প্রজেক্ট কার্ড' },
      { en: 'Carry case', bn: 'ক্যারি কেস' },
    ],
    descriptionEn:
      'The easiest way to begin. Everything in one box so you can go from unboxing to your first blinking LED in minutes — no extra shopping trips.',
    descriptionBn:
      'শুরু করার সবচেয়ে সহজ উপায়। সব কিছু এক বাক্সে, তাই বাক্স খুলেই কয়েক মিনিটে প্রথম LED জ্বালাতে পারবে — বাড়তি কিছু কিনতে দৌড়াদৌড়ি নেই।',
  },
  {
    id: 'bitsflow-robotics-kit',
    slug: 'robotics-kit',
    name: 'Robotics Add-on Kit',
    nameBn: 'রোবোটিক্স অ্যাড-অন কিট',
    tagline: 'Turn your Bitsflow into a moving, sensing robot',
    taglineBn: 'তোমার বিটসফ্লোকে বানিয়ে ফেলো চলন্ত, বুদ্ধিমান রোবট',
    price: 3200,
    currency: 'BDT',
    status: 'available',
    category: 'kits',
    featured: true,
    icon: 'robotics',
    hue: 178,
    highlights: [
      'Motor driver expansion board',
      '2 geared DC motors + wheels',
      'Chassis, castor and mounting hardware',
      'Line-follow & distance sensor',
      'Snaps onto the Bitsflow GPIO header',
    ],
    highlightsBn: [
      'মোটর ড্রাইভার এক্সপ্যানশন বোর্ড',
      '২টি গিয়ার DC মোটর + চাকা',
      'চেসিস, ক্যাস্টর আর লাগানোর যন্ত্রপাতি',
      'লাইন-ফলো আর দূরত্ব মাপার সেন্সর',
      'বিটসফ্লো GPIO হেডারে সরাসরি লাগে',
    ],
    inBox: [
      { en: 'Motor driver board', bn: 'মোটর ড্রাইভার বোর্ড' },
      { en: '2 motors + wheels', bn: '২টি মোটর + চাকা' },
      { en: 'Chassis kit', bn: 'চেসিস কিট' },
      { en: 'Sensors', bn: 'সেন্সর' },
    ],
    descriptionEn:
      'Build a robot that follows lines, dodges walls and shows its mood on the RGB grid. A favourite for classroom competitions.',
    descriptionBn:
      'এমন রোবট বানাও যেটা লাইন ধরে চলে, দেয়াল এড়িয়ে যায় আর RGB গ্রিডে মন-মেজাজ দেখায়। ক্লাসরুম প্রতিযোগিতার একদম প্রিয়।',
  },
  {
    id: 'bitsflow-sensor-pack',
    slug: 'sensor-pack',
    name: 'Sensor Expansion Pack',
    nameBn: 'সেন্সর এক্সপ্যানশন প্যাক',
    tagline: 'Six plug-and-play sensors to take your projects further',
    taglineBn: 'প্রজেক্টকে আরও দূরে নিতে ছয়টা প্লাগ-অ্যান্ড-প্লে সেন্সর',
    price: 1800,
    currency: 'BDT',
    status: 'available',
    category: 'accessories',
    featured: true,
    icon: 'sensor',
    hue: 192,
    highlights: [
      'Soil moisture, sound & motion sensors',
      'Ultrasonic distance sensor',
      'Servo motor + potentiometer',
      'Plug-in cables included',
      'Works with blocks and code',
    ],
    highlightsBn: [
      'মাটির আর্দ্রতা, শব্দ আর মোশন সেন্সর',
      'আল্ট্রাসনিক দূরত্ব সেন্সর',
      'সার্ভো মোটর + পটেনশিওমিটার',
      'সাথে প্লাগ-ইন কেবল দেওয়া',
      'ব্লক আর কোড দুটোতেই চলে',
    ],
    inBox: [
      { en: '6 sensor modules', bn: '৬টি সেন্সর মডিউল' },
      { en: 'Connecting cables', bn: 'কানেক্টিং কেবল' },
      { en: 'Guide card', bn: 'গাইড কার্ড' },
    ],
    descriptionEn:
      'Measure the world around you — moisture, distance, sound and more. Perfect for science-fair projects and smart-home experiments.',
    descriptionBn:
      'চারপাশটা মেপে দেখো — আর্দ্রতা, দূরত্ব, শব্দ আরও কত কী। সায়েন্স ফেয়ার প্রজেক্ট আর স্মার্ট-হোম এক্সপেরিমেন্টের জন্য দারুণ।',
  },
  {
    id: 'bitsflow-battery-pack',
    slug: 'battery-pack',
    name: 'Rechargeable Battery Pack',
    nameBn: 'রিচার্জেবল ব্যাটারি প্যাক',
    tagline: 'Cut the cord and take your build anywhere',
    taglineBn: 'তার খুলে ফেলো, প্রজেক্ট নিয়ে যাও যেখানে খুশি',
    price: 950,
    currency: 'BDT',
    status: 'available',
    category: 'accessories',
    featured: true,
    icon: 'battery',
    hue: 138,
    highlights: [
      'Rechargeable Li-ion cell',
      'USB-C charging',
      'Snug fit on the back of the board',
      'On/off switch + charge indicator',
      'Hours of portable play',
    ],
    highlightsBn: [
      'রিচার্জেবল লি-আয়ন সেল',
      'USB-C দিয়ে চার্জ',
      'বোর্ডের পেছনে ঠিকঠাক বসে যায়',
      'অন/অফ সুইচ + চার্জ ইনডিকেটর',
      'ঘণ্টার পর ঘণ্টা পোর্টেবল মজা',
    ],
    inBox: [
      { en: 'Battery pack', bn: 'ব্যাটারি প্যাক' },
      { en: 'Mounting clip', bn: 'লাগানোর ক্লিপ' },
    ],
    descriptionEn:
      'Wearables, robots, roaming weather stations — anything that needs to move needs this. Clips right onto the board.',
    descriptionBn:
      'ওয়্যারেবল, রোবট, ঘুরে বেড়ানো আবহাওয়া স্টেশন — নড়াচড়া করে এমন সব কিছুর জন্য এটা লাগবেই। বোর্ডে সরাসরি ক্লিপ হয়ে যায়।',
  },
  {
    id: 'bitsflow-usbc-cable',
    slug: 'usb-c-cable',
    name: 'USB-C Cable',
    nameBn: 'USB-C কেবল',
    tagline: 'A tough spare cable for power, code and data',
    taglineBn: 'পাওয়ার, কোড আর ডেটার জন্য মজবুত একটা বাড়তি কেবল',
    price: 250,
    currency: 'BDT',
    status: 'available',
    category: 'accessories',
    featured: true,
    icon: 'cable',
    hue: 206,
    highlights: [
      '1 metre braided cable',
      'USB-A to USB-C',
      'Data + charge in one',
      'Extra durable connectors',
    ],
    highlightsBn: [
      '১ মিটার ব্রেইডেড কেবল',
      'USB-A থেকে USB-C',
      'একসাথে ডেটা + চার্জ',
      'বাড়তি মজবুত কানেক্টর',
    ],
    inBox: [{ en: '1× USB-C cable', bn: '১টি USB-C কেবল' }],
    descriptionEn:
      'Keep a spare in your bag so a lost cable never stops a lesson. Also charges phones and other USB-C gear.',
    descriptionBn:
      'ব্যাগে একটা বাড়তি রাখো, যেন কেবল হারালেও ক্লাস থেমে না যায়। ফোন আর অন্য USB-C জিনিসও চার্জ করে।',
  },
  {
    id: 'bitsflow-classroom-pack',
    slug: 'classroom-pack',
    name: 'Classroom Pack (×10)',
    nameBn: 'ক্লাসরুম প্যাক (×১০)',
    tagline: 'Ten boards, cables and a teacher guide — a whole class, sorted',
    taglineBn: 'দশটা বোর্ড, কেবল আর টিচার গাইড — গোটা ক্লাস একসাথে',
    price: 39000,
    compareAtPrice: 45000,
    currency: 'BDT',
    status: 'prebook',
    category: 'kits',
    featured: false,
    icon: 'classroom',
    hue: 350,
    highlights: [
      '10 Bitsflow boards + 10 USB-C cables',
      'Printed teacher guide & lesson plans',
      'Stackable storage tray',
      'Best value per board',
      'Priority support for schools',
    ],
    highlightsBn: [
      '১০টি বিটসফ্লো বোর্ড + ১০টি USB-C কেবল',
      'প্রিন্ট করা টিচার গাইড আর লেসন প্ল্যান',
      'স্ট্যাক করা যায় এমন স্টোরেজ ট্রে',
      'প্রতি বোর্ডে সবচেয়ে সাশ্রয়ী',
      'স্কুলের জন্য প্রায়োরিটি সাপোর্ট',
    ],
    inBox: [
      { en: '10 boards + 10 cables', bn: '১০টি বোর্ড + ১০টি কেবল' },
      { en: 'Teacher guide', bn: 'টিচার গাইড' },
      { en: 'Storage tray', bn: 'স্টোরেজ ট্রে' },
    ],
    descriptionEn:
      'Everything a teacher needs to run coding in the classroom, at the best per-board price. Lesson plans map straight to the block editor.',
    descriptionBn:
      'ক্লাসরুমে কোডিং চালাতে একজন শিক্ষকের যা যা লাগে, সব — আর প্রতি বোর্ডে সেরা দামে। লেসন প্ল্যানগুলো সরাসরি ব্লক এডিটরের সাথে মেলে।',
  },
  {
    id: 'bitsflow-carry-case',
    slug: 'carry-case',
    name: 'Carry Case',
    nameBn: 'ক্যারি কেস',
    tagline: 'Keep your board and bits safe on the go',
    taglineBn: 'বোর্ড আর ছোট যন্ত্রপাতি নিরাপদে সাথে নিয়ে ঘোরো',
    price: 650,
    currency: 'BDT',
    status: 'available',
    category: 'accessories',
    featured: false,
    icon: 'case',
    hue: 120,
    highlights: [
      'Hard-shell zip case',
      'Cut-foam insert for board + parts',
      'Fits battery, cable and small components',
      'Light and school-bag friendly',
    ],
    highlightsBn: [
      'শক্ত খোলসের জিপ কেস',
      'বোর্ড + পার্টসের জন্য কাটা-ফোম ইনসার্ট',
      'ব্যাটারি, কেবল আর ছোট কম্পোনেন্ট ধরে',
      'হালকা, স্কুল-ব্যাগ ফ্রেন্ডলি',
    ],
    inBox: [{ en: 'Carry case', bn: 'ক্যারি কেস' }],
    descriptionEn:
      'A neat home for your Bitsflow so nothing gets lost between home and school.',
    descriptionBn:
      'তোমার বিটসফ্লোর একটা গোছানো ঘর, যাতে বাসা থেকে স্কুলের পথে কিছু হারিয়ে না যায়।',
  },
];

// Seed defaults: published, ordered as listed above.
PRODUCTS.forEach((p, i) => {
  p.active ??= true;
  p.sortOrder ??= (i + 1) * 10;
});

/** Slugs that have a pre-rendered page at /products/<slug> (built from the seed). */
export const STATIC_SLUGS: string[] = PRODUCTS.map((p) => p.slug);

/**
 * Link to a product's detail page. Seed products have a pre-rendered page;
 * products created later in the admin are served by the client-rendered
 * `/products/view` page (production also rewrites `/products/**` there).
 */
export function productHref(slug: string): string {
  return STATIC_SLUGS.includes(slug)
    ? `/products/${slug}`
    : `/products/view?slug=${encodeURIComponent(slug)}`;
}

/** Stable storefront ordering: sortOrder ascending, then name. */
export function sortProducts<T extends CatalogProduct>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      (a.sortOrder ?? 1000) - (b.sortOrder ?? 1000) || a.name.localeCompare(b.name)
  );
}

/** Only products that should appear on the storefront. */
export function publishedOnly<T extends CatalogProduct>(list: T[]): T[] {
  return list.filter((p) => p.active !== false);
}

/** All seed products. */
export function getAllProducts(): CatalogProduct[] {
  return PRODUCTS;
}

/** Featured products (the home page shows 6). Works on any list. */
export function getFeaturedProducts(list: CatalogProduct[] = PRODUCTS): CatalogProduct[] {
  return sortProducts(publishedOnly(list)).filter((p) => p.featured);
}

/** Look up a seed product by its URL slug. */
export function getProductBySlug(slug: string): CatalogProduct | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

/** Products grouped by category, in CATEGORIES order (empty groups omitted). */
export function getProductsByCategory(list: CatalogProduct[] = PRODUCTS): {
  key: ProductCategory;
  en: string;
  bn: string;
  items: CatalogProduct[];
}[] {
  const visible = sortProducts(publishedOnly(list));
  return CATEGORIES.map((c) => ({
    ...c,
    items: visible.filter((p) => p.category === c.key),
  })).filter((g) => g.items.length > 0);
}
