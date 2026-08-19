import { SITE_URL } from '../lib/config';
import type { APIRoute } from 'astro';

export const prerender = true;

export const GET: APIRoute = () => new Response(
  ['User-agent: *',
   'Allow: /',
   'Disallow: /ask',
   '',
   `Sitemap: ${SITE_URL}/sitemap.xml`,
   ''].join('\n'),
  { headers: { 'content-type': 'text/plain; charset=utf-8' } },
);
