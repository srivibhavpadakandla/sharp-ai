-- Answer feedback. Anonymous: no IP, no user, no session. The value is the
-- join between a verdict and the retrieval scores that produced it — that is
-- what tells you WHICH questions retrieve badly, rather than that some do.
CREATE TABLE IF NOT EXISTS feedback (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            TEXT NOT NULL,
  question      TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  slug          TEXT,
  verdict       TEXT NOT NULL CHECK (verdict IN ('up','down')),
  reason        TEXT,
  chunk_ids     TEXT,
  source_ids    TEXT,
  best_cosine   REAL,
  best_bm25     REAL
);

CREATE INDEX IF NOT EXISTS idx_feedback_verdict ON feedback(verdict, ts DESC);
