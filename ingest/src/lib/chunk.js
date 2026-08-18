/**
 * Heading-section chunker. Source-agnostic: it only sees the normalised
 * document shape below, so gm0 (RST), ftc-docs (HTML), REV (HTML) and the SDK
 * javadocs all go through this same code.
 *
 *   Document = {
 *     sourceId, sourceName, license, canExcerpt, category,
 *     docPath, pageTitle, pageUrl,
 *     sections: [{ level, title, anchor, body }]   // document order
 *   }
 *
 * Rules
 * -----
 * 1. One chunk per heading section. Never a fixed character window.
 * 2. Every chunk text opens with the page title and the full heading path, so
 *    a chunk retrieved on its own still carries its context into the prompt.
 * 3. Sections whose own body is thin are merged forward into the next section
 *    in document order (a bare "Mecanum Drive" heading followed by
 *    "Advantages" should be one retrievable idea, not two useless ones).
 * 4. Only after 1-3 does size enter the picture, and only as a guard: a
 *    section longer than MAX_CHARS is split on paragraph boundaries — never
 *    mid-paragraph and never inside a fenced code block.
 */

const MIN_CHARS = 240;    // below this a section cannot stand alone
const MERGE_MAX = 2200;   // stop merging forward once we reach this
const MAX_CHARS = 3600;   // hard ceiling before a section is split
const SPLIT_TARGET = 2400;

export function headerFor(pageTitle, headingPath) {
  const path = headingPath.join(' > ');
  return path && path !== pageTitle
    ? `# ${pageTitle}\n## ${path}\n\n`
    : `# ${pageTitle}\n\n`;
}

/** Split a rendered body into atomic blocks: paragraphs and whole code fences. */
function atoms(body) {
  const out = [];
  const lines = body.split('\n');
  let buf = [];
  let fence = false;
  const flush = () => {
    const t = buf.join('\n').trim();
    if (t) out.push(t);
    buf = [];
  };
  for (const line of lines) {
    if (line.startsWith('```')) {
      if (!fence) { flush(); fence = true; buf.push(line); }
      else { buf.push(line); fence = false; flush(); }
      continue;
    }
    if (!fence && !line.trim()) { flush(); continue; }
    buf.push(line);
  }
  flush();
  return out;
}

function splitOversized(body) {
  if (body.length <= MAX_CHARS) return [body];
  const parts = [];
  let buf = [];
  let len = 0;
  for (const a of atoms(body)) {
    // A single atom bigger than the ceiling (one huge code sample) stays whole:
    // cutting a code block in half is worse than one long chunk.
    if (len && len + a.length + 2 > SPLIT_TARGET) {
      parts.push(buf.join('\n\n'));
      buf = [];
      len = 0;
    }
    buf.push(a);
    len += a.length + 2;
  }
  if (buf.length) parts.push(buf.join('\n\n'));
  return parts.filter((p) => p.trim());
}

export function chunkDocument(doc) {
  const stack = [];
  const units = [];

  for (const s of doc.sections) {
    while (stack.length && stack[stack.length - 1].level >= s.level) stack.pop();
    stack.push({ level: s.level, title: s.title });
    units.push({
      title: s.title,
      anchor: s.anchor,
      headingPath: stack.map((x) => x.title),
      body: (s.body || '').trim(),
    });
  }

  // Rule 3: merge thin sections forward.
  const merged = [];
  for (const u of units) {
    const prev = merged[merged.length - 1];
    const prevThin = prev && prev.body.length < MIN_CHARS;
    const fits = prev && prev.body.length + u.body.length < MERGE_MAX;
    if (prevThin && fits) {
      prev.body = [prev.body, u.body].filter(Boolean).join('\n\n');
      // The merged unit inherits the deeper heading trail for display, but keeps
      // the earlier anchor so the citation links to where the reading starts.
      prev.mergedTitles = [...(prev.mergedTitles || [prev.title]), u.title];
      continue;
    }
    merged.push({ ...u });
  }

  const kept = merged.filter((u) => u.body.replace(/\s+/g, ' ').trim().length >= 80);

  const chunks = [];
  let ordinal = 0;
  for (const u of kept) {
    const header = headerFor(doc.pageTitle, u.headingPath);
    const pieces = splitOversized(u.body);
    pieces.forEach((piece, idx) => {
      const partSuffix = pieces.length > 1 ? ` (part ${idx + 1} of ${pieces.length})` : '';
      chunks.push({
        sourceId: doc.sourceId,
        sourceName: doc.sourceName,
        docPath: doc.docPath,
        pageTitle: doc.pageTitle,
        sectionTitle: u.title,
        headingPath: u.headingPath.join(' > '),
        anchor: u.anchor,
        sourceUrl: u.anchor ? `${doc.pageUrl}#${u.anchor}` : doc.pageUrl,
        category: doc.category,
        license: doc.license,
        canExcerpt: doc.canExcerpt ? 1 : 0,
        text: `${header.replace(/\n\n$/, partSuffix + '\n\n')}${piece}`,
        ordinal: ordinal++,
        part: pieces.length > 1 ? idx + 1 : 0,
        partCount: pieces.length,
      });
    });
  }
  return chunks;
}

export const CHUNK_LIMITS = { MIN_CHARS, MERGE_MAX, MAX_CHARS, SPLIT_TARGET };
