/**
 * Reciprocal rank fusion + the relevance gate.
 *
 * RRF is rank-based, so its score says nothing about whether a result is
 * actually relevant — an off-topic question still produces a rank-1 result with
 * a healthy RRF score. Gating on RRF alone would let "write me a poem" through.
 *
 * So the gate reads the two *absolute* signals underneath the fusion:
 *   - cosine similarity from the embedding model (calibrated, comparable)
 *   - BM25, sign-flipped so larger is better (corpus-relative but monotonic)
 *
 * A question passes if either signal clears its bar. Thresholds are tuned
 * against ingest/src/eval.js, which scores real FTC questions against
 * deliberately off-topic ones.
 */

// k=60 is the paper's default, but with only two rankings it flattens the
// advantage of a rank-1 hit so far that a mediocre-in-both chunk outranks a
// precise-in-one chunk. k=20 keeps fusion's agreement bonus while letting a
// confident first place still matter.
export const RRF_K = 20;

export const DEFAULT_THRESHOLDS = {
  // A confident semantic match is sufficient on its own.
  minCosine: 0.60,
  // Below this, nothing is close enough to be worth an LLM call regardless of
  // the other signals.
  floorCosine: 0.46,
  // A keyword-led pass needs a strong BM25 AND corroboration, because a single
  // spurious term match ("bake sourdough bread") reaches BM25 ~6 on its own.
  minBm25: 8.0,
  // Corroboration, both required. Overlap is the sharper of the two: every
  // on-topic question in the eval set has the two retrievers agreeing on at
  // least one chunk, and every off-topic one has them agreeing on none.
  minCoverage: 0.5,
  minOverlap: 1,
};

/**
 * @param {Array<{results: Array<{chunkId: string}>, weight?: number}>} rankings
 * @returns {Map<string, {chunkId: string, rrf: number, ranks: Record<string, number>}>}
 */
export function reciprocalRankFusion(rankings) {
  const merged = new Map();
  for (const { name, results, weight = 1 } of rankings) {
    results.forEach((r, i) => {
      const rank = i + 1;
      const entry = merged.get(r.chunkId) || { chunkId: r.chunkId, rrf: 0, ranks: {} };
      entry.rrf += weight * (1 / (RRF_K + rank));
      entry.ranks[name] = rank;
      merged.set(r.chunkId, entry);
    });
  }
  return merged;
}

/**
 * @param {{keyword: Array, semantic: Array}} lists  each item: {chunkId, score}
 * @param {number} topK
 */
export function fuse({ keyword = [], semantic = [] }, topK = 6) {
  const merged = reciprocalRankFusion([
    { name: 'keyword', results: keyword },
    { name: 'semantic', results: semantic },
  ]);

  const bm25By = new Map(keyword.map((r) => [r.chunkId, r.score]));
  const cosBy = new Map(semantic.map((r) => [r.chunkId, r.score]));

  const ordered = [...merged.values()]
    .map((e) => ({
      ...e,
      bm25: bm25By.get(e.chunkId) ?? null,
      cosine: cosBy.get(e.chunkId) ?? null,
    }))
    .sort((a, b) => b.rrf - a.rrf || (b.cosine ?? 0) - (a.cosine ?? 0));

  const bestCosine = semantic.length ? Math.max(...semantic.map((r) => r.score)) : null;
  const bestBm25 = keyword.length ? Math.max(...keyword.map((r) => r.score)) : null;

  // Rank agreement: chunks both retrievers independently put in their top 10.
  const kTop = new Set(keyword.slice(0, 10).map((r) => r.chunkId));
  const overlap = semantic.slice(0, 10).filter((r) => kTop.has(r.chunkId)).length;

  // Rank-1 anchoring.
  //
  // Pure RRF rewards agreement, which is usually right but has one bad failure
  // mode: a chunk that both retrievers rank mid-list beats a chunk that one
  // retriever ranks first. On "how do I make my mecanum drive field centric"
  // that promoted the page introduction over the Field Centric section itself,
  // because the section is code-heavy and embeds poorly.
  //
  // So each leg's top result is guaranteed a seat. Hybrid is then never worse
  // than its best component at the top of the list, which is the property we
  // actually want from fusion.
  const results = ordered.slice(0, topK);
  const present = new Set(results.map((r) => r.chunkId));
  const anchors = [keyword[0]?.chunkId, semantic[0]?.chunkId].filter(
    (id) => id && !present.has(id),
  );
  for (const id of anchors) {
    const entry = ordered.find((r) => r.chunkId === id)
      || { chunkId: id, rrf: 0, ranks: {}, bm25: bm25By.get(id) ?? null, cosine: cosBy.get(id) ?? null };
    // Insert just below the fused winner rather than at the top: fusion's first
    // pick has agreement behind it and has earned the lead.
    results.splice(Math.min(1, results.length), 0, { ...entry, anchored: true });
    present.add(id);
  }

  return {
    results: results.slice(0, topK),
    all: ordered,
    bestCosine,
    bestBm25,
    overlap,
    topRrf: ordered.length ? ordered[0].rrf : 0,
  };
}

/**
 * The load-bearing guard: decides whether the question is answerable from the
 * corpus at all, BEFORE any LLM token is spent.
 */
export function passesRelevanceGate(
  { bestCosine, bestBm25, overlap = 0, coverage = 0 },
  thresholds = DEFAULT_THRESHOLDS,
) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const cos = bestCosine ?? 0;
  const bm25 = bestBm25 ?? 0;

  // Path A — the embedding is confident on its own.
  const strongSemantic = cos >= t.minCosine;

  // Path B — a weaker semantic match, rescued by evidence that the question's
  // own words are genuinely in the retrieved documentation.
  const corroborated =
    cos >= t.floorCosine &&
    bm25 >= t.minBm25 &&
    overlap >= t.minOverlap &&
    coverage >= t.minCoverage;

  return {
    pass: strongSemantic || corroborated,
    reason: strongSemantic ? 'semantic' : (corroborated ? 'corroborated' : 'below-threshold'),
    bestCosine, bestBm25, overlap, coverage,
    thresholds: t,
  };
}
