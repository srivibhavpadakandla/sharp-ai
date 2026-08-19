/**
 * Citation verification.
 *
 * Every other guard in this system protects against the model saying something
 * the documentation does not support. This one protects against a subtler
 * failure: the claim is fine, but the number beside it points at the wrong
 * section. A reader cannot detect that — the link looks authoritative and
 * resolves to a real page — which makes it the most dangerous defect we ship.
 *
 * Deterministic on purpose. No extra LLM call, so it runs on every answer
 * rather than only when there is quota for it.
 */

const STOP = new Set(`the a an and or but if then than that this these those is are was were be
been being do does did have has had of in on at by for with about from to as it its their they them
you your we our can could should would may might must will shall not no so such into over under`.split(/\s+/));

function terms(text) {
  return new Set(
    String(text).toLowerCase()
      .replace(/`[^`]*`/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w)),
  );
}

/** Split into sentences, keeping the citation markers attached to their claim. */
function sentences(md) {
  return String(md)
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z*\-#])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {string} answerMd  the grounded half only
 * @param {Array<{n:number, chunkId:string}>} citations
 * @param {Map<string,string>} textById  chunk_id -> chunk text
 */
export function verifyCitations(answerMd, citations, textById) {
  const valid = new Set(citations.map((c) => c.n));
  const byN = new Map(citations.map((c) => [c.n, c]));

  const outOfRange = new Set();
  const weak = [];
  let checked = 0;

  // Paragraphs, not sentences. The prompt asks for one bracket at the END of a
  // paragraph listing what that paragraph drew on, so a citation covers the
  // whole paragraph — but this used to score only the final sentence against
  // each chunk. A paragraph that genuinely drew on a section in its opening
  // line was flagged weak because the last line happened not to. The unit being
  // checked has to match the unit being cited.
  const paragraphs = String(answerMd)
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  for (const sentence of paragraphs) {
    const marks = [...sentence.matchAll(/\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g)]
      .flatMap((m) => m[1].split(',').map((x) => Number(x.trim())));
    if (!marks.length) continue;

    const claim = terms(sentence.replace(/\[[\d,\s]+\]/g, ' '));
    if (claim.size < 5) continue;                 // too short to judge fairly

    for (const n of new Set(marks)) {
      if (!valid.has(n)) { outOfRange.add(n); continue; }
      const chunk = textById.get(byN.get(n).chunkId);
      if (!chunk) continue;
      checked += 1;
      const source = terms(chunk);
      let hit = 0;
      for (const t of claim) if (source.has(t)) hit += 1;
      const overlap = hit / claim.size;
      // A supported sentence reuses the section's vocabulary. The bar is
      // deliberately low: a false alarm here tells someone a correct citation
      // is wrong, which is worse than missing a real drift. A code-heavy
      // sentence scored 0.33 against an earlier 0.34 bar and was flagged
      // wrongly — identifiers live in fenced blocks and get stripped from the
      // claim but not the section.
      if (overlap < 0.22) {
        weak.push({ n, overlap: Number(overlap.toFixed(2)), claim: sentence.slice(0, 140) });
      }
    }
  }

  return {
    checked,
    ok: outOfRange.size === 0 && weak.length === 0,
    outOfRange: [...outOfRange],
    weak: weak.slice(0, 4),
  };
}
