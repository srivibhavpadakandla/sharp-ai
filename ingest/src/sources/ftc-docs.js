/**
 * Source adapter: the official FIRST Tech Challenge documentation.
 * github.com/FIRST-Tech-Challenge/ftcdocs
 *
 * BSD 3-Clause, so excerpting is permitted with attribution and the copyright
 * notice — unlike the Game Manual, which is not openly licensed and would have
 * to be registered with canExcerpt:false.
 */
import path from 'node:path';
import { loadSphinxDocs } from '../lib/sphinx.js';

export const meta = {
  sourceId: 'ftc-docs',
  sourceName: 'FTC Docs',
  homepage: 'https://ftc-docs.firstinspires.org',
  license: 'BSD 3-Clause',
  licenseUrl: 'https://github.com/FIRST-Tech-Challenge/ftcdocs/blob/main/LICENSE',
  attribution: 'FIRST Tech Challenge Docs — Copyright (c) 2022 FIRST Tech Challenge — BSD 3-Clause',
  canExcerpt: true,
  priority: 5,          // official documentation outranks community docs
};

const BASE_URL = 'https://ftc-docs.firstinspires.org/en/latest';

// Navigation stubs and project meta, not answers to anything.
const SKIP = [
  /^404$/, /^todo$/, /^index$/,
  /^contrib\//, /^common\//, /^assets\//,
  /^ftc_ml\/.*_(images|assets)/,
];

export function loadDocuments(opts = {}) {
  return loadSphinxDocs({
    root: opts.root || path.join(process.cwd(), 'vendor', 'ftcdocs', 'docs', 'source'),
    baseUrl: BASE_URL,
    meta,
    skip: SKIP,
  });
}
