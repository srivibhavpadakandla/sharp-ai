/**
 * Query normalisation and FTS5 MATCH construction.
 *
 * Shared by the Worker and by the local evaluation harness so that what we
 * measure offline is exactly what runs in production.
 */

export const MAX_QUESTION_CHARS = 500;

const STOPWORDS = new Set(`a an the and or but if then than that this these those
is are was were be been being do does did doing have has had having
i me my we our you your he she it its they them their
what which who whom whose when where why how
can could should would may might must will shall
to of in on at by for with about against between into through during
from up down out over under again further once here there all any both each
few more most other some such no nor not only own same so too very s t just
dont don't im i'm ive i've whats what's hows how's thats that's
please help need want know tell explain does do use using used
my robot team ftc`.split(/\s+/).filter(Boolean));

/** Keeps identifiers intact: `gamepad1.left_stick_y`, `REV-45-2470`, `NullPointerException`. */
export function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ' ')
    .split(/\s+/)
    .flatMap((t) => {
      const clean = t.replace(/^[._-]+|[._-]+$/g, '');
      if (!clean) return [];
      // A dotted Java identifier is worth indexing both whole and split.
      if (/^[a-z0-9]+(\.[a-z0-9_]+)+$/.test(clean) && clean.length > 6) {
        return [clean, ...clean.split('.').filter((p) => p.length > 2)];
      }
      return [clean];
    })
    .filter((t) => t.length >= 2 && t.length <= 64);
}

export function contentTerms(text) {
  const seen = new Set();
  const out = [];
  for (const t of tokenize(text)) {
    if (STOPWORDS.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Build an FTS5 MATCH expression. Every term is double-quoted, which makes the
 * expression injection-proof: a user cannot smuggle in FTS operators.
 * OR-of-terms plus BM25 ranking behaves better on natural questions than AND,
 * which drops to zero results the moment one word is missing from the corpus.
 */
export function buildFtsQuery(question, { maxTerms = 12 } = {}) {
  let terms = contentTerms(question).slice(0, maxTerms);
  if (!terms.length) terms = tokenize(question).slice(0, maxTerms);
  if (!terms.length) return null;
  return terms.map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ');
}

/**
 * bge-* models are trained with an asymmetric instruction: queries get a
 * prefix, passages do not. Both the Worker and the ingest embedder import this
 * so the two never drift apart.
 */
export const BGE_QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';
export const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';
export const EMBEDDING_DIM = 768;

export function embedQueryText(question) {
  return BGE_QUERY_PREFIX + String(question).trim();
}

/**
 * Fraction of the question's content terms that actually appear in the
 * retrieved text. This is the signal that separates "my lift keeps falling
 * down" (weak cosine, real question) from "explain the plot of Hamlet" (weak
 * cosine, nothing to say) — BM25 alone cannot, because one spurious term match
 * produces a healthy BM25 either way.
 */
export function termCoverage(question, texts) {
  const terms = contentTerms(question);
  if (!terms.length) return 0;
  const hay = texts.join('\n').toLowerCase();
  let hit = 0;
  for (const t of terms) {
    // Crude stem: match the term or its first 5 characters as a prefix, which
    // covers strafe/strafing, encoder/encoders, gear/gearing.
    const stem = t.length > 6 ? t.slice(0, t.length - 2) : t;
    if (hay.includes(t) || (stem.length >= 4 && hay.includes(stem))) hit += 1;
  }
  return hit / terms.length;
}
