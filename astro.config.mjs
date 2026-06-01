// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Static output: home/blog/product/shop are pre-rendered to HTML and served
// cheaply from Firebase Hosting. Interactive parts (3D hero, auth, dashboard,
// checkout) are React islands hydrated in the browser via the Firebase web SDK.
// https://astro.build/config
export default defineConfig({
  site: 'https://bitsflow.cc',
  output: 'static',
  integrations: [react(), mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
