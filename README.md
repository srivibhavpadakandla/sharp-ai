# Sharp AI

FTC documentation answers with the supporting sources beside them. Astro and React on Cloudflare Pages, one Cloudflare Worker, D1 keyword search, and Vectorize semantic search.

## Features

- Cited answers, FTC SDK symbol checks, and a separate general engineering reasoning section.
- A responsive chat workspace with one thinking indicator, stop/retry, answer and code copying, and Markdown export.
- Conversation history stored on the current browser, with search and deletion. Only grounded answers and their sources are retained; questions have no public share page.
- A Pedro Pathing planner with Pedro 3 and Pedro 2 Java exports, import, curves, heading interpolation, sequences, and simulated timing. Pedro 3 exports preserve planned pauses. Configure your own hardware and implement actions before running the generated autonomous.
- Robot configuration, CAD size checks, a mechanism lab, and a BIOBUZZ season guide.

## Sources and freshness

The registry in `ingest/src/sources/index.js` defines the supported sources. These include Game Manual 0, FTC Docs, official SDK API and samples, the Competition Manual, Pedro Pathing, Road Runner Quickstart, REV, FTCLib, CTRL ALT FTC, and robotics community indexes.

`worker/src/lib/corpus-info.json` records the current section counts, refresh date, SDK version, manual version, and source modes. The chat and About page use this manifest. `/api/corpus`, `/api/manual`, and `/api/health` expose current metadata.

Openly licensed sources permit cited excerpts. The Competition Manual and Pedro documentation are summarized without reproducing their text in the UI. Other sources are indexed by titles and links. Game Manual 0 is CC BY-NC 4.0; the site has no advertising, paid tier, or sponsorship.

## Query flow

1. Verify the browser and enforce the per-IP allowance.
2. Look up the answer cache using the documentation snapshot and normalized question.
3. Retrieve D1 FTS5 and Vectorize results and fuse the rankings.
4. Check relevance; optionally plan another search and rerank.
5. Stream the answer and its citations. If the main model has no quota, try Flash Lite before returning clearly labeled source excerpts.
6. Check citations and SDK symbols, then persist the grounded answer privately.

The primary answer model is configured in `worker/wrangler.toml`. The current primary and deep models are `gemini-3.7-flash`; planning and quota fallback use `gemini-3.5-flash-lite`. The actual successful answer model is recorded with the cached answer. Provider quota is separate from the site's daily call ceiling.

## Project layout

```
ingest/   local corpus adapters, embedding, and retrieval evaluation
worker/   retrieval, generation, verification, quota, and private persistence
web/      Astro pages and React workspaces
scripts/  test-gated deployment
```

## Development

Install dependencies in each package. `npm --prefix web run dev` opens the website; the development server proxies API requests to the deployed Worker. For a local Worker, load the local schema/corpus and configure its development bindings and secrets using `worker/.dev.vars`.

```
npm --prefix ingest install
npm --prefix worker install
npm --prefix web install
npm --prefix web run dev
```

For fully offline retrieval, configure `DEV_EMBED_URL` and `REQUIRE_TURNSTILE=false` in the local Worker's development variables, load `ingest/data/sql/900-vectors.local.sql` into local D1, and run `npm --prefix ingest run embed-server`.

## Refresh the corpus

The vendor checkouts are Game Manual 0, FTC Docs, the FTC SDK, and Road Runner Quickstart. SDK javadocs and the current manual are downloaded by the refresh script. `pdftotext`, `curl`, `unzip`, and `rsync` are required.

```
./ingest/scripts/refresh.sh
```

`--no-pull` rebuilds existing vendor files. `FTC_SDK_VERSION` selects an explicit SDK release; otherwise the script uses the latest published release. Pedro pages and link indexes are refreshed, source metadata is rebuilt, and unchanged embeddings are reused only when the text hash matches. Evaluation fails the refresh if relevance gates or source routing regress.

To publish, snapshot the live corpus, upsert the rebuilt vectors, verify processing, replace D1 with the generated source/chunk SQL, and retire vector IDs absent from the current corpus. The generated corpus epoch retires old answer caches, including when licensing or source links change. Deploy the Worker and website together after publishing the data.

## Verify and deploy

```
npm --prefix worker test
npm --prefix web test
cd web
npx tsc --noEmit -p .
npm run build
```

From the repository root:

```
./scripts/ship.sh
```

The script runs tests, typechecks, deploys the Worker and production Pages project `sharpftc`, checks health, and verifies the deployed chat bundle's API host. Use `./scripts/ship.sh worker` or `./scripts/ship.sh web` to deploy one part.

Production: https://sharpftc.pages.dev

Worker credentials stay in Cloudflare secrets. Public site configuration is baked into the web build; keep its API origin, CSP, and CI environment aligned.

## Telemark integration

Telemark sends its Firebase ID token to `POST /api/ask` alongside the question,
lesson context, recent turns, and `chat: true`. The Worker verifies the RS256
signature and Firebase claims for `FIREBASE_PROJECT_ID=telemark-e9159` using
Google’s public keys. Public Sharp AI requests continue to use Turnstile.

Keep `SITE_ORIGIN` in `worker/wrangler.toml` aligned with both the canonical
Telemark origin (`https://telemarkfirst.github.io`) and the legacy origin
(`https://sharpfacerobotics.github.io`). A missing origin blocks browser access
even when the API is healthy. Signed-in students have separate hashed account
budgets (`RATE_PER_DAY_SIGNED_IN`), so classmates do not share one IP allowance.

A rejected account token returns `403 auth-failed`; unavailable verification
returns `503 auth-unavailable`. Missing public CAPTCHA tokens still return
`403 turnstile-failed`. Run `npm test` in `worker/` before deploying: the tests
exercise the real ask handler with locally signed test tokens and mocked public
keys, CORS configuration, invalid credentials, and shared-network budgets.
