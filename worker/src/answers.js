/**
 * Answer persistence: the KV cache (fast path) and the D1 `answers` table
 * (permanent, server-rendered /q/<slug> pages), plus the anonymised query log.
 */
import { normalizeQuestion, questionSlug } from './lib/slug.js';

export const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days

export async function sha256hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The cache key carries the corpus epoch.
 *
 * Without it a re-ingest silently kept serving the old corpus's answers for up
 * to CACHE_TTL. That was survivable while the index only gained pages; it
 * stopped being survivable at kickoff, when the Competition Manual was
 * replaced wholesale and every cached rules answer became a confident
 * statement about last season — including the one that said this season's
 * expansion limits "are not stated".
 *
 * Bumping CORPUS_EPOCH in wrangler.toml after an ingest makes every old entry
 * unreachable at once. Nothing is deleted; the orphans expire on their own
 * TTL, so this costs no writes and cannot fail halfway.
 */
export async function cacheKeyFor(env, question) {
  const norm = normalizeQuestion(question);
  const epoch = env?.CORPUS_EPOCH || '0';
  return { norm, key: `ans:${epoch}:${await sha256hex(norm)}` };
}

export async function readCache(env, question) {
  const { key } = await cacheKeyFor(env, question);
  const hit = await env.CACHE.get(key, 'json');
  return hit || null;
}

/**
 * @param cacheSubject What the cached entry is keyed on, when that differs from
 *   the question. A question like "explain this lesson" means something
 *   different on every page, so the page has to be part of the key or the
 *   first answer is served to every lesson that asks it. The stored answer row
 *   still records the question the student actually typed.
 */
export async function writeAnswer(env, { question, cacheSubject, answerMd, citations, excerpts, category, model, topScore }) {
  const { norm } = await cacheKeyFor(env, question);
  const { key } = await cacheKeyFor(env, cacheSubject || question);
  const hash = await sha256hex(norm);
  const now = new Date().toISOString();

  // A question that only differs in punctuation must land on the same page.
  const existing = await env.DB
    .prepare('SELECT slug FROM answers WHERE question_norm = ?')
    .bind(norm).first();
  const slug = existing?.slug || questionSlug(question, hash);

  const sourceIds = [...new Set(citations.map((c) => c.sourceId))];
  const payload = {
    slug, question, answerMd, citations, excerpts, category,
    sourceIds, model, createdAt: now,
  };

  await env.DB.prepare(`
    INSERT INTO answers (slug, question, question_norm, answer_md, citations, excerpts,
                         source_ids, category, model, top_score, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(question_norm) DO UPDATE SET
      answer_md = excluded.answer_md,
      citations = excluded.citations,
      excerpts  = excluded.excerpts,
      source_ids = excluded.source_ids,
      top_score = excluded.top_score,
      updated_at = excluded.updated_at
  `).bind(
    slug, question, norm, answerMd,
    JSON.stringify(citations),
    JSON.stringify(excerpts),
    JSON.stringify(sourceIds),
    category || null, model, topScore ?? null, now, now,
  ).run();

  await env.CACHE.put(key, JSON.stringify(payload), { expirationTtl: CACHE_TTL });
  return payload;
}

export async function getAnswerBySlug(env, slug) {
  const row = await env.DB
    .prepare('SELECT * FROM answers WHERE slug = ?')
    .bind(slug).first();
  if (!row) return null;
  return hydrateAnswerRow(row);
}

export function hydrateAnswerRow(row) {
  return {
    slug: row.slug,
    question: row.question,
    answerMd: row.answer_md,
    citations: JSON.parse(row.citations || '[]'),
    excerpts: JSON.parse(row.excerpts || '[]'),
    sourceIds: JSON.parse(row.source_ids || '[]'),
    category: row.category,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    viewCount: row.view_count,
  };
}

/**
 * Anonymised logging. Deliberately absent: IP, user agent, referrer, country,
 * any header at all. The question text is kept because it is the product (it
 * builds the browsable index); nothing identifies who asked it.
 */
export async function logQuery(env, entry) {
  try {
    await env.DB.prepare(`
      INSERT INTO query_log (ts, question, question_hash, question_len, cache_hit,
                             below_threshold, llm_called, degraded, top_score,
                             best_bm25, best_cosine, source_ids, chunk_ids, latency_ms,
                             cite_checked, cite_weak)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      new Date().toISOString(),
      entry.question,
      entry.questionHash,
      entry.question.length,
      entry.cacheHit ? 1 : 0,
      entry.belowThreshold ? 1 : 0,
      entry.llmCalled ? 1 : 0,
      entry.degraded ? 1 : 0,
      entry.topScore ?? null,
      entry.bestBm25 ?? null,
      entry.bestCosine ?? null,
      JSON.stringify(entry.sourceIds || []),
      JSON.stringify(entry.chunkIds || []),
      entry.latencyMs ?? null,
      entry.citeChecked ?? null,
      entry.citeWeak ?? null,
    ).run();
  } catch (err) {
    console.error('logQuery failed', err.message);
  }
}
