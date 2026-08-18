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
    license: 'No licence published — summarised, never reproduced',
    licenseUrl: null,
    attribution: 'Pedro Pathing — https://pedropathing.com — paraphrased, not reproduced',
    canExcerpt: false,
    summarizeOnly: true,
    priority: 30,
    category: () => 'odometry',
  },

  /**
   * Promoted from link-only to SUMMARISE. Titles alone could route someone to
   * the tuning page but could not tell them what tuning involves, and Pedro
   * Pathing is the single most asked-about topic in the query log.
   *
   * The docs publish no licence, so the same rule as the Competition Manual
   * applies: the text reaches the model and nothing else. It is never placed in
   * excerpts, so it cannot appear in the sources panel or on a /q/ page — the
   * answer explains the concept in its own words and links the page.
   */
  async loadChunks() {
    const pages = await cached('pedropathing-content', async () => {
      throw new Error('run ingest/scripts/crawl-pedropathing-content.mjs first');
    });
    const out = [];
    for (const page of pages) {
      const body = String(page.text || '').trim();
      if (body.length < 200) continue;
      // Split long pages on blank lines so a chunk is never cut mid-paragraph.
      const parts = [];
      let buf = [], len = 0;
      for (const para of body.split(/\n\s*\n/)) {
        if (len && len + para.length > 2400) { parts.push(buf.join('\n\n')); buf = []; len = 0; }
        buf.push(para); len += para.length + 2;
      }
      if (buf.length) parts.push(buf.join('\n\n'));

      parts.forEach((text, i) => {
        out.push({
          sourceId: this.meta.sourceId,
          sourceName: this.meta.sourceName,
          docPath: page.docPath + (parts.length > 1 ? `-${i + 1}` : ''),
          pageTitle: page.title,
          sectionTitle: page.title,
          headingPath: `Pedro Pathing > ${page.title}`,
          anchor: '',
          sourceUrl: page.url,
          category: 'odometry',
          license: this.meta.license,
          canExcerpt: 0,
          excerptMode: 'summarize',
          text: `# Pedro Pathing\n## ${page.title}\n\n${text}`,
          ordinal: out.length,
          part: parts.length > 1 ? i + 1 : 0,
          partCount: parts.length,
        });
      });
    }
    return out;
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

/**
 * Chief Delphi — FTC-tagged topics only.
 *
 * The full forum sitemap is 22 files of 10,000 URLs each: roughly 220,000
 * pages, overwhelmingly FRC. Indexing that would be seventy times the whole
 * rest of the corpus and would bury real FTC documentation under unrelated
 * discussion. Discourse exposes /tag/ftc.json, which is the correct filter, so
 * only FTC-tagged threads are indexed — titles and links, capped.
 */
export const chiefdelphi = {
  meta: {
    sourceId: 'chiefdelphi', sourceName: 'Chief Delphi',
    homepage: 'https://www.chiefdelphi.com',
    license: 'Community forum posts — not openly licensed',
    licenseUrl: null,
    attribution: 'Chief Delphi — https://www.chiefdelphi.com — FTC-tagged threads, title and link only',
    canExcerpt: false, priority: 70, linkOnly: true,
    category: () => 'programming',
  },
  async loadChunks() {
    const entries = await cached('chiefdelphi', async () => {
      const out = [];
      const seen = new Set();
      for (let page = 0; page < 10; page += 1) {
        const res = await fetch(`https://www.chiefdelphi.com/tag/ftc.json?page=${page}`, {
          headers: { 'user-agent': 'sharp-ai-indexer' },
          signal: AbortSignal.timeout(25000),
        });
        if (!res.ok) break;
        const topics = (await res.json())?.topic_list?.topics || [];
        if (!topics.length) break;
        for (const t of topics) {
          if (seen.has(t.id)) continue;
          seen.add(t.id);
          out.push({
            title: t.title,
            url: `https://www.chiefdelphi.com/t/${t.slug}/${t.id}`,
            docPath: `t/${t.id}`,
            headingPath: ['Chief Delphi', 'FTC'],
          });
        }
      }
      return out;
    });
    return linkChunks(entries, this.meta);
  },
};

export const ftcCommunity = sitemapped(
  'ftc-community', 'FTC Community', 'https://ftc-community.firstinspires.org',
  'https://ftc-community.firstinspires.org/sitemap.xml', 'rules',
);

/**
 * FRC Zero. FRC rather than FTC, but its control-theory, wiring and mechanism
 * write-ups carry over directly, and the captain asked for it explicitly. The
 * source name makes the distinction visible in every citation.
 */
export const frczero = sitemapped(
  'frczero', 'FRC Zero (FRC)', 'https://www.frczero.org',
  'https://www.frczero.org/sitemap.xml', 'programming',
);

/**
 * Sites with no sitemap and client-rendered navigation. Rather than crawl them
 * badly, a small hand-checked set of entry points is indexed so a question can
 * still be routed to the right destination.
 */
export const communityHubs = {
  meta: {
    sourceId: 'community-hubs', sourceName: 'FTC Community Resources',
    homepage: 'https://theopenalliance.org',
    license: 'Community sites — not openly licensed',
    licenseUrl: null,
    attribution: 'Community FTC resources — entry pages linked, no text reproduced',
    canExcerpt: false, priority: 75, linkOnly: true,
    category: () => 'build',
  },
  async loadChunks() {
    const entries = [
      { title: 'The Open Alliance — FTC build threads and open-source robot documentation',
        url: 'https://theopenalliance.org/ftc', docPath: 'open-alliance-ftc', headingPath: ['Open Alliance'] },
      { title: 'FTC Secrets — OPR, cOPR, match prediction and team analytics',
        url: 'https://secrets.team31000.org/resources', docPath: 'ftc-secrets', headingPath: ['FTC Secrets'] },
      { title: 'FTC Secrets resources — scouting and statistics tools',
        url: 'https://secrets.team31000.org', docPath: 'ftc-secrets-home', headingPath: ['FTC Secrets'] },
    ];
    return linkChunks(entries, this.meta);
  },
};
