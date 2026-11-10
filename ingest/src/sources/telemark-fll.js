/** Telemark's FLL lesson sections, exported from the Telemark source tree. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CORPUS = path.resolve(here, '../../corpus/telemark-fll-corpus.jsonl');
const SITE = 'https://telemarkfirst.github.io';

export const meta = {
  sourceId: 'telemark-fll',
  sourceName: 'Telemark FLL',
  homepage: `${SITE}/fll/`,
  license: 'Telemark original curriculum',
  licenseUrl: null,
  attribution: 'Telemark FLL curriculum — https://telemarkfirst.github.io/fll/',
  canExcerpt: true,
  priority: 8,
};

function categoryFor(pagePath) {
  const unit = Number(pagePath.match(/\/unit-(\d{2})\//)?.[1]);
  if (pagePath.endsWith('/references') || unit === 13 || unit === 14) return 'rules';
  if (unit === 8) return 'drivetrains';
  if (unit === 1 || unit === 9 || unit === 10) return 'electronics';
  if (unit === 7 || /simple-machines|mission-mechanism|secure-and-support/.test(pagePath)) return 'build';
  return 'programming';
}

export function loadChunks({ file = DEFAULT_CORPUS } = {}) {
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  const ordinals = new Map();
  const keys = new Set();
  return lines.map((line, index) => {
    const row = JSON.parse(line);
    const { source, path: pagePath, title, heading, text } = row;
    if (source !== meta.sourceName || !/^\/fll\/[a-z0-9/-]+$/.test(pagePath)
        || !title?.trim() || !heading?.trim() || !text?.trim()) {
      throw new Error(`Invalid Telemark FLL corpus record on line ${index + 1}`);
    }
    const key = `${pagePath}\0${heading}`;
    if (keys.has(key)) throw new Error(`Duplicate Telemark FLL section: ${key}`);
    keys.add(key);
    const ordinal = ordinals.get(pagePath) || 0;
    ordinals.set(pagePath, ordinal + 1);
    // The heading digest makes each section's identity stable if lessons are reordered.
    // Citations use the page URL: the export does not carry Docusaurus heading IDs.
    const sectionKey = crypto.createHash('sha256').update(heading).digest('hex').slice(0, 12);
    return {
      sourceId: meta.sourceId,
      sourceName: meta.sourceName,
      docPath: `${pagePath.slice(1)}#${sectionKey}`,
      pageTitle: title,
      sectionTitle: heading,
      headingPath: `${title} > ${heading}`,
      anchor: '',
      sourceUrl: `${SITE}${pagePath}`,
      category: categoryFor(pagePath),
      license: meta.license,
      canExcerpt: 1,
      excerptMode: 'full',
      text: `# ${title}\n## ${heading}\n\n${text}`,
      ordinal,
      part: 0,
      partCount: 1,
    };
  });
}
