/**
 * Sharp AI — the single Cloudflare Worker.
 *
 * Query flow for POST /api/ask, in order:
 *   1. Turnstile token validation
 *   2. Per-IP rate limit (KV): 10/min, 100/day
 *   3. Reject input over MAX_QUESTION_CHARS
 *   4. KV cache lookup on the normalised question
 *   5. D1 FTS5 + Vectorize in parallel, merged with reciprocal rank fusion
 *   6. Relevance gate — below threshold returns a refusal with NO LLM call
 *   7. Gemini, with can_excerpt enforced during prompt assembly
 *   8. Stream the response
 *   9. Persist to KV and to the D1 answers table with a URL slug
 *  10. Anonymised log row
 *
 * The daily LLM ceiling degrades to "sources without a summary" — never errors.
 */
import { retrieve, retrieveMulti } from './retrieval.js';
import { streamGemini, buildPrompt, createAnswerSplitter, sanitiseBeyond } from './gemini.js';
import { needsEscalation, planSearch, rerank } from './agent.js';
import { checkRateLimit, reserveLlmCall, llmUsage } from './ratelimit.js';
import { verifyTurnstile, TESTING_SITE_KEY } from './turnstile.js';
import {
  readCache, writeAnswer, getAnswerBySlug, hydrateAnswerRow, logQuery, sha256hex, cacheKeyFor,
} from './answers.js';
import { MAX_QUESTION_CHARS } from './lib/query.js';
import { CATEGORIES } from './lib/categories.js';

