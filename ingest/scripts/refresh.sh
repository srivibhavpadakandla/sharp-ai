#!/usr/bin/env bash
# Full corpus refresh. Nothing re-ingests on its own, so the index is a
# snapshot that silently ages — gm0 and ftc-docs both change during a season.
# Run this monthly, or after a game manual update.
#
#   ./ingest/scripts/refresh.sh            # everything
#   ./ingest/scripts/refresh.sh --no-pull  # re-index what is already checked out
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" != "--no-pull" ]; then
  echo "==> refreshing checkouts"
  for d in vendor/gm0 vendor/ftcdocs vendor/ftc-sdk; do
    [ -d "$d/.git" ] && (cd "$d" && git pull --ff-only -q && echo "    $d updated") || echo "    $d missing — see README"
  done
  echo "==> refreshing link indexes (titles and URLs only)"
  rm -f vendor/linkcache/ctrlaltftc.json vendor/linkcache/ftclib.json \
        vendor/linkcache/roadrunner.json vendor/linkcache/rev.json
  node scripts/crawl-pedropathing.mjs || echo "    pedro pathing crawl skipped"
fi

echo "==> ingest"; node src/ingest.js --all
echo "==> sdk symbol table"; node src/sdk-symbols.js
echo "==> embed"; node src/embed.js
echo "==> eval (regressions show here, before anything ships)"; node src/eval.js | tail -32

cat <<'NEXT'

==> local artifacts rebuilt. To publish — all five steps, or it is half done:

 1. Snapshot the ids that are live RIGHT NOW, before anything deletes them.
    Chunk ids are content hashes, so unchanged sections keep theirs and only
    the rest need retiring:
      cd ../worker && npx wrangler d1 execute sharp-ai --remote --json \
        --command "SELECT chunk_id FROM chunks" > /tmp/live-ids.json

 2. cd worker && ./scripts/load-d1.sh remote
    (the generated SQL deletes each source before inserting it, so this is a
    clean replace rather than a merge)

 3. Delete the ids that were live in step 1 and are absent from
    ../ingest/data/chunks.ndjson. Skipping this leaves orphan vectors in
    Vectorize pointing at rows D1 no longer has:
      npx wrangler vectorize delete-vectors sharp-ai-chunks --ids <id> ...

 4. npx wrangler vectorize upsert sharp-ai-chunks --file=../ingest/data/vectors.ndjson
    npx wrangler deploy

 5. Bump CORPUS_EPOCH in worker/wrangler.toml, and CORPUS_SECTIONS (all chunks
    all of them now) and CORPUS_UPDATED in web/src/lib/config.ts.
    CORPUS_EPOCH is part of the answer cache key. Without it the 30-day KV
    cache keeps serving answers written against the index you just replaced —
    which at kickoff meant telling teams this season's expansion limits were
    "not stated". Then: npm --prefix ../worker run warm

NEXT
