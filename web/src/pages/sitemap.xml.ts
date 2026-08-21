import { SITE_URL } from '../lib/config';
import type { APIRoute } from 'astro';

// Static pages only. This used to pull every answered question from
// /api/sitemap and emit a /q/<slug> URL for each one, which handed real student
// questions to search engines. Questions are private now — nothing here is
// derived from what anyone asked.
export const prerender = true;

const STATIC = ['/', '/about', '/error'];

export const GET: APIRoute = () => {
  const base = SITE_URL;

  const urls = STATIC
    .map((p) => `<url><loc>${base}${p}</loc><changefreq>weekly</changefreq></url>`)
    .join('');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } },
  );
};
