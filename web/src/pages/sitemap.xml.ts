import type { APIRoute } from 'astro';
import { API_BASE } from '../lib/config';

// Rendered on request so newly answered questions appear without a rebuild.
export const prerender = false;

const STATIC = ['/', '/about', '/error'];

export const GET: APIRoute = async () => {
  const base = 'https://sharp-ai-8a1.pages.dev';
  let slugs: Array<{ slug: string; updated_at: string }> = [];
  try {
    const res = await fetch(`${API_BASE}/api/sitemap`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) slugs = (await res.json()).slugs || [];
  } catch { /* still emit the static pages */ }

  const urls = [
    ...STATIC.map((p) => `<url><loc>${base}${p}</loc><changefreq>weekly</changefreq></url>`),
    ...slugs.map((s) =>
      `<url><loc>${base}/q/${encodeURIComponent(s.slug)}</loc>` +
      `<lastmod>${(s.updated_at || '').slice(0, 10)}</lastmod></url>`),
  ].join('');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } },
  );
};
