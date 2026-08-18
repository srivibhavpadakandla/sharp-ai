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


/**
 * Pedro Pathing. The most-refused topic in the query log by a wide margin —
 * every one of the six most recent refusals before this was asked about it.
 *
 * No licence and no sitemap, and the docs nav is client-rendered, so the link
 * list is captured with a headless browser and cached. Titles and URLs only,
 * like the rest of the link-only sources.
 */
export const pedropathing = {
  meta: {
    sourceId: 'pedropathing', sourceName: 'Pedro Pathing',
    homepage: 'https://pedropathing.com',
    license: 'All rights reserved (no licence published)',
    licenseUrl: null,
    attribution: 'Pedro Pathing — https://pedropathing.com — indexed by title and link only',
    canExcerpt: false, priority: 60, linkOnly: true,
    category: () => 'odometry',
  },
  async loadChunks() {
    const entries = await cached('pedropathing', async () => {
      throw new Error('run ingest/scripts/crawl-pedropathing.mjs to refresh this cache');
    });
    return linkChunks(entries, this.meta);
  },
};

/**
 * The official FIRST rules surfaces. These are FIRST copyright and not openly
 * licensed, so only the landing pages are named and linked — never a rule and
 * never its wording. Sharp AI should be able to answer "where are the rules"
 * with the right destination instead of a shrug.
 */
export const firstRules = {
  meta: {
    sourceId: 'first-rules', sourceName: 'FIRST Official',
    homepage: 'https://www.firstinspires.org',
    license: 'FIRST copyright — not openly licensed',
    licenseUrl: null,
    attribution: 'FIRST — https://www.firstinspires.org — landing pages linked, no text reproduced',
    canExcerpt: false, priority: 1, linkOnly: true,
    category: () => 'rules',
  },
  async loadChunks() {
    const entries = [
      {
        title: 'Game and Season Materials — Competition Manual, Game Manual Part 1 and Part 2',
        url: 'https://www.firstinspires.org/resource-library/ftc/game-and-season-info',
        docPath: 'game-and-season-info', headingPath: ['FIRST Official'],
      },
      {
        title: 'Official FTC Question and Answer System — binding rule interpretations',
        url: 'https://ftc-qa.firstinspires.org',
        docPath: 'qa', headingPath: ['FIRST Official'],
      },
    ];
    return linkChunks(entries, this.meta);
  },
};
