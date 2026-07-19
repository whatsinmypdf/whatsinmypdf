import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://whatsinmypdf.com',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: { exclude: ['mupdf'] },
    // mupdf uses top-level await, which requires ES-module workers (the default
    // 'iife' worker format cannot bundle it). Matches the `{ type: 'module' }`
    // Worker constructed in Scanner.tsx.
    worker: { format: 'es' },
  },
});
