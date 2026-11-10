# Sharp AI and Telemark improvement goal

Requested 2026-11-09: run and improve both applications, including UI, useful new
features, updates, and more documentation indexing. Existing working changes and
student data must be preserved. Verify what a learner experiences, distinguish
mocked UI tests from real services, and never substitute test counts for answer
accuracy.

## Implemented scope

- Refresh authoritative indexed sources, SDK symbols, embeddings, and manifest;
  retain source licensing modes and preserve private answer/query data.
- Stage and verify coordinated D1/vector publication with rollback evidence.
- Add a usable source explorer with scoped search, source versions, coverage,
  excerpt restrictions, and a visible snapshot date.
- Improve Telemark tutor workspace recovery, retry/stop, safe saved history,
  and verify its curriculum/simulator/mobile flows.
- Check dependency update needs and make compatible fixes, avoiding unrelated
  upgrades without a tested reason.

## Gates

- Focused regression tests for the changed behavior, full relevant suites,
  TypeScript checks, production builds, and headed desktop/mobile browser QA.
- Real live checks of source retrieval and critical guest/chat flows; fixtures
  for authenticated UI must remain clearly labeled.
- Compare actual retrieval/answer evidence against documented expectations.
- Publish verified Sharp AI changes and prepare current Telemark PR changes.
  Canonical Telemark is read-only to this account; record that blocker rather
  than claiming an unperformed deployment.

## Current measured baseline

Sharp AI main 669886d: 3,732 indexed sections, 16 sources, SDK12.0.0,
Competition Manual TU04 indexed2026-10-11. Prior limited live model reviews found
citation/freshness weaknesses; no human-validated accuracy is established.
Telemark PR1 is mergeable at its current base but cannot be merged by this account.

## Verified implementation

- Added source notebook, source-scoped keyword/vector search, safe excerpt
  handling, original links, confidence labels, live/bundled coverage status,
  public sitemap entries, and responsive navigation.
- Refreshed all configured sources plus42 public official Team Q&A rulings:
  3,857 sections/17sources, manualTU08, latest verified SDK12.0.0. Snapshot date
  is2026-11-10 UTC. Publication has corpus-only backups and a tested rollback.
- Updated Sharp static website framework/dependencies; web and Worker tooling
  audits both report zero advisories. No SSR adapter is required by the site.
- Telemark recovery/retry/stop and safe history are implemented and browser
  verified. Its current canonical main is merged into the PR branch.
- 110 Worker tests, 10 index privacy/rollback tests, TypeScript, web tests/build,
  and headed desktop/mobile public-page checks pass. Fixture auth/answers are
  synthetic. Real Google sign-in and human answer accuracy remain unverified.
- Canonical Telemark hosting recovered after its separate main-branch workflow
  update. Deployment42736515223 and live build metadata verify ecd9840c;
  headed live guest/curriculum/mobile checks pass. This account still has no
  push/merge rights on canonical main. PR1 (head d0466a15) is mergeable and
  contains the new tutor and dependency improvements awaiting a maintainer.

Production index and source-browser deployment are verified. Final answer-reliability regression results are recorded in docs/reliability-regression-2026-11-09.md.

All three Sharp package groups (web, Worker tooling, ingest) now audit with zero
advisories. Telemark has zero critical/high/moderate production findings and five
low inherited findings from an upstream deepmerge package without a published fix.

## Final release state

Sharp AI main `5fb52b4` is deployed, with successful Worker/site/index safeguard
workflows. The website is https://sharpftc.pages.dev and the new source browser
is https://sharpftc.pages.dev/sources/. Live source-scoped search verifies all
3,857 sections across 17 sources, TU08 and the 42 public official Q&A rulings.
The existing private tables were preserved during corpus publication.

The live three-case answer rerun completes without fallback/errors. Java takes
33.9 seconds (previously a 90-second timeout), diagnosis 9.3 seconds (previously a
timeout), and rules 8.7 seconds. The rules answer includes its explicit preload
exception. A provisional model review found no remaining substantive factual
defect in these cases; Java evidence support remains weak and no human accuracy
claim is established. See the reliability regression report for exact limits.

Telemark PR https://github.com/telemarkfirst/telemarkfirst.github.io/pull/1
contains all tutor, history, calculator navigation, fullscreen and dependency
updates and is mergeable at head `d0466a15`, incorporating canonical main
`ecd9840c`. Separate clean install, typecheck, full site tests, production build,
headed recovery/mobile checks and real local FLL Python/fullscreen checks pass.
Its live guest software/mechanical/FLL pages and mobile layout also pass.

The remaining release action requires a canonical Telemark maintainer: this
account has read access and no push/merge permission. The PR changes are not
live until merged and deployed. Real Google sign-in and authenticated production
answers remain unverified. Five low inherited Telemark dependency advisories
remain because the upstream package has no published fix.
