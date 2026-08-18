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
const HEADING = /^\s{0,6}(\d{1,2}(?:\.\d{1,2}){0,2})\s{2,}([A-Z][^\n]{2,80}?)\s*$/;
/** Rule codes such as A201, GS02, RE14. */
const RULE = /\b([A-Z]{1,2}\d{2,3})\b/g;

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
      current = { number: h[1], title: h[2].replace(/\s{2,}/g, ' ').trim(), body: [] };
      continue;
    }
    if (current && line.trim()) current.body.push(line.replace(/^\s{0,12}/, ''));
  }
  if (current) sections.push(current);

  const out = [];
  for (const s of sections) {
    const body = s.body.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (body.length < 200) continue;                 // headers, page furniture

    // Long sections split on blank lines, never mid-paragraph.
    const parts = [];
    let buf = [];
    let len = 0;
    for (const para of body.split(/\n\s*\n/)) {
      if (len && len + para.length > 2600) { parts.push(buf.join('\n\n')); buf = []; len = 0; }
      buf.push(para);
      len += para.length + 2;
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
