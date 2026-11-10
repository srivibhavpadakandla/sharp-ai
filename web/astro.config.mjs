import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// The website is static; the separate Worker serves the API.
export default defineConfig({
  output: 'static',
  integrations: [react()],
  site: process.env.PUBLIC_SITE_URL || 'https://sharpftc.pages.dev',
  devToolbar: { enabled: false },
  vite: { ssr: { external: ['node:buffer'] }, server: {
    watch: { usePolling: true },
    proxy: { '/api': { target: 'https://sharp-ai.srivibhavp.workers.dev', changeOrigin: true, headers: { origin: 'https://sharpftc.pages.dev' } } },
  } },
});
