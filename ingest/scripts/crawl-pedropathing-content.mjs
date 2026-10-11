import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const cache = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../vendor/linkcache');
const pages = JSON.parse(fs.readFileSync(path.join(cache, 'pedropathing.json'), 'utf8'));
const out = [];
const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
for (let i = 0; i < pages.length; i += 4) {
  const batch = await Promise.all(pages.slice(i, i + 4).map(async (entry) => {
    const res = await fetch(entry.url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`${entry.url}: HTTP ${res.status}`);
    const html = await res.text();
    const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
      || html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
    if (!article) throw new Error(`${entry.url}: no article content`);
    const text = decode(article.replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(p|h[1-6]|pre|li|section|div)>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
    if (text.length < 120) throw new Error(`${entry.url}: empty documentation`);
    return { ...entry, text: text.slice(0, 30000) };
  }));
  out.push(...batch);
  console.log(`[pedro] refreshed ${out.length}/${pages.length}`);
}
fs.writeFileSync(path.join(cache, 'pedropathing-content.json'), JSON.stringify(out, null, 1));
