/**
 * Hybrid retrieval: D1 FTS5 keyword search and Vectorize semantic search run in
 * parallel, then merge with reciprocal rank fusion.
 */
import { buildFtsQuery, termCoverage } from './lib/query.js';
import { fuse, passesRelevanceGate } from './lib/fusion.js';
import { embedQuery } from './embed.js';

/** Must stay identical to ingest/src/lib/keyword.js so offline eval is honest. */
const BM25_WEIGHTS = [4.0, 6.0, 1.0];

const CHUNK_COLUMNS = `
  c.chunk_id      AS chunkId,
  c.source_id     AS sourceId,
  c.source_name   AS sourceName,
  c.page_title    AS pageTitle,
  c.section_title AS sectionTitle,
  c.heading_path  AS headingPath,
  c.source_url    AS sourceUrl,
  c.category      AS category,
  c.license       AS license,
  c.can_excerpt   AS canExcerpt,
  c.text          AS text`;

export async function keywordSearch(env, question, limit) {
  const match = buildFtsQuery(question);
  if (!match) return [];
  const sql = `
    SELECT ${CHUNK_COLUMNS},
           -bm25(chunks_fts, ${BM25_WEIGHTS[0]}, ${BM25_WEIGHTS[1]}, ${BM25_WEIGHTS[2]}) AS score
    FROM chunks_fts
    JOIN chunks c ON c.rowid = chunks_fts.rowid
    WHERE chunks_fts MATCH ?
    ORDER BY score DESC
    LIMIT ?`;
  try {
    const { results } = await env.DB.prepare(sql).bind(match, limit).all();
    return results || [];
  } catch (err) {
    // A malformed MATCH must degrade to "no keyword hits", never 500 the request.
    console.error('keywordSearch failed', err.message, 'match=', match);
    return [];
  }
}

export async function semanticSearch(env, question, limit) {
  const vector = await embedQuery(env, question);

  if (env.VECTORIZE) {
    const res = await env.VECTORIZE.query(vector, { topK: limit, returnMetadata: 'none' });
    return (res.matches || []).map((m) => ({ chunkId: m.id, score: m.score }));
  }

  // Dev fallback: brute-force cosine over the vectors mirrored into D1.
  const { results } = await env.DB.prepare('SELECT chunk_id, vec FROM vectors').all();
  const scored = [];
  for (const row of results || []) {
    const buf = row.vec instanceof ArrayBuffer ? row.vec : new Uint8Array(row.vec).buffer;
    const v = new Float32Array(buf);
    let s = 0;
    for (let i = 0; i < v.length; i += 1) s += v[i] * vector[i];
    scored.push({ chunkId: row.chunk_id, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export async function hydrate(env, chunkIds) {
  if (!chunkIds.length) return new Map();
  const placeholders = chunkIds.map(() => '?').join(',');
  const { results } = await env.DB
    .prepare(`SELECT ${CHUNK_COLUMNS} FROM chunks c WHERE c.chunk_id IN (${placeholders})`)
    .bind(...chunkIds)
    .all();
  return new Map((results || []).map((r) => [r.chunkId, r]));
}

/**
 * Full hybrid retrieval. Never throws for a retrieval-layer failure: if the
 * semantic leg dies we still answer from keyword hits, and vice versa.
 */
export async function retrieve(env, question) {
  const candidates = Number(env.CANDIDATES || 24);
  const topK = Number(env.TOP_K || 6);

  const [kw, sem] = await Promise.allSettled([
    keywordSearch(env, question, candidates),
    semanticSearch(env, question, candidates),
  ]);

  const keyword = kw.status === 'fulfilled' ? kw.value : [];
  const semantic = sem.status === 'fulfilled' ? sem.value : [];
  if (sem.status === 'rejected') console.error('semanticSearch failed', sem.reason?.message);

  const fused = fuse({ keyword, semantic }, topK);

  const byId = new Map(keyword.map((r) => [r.chunkId, r]));
  const missing = fused.results.map((r) => r.chunkId).filter((id) => !byId.has(id));
  if (missing.length) {
    const extra = await hydrate(env, missing);
    for (const [id, row] of extra) byId.set(id, row);
  }

  const chunks = fused.results
    .map((r) => {
      const row = byId.get(r.chunkId);
      return row ? { ...row, rrf: r.rrf, bm25: r.bm25, cosine: r.cosine, ranks: r.ranks } : null;
    })
    .filter(Boolean);

  // Coverage is measured on what we actually retrieved, so it has to come after
  // hydration — this is the signal that distinguishes a real but awkwardly
  // worded question from junk that happens to share one word with the corpus.
  const coverage = termCoverage(question, chunks.map((c) => c.text));

  const gate = passesRelevanceGate(
    {
      bestCosine: fused.bestCosine,
      bestBm25: fused.bestBm25,
      overlap: fused.overlap,
      coverage,
    },
    {
      minCosine: Number(env.MIN_COSINE || 0.60),
      floorCosine: Number(env.FLOOR_COSINE || 0.46),
      minBm25: Number(env.MIN_BM25 || 8.0),
      minCoverage: Number(env.MIN_COVERAGE || 0.5),
      minOverlap: Number(env.MIN_OVERLAP || 1),
    },
  );

  return {
    chunks,
    gate,
    stats: {
      keywordHits: keyword.length,
      semanticHits: semantic.length,
      bestBm25: fused.bestBm25,
      bestCosine: fused.bestCosine,
      overlap: fused.overlap,
      coverage,
      topRrf: fused.topRrf,
      semanticFailed: sem.status === 'rejected',
    },
  };
}
