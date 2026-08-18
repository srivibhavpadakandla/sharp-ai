#!/usr/bin/env node
/**
 * Sharp AI corpus ingest — LOCAL ONLY. This never runs inside the Worker.
 *
 *   node src/ingest.js --source gm0
 *   node src/ingest.js --source gm0 --limit 5 --dump 2   # inspect chunks
 *
 * Outputs
 *   data/chunks.ndjson      one JSON chunk per line (input to embed.js)
 *   data/sql/NNN-*.sql      batched INSERTs for `wrangler d1 execute --file`
 *   data/local.db           local SQLite mirror, for search-cli.js / eval.js
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getSource, SOURCES } from './sources/index.js';
import { chunkDocument, CHUNK_LIMITS } from './lib/chunk.js';
import { DATA_DIR, openLocal } from './lib/db.js';

const args = parseArgs(process.argv.slice(2));
// Multiple sources accumulate into one corpus: `--source gm0,ftc-docs` or
// `--all`. chunk_id is namespaced by source, so ids never collide.
const sourceIds = args.all
  ? Object.keys(SOURCES)
  : String(args.source || 'gm0').split(',').map((x) => x.trim()).filter(Boolean);
const BATCH = Number(args.batch || 400);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

function main() {
  const now = new Date().toISOString();
  const metas = sourceIds.map((id) => getSource(id).meta);
  const chunks = [];

  for (const sourceId of sourceIds) {
    const src = getSource(sourceId);
    let docs = src.loadDocuments();
    if (args.limit) docs = docs.slice(0, Number(args.limit));
    console.log(`[ingest] ${src.meta.sourceName}: ${docs.length} pages`);

  for (const doc of docs) {
    for (const c of chunkDocument(doc)) {
      // Licensing invariant: a chunk may be stricter than its source, never looser.
      if (c.canExcerpt && !src.meta.canExcerpt) {
        throw new Error(`can_excerpt escalation in ${c.docPath} — refusing to ingest`);
      }
      const contentHash = sha(c.text);
      chunks.push({
        ...c,
        // Vectorize caps vector ids at 64 bytes, and the id has to be the same
        // key in D1 and in the index so retrieval can fuse the two lists
        // without a translation lookup. So the id is a short stable digest of
        // the human-readable key; doc_path, anchor and part remain columns.
        chunkId: `${c.sourceId}:${sha(`${c.docPath}#${c.anchor || 'root'}:${c.part || 0}`).slice(0, 16)}`,
        charLen: c.text.length,
        contentHash,
        updatedAt: now,
      });
    }
  }
  }

  const seen = new Set();
  for (const c of chunks) {
    if (seen.has(c.chunkId)) throw new Error(`duplicate chunk_id ${c.chunkId}`);
    seen.add(c.chunkId);
  }

  if (args.dump) {
    for (const c of chunks.slice(0, Number(args.dump))) {
      console.log('\n' + '='.repeat(72));
      console.log(c.chunkId, '\n' + c.sourceUrl, `\ncategory=${c.category} chars=${c.charLen}`);
      console.log('-'.repeat(72));
      console.log(c.text);
    }
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const ndjson = path.join(DATA_DIR, 'chunks.ndjson');
  fs.writeFileSync(ndjson, chunks.map((c) => JSON.stringify(c)).join('\n') + '\n');

  // ---- SQL batches for D1 -------------------------------------------------
  const sqlDir = path.join(DATA_DIR, 'sql');
  fs.rmSync(sqlDir, { recursive: true, force: true });
  fs.mkdirSync(sqlDir, { recursive: true });

  const sourceSql = metas.map((m) =>
    `DELETE FROM chunks WHERE source_id = ${q(m.sourceId)};\n` +
    `INSERT OR REPLACE INTO sources (source_id, source_name, homepage, license, license_url, attribution, can_excerpt, priority, updated_at)\n` +
    `VALUES (${q(m.sourceId)}, ${q(m.sourceName)}, ${q(m.homepage)}, ${q(m.license)}, ` +
    `${q(m.licenseUrl)}, ${q(m.attribution)}, ${m.canExcerpt ? 1 : 0}, ${m.priority}, ${q(now)});\n`,
  ).join('');
  fs.writeFileSync(path.join(sqlDir, '000-source.sql'), sourceSql);

  const cols = '(chunk_id, source_id, source_name, doc_path, page_title, section_title, heading_path, anchor, source_url, category, license, can_excerpt, text, char_len, ordinal, part, part_count, content_hash, updated_at)';
  let fileNo = 0;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    // One statement per row: D1's remote importer rejects a single multi-row
    // INSERT of this size with SQLITE_TOOBIG.
    const stmts = slice.map((c) => `INSERT OR REPLACE INTO chunks ${cols} VALUES (${[
      q(c.chunkId), q(c.sourceId), q(c.sourceName), q(c.docPath), q(c.pageTitle),
      q(c.sectionTitle), q(c.headingPath), q(c.anchor), q(c.sourceUrl), q(c.category),
      q(c.license), c.canExcerpt, q(c.text), c.charLen, c.ordinal, c.part, c.partCount,
      q(c.contentHash), q(c.updatedAt),
    ].join(', ')});`).join('\n');
    fileNo += 1;
    fs.writeFileSync(
      path.join(sqlDir, `${String(fileNo).padStart(3, '0')}-chunks.sql`),
      stmts + '\n',
    );
  }

  // ---- Local SQLite mirror -----------------------------------------------
  const db = openLocal({ fresh: true });
  db.exec(sourceSql);
  const ins = db.prepare(`INSERT OR REPLACE INTO chunks ${cols} VALUES (${new Array(19).fill('?').join(',')})`);
  db.exec('BEGIN');
  for (const c of chunks) {
    ins.run(c.chunkId, c.sourceId, c.sourceName, c.docPath, c.pageTitle, c.sectionTitle,
      c.headingPath, c.anchor, c.sourceUrl, c.category, c.license, c.canExcerpt, c.text,
      c.charLen, c.ordinal, c.part, c.partCount, c.contentHash, c.updatedAt);
  }
  db.exec('COMMIT');

  // ---- Report -------------------------------------------------------------
  const lens = chunks.map((c) => c.charLen).sort((a, b) => a - b);
  const pct = (p) => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))];
  const byCat = {};
  for (const c of chunks) byCat[c.category] = (byCat[c.category] || 0) + 1;
  const bySrc = {};
  for (const c of chunks) bySrc[c.sourceId] = (bySrc[c.sourceId] || 0) + 1;

  console.log(`[ingest] ${chunks.length} chunks -> ${ndjson}`);
  console.log(`[ingest] ${fileNo} SQL batches -> ${sqlDir}`);
  console.log(`[ingest] chars  min=${lens[0]} p50=${pct(0.5)} p90=${pct(0.9)} max=${lens[lens.length - 1]}`);
  console.log(`[ingest] limits ${JSON.stringify(CHUNK_LIMITS)}`);
  console.log(`[ingest] split  ${chunks.filter((c) => c.part > 0).length} chunks came from oversized sections`);
  console.log('[ingest] sources   ', bySrc);
  console.log('[ingest] categories', byCat);
  console.log(`[ingest] fts rows ${db.prepare('SELECT count(*) n FROM chunks_fts').get().n}`);
  db.close();
}

main();
