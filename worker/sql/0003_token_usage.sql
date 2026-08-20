-- Real token consumption, as reported by Gemini's usageMetadata.
--
-- This lives in D1 rather than KV on purpose. The KV free tier allows 1000
-- writes/day and an uncached question already spends about three of them, so a
-- fourth would have forced the daily answer ceiling down. D1 allows 100k
-- writes/day, and this is one UPSERT per answer.
--
-- Aggregated per (day, kind) rather than one row per call: the question count
-- is already logged elsewhere, and nobody needs to know which individual
-- question cost 4,000 tokens. Keeps the table at a handful of rows a day and
-- the health query O(1).
CREATE TABLE IF NOT EXISTS token_usage (
  day             TEXT NOT NULL,          -- UTC date, matching the rate-limit buckets
  kind            TEXT NOT NULL,          -- answer | code | error | agent
  calls           INTEGER NOT NULL DEFAULT 0,
  prompt_tokens   INTEGER NOT NULL DEFAULT 0,
  thoughts_tokens INTEGER NOT NULL DEFAULT 0,  -- drawn from the same output budget
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  total_tokens    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
);

CREATE INDEX IF NOT EXISTS idx_token_usage_day ON token_usage(day DESC);
