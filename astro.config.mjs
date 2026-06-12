// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Static-first: every page is prerendered at build time; only the
// /api/* routes opt out with `export const prerender = false` and run
// on Cloudflare's runtime.
export default defineConfig({
  output: 'static',
  adapter: cloudflare(),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
