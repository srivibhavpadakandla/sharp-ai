#!/usr/bin/env bash
# Load the generated corpus SQL into D1.
#   ./scripts/load-d1.sh local     (wrangler dev's local D1)
#   ./scripts/load-d1.sh remote    (the real database)
set -euo pipefail

TARGET="${1:-local}"
case "$TARGET" in
  local)  FLAG="--local"  ;;
  remote) FLAG="--remote" ;;
  *) echo "usage: $0 [local|remote]" >&2; exit 1 ;;
esac

cd "$(dirname "$0")/.."
SQL_DIR="../ingest/data/sql"

if [ ! -d "$SQL_DIR" ]; then
  echo "No $SQL_DIR — run: npm --prefix ../ingest run ingest" >&2
  exit 1
fi

echo "==> schema ($TARGET)"
npx wrangler d1 execute sharp-ai $FLAG --file=sql/0000_schema.sql -y

for f in "$SQL_DIR"/[0-8]*.sql; do
  [ -e "$f" ] || continue
  echo "==> $(basename "$f")"
  npx wrangler d1 execute sharp-ai $FLAG --file="$f" -y
done

# Vector blobs are only needed by the offline dev fallback; Vectorize serves prod.
if [ "$TARGET" = "local" ] && [ -f "$SQL_DIR/900-vectors.local.sql" ]; then
  echo "==> 900-vectors.local.sql"
  npx wrangler d1 execute sharp-ai $FLAG --file="$SQL_DIR/900-vectors.local.sql" -y
fi

echo "==> done"
npx wrangler d1 execute sharp-ai $FLAG -y \
  --command "SELECT (SELECT count(*) FROM chunks) AS chunks, (SELECT count(*) FROM chunks_fts) AS fts;"
