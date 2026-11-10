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
