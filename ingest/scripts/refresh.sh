#!/usr/bin/env bash
# Rebuild every configured source, its embeddings, evaluation, and published metadata.
set -euo pipefail
# Match curl’s proxy routing when Node fetch cannot reach a source directly.
export NODE_USE_ENV_PROXY="${NODE_USE_ENV_PROXY:-1}"
cd "$(dirname "$0")/.."
SDK_VERSION="${FTC_SDK_VERSION:-}"
if [ -z "$SDK_VERSION" ]; then
  if [ "${1:-}" = "--no-pull" ]; then
    SDK_VERSION=$(cat vendor/sdk-javadoc/version.txt)
  else
    SDK_VERSION=$(curl -fsSL --max-time 30 https://repo1.maven.org/maven2/org/firstinspires/ftc/RobotCore/maven-metadata.xml | sed -n 's/.*<release>\(.*\)<\/release>.*/\1/p')
  fi
fi
[[ "$SDK_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Cannot determine SDK version" >&2; exit 1; }
if [ "${1:-}" != "--no-pull" ]; then
  for d in vendor/gm0 vendor/ftcdocs vendor/ftc-sdk vendor/rr-quickstart; do
    [ -d "$d/.git" ] || { echo "Missing source checkout: $d" >&2; exit 1; }
    git -C "$d" pull --ff-only -q
  done
  stage=$(mktemp -d)
  trap 'rm -rf "$stage"' EXIT
  curl -fsSL --max-time 60 https://ftc-resources.firstinspires.org/ftc/game/manual -o "$stage/manual.pdf"
  pdftotext -layout "$stage/manual.pdf" "$stage/manual.txt"
  test -s "$stage/manual.txt"
  grep -Eq 'Version:[[:space:]]*TU[0-9]+' "$stage/manual.txt" || { echo "Manual has no verifiable team-update revision" >&2; exit 1; }
  cp "$stage/manual.pdf" vendor/first-manual/competition-manual.pdf
  cp "$stage/manual.txt" vendor/first-manual/manual.txt
  for artifact in RobotCore Hardware FtcCommon Vision; do
    curl -fsSL --max-time 60 "https://repo1.maven.org/maven2/org/firstinspires/ftc/$artifact/$SDK_VERSION/$artifact-$SDK_VERSION-javadoc.jar" -o "$stage/$artifact.jar"
    mkdir -p "$stage/$artifact"
    unzip -oq "$stage/$artifact.jar" -d "$stage/$artifact"
    rsync -a --delete "$stage/$artifact/" "vendor/sdk-javadoc/$artifact/"
  done
  printf '%s\n' "$SDK_VERSION" > vendor/sdk-javadoc/version.txt
  node scripts/crawl-pedropathing.mjs
  node scripts/crawl-pedropathing-content.mjs
  node scripts/crawl-first-qa.mjs
  export REFRESH_LINKS=1
fi
export FTC_SDK_VERSION="$SDK_VERSION"
node src/sdk-symbols.js
node src/ingest.js --all
node src/embed.js
node src/eval.js
node src/corpus-info.js
printf '\nCorpus rebuilt. Publish vectors and D1 together, retire obsolete vector IDs, then deploy with a new CORPUS_EPOCH.\n'
