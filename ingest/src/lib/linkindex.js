/**
 * Link-index sources.
 *
 * Some FTC documentation that teams genuinely rely on is not openly licensed —
 * CTRL ALT FTC and FTCLib ship no LICENSE file (all rights reserved by
 * default), and REV is a commercial site. We should not copy their prose into
 * a database and feed it to a model.
 *
 * But refusing outright is the worse answer: "Road Runner tuning" IS
 * documented, and a team asking about it deserves to be pointed at the page.
 *
 * So these sources are indexed by METADATA ONLY — page title, heading path and
 * URL. No body text is fetched, stored, embedded or prompted. Every chunk is
 * written with can_excerpt = 0, which the Worker already enforces during
 * prompt assembly: it contributes its title and link and nothing else.
 *
 * That is the same mechanism built for the FIRST Game Manual, reused.
 */

/** Parse a GitBook SUMMARY.md into {title, path} entries. */
export function parseGitbookSummary(md, { baseUrl }) {
  const out = [];
  const stack = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^(\s*)\*\s*\[([^\]]+)\]\(([^)]+)\)/);
    if (!m) continue;
    const [, indent, title, href] = m;
    const depth = Math.floor(indent.replace(/\t/g, '  ').length / 2);
    stack.length = depth;
    stack[depth] = title.trim();

    const slug = href.replace(/\.md$/, '').replace(/^\.?\//, '').replace(/README$/i, '');
    out.push({
      title: title.trim(),
      headingPath: stack.filter(Boolean),
      url: `${baseUrl}/${slug}`.replace(/\/+$/, '') || baseUrl,
      docPath: slug || 'index',
    });
  }
  return out;
}

/** Pull <loc> entries out of a sitemap. */
export function parseSitemap(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

/**
 * Resolve a sitemap URL to page URLs, following one level of <sitemapindex>.
 *
 * REV publishes an index of sitemaps rather than a flat list, so reading
 * <loc> naively yielded child sitemap URLs and every "page title" fetch came
 * back as XML with no <title>. Hence 0 pages indexed.
 */
export async function resolveSitemap(url, depth = 0) {
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) return [];
  const xml = await res.text();
  const locs = parseSitemap(xml);
  if (!/<sitemapindex/i.test(xml) || depth > 1) return locs;
  const out = [];
  for (const child of locs) out.push(...await resolveSitemap(child, depth + 1));
  return out;
}

/** Fetch only the <title> of a page — metadata, not content. */
export async function fetchTitle(url, timeoutMs = 15000) {
  const ctl = AbortSignal.timeout(timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl, headers: { 'user-agent': 'sharp-ai-indexer' } });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    if (!m) return null;
    return m[1].replace(/\s+/g, ' ').replace(/\s*[|—–-]\s*[^|—–-]{0,40}$/, '').trim() || null;
  } catch { return null; }
}

/**
 * Turn link entries into the normalised document shape the chunker expects.
 * The "body" is deliberately just the title restated — enough for the embedder
 * to place the page topically, and nothing that reproduces the source.
 */
export function linkDocuments(entries, meta) {
  return entries.map((e) => ({
    sourceId: meta.sourceId,
    sourceName: meta.sourceName,
    license: meta.license,
    canExcerpt: false,              // never excerptable — enforced in the Worker
    category: meta.category(e),
    docPath: e.docPath,
    pageTitle: e.title,
    pageUrl: e.url,
    sections: [{
      level: 1,
      title: e.title,
      anchor: '',
      // Metadata only. No sentence of the source document appears here.
      body: [meta.sourceName, ...(e.headingPath || []), e.title]
        .filter(Boolean).join(' — '),
    }],
  }));
}

/**
 * Emit chunk records directly.
 *
 * Link entries bypass chunkDocument on purpose: it drops anything under 80
 * characters as too thin to retrieve, which is correct for prose and wrong for
 * a deliberate title-only record.
 */
export function linkChunks(entries, meta) {
  return entries.map((e, i) => {
    const headingPath = [...(e.headingPath || [])];
    if (!headingPath.length || headingPath[headingPath.length - 1] !== e.title) headingPath.push(e.title);
    const text = `# ${meta.sourceName}\n## ${headingPath.join(' > ')}\n\n`
      + `${meta.sourceName} documents this at "${e.title}". `
      + `The text of this page is not reproduced here; open the link to read it.`;
    return {
      sourceId: meta.sourceId,
      sourceName: meta.sourceName,
      docPath: e.docPath,
      pageTitle: e.title,
      sectionTitle: e.title,
      headingPath: headingPath.join(' > '),
      anchor: '',
      sourceUrl: e.url,
      category: meta.category(e),
      license: meta.license,
      canExcerpt: 0,
      text,
      ordinal: i,
      part: 0,
      partCount: 1,
    };
  });
}
