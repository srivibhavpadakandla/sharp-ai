import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('https://pedropathing.com/docs/pathing', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(3000);
const links = await p.evaluate(() => {
  const seen = new Map();
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    if (!href.startsWith('/docs')) continue;
    const title = (a.textContent || '').trim().replace(/\s+/g, ' ');
    if (!title || title.length > 80) continue;
    const url = new URL(href, location.origin).href.replace(/\/$/, '');
    if (!seen.has(url)) seen.set(url, title);
  }
  return [...seen].map(([url, title]) => ({
    title, url,
    docPath: new URL(url).pathname.replace(/^\/|\/$/g, ''),
    headingPath: ['Pedro Pathing'],
  }));
});
fs.mkdirSync('/Users/srivibhavp/sharp-ai/ingest/vendor/linkcache', { recursive: true });
fs.writeFileSync('/Users/srivibhavp/sharp-ai/ingest/vendor/linkcache/pedropathing.json', JSON.stringify(links, null, 1));
console.log('cached', links.length, 'pedro pathing pages');
await b.close();
