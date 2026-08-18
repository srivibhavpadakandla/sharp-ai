/**
 * BM25 keyword search over the local SQLite mirror.
 *
 * The SQL is kept character-identical to the Worker's D1 query (worker/src/
 * retrieval.js) so offline evaluation measures production behaviour.
 */

/** page_title, section_title, text — titles carry more signal than body prose. */
export const BM25_WEIGHTS = [4.0, 6.0, 1.0];

export const KEYWORD_SQL = `
  SELECT c.chunk_id      AS chunkId,
         c.page_title    AS pageTitle,
         c.section_title AS sectionTitle,
         c.heading_path  AS headingPath,
         c.source_url    AS sourceUrl,
         c.source_id     AS sourceId,
         c.source_name   AS sourceName,
         c.category      AS category,
         c.license       AS license,
         c.can_excerpt   AS canExcerpt,
         c.text          AS text,
         -bm25(chunks_fts, ${BM25_WEIGHTS[0]}, ${BM25_WEIGHTS[1]}, ${BM25_WEIGHTS[2]}) AS score
  FROM chunks_fts
  JOIN chunks c ON c.rowid = chunks_fts.rowid
  WHERE chunks_fts MATCH ?
  ORDER BY score DESC
  LIMIT ?`;

export function keywordSearchSqlite(db, match, limit) {
  if (!match) return [];
  const rows = db.prepare(KEYWORD_SQL).all(match, limit);
  return rows.map((r) => ({ ...r, snippet: r.text.split('\n\n').slice(1).join(' ') || r.text }));
}
