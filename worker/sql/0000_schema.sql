-- Sharp AI — D1 schema
-- Applied with:  wrangler d1 execute sharp-ai --file=sql/0000_schema.sql [--local|--remote]

-------------------------------------------------------------------------------
-- 1. SOURCES  (one row per documentation source; drives licensing + attribution)
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sources (
  source_id     TEXT PRIMARY KEY,          -- 'gm0', 'ftc-docs', 'rev', ...
  source_name   TEXT NOT NULL,             -- 'Game Manual 0'
  homepage      TEXT NOT NULL,
  license       TEXT NOT NULL,             -- 'CC BY-NC 4.0'
  license_url   TEXT,
  attribution   TEXT,                      -- required attribution string
  -- Default excerpt policy for the source. Per-chunk can_excerpt may be
  -- stricter but never looser (enforced by the ingest script).
  can_excerpt   INTEGER NOT NULL CHECK (can_excerpt IN (0,1)),
  priority      INTEGER NOT NULL DEFAULT 100,
  updated_at    TEXT NOT NULL
);

-------------------------------------------------------------------------------
-- 2. CHUNKS  (one row per heading section of one page)
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chunks (
  chunk_id      TEXT PRIMARY KEY,          -- '<source_id>:<doc_path>#<anchor>[:part]'
  source_id     TEXT NOT NULL REFERENCES sources(source_id),
  source_name   TEXT NOT NULL,             -- denormalised: retrieval never joins
  doc_path      TEXT NOT NULL,             -- 'common-mechanisms/drivetrains/holonomic'
  page_title    TEXT NOT NULL,             -- 'Holonomic Drivetrains'
  section_title TEXT NOT NULL,             -- 'Mecanum Drive'
  heading_path  TEXT NOT NULL,             -- 'Holonomic Drivetrains > Mecanum Drive'
  anchor        TEXT,                      -- 'mecanum-drive'
  source_url    TEXT NOT NULL,             -- deep link, anchor included
  category      TEXT NOT NULL,             -- drivetrains|odometry|intakes|...
  license       TEXT NOT NULL,
  -- LOAD-BEARING: 0 means the Worker may cite the URL but must never place the
  -- body text in an LLM prompt or persist it in a public /q/ page.
  can_excerpt   INTEGER NOT NULL CHECK (can_excerpt IN (0,1)),
  -- full | summarize | link — see sql/0002_excerpt_mode.sql
  excerpt_mode  TEXT NOT NULL DEFAULT 'link',
  text          TEXT NOT NULL,             -- page title + heading path + body
  char_len      INTEGER NOT NULL,
  ordinal       INTEGER NOT NULL,          -- position of the chunk within its page
  part          INTEGER NOT NULL DEFAULT 0,-- >0 when an oversized section was split
  part_count    INTEGER NOT NULL DEFAULT 1,
  content_hash  TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chunks_source   ON chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_chunks_category ON chunks(category);
CREATE INDEX IF NOT EXISTS idx_chunks_page     ON chunks(source_id, doc_path, ordinal);

-------------------------------------------------------------------------------
-- 3. FTS5 keyword index (external content — chunks stays the single source of truth)
-------------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  page_title,
  section_title,
  text,
  content='chunks',
  content_rowid='rowid',
  tokenize="porter unicode61 remove_diacritics 2"
);

CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, page_title, section_title, text)
  VALUES (new.rowid, new.page_title, new.section_title, new.text);
END;

CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, page_title, section_title, text)
  VALUES ('delete', old.rowid, old.page_title, old.section_title, old.text);
END;

CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, page_title, section_title, text)
  VALUES ('delete', old.rowid, old.page_title, old.section_title, old.text);
  INSERT INTO chunks_fts(rowid, page_title, section_title, text)
  VALUES (new.rowid, new.page_title, new.section_title, new.text);
END;

-------------------------------------------------------------------------------
-- 4. VECTORS  (dev/offline fallback + a durable copy of what went into Vectorize)
--    Production semantic search uses Vectorize; this table lets the Worker run
--    with no Vectorize binding (wrangler dev --local) and lets us rebuild the
--    index without re-embedding.
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vectors (
  chunk_id  TEXT PRIMARY KEY REFERENCES chunks(chunk_id) ON DELETE CASCADE,
  dim       INTEGER NOT NULL,
  model     TEXT NOT NULL,
  vec       BLOB NOT NULL                  -- Float32Array, L2-normalised
);

-------------------------------------------------------------------------------
-- 5. ANSWERS  (permanent, indexable /q/<slug> pages)
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS answers (
  slug          TEXT PRIMARY KEY,
  question      TEXT NOT NULL,
  question_norm TEXT NOT NULL UNIQUE,
  answer_md     TEXT NOT NULL,
  citations     TEXT NOT NULL,             -- JSON [{n,chunk_id,source_name,section,url,license}]
  excerpts      TEXT NOT NULL,             -- JSON [{chunk_id,text}] — can_excerpt=1 only
  source_ids    TEXT NOT NULL,             -- JSON string[]
  category      TEXT,
  model         TEXT NOT NULL,
  top_score     REAL,
  view_count    INTEGER NOT NULL DEFAULT 0,
  featured      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_answers_category ON answers(category, view_count DESC);
CREATE INDEX IF NOT EXISTS idx_answers_recent   ON answers(created_at DESC);

-------------------------------------------------------------------------------
-- 6. QUERY LOG  (anonymised: no IPs, no user identifiers, no headers)
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS query_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts              TEXT NOT NULL,
  question        TEXT NOT NULL,
  question_hash   TEXT NOT NULL,
  question_len    INTEGER NOT NULL,
  cache_hit       INTEGER NOT NULL DEFAULT 0,
  below_threshold INTEGER NOT NULL DEFAULT 0,
  llm_called      INTEGER NOT NULL DEFAULT 0,
  degraded        INTEGER NOT NULL DEFAULT 0,
  top_score       REAL,
  best_bm25       REAL,
  best_cosine     REAL,
  source_ids      TEXT,                    -- JSON string[]
  chunk_ids       TEXT,                    -- JSON string[]
  latency_ms      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_log_ts ON query_log(ts DESC);
