import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';

// Static everywhere except the pages that must be server-rendered for Google
// (/q/<slug>) — those opt in per-page with `export const prerender = false`.
export default defineConfig({
  output: 'static',
  adapter: cloudflare({ imageService: 'passthrough' }),
  integrations: [react()],
  site: 'https://sharp-ai-8a1.pages.dev',
  devToolbar: { enabled: false },
  vite: { ssr: { external: ['node:buffer'] } },
});
