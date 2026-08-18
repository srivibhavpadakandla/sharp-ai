import type { APIRoute } from 'astro';

export const prerender = true;

export const GET: APIRoute = () => new Response(
  ['User-agent: *',
   'Allow: /',
   'Disallow: /ask',
   '',
   'Sitemap: https://sharp-ai-8a1.pages.dev/sitemap.xml',
   ''].join('\n'),
  { headers: { 'content-type': 'text/plain; charset=utf-8' } },
);
