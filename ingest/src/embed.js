#!/usr/bin/env node
/**
 * Embed the corpus locally with the same weights Workers AI serves.
 *   npm run embed
 * Outputs: data/vectors.ndjson (Vectorize bulk format),
 *          data/sql/900-vectors.local.sql (dev fallback), data/local.db vectors table.
 */
import fs from 'node:fs';
import path from 'node:path';
import { embedBatch, LOCAL_MODEL_ID } from './lib/embedder.js';
import { DATA_DIR, openLocal, floatsToBlob } from './lib/db.js';
import { EMBEDDING_MODEL, EMBEDDING_DIM } from '../../worker/src/lib/query.js';

const BATCH = Number(process.env.EMBED_BATCH || 16);
const chunks = fs.readFileSync(path.join(DATA_DIR, 'chunks.ndjson'), 'utf8')
  .trim().split('\n').map((l) => JSON.parse(l));

console.log(`[embed] ${chunks.length} chunks with ${LOCAL_MODEL_ID} (== ${EMBEDDING_MODEL})`);

const db = openLocal();
db.exec('DELETE FROM vectors;');
const ins = db.prepare('INSERT OR REPLACE INTO vectors (chunk_id, dim, model, vec) VALUES (?,?,?,?)');
const out = fs.createWriteStream(path.join(DATA_DIR, 'vectors.ndjson'));
const sqlRows = [];
const t0 = Date.now();

db.exec('BEGIN');
for (let i = 0; i < chunks.length; i += BATCH) {
  const slice = chunks.slice(i, i + BATCH);
  // Passages are embedded bare — the bge instruction prefix is query-side only.
  const vecs = await embedBatch(slice.map((c) => c.text));
  slice.forEach((c, j) => {
    const v = vecs[j];
    if (v.length !== EMBEDDING_DIM) throw new Error(`dim ${v.length} != ${EMBEDDING_DIM}`);
    out.write(JSON.stringify({
      id: c.chunkId,
      values: Array.from(v, (x) => Math.fround(x)),
      metadata: { source_id: c.sourceId, category: c.category },
    }) + '\n');
    const blob = floatsToBlob(v);
    ins.run(c.chunkId, EMBEDDING_DIM, EMBEDDING_MODEL, blob);
    sqlRows.push(`('${c.chunkId.replace(/'/g, "''")}', ${EMBEDDING_DIM}, '${EMBEDDING_MODEL}', X'${blob.toString('hex')}')`);
  });
  const done = Math.min(i + BATCH, chunks.length);
  process.stdout.write(`\r[embed] ${done}/${chunks.length}  ${(done / ((Date.now() - t0) / 1000)).toFixed(1)}/s   `);
}
db.exec('COMMIT');
out.end();
process.stdout.write('\n');

fs.mkdirSync(path.join(DATA_DIR, 'sql'), { recursive: true });
fs.writeFileSync(path.join(DATA_DIR, 'sql', '900-vectors.local.sql'),
  ['DELETE FROM vectors;', ...sqlRows.map((r) => `INSERT INTO vectors (chunk_id, dim, model, vec) VALUES ${r};`)].join('\n') + '\n');

console.log(`[embed] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`[embed] local vectors rows: ${db.prepare('SELECT count(*) n FROM vectors').get().n}`);
db.close();
