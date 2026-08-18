#!/usr/bin/env node
/**
 * CLI verification of the D1 FTS5 keyword index against the local mirror.
 *
 *   npm run search -- "how do I tune a mecanum drive"
 *   npm run search -- --k 10 "what gear ratio for a lift"
 *
 * Uses exactly the FTS expression and BM25 weights the Worker uses.
 */
import { openLocal } from './lib/db.js';
import { buildFtsQuery } from '../../worker/src/lib/query.js';
import { keywordSearchSqlite, BM25_WEIGHTS } from './lib/keyword.js';

const argv = process.argv.slice(2);
let k = 8;
const qIdx = argv.indexOf('--k');
if (qIdx !== -1) { k = Number(argv[qIdx + 1]); argv.splice(qIdx, 2); }
const question = argv.join(' ').trim();

if (!question) {
  console.error('usage: npm run search -- [--k N] "your question"');
  process.exit(1);
}

const db = openLocal();
const match = buildFtsQuery(question);
console.log(`question : ${question}`);
console.log(`fts match: ${match}`);
console.log(`bm25 wts : page_title=${BM25_WEIGHTS[0]} section_title=${BM25_WEIGHTS[1]} text=${BM25_WEIGHTS[2]}\n`);

const rows = keywordSearchSqlite(db, match, k);
if (!rows.length) console.log('(no results)');
for (const [i, r] of rows.entries()) {
  console.log(`${String(i + 1).padStart(2)}. ${r.score.toFixed(3)}  ${r.pageTitle} › ${r.sectionTitle}`);
  console.log(`    ${r.sourceUrl}`);
  console.log(`    ${r.snippet.replace(/\s+/g, ' ').slice(0, 160)}…\n`);
}
db.close();
