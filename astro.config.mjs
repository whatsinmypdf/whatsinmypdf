import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://whatsinmypdf.com',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh'],
    routing: {
      // English keeps living at the root (no /en/ prefix, no auto-redirect);
      // zh pages are manually authored under src/pages/zh/.
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    react(),
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', zh: 'zh-CN' },
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: { exclude: ['mupdf'] },
    // mupdf uses top-level await, which requires ES-module workers (the default
    // 'iife' worker format cannot bundle it). Matches the `{ type: 'module' }`
    // Worker constructed in Scanner.tsx.
    worker: { format: 'es' },
  },
});
