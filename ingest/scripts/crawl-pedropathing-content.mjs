import { chromium } from 'playwright';
import fs from 'node:fs';
const CACHE = '/Users/srivibhavp/sharp-ai/ingest/vendor/linkcache/pedropathing.json';
const pages = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
const b = await chromium.launch();
const p = await b.newPage();
const out = [];
for (const [i, entry] of pages.entries()) {
  try {
    await p.goto(entry.url, { waitUntil: 'networkidle', timeout: 45000 });
    await p.waitForTimeout(1200);
    const text = await p.evaluate(() => {
      const main = document.querySelector('main, article, [class*="content"], [class*="doc"]') || document.body;
      for (const n of main.querySelectorAll('nav, header, footer, script, style, [class*="sidebar"], [class*="nav"]')) n.remove();
      return (main.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
    });
    if (text && text.length > 200) out.push({ ...entry, text: text.slice(0, 12000) });
    process.stdout.write(`\r${i + 1}/${pages.length} ok=${out.length}   `);
  } catch { /* skip a page rather than fail the crawl */ }
}
fs.writeFileSync('/Users/srivibhavp/sharp-ai/ingest/vendor/linkcache/pedropathing-content.json', JSON.stringify(out, null, 1));
console.log(`\ncrawled ${out.length} pages, ${out.reduce((n, x) => n + x.text.length, 0).toLocaleString()} chars`);
console.log('sample:', out.find(x => /tuning/i.test(x.title))?.text.slice(0, 180).replace(/\n/g, ' '));
await b.close();