const REFUSAL =
  'I can only answer FTC documentation questions. That question does not match '
  + 'anything in the indexed documentation.';

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function corsHeaders(env, request) {
  const origin = request.headers.get('origin') || '';
  const allowed = (env.SITE_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin)
    || /^https?:\/\/localhost(:\d+)?$/.test(origin)
    || /^https:\/\/[a-z0-9-]+\.sharp-ai\.pages\.dev$/.test(origin)
    || /\.pages\.dev$/.test(origin);
  return {
    'access-control-allow-origin': ok ? origin : (allowed[0] || '*'),
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

const json = (data, init = {}, extra = {}) => new Response(JSON.stringify(data), {
  ...init,
  headers: { 'content-type': 'application/json; charset=utf-8', ...extra, ...(init.headers || {}) },
});

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function handleAsk(request, env, ctx, { isError = false } = {}) {
  const started = Date.now();
  const cors = corsHeaders(env, request);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid-json' }, { status: 400 }, cors); }

  const question = String(body.question ?? body.q ?? '').trim();
  const token = body.turnstileToken || body['cf-turnstile-response'];

  // --- 1. Turnstile ---------------------------------------------------------
  const ts = await verifyTurnstile(env, token, request);
  if (!ts.ok) {
    return json({ error: 'turnstile-failed', detail: ts.reason }, { status: 403 }, cors);
  }

  // --- 3. Length (checked before the KV round-trips so junk costs nothing) ---
  const maxChars = Number(env.MAX_QUESTION_CHARS || MAX_QUESTION_CHARS);
  if (!question) return json({ error: 'empty-question' }, { status: 400 }, cors);
  if (question.length > maxChars) {
    return json({ error: 'question-too-long', maxChars }, { status: 413 }, cors);
  }

  // --- 2. Rate limit --------------------------------------------------------
  const rl = await checkRateLimit(env, request);
  if (!rl.ok) {
    return json(
      { error: 'rate-limited', scope: rl.scope, limit: rl.limit },
      { status: 429, headers: { 'retry-after': String(rl.retryAfter) } },
      cors,
    );
  }

  // --- 4. Cache -------------------------------------------------------------
  const { norm } = await cacheKeyFor(question);
  const questionHash = await sha256hex(norm);
  const cached = await readCache(env, question);
  if (cached) {
    ctx.waitUntil(logQuery(env, {
      question, questionHash, cacheHit: true, llmCalled: false,
      sourceIds: cached.sourceIds, chunkIds: (cached.citations || []).map((c) => c.chunkId),
      latencyMs: Date.now() - started,
    }));
    return streamPrerendered(cached, cors, { cached: true });
  }

  await rl.commit();

  // --- 5. Retrieval ---------------------------------------------------------
  const { chunks, gate, stats } = await retrieve(env, question);

  // --- 6. Relevance gate: refuse without spending an LLM token --------------
  if (!gate.pass || !chunks.length) {
    ctx.waitUntil(logQuery(env, {
      question, questionHash, cacheHit: false, belowThreshold: true, llmCalled: false,
      bestBm25: stats.bestBm25, bestCosine: stats.bestCosine,
      latencyMs: Date.now() - started,
    }));
    return streamPrerendered(
      { question, answerMd: REFUSAL, citations: [], excerpts: [], slug: null },
      cors,
      { refused: true, gate },
    );
  }

  // --- 6b. Agentic pass -----------------------------------------------------
  // A confident first retrieval is left alone. A weak one gets the model to
  // rewrite the search in the documentation's vocabulary, then to rerank what
  // comes back. Both extra calls are charged against the same daily ceiling as
  // the answer itself, and if the ceiling refuses them we simply proceed with
  // what fusion already found.
  let finalChunks = chunks;
  const agent = { escalated: false, queries: null, interpretation: null, reranked: false };

  if (String(env.AGENTIC ?? 'true') !== 'false' && needsEscalation(question, stats, gate)) {
    try {
      const planBudget = await reserveLlmCall(env);
      if (planBudget.granted) {
        const plan = await planSearch(env, question, chunks.map((c) => c.headingPath));
        const queries = [question, ...(plan.queries || [])].slice(0, 5);
        agent.escalated = true;
        agent.queries = plan.queries || [];
        agent.interpretation = plan.interpretation || null;

        const wide = await retrieveMulti(env, queries);
        const candidates = wide.chunks.length ? wide.chunks : chunks;

        const rerankBudget = await reserveLlmCall(env);
        if (rerankBudget.granted && candidates.length > Number(env.TOP_K || 6)) {
          finalChunks = await rerank(env, question, candidates, Number(env.TOP_K || 6));
          agent.reranked = true;
        } else {
          finalChunks = candidates.slice(0, Number(env.TOP_K || 6));
        }
      }
    } catch (err) {
      // The agentic layer is an improvement, never a dependency.
      console.error('agentic pass failed, using fusion order', err.message);
      finalChunks = chunks;
    }
  }

  const { citations, excerpts } = buildPrompt(question, finalChunks, { isError });
  const category = finalChunks[0]?.category || null;

  // --- Daily ceiling: degrade to sources, never error -----------------------
  const reservation = await reserveLlmCall(env);
  if (!reservation.granted) {
    const md = degradedMarkdown(finalChunks);
    ctx.waitUntil(logQuery(env, {
      question, questionHash, cacheHit: false, llmCalled: false, degraded: true,
      bestBm25: stats.bestBm25, bestCosine: stats.bestCosine,
      sourceIds: [...new Set(finalChunks.map((c) => c.sourceId))],
      chunkIds: finalChunks.map((c) => c.chunkId), latencyMs: Date.now() - started,
    }));
    return streamPrerendered(
      { question, answerMd: md, citations, excerpts, slug: null },
      cors,
      { degraded: true, reason: 'daily-llm-ceiling', ...reservation },
    );
  }

  // --- 7 + 8. Gemini, streamed ---------------------------------------------
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const pump = (async () => {
    // `grounded` is the only text that will ever be persisted. `beyond` is
    // streamed to this reader and then discarded — it never reaches D1, KV, or
    // the indexable /q/ page.
    let grounded = '';
    let beyond = '';
    const splitter = createAnswerSplitter();

    try {
      await writer.write(encoder.encode(sse('meta', {
        question, citations, excerpts, category,
        cached: false, degraded: false,
        agent,
        stats: { bestBm25: stats.bestBm25, bestCosine: stats.bestCosine },
      })));

      let announcedBeyond = false;
      const emit = async ({ grounded: g, beyond: b }) => {
        if (g) {
          grounded += g;
          await writer.write(encoder.encode(sse('token', { t: g })));
        }
        if (b) {
          let text = sanitiseBeyond(b);
          if (!announcedBeyond) {
            announcedBeyond = true;
            text = text.replace(/^\s+/, '');          // only the very first delta
            await writer.write(encoder.encode(sse('beyond_start', {})));
          }
          beyond += text;
          if (text) await writer.write(encoder.encode(sse('beyond', { t: text })));
        }
      };

      for await (const delta of streamGemini(env, { question, chunks: finalChunks, isError })) {
        await emit(splitter.push(delta));
      }
      await emit(splitter.end());

      let slug = null;
      if (grounded.trim()) {
        const saved = await writeAnswer(env, {
          // Grounded only. Persisting the ungrounded half would put uncited
          // claims on a permanent, crawlable URL.
          question, answerMd: grounded.trim(), citations, excerpts, category,
          model: env.GEMINI_MODEL || 'gemini-3.5-flash', topScore: stats.bestCosine,
        });
        slug = saved.slug;
      }
      await writer.write(encoder.encode(sse('done', {
        slug, chars: grounded.length, beyondChars: beyond.length,
      })));

      await logQuery(env, {
        question, questionHash, cacheHit: false, llmCalled: true,
        bestBm25: stats.bestBm25, bestCosine: stats.bestCosine,
        topScore: stats.bestCosine,
        sourceIds: [...new Set(finalChunks.map((c) => c.sourceId))],
        chunkIds: finalChunks.map((c) => c.chunkId),
        latencyMs: Date.now() - started,
      });
    } catch (err) {
      console.error('ask failed', err.stack || err.message);
      // Degrade in place: the reader already has the sources, give them the
      // excerpt fallback rather than an error page.
      await writer.write(encoder.encode(sse('degrade', {
        reason: 'llm-unavailable',
        answerMd: degradedMarkdown(finalChunks),
      })));
      await writer.write(encoder.encode(sse('done', { slug: null })));
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  ctx.waitUntil(pump);

  return new Response(readable, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      ...cors,
    },
  });
}

/** Replays an already-known answer over the same SSE protocol the client expects. */
function streamPrerendered(payload, cors, meta = {}) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sse('meta', {
        question: payload.question,
        citations: payload.citations || [],
        excerpts: payload.excerpts || [],
        category: payload.category || null,
        ...meta,
      })));
      controller.enqueue(encoder.encode(sse('token', { t: payload.answerMd })));
      controller.enqueue(encoder.encode(sse('done', { slug: payload.slug || null })));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      ...cors,
    },
  });
}

