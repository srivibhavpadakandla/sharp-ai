# Corpus refresh and publication

The 2026-11-09 local refresh (artifact timestamps use **2026-11-10 UTC**) rebuilt
all configured vendor snapshots and metadata. The staged corpus has **3,857
chunks across 17 sources**, compared with the verified live baseline of 3,732
chunks across 16 sources. This describes the staged artifacts; verify live API
metadata after publication/deployment before claiming that those artifacts are
serving users.

| Source | Baseline chunks | Refreshed chunks |
|---|---:|---:|
| FTC Docs | 1,051 | 1,132 |
| Competition Manual | 218, TU04 | 220, TU08 |
| Official public Team Q&A | 0 | 42 published answers |
| Other existing sources combined | 2,463 | 2,463 |
| Total | 3,732 | 3,857 |

The latest official [SDK release](https://github.com/FIRST-Tech-Challenge/FtcRobotController/releases/latest)
and [published Maven metadata](https://repo1.maven.org/maven2/org/firstinspires/ftc/RobotCore/maven-metadata.xml)
both identify **12.0.0**. The SDK API surface is unchanged; its extraction timestamp
was refreshed. The [official manual](https://ftc-resources.firstinspires.org/ftc/game/manual)
identifies **TU08**. Updating its label alone would be insufficient: its actual
text, chunks, keyword index, vectors, and cache epoch were rebuilt together.

## New official coverage and source boundaries

The anonymous [public Team Q&A board](https://game-qa.firstinspires.org/boards/2027/FTC/QA)
explicitly declares itself public and exposes 42 answered questions for
2026–2027 BIOBUZZ. The adapter accepts only that official public FTC Team board,
only `ANSWERED` entries with a matching published answer, and canonical public
question links. Unanswered questions, volunteer/private boards, login flows,
author/account objects, and the excluded third-party team curriculum are not
indexed. Question/ruling numbers remain in titles and links.

The manual and Q&A remain **summarize-only**: `can_excerpt=0`, no original text in
client excerpts, and no permission to quote their original wording. The new Q&A
source carries a verified season version through the public manifest. Other
restricted sources retain their existing policies; title/link-only sources are
validated against the deterministic metadata-only record format. No rights are
inferred from public availability.

## Refresh and verify

```bash
./ingest/scripts/refresh.sh
npm --prefix ingest test
```

`--no-pull` rebuilds existing snapshots without fetching newer vendor material.
The script uses the machine's existing proxy route for Node fetches; this fixed
real Chief Delphi connection timeouts and recovered all 752 REV page titles.
Missing/empty sources fail the refresh instead of silently publishing an empty
corpus. An isolated worktree preserved the original vendor/data/model-cache
snapshots during this run.

Embedding reuses only dimension/model-compatible vectors with matching text
hashes. The existing-source pass embedded 449 changed/new chunks and reused
3,366; the Q&A pass reused all 3,815 and embedded only 42 new chunks. The complete
retrieval/relevance evaluation passes, including **16/16 source-routing checks**;
new checks exercise R102 and two published Q&A subjects. These are retrieval
checks, not a factual-answer accuracy score or human review.

Do not run a single-source ingest over the canonical full data directory: that
command replaces the local corpus and SQL outputs. Always rebuild the merged
corpus before publishing its manifest and epoch.

## Read-only backup and staged publication

```bash
node ingest/scripts/snapshot-corpus.mjs --remote --out ingest/data/live-snapshot
node ingest/scripts/stage-publication.mjs --baseline ingest/data/live-snapshot --out ingest/data/publication
```

Supply the previous `corpus-info.json` alongside the snapshot before staging.
Snapshot exports are restricted to `sources` and `chunks` plus document vectors;
student answers, query logs, feedback, and cache contents are not exported.
Wrangler's temporary signed export URL is redacted from saved logs. Vector
snapshot reads respect the actual 20-ID `get_by_ids` limit.

The observed baseline has all 3,732 live chunk hashes matching the original local
snapshot. A full remote vector snapshot supplies rollback values. The staged
forward delta contains **133 added, 686 changed, and 8 removed chunk IDs**, with
3,038 unchanged. Forward/rollback SQL only updates corpus tables, uses escaped
UPSERTs, and prunes explicit obsolete IDs. It does not drop schemas or touch
private tables. Tests exercise quoted hostile-looking source text, protected
sentinel rows, FTS integrity, and exact rollback restoration. A full-data local
forward/rollback roundtrip also restored the original 3,732 chunk hashes.

The ignored publication directory contains checksummed forward/rollback SQL,
all current/previous vectors, explicit retirement ID lists, and current/previous
manifests. Do not commit corpus text, embeddings, snapshots, or signed URLs.

## Coordinated production sequence

1. Verify the Vectorize `source_id` **String** metadata index. It already exists
   on the inspected production index, together with `category`. If absent,
   create it before upserting; existing vectors must be re-upserted for that
   metadata index to cover them. See [Cloudflare metadata filtering](https://developers.cloudflare.com/vectorize/reference/metadata-filtering/).
2. Upsert **all 3,857** current vectors, including reused embeddings, using
   `wrangler vectorize upsert sharp-ai-chunks --file PATH/vectors-upsert.ndjson --batch-size 500 --json`.
   Wait until the final mutation is processed. Before pruning, the expected
   count is 3,865 because eight obsolete IDs remain.
3. Apply the checksummed corpus-only `forward.sql` to the existing D1 database.
   Verify 3,857 rows, 17 sources, and 42 Q&A rows with summarize-only policy;
   confirm protected-table counts did not decrease.
4. Retire only the eight IDs in `vector-ids-retire.json`. Wait for final vector
   count **3,857** and verify source-filtered semantic queries.
5. Deploy the merged Worker/web code with the new manifest and
   `CORPUS_EPOCH=2026-11-10-1c4a00ff85f3f5a1`, then check live corpus/manual APIs
   and Q&A/manual searches. Old answer-cache entries expire naturally; no
   student answer/cache table is erased.

D1 and Vectorize changes are **not a cross-store atomic transaction**. Keep the
publication window short and verify each stage. If a stage fails, stop and use
the staged rollback: restore previous vectors and corpus SQL, retire the 133 new
IDs, restore the previous manifest/epoch, and verify the previous source counts.
The original application code must not be deployed from the indexing worktree;
merge its data/provenance changes into the current Worker/web branch first.

## Production publication verification

The approved corpus publication completed on **2026-11-10 UTC**. D1 contains
**3,857 chunks across 17 sources**, including 42 official Q&A rows restricted to
`can_excerpt=0` and `summarize`. Vectorize reports **3,857 vectors at 768
dimensions** after processing retirement mutation
`13e6bbeb-3624-4b91-af11-cdd531a49036` at
`2026-11-10T01:26:52.223Z`. A stored Q&A vector matched its staged content hash
and source metadata; a metadata-filtered semantic probe returned five matches,
all from `first-qa`.

Protected-table checks used only aggregate counts, which were exactly unchanged
before and after publication. No private content was exported. Proof logs and rollback artifacts remain in ignored local
`ingest/data/publication/`; application deployment is coordinated separately
from the current merged Worker/web branch. These checks establish publication
integrity, not answer quality or general factual accuracy.

## Ingest dependency security follow-up

The local-only ingest dependency retains Transformers.js 3.8.1 and overrides
its image dependency to `sharp@0.35.5`, with a regenerated lockfile. The reviewed
advisories concern inherited image parsers:
[libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) before 0.35.0,
[libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) before 0.35.4, and
[librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) before 0.35.5.
The ingest feature-extraction path supplies text rather than images, but the
transitive packages are still patched. Sharp 0.35.5 requires Node >=20.9.0.

An isolated installation loaded the unchanged cached
`Xenova/bge-base-en-v1.5` model with fp32, CLS pooling, and L2 normalization.
Three synthetic passage/query inputs produced finite 768-dimensional vectors
bit-identical to the previous dependency installation (maximum absolute
difference 0). This bounded compatibility check is not an exhaustive model
benchmark. Model weights, query prefix, dimensions, and corpus vectors were
unchanged; no reindexing or production mutation accompanied this update.
The revised ingest lockfile reports zero npm audit findings; all ten ingest
integrity tests pass.
