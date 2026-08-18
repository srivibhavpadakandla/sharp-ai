/**
 * Source adapter: Game Manual 0 (github.com/gamemanual0/gm0).
 *
 * License CC BY-NC 4.0 — excerpting is permitted with attribution, which is why
 * canExcerpt is true here. The site must therefore carry no ads, no paid tier
 * and no sponsorship, anywhere, forever.
 *
 * Adapters only normalise; all chunking lives in lib/chunk.js.
 */
import path from 'node:path';
import { loadSphinxDocs } from '../lib/sphinx.js';

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

export function loadDocuments(opts = {}) {
  return loadSphinxDocs({
    root: opts.root || path.join(process.cwd(), 'vendor', 'gm0', 'source', 'docs'),
    baseUrl: BASE_URL,
    meta,
    // Contributor and gallery pages answer no robot question and dilute retrieval.
    skip: [/^contributing\//, /^appendix\/gallery$/],
  });
}