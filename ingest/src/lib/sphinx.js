/**
 * Shared loader for Sphinx/reStructuredText documentation sites.
 *
 * gm0 and ftc-docs are both Sphinx projects, so the only things that differ
 * between them are the checkout path, the published base URL, the licence, and
 * which pages are worth indexing. Everything structural — section splitting,
 * anchor generation, directive handling — is the same parser.
 *
 * A new Sphinx source is a ~20 line adapter calling this.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseRst } from './rst.js';
import { categorise } from '../../../worker/src/lib/categories.js';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['_static', '_templates', 'assets', 'images', '_build'].includes(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.rst')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * @param {object} o
 * @param {string} o.root      directory containing the .rst tree
 * @param {string} o.baseUrl   published base, e.g. https://gm0.org/en/latest/docs
 * @param {object} o.meta      source metadata (id, name, licence, canExcerpt…)
 * @param {RegExp[]} [o.skip]  doc paths to leave out of the index
 * @param {(p:string,t:string)=>string} [o.categorise]
 */
export function loadSphinxDocs({ root, baseUrl, meta, skip = [], categorise: cat = categorise }) {
  if (!fs.existsSync(root)) {
    throw new Error(`${meta.sourceName} checkout not found at ${root}. See README setup.`);
  }

  const docs = [];
  for (const file of walk(root).sort()) {
    const rel = path.relative(root, file).replace(/\.rst$/, '');
    if (skip.some((re) => re.test(rel))) continue;

    const { pageTitle, sections } = parseRst(fs.readFileSync(file, 'utf8'));
    if (!pageTitle || !sections.length) continue;

    docs.push({
      sourceId: meta.sourceId,
      sourceName: meta.sourceName,
      license: meta.license,
      canExcerpt: meta.canExcerpt,
      category: cat(rel, pageTitle),
      docPath: rel,
      pageTitle,
      pageUrl: `${baseUrl}/${rel}.html`,
      sections,
    });
  }
  return docs;
}
