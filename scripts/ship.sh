#!/usr/bin/env bash
# Test, then deploy, then check it actually came up.
#
#   ./scripts/ship.sh            worker and site
#   ./scripts/ship.sh worker     just the worker
#   ./scripts/ship.sh web        just the site
#
# This exists because CI cannot run. GitHub Actions on a private repository
# draws on the account's included minutes, and with none left a job is created
# and then fails in three seconds without ever being given a runner — no steps,
# no logs. The workflows in .github/ are correct and will start working the day
# the repo goes public or the minutes come back; until then nothing was
# enforcing the one rule that mattered, which is that tests run before a deploy.
#
# So this does the part that matters, locally: it refuses to deploy anything if
# a test fails, and it verifies the deploy afterwards rather than trusting the
# "Deployment complete" line, which prints whether or not the thing works.
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-all}"
API="https://sharp-ai.driveforge-ftc.workers.dev"
SITE="https://sharpftc.pages.dev"
say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

say "tests"
( cd worker && npm test --silent ) || { echo "worker tests failed — nothing deployed"; exit 1; }
( cd web && npx tsc --noEmit -p . ) || { echo "web typecheck failed — nothing deployed"; exit 1; }
( cd web && npm test --silent ) || { echo "web tests failed — nothing deployed"; exit 1; }
echo "all green"

if [ "$TARGET" = "all" ] || [ "$TARGET" = "worker" ]; then
  say "worker"
  ( cd worker && npx wrangler deploy | tail -1 )
fi

if [ "$TARGET" = "all" ] || [ "$TARGET" = "web" ]; then
  say "site"
  ( cd web && npm run deploy | tail -1 )
fi

say "checking it came up"
# Cache-busted: an edge copy of the previous build will happily return 200.
health=$(curl -fsS -m 30 "$API/api/health?cb=$RANDOM") || { echo "FAIL: worker health did not respond"; exit 1; }
chunks=$(printf '%s' "$health" | sed -n 's/.*"chunks":\([0-9]*\).*/\1/p')
[ "${chunks:-0}" -gt 0 ] || { echo "FAIL: worker reports $chunks chunks"; exit 1; }
echo "worker ok, $chunks chunks indexed"

code=$(curl -fsS -m 30 -o /dev/null -w '%{http_code}' "$SITE/?cb=$RANDOM") || true
[ "$code" = "200" ] || { echo "FAIL: site returned $code"; exit 1; }
echo "site ok"

# The host the browser is told to call must be the one that answers. These
# drifted apart once already, when the account's workers.dev subdomain changed:
# every page loaded and no question was ever answered.
built=$(curl -fsS -m 30 "$SITE/?cb=$RANDOM" | grep -o 'https://sharp-ai\.[a-z0-9-]*\.workers\.dev' | head -1 || true)
if [ -n "$built" ] && [ "$built" != "$API" ]; then
  echo "FAIL: the site calls $built but the worker is at $API"; exit 1
fi
echo "site and worker agree on the API host"
printf '\n\033[1mshipped\033[0m\n'