/** The no-LLM fallback: real excerpts with links, clearly labelled as such. */
function degradedMarkdown(chunks) {
  const lines = [
    '_Sharp AI has reached its daily answer limit. Here are the documentation '
    + 'sections that match your question, unsummarised._',
    '',
  ];
  chunks.forEach((c, i) => {
    lines.push(`### ${i + 1}. ${c.pageTitle} › ${c.sectionTitle}`);
    lines.push(`[${c.sourceName} →](${c.sourceUrl})`);
    if (Number(c.canExcerpt) === 1) {
      const body = c.text.split('\n\n').slice(1).join('\n\n').trim();
      lines.push('', body.slice(0, 700) + (body.length > 700 ? '…' : ''));
    } else {
      lines.push('', `_This section is under ${c.license} and cannot be excerpted here._`);
    }
    lines.push('');
  });
  return lines.join('\n');
}

async function handleAnswer(request, env, slug) {
  const cors = corsHeaders(env, request);
  const answer = await getAnswerBySlug(env, slug);
  if (!answer) return json({ error: 'not-found' }, { status: 404 }, cors);
  return json(answer, {}, { ...cors, 'cache-control': 'public, max-age=300, s-maxage=3600' });
}

async function handleAnswers(request, env, url) {
  const cors = corsHeaders(env, request);
  const category = url.searchParams.get('category');
  const limit = Math.min(60, Number(url.searchParams.get('limit') || 24));
  const sql = category
    ? 'SELECT * FROM answers WHERE category = ? ORDER BY featured DESC, view_count DESC, created_at DESC LIMIT ?'
    : 'SELECT * FROM answers ORDER BY featured DESC, view_count DESC, created_at DESC LIMIT ?';
  const stmt = category
    ? env.DB.prepare(sql).bind(category, limit)
    : env.DB.prepare(sql).bind(limit);
  const { results } = await stmt.all();
  return json(
    { answers: (results || []).map(hydrateAnswerRow) },
    {},
    { ...cors, 'cache-control': 'public, max-age=300, s-maxage=1800' },
  );
}

