#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { embedBatch, LOCAL_MODEL_ID } from './lib/embedder.js';
import { DATA_DIR, openLocal, floatsToBlob } from './lib/db.js';
import { EMBEDDING_MODEL, EMBEDDING_DIM } from '../../worker/src/lib/query.js';

const BATCH = Number(process.env.EMBED_BATCH || 16);
const chunks = fs.readFileSync(path.join(DATA_DIR, 'chunks.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
const vectorFile = path.join(DATA_DIR, 'vectors.ndjson');
const cached = new Map();
if (fs.existsSync(vectorFile)) {
  for (const line of fs.readFileSync(vectorFile, 'utf8').trim().split('\n')) {
    const v = JSON.parse(line);
    if (v.values?.length === EMBEDDING_DIM && v.metadata?.content_hash && (!v.metadata.embedding_model || v.metadata.embedding_model === EMBEDDING_MODEL)) cached.set(v.id, v);
  }
}
const dirty = chunks.filter((c) => cached.get(c.chunkId)?.metadata.content_hash !== c.contentHash);
console.log(`[embed] ${chunks.length} chunks: ${chunks.length - dirty.length} unchanged, ${dirty.length} to embed with ${LOCAL_MODEL_ID}`);
const t0 = Date.now();
for (let i = 0; i < dirty.length; i += BATCH) {
  const slice = dirty.slice(i, i + BATCH);
  const vecs = await embedBatch(slice.map((c) => c.text));
  slice.forEach((c, j) => {
    if (vecs[j].length !== EMBEDDING_DIM) throw new Error(`Invalid embedding dimension for ${c.chunkId}`);
    cached.set(c.chunkId, { id: c.chunkId, values: Array.from(vecs[j], Math.fround),
      metadata: { source_id: c.sourceId, category: c.category, content_hash: c.contentHash } });
  });
  console.log(`[embed] ${Math.min(i + BATCH, dirty.length)}/${dirty.length} new vectors (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
const db = openLocal();
const ins = db.prepare('INSERT OR REPLACE INTO vectors (chunk_id, dim, model, vec) VALUES (?,?,?,?)');
const rows = [];
const vectors = [];
db.exec('BEGIN; DELETE FROM vectors;');
for (const c of chunks) {
  const v = cached.get(c.chunkId);
  if (!v || v.metadata.content_hash !== c.contentHash) throw new Error(`Missing current vector for ${c.chunkId}`);
  v.metadata.embedding_model = EMBEDDING_MODEL;
  vectors.push(JSON.stringify(v));
  const blob = floatsToBlob(v.values);
  ins.run(c.chunkId, EMBEDDING_DIM, EMBEDDING_MODEL, blob);
  rows.push(`INSERT INTO vectors (chunk_id, dim, model, vec) VALUES ('${c.chunkId.replace(/'/g, "''")}',${EMBEDDING_DIM},'${EMBEDDING_MODEL}',X'${blob.toString('hex')}');`);
}
db.exec('COMMIT;');
fs.writeFileSync(vectorFile + '.tmp', vectors.join('\n') + '\n');
fs.renameSync(vectorFile + '.tmp', vectorFile);
fs.writeFileSync(path.join(DATA_DIR, 'sql', '900-vectors.local.sql'), ['DELETE FROM vectors;', ...rows].join('\n') + '\n');
console.log(`[embed] ${chunks.length} current vectors written; obsolete vectors excluded`);
db.close();
