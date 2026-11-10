# Sharp AI and Telemark improvement goal

Requested 2026-11-09: run and improve both applications, including UI, useful new
features, updates, and more documentation indexing. Existing working changes and
student data must be preserved. Verify what a learner experiences, distinguish
mocked UI tests from real services, and never substitute test counts for answer
accuracy.

## Work in progress

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
- Worker tests, index privacy/rollback tests, TypeScript, web tests/build,
  and headed desktop/mobile public-page checks pass. Fixture auth/answers are
  synthetic. Real Google sign-in and human answer accuracy remain unverified.
- Canonical Telemark deployment42732828386 passed its build but timed out
  syncing Pages files. The live build remains29862bc3 (October11). Main is
  read-only to this account; PR1 contains the changes awaiting a maintainer.

Production index/deployment verification continues below when completed.