async function handleCategories(request, env) {
  const cors = corsHeaders(env, request);
  const { results } = await env.DB.prepare(`
    SELECT category, count(*) AS n FROM answers GROUP BY category
  `).all();
  const counts = Object.fromEntries((results || []).map((r) => [r.category, r.n]));

  const { results: top } = await env.DB.prepare(`
    SELECT slug, question, category FROM answers
    ORDER BY featured DESC, view_count DESC, created_at DESC LIMIT 200
  `).all();

  return json({
    categories: CATEGORIES.map((c) => ({
      ...c,
      count: counts[c.id] || 0,
      questions: (top || []).filter((t) => t.category === c.id).slice(0, 6),
    })),
  }, {}, { ...cors, 'cache-control': 'public, max-age=300, s-maxage=1800' });
}

/** Retrieval only — no LLM, no Turnstile. Powers the "sources" pane and debugging. */
async function handleSearch(request, env, url) {
  const cors = corsHeaders(env, request);
  const q = (url.searchParams.get('q') || '').trim().slice(0, Number(env.MAX_QUESTION_CHARS || 500));
  if (!q) return json({ error: 'empty-query' }, { status: 400 }, cors);
  const { chunks, gate, stats } = await retrieve(env, q);
  return json({
    query: q,
    gate,
    stats,
    results: chunks.map((c) => ({
      chunkId: c.chunkId, sourceName: c.sourceName, pageTitle: c.pageTitle,
      sectionTitle: c.sectionTitle, headingPath: c.headingPath, url: c.sourceUrl,
      category: c.category, license: c.license, canExcerpt: !!Number(c.canExcerpt),
      rrf: c.rrf, bm25: c.bm25, cosine: c.cosine,
      text: Number(c.canExcerpt) === 1 ? c.text : null,
    })),
  }, {}, cors);
}

async function handleSitemap(request, env) {
  const cors = corsHeaders(env, request);
  const { results } = await env.DB
    .prepare('SELECT slug, updated_at FROM answers ORDER BY updated_at DESC LIMIT 5000').all();
  return json({ slugs: results || [] }, {}, cors);
}

async function handleHealth(request, env) {
  const cors = corsHeaders(env, request);
  const [chunkRow, answerRow, usage] = await Promise.all([
    env.DB.prepare('SELECT count(*) AS n FROM chunks').first().catch(() => null),
    env.DB.prepare('SELECT count(*) AS n FROM answers').first().catch(() => null),
    llmUsage(env).catch(() => null),
  ]);
  return json({
    ok: true,
    chunks: chunkRow?.n ?? null,
    answers: answerRow?.n ?? null,
    llm: usage,
    bindings: {
      d1: !!env.DB, vectorize: !!env.VECTORIZE, ai: !!env.AI,
      cache: !!env.CACHE, rate: !!env.RATE,
      gemini: !!env.GEMINI_API_KEY, turnstile: !!env.TURNSTILE_SECRET,
    },
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || TESTING_SITE_KEY,
  }, {}, cors);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(env, request);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      const p = url.pathname.replace(/\/+$/, '') || '/';

      if (p === '/api/ask' && request.method === 'POST') return handleAsk(request, env, ctx);
      if (p === '/api/explain-error' && request.method === 'POST') {
        return handleAsk(request, env, ctx, { isError: true });
      }
      if (p === '/api/search') return handleSearch(request, env, url);
      if (p === '/api/categories') return handleCategories(request, env);
      if (p === '/api/answers') return handleAnswers(request, env, url);
      if (p.startsWith('/api/answer/')) {
        return handleAnswer(request, env, decodeURIComponent(p.slice('/api/answer/'.length)));
      }
      if (p === '/api/sitemap') return handleSitemap(request, env);
      if (p === '/api/health' || p === '/') return handleHealth(request, env);

      return json({ error: 'not-found' }, { status: 404 }, cors);
    } catch (err) {
      console.error('unhandled', err.stack || err.message);
      return json({ error: 'internal', message: err.message }, { status: 500 }, cors);
    }
  },
};
