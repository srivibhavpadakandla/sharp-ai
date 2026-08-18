/**
 * Query-time embeddings.
 *
 * Production: Workers AI `@cf/baai/bge-base-en-v1.5`.
 * Dev fallback: a local embedding server (ingest/src/embed-server.js) running
 * the identical weights, so `wrangler dev --local` works with no account calls.
 */
import { EMBEDDING_MODEL, EMBEDDING_DIM, embedQueryText } from './lib/query.js';

function l2normalize(vec) {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const n = Math.sqrt(sum) || 1;
  return vec.map((v) => v / n);
}

export async function embedQuery(env, question) {
  const text = embedQueryText(question);

  if (env.AI) {
    const res = await env.AI.run(EMBEDDING_MODEL, { text: [text] });
    const vec = res?.data?.[0];
    if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) {
      throw new Error(`Workers AI returned an unexpected embedding shape (${vec?.length})`);
    }
    return l2normalize(vec);
  }

  if (env.DEV_EMBED_URL) {
    const res = await fetch(env.DEV_EMBED_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts: [text], raw: true }),
    });
    if (!res.ok) throw new Error(`dev embed server: ${res.status}`);
    const { vectors } = await res.json();
    return l2normalize(vectors[0]);
  }

  throw new Error('No embedding provider: bind Workers AI or set DEV_EMBED_URL');
}
