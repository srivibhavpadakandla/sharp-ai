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

==> local artifacts rebuilt. To publish:
    cd worker && ./scripts/load-d1.sh remote
    npx wrangler vectorize upsert sharp-ai-chunks --file=../ingest/data/vectors.ndjson
    npx wrangler deploy
    # then bump CORPUS_SECTIONS and CORPUS_UPDATED in web/src/lib/config.ts
NEXT
