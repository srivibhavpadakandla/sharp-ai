-- Three excerpt modes, not two.
--
--   full       text stored, quotable, shown in the sources panel and on /q/
--   summarize  text stored and given to the model, which must paraphrase it;
--              NEVER shown in the sources panel and NEVER written to a /q/ page
--   link       only title and URL; no text reaches the model at all
--
-- The middle mode exists for the FIRST Competition Manual: rules questions are
-- the ones where a wrong answer costs a match, so deflecting to a link was the
-- worst option — but the manual is FIRST copyright, so republishing its wording
-- was not an option either.
ALTER TABLE chunks ADD COLUMN excerpt_mode TEXT NOT NULL DEFAULT 'link';
UPDATE chunks SET excerpt_mode = CASE WHEN can_excerpt = 1 THEN 'full' ELSE 'link' END;
CREATE INDEX IF NOT EXISTS idx_chunks_mode ON chunks(excerpt_mode);
