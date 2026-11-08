# Answer-quality benchmark

The benchmark contains **40 synthetic student scenarios** in `eval/cases.mjs`:
Java, wiring, mechanical design, autonomous, current-season rules, lesson tutoring,
and diagnostic follow-ups. These are authored test cases, not real student usage
or evidence of answer quality. Each case defines expected behaviors, unacceptable
claims, source requirements, and a three-dimension human rubric.

## What a pass means

Automated checks can establish that an answer finished, did not degrade to a
source-only fallback, has required source records, and has no dangling numbered
citations. They **cannot establish correctness, useful teaching, or whether a
passage actually supports a claim**. Those require a reviewer to read the answer,
its evidence, and the version-matched official source.

Review correctness, usefulness, and citation support from 0 to 4. Each judgment
accepts `reviewerType: "human"` or `reviewerType: "model"`; omitted reviewer type
defaults to `human` for existing manual scoring files. An individual answer passes
human review only when every dimension is at least 3 and a human reviewer supplies
a rationale. Model scores use the same rubric but are always provisional. A completed stream does not receive a synthetic score. Source-only
fallbacks, refusals for these valid scenarios, disconnected streams, and request
failures remain failures. Unrun and unreviewed cases remain pending. Human-only means stay in `reviewedOnlyMeans`; provisional model means are
separate in `modelOnlyMeans`. Summaries count `humanReviewed` and `modelReviewed`
separately. Model-reviewed cases remain pending human review, even when all model
scores are high. A low model score can therefore count as a failed provisional
review and also as pending human review. A run establishes quality only when every
recorded case passes HUMAN review; model-only runs always keep
`qualityEstablished: false`.
This is a regression threshold, not a guarantee of future responses.

## Generate the review plan without network requests

From the repository root:

```bash
node eval/benchmark.mjs plan --out eval/results/review-plan
node --test eval/benchmark.test.mjs
```

The first command writes a JSON run and Markdown scoring sheet for all 40 cases.
Every case is marked unrun; the command does not call the API. `eval/results/` is
ignored by Git. Review results before sharing them: live answer text is retained.
Student examples here are synthetic, and no credential is written to a report.

## Run answers explicitly

Start with three cases on a testing-key deployment:

```bash
node eval/benchmark.mjs run --live --testing-turnstile --limit 3 --out eval/results/smoke
```

`--testing-turnstile` explicitly selects Cloudflare's published dummy response and
only works on a deployment configured with testing keys. It does not solve a real
CAPTCHA. Do not use it as a replacement for production browser verification.
Every request includes a non-null `learning` object (defaulting to
`{mode: "explain", files: []}`), including scenarios without attached code. This
selects the Worker's private context path: no shared answer-cache read/write and
no `query_log` entry. Use a Worker revision that implements this contract; an older
deployment might ignore the field. The payload and dataset fingerprint use the
same default context.

The default endpoint is Sharp AI's Worker; use `--endpoint` for a separate test
Worker. Non-local endpoints must use HTTPS and cannot contain credentials or query
parameters. The default is at most three sequential requests, with 30 seconds
between cases and a 90-second request timeout. No live request occurs without
both `run` and `--live`.

A real Turnstile token is single-use. For one case, set `TURNSTILE_TOKEN` in your
local environment without putting its value in shell history. For multiple cases,
supply a local JSON map with `--tokens /absolute/path/to/tokens.json`, keyed by case
ID. Each value is a freshly obtained token, or an array of fresh tokens for an
initial request and an optional minute-limit retry. Keep this file outside Git.
The runner refuses to reuse `TURNSTILE_TOKEN` across multiple cases and never
serializes token values. Fresh browser verification must happen through the
normal browser flow; this tool does not acquire tokens itself.

Examples of selecting a smaller group:

```bash
node eval/benchmark.mjs plan --category diagnostics --out eval/results/diagnostic-plan
node eval/benchmark.mjs run --live --testing-turnstile --id diagnostic-01 --limit 1 --out eval/results/diagnostic-01
```

For a representative six-case staging run, replace the endpoint with the deployed
staging URL:

```bash
node eval/benchmark.mjs run --live --testing-turnstile --endpoint https://YOUR-STAGING-WORKER.workers.dev/api/ask --ids java-02,mechanical-01,auto-04,rules-01,tutor-01,diagnostic-02 --limit 6 --out eval/results/staging-six
```

A full staging run uses the same explicit testing-key condition:

```bash
node eval/benchmark.mjs run --live --testing-turnstile --endpoint https://YOUR-STAGING-WORKER.workers.dev/api/ask --limit 40 --out eval/results/staging-all
```

`--ids` selects distinct known case IDs, retaining dataset order.
`--limit` accepts 1–40; a full run requires explicitly passing `--limit 40` and can
consume model budget. Minute-limit responses retry once only when the server sends
`Retry-After` of at most 60 seconds and a fresh token is available. A rate limit
that cannot be retried stops the remaining cases and marks them unrun. A day limit
never triggers repeated requests. Interrupted answers preserve received text and
remain incomplete. Degradation is recorded explicitly, including the source-only
fallback text, and is never substituted for a successful answer.

## Review and score a recorded run

Use the generated Markdown file as the scoring sheet. Verify:

1. Does the answer identify the actual code, hardware, or lesson issue? Does it
   avoid the case's unacceptable claims?
2. Is there a small next action and an observable check appropriate to the
   student's evidence and selected tutoring mode?
3. Do the cited passages support the factual claims, with the applicable SDK,
   library, season, and manual revision? A matching URL or vocabulary overlap alone
   does not establish support. A good clarification can score well without a
   citation when it makes no unsupported factual claim.

Copy `eval/judgments.example.json` to a private results file, replace the `null`
scores and empty rationale for each case you actually reviewed, and add the other
reviewed case IDs. Omit unreviewed cases. For an automated/model assessment, set
`"reviewerType": "model"` on EVERY judgment rather than relying on the manual
default. The report labels those scores and means provisional, and does not claim
human validation. Keep separately named output files for provisional and later
human reviews. Then run:

```bash
node eval/benchmark.mjs score --input eval/results/smoke.json --judgments eval/results/judgments.json --out eval/results/scored
```

Each run records a SHA-256 fingerprint of the dataset. Scoring rejects a changed
dataset, unknown/duplicate case IDs, and incomplete human judgments; use the
matching dataset revision when reviewing an older run.
For comparing revisions, use the same cases, versions, review rubric, and reviewer
criteria. Record the commit/deployment with the results externally. Do not claim a
measured improvement until comparable runs have been reviewed.

No live baseline, quality score, or improvement claim is bundled with this code.

## Recorded live review

See [the dated live evaluation summary](evaluation-results-2026-11-08.md) for actual
outputs, provisional model scores, failures, and the limits of those samples.
