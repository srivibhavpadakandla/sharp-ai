# Live reliability regression

Synthetic scenarios were run against the deployed Worker with its configured
public testing Turnstile key. Each request used the private learning path, so
it did not populate the shared answer cache or query log. This does not verify
real Google sign-in or real CAPTCHA protection.

The first three-case run found two 90-second metadata-only timeouts (Java field
shadowing and motor diagnosis). A starting-size answer completed in 8.5 seconds
but its unverified addendum contradicted R102's explicit exemption for preloaded
scoring elements. This was a substantive defect despite valid citation numbers.

The fix bounds each model's first visible content to 25 seconds and switches to
configured fallback models before emitting text. After output begins, 30 seconds
without further visible content terminates with an explicit fallback; it never
replays a partially delivered answer from another model. Internal thought,
usage and whitespace frames cannot defeat these deadlines. Reader/provider
cancellation, stalled headers, signal-ignoring providers and terminal API events
have regression coverage. Abandoned HTTP requests cancel model work.

Regulatory answers backed by the official manual or Q&A now omit the unverified
suggestion lane. The prompt requires applicable explicit rule qualifications and
exemptions. A deliberately contradictory fixture failed before this change and
passes afterward. Ordinary engineering suggestions remain clearly separated.
The answer-cache epoch changed so older policy outputs are not reused.

110 Worker/evaluation tests and 10 index tests pass; the Worker bundles successfully.
Live post-deployment results are appended after the rerun. Automated stream
checks and provisional model review are not human-validated answer accuracy.

## Deployed rerun

Worker commit `5fb52b4` deployed successfully in run42737266259. All three
synthetic scenarios completed with citations and terminal events, without
source-only fallback or request errors.

| Scenario | Before | After | Observed behavior |
|---|---|---|---|
| Java field shadowing |90s timeout|33.876s|Identifies local variable shadowing and removes the local type declaration to assign the field.|
| Robot starting size |8.491s|8.697s|Identifies TU08/date, states the robot limit, includes the preload exemption, no speculative addendum.|
| Motor configuration diagnosis |90s timeout|9.327s|Uses the completed hardware test and checks the active configuration's exact case-sensitive name.|

A provisional model review found no remaining substantive factual defect in
these three recorded responses. This is not human validation or a general
accuracy measurement. Java's evidence group remains labeled weak: the passage
supports hardware assignment, while the shadowing diagnosis comes from the
attached code. The diagnostic reply could name the exact `lift` lookup string
rather than referring only to line1. Those limits remain visible.

Ignored local reports: `/tmp/sharp-goal-live-benchmark.json` (before) and
`/tmp/sharp-goal-live-fixed.json` (after). They contain synthetic scenarios, not
student questions or credentials. Live source/API/browser artifacts are under
`/tmp/sharp-source-qa`; they verify source isolation, excerpt restrictions and
production desktop/mobile behavior.
