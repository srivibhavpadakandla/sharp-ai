# Sharp AI

FTC documentation search that answers in plain language and shows the source
section beside every answer. Runs entirely on free tiers — no VM, no always-on
process, no paid services.

```
ingest/   local-only Node corpus pipeline (never runs in the Worker)
worker/   the single Cloudflare Worker: retrieval, gate, Gemini, persistence
web/      Astro site on Cloudflare Pages, React islands only where needed
```

## Architecture

| Concern | Service |
|---|---|
| Frontend | Astro on Cloudflare Pages, static except `/q/<slug>` |
| Backend | one Cloudflare Worker |
| Keyword search | D1 + FTS5 (`porter unicode61`), BM25 with title weighting |
| Semantic search | Cloudflare Vectorize, 768-d cosine |
| Embeddings | Workers AI `@cf/baai/bge-base-en-v1.5` |
| Cache + counters | Workers KV |
| Answer generation | Gemini free tier, key in Worker secrets only |
| Bot protection | Cloudflare Turnstile |

## Query flow

1. Turnstile token verified
2. Per-IP rate limit in KV — 10/min, 100/day (IP is hashed, never stored)
3. Questions over 500 characters rejected
4. KV cache lookup on the normalised question
5. D1 FTS5 and Vectorize queried in parallel, merged with reciprocal rank fusion
6. **Relevance gate** — below threshold returns a refusal with no LLM call
7. **Agentic pass**, when the first retrieval is not near-exact: the model reads
   the naive results, rewrites the search into the documentation's vocabulary
   (one query per part of the question), everything is retrieved again and
   fused, then the model reranks the shortlist. Two extra calls, charged
   against the same ceiling, skipped entirely on a confident first pass.
8. Gemini, with `can_excerpt` enforced during prompt assembly
9. Response streamed as SSE, split into two parts (below)
10. **Grounded half only** written to KV and to the D1 `answers` table
11. Anonymised row appended to `query_log`

## Grounded vs beyond

The model returns two parts behind `===GROUNDED===` / `===BEYOND===` markers,
and `worker/src/gemini.js` splits them *while the tokens are still streaming*.

**Grounded** is documentation only, every claim cited, and it is the only thing
that is ever persisted — it is what a `/q/<slug>` page contains, what Google
indexes, and what the JSON-LD `acceptedAnswer` holds.

**Beyond** is general robotics reasoning the sections do not cover: why a
failure happens physically, what to check first, a tradeoff worth knowing. It
carries no citations (any that slip through are stripped server-side), it is
never written to D1 or KV, and it is visually set apart in the UI with an
explicit warning. Revisiting a `/q/` page shows the cited half alone.

The prohibition on invented part numbers, gear ratios, tick counts and rule
numbers applies to *both* halves.

## Models

| Role | Model |
|---|---|
| Answer | `gemini-3.5-flash`, `thinkingLevel: medium` |
| Plan + rerank | `gemini-3.5-flash-lite`, `thinkingLevel: low`, structured output |

`gemini-2.5-flash-lite` is closed to new API users and 3.x rejects
`thinkingBudget` on flash-lite — use `thinkingLevel`.

A hard daily LLM ceiling degrades to *retrieved excerpts with links, no
summary*. It never errors out.

## Licensing

Game Manual 0 is CC BY-NC 4.0. Because of that this site carries **no
advertising, no paid tier and no sponsorship, ever**.

Chunks carry a `can_excerpt` flag. Sources that are not openly licensed (the
*FIRST* Game Manual Part 1/2 and the official Q&A) must be registered with
`can_excerpt = 0`; the Worker then contributes only their title and link to the
prompt and never their text. This is enforced in `worker/src/gemini.js`,
server-side, before a prompt exists.

## Setup

```bash
# 1. corpus
git clone --depth 1 https://github.com/gamemanual0/gm0.git ingest/vendor/gm0
npm --prefix ingest install
npm --prefix ingest run ingest          # -> data/chunks.ndjson, data/sql/, data/local.db
npm --prefix ingest run search -- "how do I make my mecanum drive field centric"
npm --prefix ingest run embed           # -> data/vectors.ndjson (downloads the model once)
npm --prefix ingest run eval            # keyword vs semantic vs hybrid, + gate separation

# 2. Cloudflare resources
cd worker
npx wrangler d1 create sharp-ai
npx wrangler vectorize create sharp-ai-chunks --dimensions=768 --metric=cosine
npx wrangler kv namespace create CACHE
npx wrangler kv namespace create RATE
# put the ids into wrangler.toml

npm run schema:remote
./scripts/load-d1.sh remote
npx wrangler vectorize insert sharp-ai-chunks --file=../ingest/data/vectors.ndjson

npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put TURNSTILE_SECRET
npm run deploy

# 3. site
cd ../web
PUBLIC_API_BASE=https://sharp-ai.<subdomain>.workers.dev npm run deploy
```

## Local development

```bash
cd worker
npm run schema:local && ./scripts/load-d1.sh local
npx wrangler dev                  # binds real Vectorize/Workers AI when logged in
```

Fully offline (no account calls): put `DEV_EMBED_URL="http://127.0.0.1:8791/embed"`
and `REQUIRE_TURNSTILE="false"` in `worker/.dev.vars`, load
`ingest/data/sql/900-vectors.local.sql` into the local D1, and run
`npm --prefix ingest run embed-server`. The Worker then brute-forces cosine over
the `vectors` table instead of calling Vectorize.

## Adding a source

Write `ingest/src/sources/<id>.js` exporting `meta` and `loadDocuments()`
returning the normalised document shape, register it in
`ingest/src/sources/index.js`, and run the ingest. The parser, chunker, SQL
writer and embedder are source-agnostic and need no changes. One source per PR.

## Free-tier budget

The binding constraint is the Gemini free tier, not Cloudflare.
`LLM_DAILY_CEILING` counts **calls**, not questions, and defaults to 300: a
confident question costs one call, an escalated one costs three. Set
`AGENTIC = "false"` to disable the agentic pass and return to one call each. Each uncached question costs about three KV writes
(minute bucket, day bucket, answer cache) which keeps the whole site inside KV's
1,000 writes/day. Cached and `/q/<slug>` traffic costs no LLM calls at all.
