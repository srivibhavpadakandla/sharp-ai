import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cache = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../vendor/linkcache');
const response = await fetch('https://pedropathing.com/docs/pathing', { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Pedro navigation returned ${response.status}`);
const html = await response.text();
const links = new Map();
for (const match of html.matchAll(/<a\b[^>]*href="(\/docs[^"#]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
  const title = match[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  if (!title || title.length > 100) continue;
  const url = new URL(match[1], 'https://pedropathing.com').href.replace(/\/$/, '');
  if (!links.has(url)) links.set(url, { title, url, docPath: new URL(url).pathname.slice(1), headingPath: ['Pedro Pathing'] });
}
if (links.size < 10) throw new Error(`Pedro navigation incomplete: ${links.size} pages`);
fs.mkdirSync(cache, { recursive: true });
fs.writeFileSync(path.join(cache, 'pedropathing.json'), JSON.stringify([...links.values()], null, 1));
console.log(`[pedro] ${links.size} documentation pages discovered`);
