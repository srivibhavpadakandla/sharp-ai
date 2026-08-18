/**
 * Local embedder using the exact same weights Workers AI serves for
 * `@cf/baai/bge-base-en-v1.5`. Running the model locally means:
 *
 *   - ingest costs nothing and needs no Cloudflare round-trip per chunk
 *   - the offline evaluation harness produces vectors that are directly
 *     comparable to the ones the Worker computes at query time
 *
 * Passages are embedded bare; queries get the bge instruction prefix. That
 * asymmetry lives in worker/src/lib/query.js so both sides share it.
 */
import { pipeline, env } from '@huggingface/transformers';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
env.cacheDir = path.resolve(here, '../../.cache');
env.allowRemoteModels = true;

export const LOCAL_MODEL_ID = 'Xenova/bge-base-en-v1.5';

let extractor = null;

export async function getExtractor() {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', LOCAL_MODEL_ID, { dtype: 'fp32' });
  }
  return extractor;
}

/** @returns {Promise<Float32Array[]>} L2-normalised 768-d vectors. */
export async function embedBatch(texts) {
  const pipe = await getExtractor();
  const out = await pipe(texts, { pooling: 'cls', normalize: true });
  const dim = out.dims[out.dims.length - 1];
  const data = out.data;
  const vecs = [];
  for (let i = 0; i < texts.length; i += 1) {
    vecs.push(Float32Array.from(data.slice(i * dim, (i + 1) * dim)));
  }
  return vecs;
}

export function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
}
