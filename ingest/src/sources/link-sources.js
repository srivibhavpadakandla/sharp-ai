/**
 * Documentation that FTC teams rely on but which is not openly licensed.
 *
 * Each of these is indexed by metadata only — title, heading path, URL — and
 * registered with canExcerpt false, so the Worker contributes the link and
 * never the text. See lib/linkindex.js for why.
 *
 * If any of these publishes an open licence later, the source moves to a full
 * Sphinx/Markdown adapter and can_excerpt flips to true. Nothing else changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseGitbookSummary, resolveSitemap, fetchTitle, linkChunks } from '../lib/linkindex.js';

const CACHE = path.join(process.cwd(), 'vendor', 'linkcache');

async function cached(name, fn) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${name}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const data = await fn();
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
  return data;
}

const gitbook = (id, name, homepage, repo, branch, category) => ({
  meta: {
    sourceId: id, sourceName: name, homepage,
    license: 'All rights reserved (no licence published)',
    licenseUrl: null,
    attribution: `${name} — ${homepage} — indexed by title and link only`,
    canExcerpt: false, priority: 60, linkOnly: true,
    category: () => category,
  },
  async loadChunks() {
    const entries = await cached(id, async () => {
      const res = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/SUMMARY.md`);
      if (!res.ok) throw new Error(`${id}: SUMMARY.md ${res.status}`);
      return parseGitbookSummary(await res.text(), { baseUrl: homepage });
    });
    return linkChunks(entries, this.meta);
  },
});

const sitemapped = (id, name, homepage, sitemap, category, keep = () => true) => ({
  meta: {
    sourceId: id, sourceName: name, homepage,
    license: 'All rights reserved (no licence published)',
    licenseUrl: null,
    attribution: `${name} — ${homepage} — indexed by title and link only`,
    canExcerpt: false, priority: 60, linkOnly: true,
    category: () => category,
  },
  async loadChunks() {
    const entries = await cached(id, async () => {
      const urls = (await resolveSitemap(sitemap)).filter(keep);
      const out = [];
      // Titles are fetched one at a time and nothing else is read from the page.
      for (const url of urls) {
        const title = await fetchTitle(url);
        if (!title) continue;
        const slug = new URL(url).pathname.replace(/^\/|\/$/g, '') || 'index';
        out.push({ title, headingPath: [], url, docPath: slug });
      }
      return out;
    });
    return linkChunks(entries, this.meta);
  },
});

export const ctrlaltftc = gitbook(
  'ctrlaltftc', 'CTRL ALT FTC', 'https://www.ctrlaltftc.com',
  'BenCaunt/CTRL-ALT-FTC', 'master', 'programming',
);

export const ftclib = gitbook(
  'ftclib', 'FTCLib', 'https://docs.ftclib.org',
  'FTCLib/FTCLib-Docs', 'master', 'programming',
);

export const roadrunner = sitemapped(
  'roadrunner', 'Road Runner', 'https://rr.brott.dev',
  'https://rr.brott.dev/sitemap.xml', 'odometry',
);

export const rev = sitemapped(
  'rev', 'REV Robotics Docs', 'https://docs.revrobotics.com',
  'https://docs.revrobotics.com/sitemap.xml', 'electronics',
);
