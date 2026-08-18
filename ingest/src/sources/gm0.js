/**
 * Source adapter: Game Manual 0 (github.com/gamemanual0/gm0).
 *
 * License CC BY-NC 4.0 — excerpting is permitted with attribution, which is why
 * canExcerpt is true here. The site must therefore carry no ads, no paid tier
 * and no sponsorship, anywhere, forever.
 *
 * Adapters only normalise; all chunking lives in lib/chunk.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseRst } from '../lib/rst.js';
import { categorise } from '../../../worker/src/lib/categories.js';

export const meta = {
  sourceId: 'gm0',
  sourceName: 'Game Manual 0',
  homepage: 'https://gm0.org',
  license: 'CC BY-NC 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-nc/4.0/',
  attribution: 'Game Manual 0 — https://gm0.org — CC BY-NC 4.0',
  canExcerpt: true,
  priority: 10,
};

const BASE_URL = 'https://gm0.org/en/latest/docs';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.rst')) out.push(full);
  }
  return out;
}

/** @returns {Array<import('../lib/chunk.js').Document>} */
export function loadDocuments(opts = {}) {
  const root = opts.root || path.join(process.cwd(), 'vendor', 'gm0', 'source', 'docs');
  if (!fs.existsSync(root)) {
    throw new Error(
      `gm0 checkout not found at ${root}.\n` +
      `Run: git clone --depth 1 https://github.com/gamemanual0/gm0.git ingest/vendor/gm0`,
    );
  }

  const docs = [];
  for (const file of walk(root).sort()) {
    const rel = path.relative(root, file).replace(/\.rst$/, '');
    const raw = fs.readFileSync(file, 'utf8');
    const { pageTitle, sections } = parseRst(raw);
    if (!pageTitle || !sections.length) continue;

    // Contributor/meta pages answer no robot question and dilute retrieval.
    if (/^contributing\//.test(rel) || rel === 'appendix/gallery') continue;

    docs.push({
      sourceId: meta.sourceId,
      sourceName: meta.sourceName,
      license: meta.license,
      canExcerpt: meta.canExcerpt,
      category: categorise(rel, pageTitle),
      docPath: rel,
      pageTitle,
      pageUrl: `${BASE_URL}/${rel}.html`,
      sections,
    });
  }
  return docs;
}
