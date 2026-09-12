/**
 * The official FIRST Tech Challenge Competition Manual.
 *
 * This is the first SUMMARIZE-ONLY source, and the mode exists specifically
 * for it. The manual is FIRST copyright and not openly licensed, so:
 *
 *   - its text IS stored and IS given to the model, so questions about rules
 *     can actually be answered rather than deflected to a link
 *   - the model is instructed to explain rules in its own words and never to
 *     quote or reproduce the manual's wording
 *   - the text is NEVER placed in the excerpts array, so it never appears in
 *     the sources panel and is never written to a permanent /q/ page
 *
 * The site therefore never republishes FIRST's text; it explains what a rule
 * requires and links the manual so a team can read the authoritative wording
 * for themselves. Rules questions are the ones where being wrong costs a match,
 * so the answer always names the rule code and points at the manual.
 */
import fs from 'node:fs';
import path from 'node:path';

const SOURCE_URL = 'https://ftc-resources.firstinspires.org/ftc/game/manual';

export const meta = {
  sourceId: 'first-manual',
  sourceName: 'FTC Competition Manual',
  homepage: 'https://www.firstinspires.org/resource-library/ftc/game-and-season-info',
  license: 'FIRST copyright — summarised, never reproduced',
  licenseUrl: null,
  attribution: 'FIRST Tech Challenge Competition Manual — © FIRST — paraphrased, not reproduced',
  canExcerpt: false,
  summarizeOnly: true,
  priority: 2,          // authoritative for anything rules-related
};

/** `3.1  Team Eligibility Rules` or `1.3.1  Gracious Professionalism` */
const HEADING = /^\s{0,6}(?:(\d{2}(?:\.\d{1,2}){0,2})\s+|(\d(?:\.\d{1,2}){0,2})\s{2,})([A-Z][^\n]{2,80}?)\s*$/;
/** Rule codes such as A201, GS02, RE14. */
const RULE = /\b([A-Z]{1,2}\d{2,3})\b/g;

/** The same code at the START of a line, which is how the manual opens a rule. */
const RULE_START = /^[A-Z]{1,2}\d{2,3}\s/;
const TARGET_CHARS = 2600;
const MAX_CHARS = 3600;

/**
 * Break a section into units that can stand on their own.
 *
 * Blank lines alone were not enough. `pdftotext -layout` does not leave a
 * blank line between paragraphs inside a section, so a 192-line section
 * arrived as a single "paragraph" and the size guard never fired: section 6.2
 * became one 14,556-character chunk covering nine separate award rules.
 * Retrieval then had to haul all nine in to answer about one, and prompt
 * tokens are already ~96% of what a question costs.
 *
 * A rules manual has a better seam than a blank line anyway — every rule
 * begins a line with its own code — so "what does R505 say" can retrieve R505
 * instead of R501 through R505.
 */
function splitUnits(body) {
  const lines = body.split('\n');
  if (!lines.some((l) => RULE_START.test(l))) {
    return body.split(/\n\s*\n/).flatMap(packLines);
  }
  const units = [];
  let cur = [];
  for (const line of lines) {
    if (RULE_START.test(line) && cur.length) { units.push(cur.join('\n')); cur = []; }
    cur.push(line);
  }
  if (cur.length) units.push(cur.join('\n'));
  return units.flatMap(packLines);
}

/** Last resort, so no single unit can exceed the target on its own. */
function packLines(unit) {
  if (unit.length <= MAX_CHARS) return [unit];
  const out = [];
  let buf = [];
  let len = 0;
  for (const line of unit.split('\n')) {
    if (len && len + line.length > TARGET_CHARS) { out.push(buf.join('\n')); buf = []; len = 0; }
    buf.push(line);
    len += line.length + 1;
  }
  if (buf.length) out.push(buf.join('\n'));
  return out;
}

export function loadChunks() {
  const file = path.join(process.cwd(), 'vendor', 'first-manual', 'manual.txt');
  if (!fs.existsSync(file)) {
    throw new Error(
      `Competition Manual text not found at ${file}.\n`
      + `  curl -sL "${SOURCE_URL}" -o vendor/first-manual/competition-manual.pdf\n`
      + `  pdftotext -layout vendor/first-manual/competition-manual.pdf vendor/first-manual/manual.txt`,
    );
  }

  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const sections = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    // Table-of-contents rows are headings trailed by dot leaders and a page number.
    if (/\.{5,}\s*\d+\s*$/.test(line)) continue;
    const h = line.match(HEADING);
    if (h) {
      if (current) sections.push(current);
      current = { number: h[1] || h[2], title: h[3].replace(/\s{2,}/g, ' ').trim(), body: [] };
      continue;
    }
    if (current && line.trim()) current.body.push(line.replace(/^\s{0,12}/, ''));
  }
  if (current) sections.push(current);

  const out = [];
  for (const s of sections) {
    const body = s.body.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (body.length < 200) continue;                 // headers, page furniture

    // One rule per unit where the section is a rule list, then packed back up
    // to the target size. Never splits a single rule across two chunks.
    const parts = [];
    let buf = [];
    let len = 0;
    for (const unit of splitUnits(body)) {
      if (len && len + unit.length > TARGET_CHARS) { parts.push(buf.join('\n\n')); buf = []; len = 0; }
      buf.push(unit);
      len += unit.length + 2;
    }
    if (buf.length) parts.push(buf.join('\n\n'));

    parts.forEach((text, i) => {
      const codes = [...new Set((text.match(RULE) || []))].slice(0, 8);
      out.push({
        sourceId: meta.sourceId,
        sourceName: meta.sourceName,
        docPath: `manual/${s.number}${parts.length > 1 ? `-${i + 1}` : ''}`,
        pageTitle: `${s.number} ${s.title}`,
        sectionTitle: s.title,
        headingPath: `Competition Manual > ${s.number} ${s.title}`
          + (codes.length ? ` > ${codes.join(', ')}` : ''),
        anchor: '',
        sourceUrl: SOURCE_URL,
        category: 'rules',
        license: meta.license,
        canExcerpt: 0,             // never quoted, never shown in the sources panel
        excerptMode: 'summarize',  // but the text DOES reach the model
        text: `# FTC Competition Manual\n## ${s.number} ${s.title}`
          + (codes.length ? ` (rules ${codes.join(', ')})` : '')
          + `\n\n${text}`,
        ordinal: out.length,
        part: parts.length > 1 ? i + 1 : 0,
        partCount: parts.length,
      });
    });
  }
  return out;
}
