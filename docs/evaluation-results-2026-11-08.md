# Live evaluation observations — 2026-11-08

These are **actual live Worker outputs for synthetic learner scenarios**, followed
by **provisional model review**. No real student work was submitted. There were
**zero human reviews**, and `qualityEstablished` is **false** for both runs. Code
was not compiled or executed, and no robot or mechanism was tested.

The dataset and rubric were unchanged between runs. Dataset SHA-256:

```text
e3135a379332de1070e1bcfb5bda4edae6dfd7393eb1c7085b28fc968b130628
```

Scores below are **C / U / S**: correctness, usefulness, and citation support,
each from 0–4. Every dimension must be at least 3 for a provisional model pass.
Structurally failed responses remain unscored, even when they contain useful
content.

## Original six-case run

Recorded timestamp from the run file: **2026-11-08T21:06:12.363Z (UTC)**.

| Case | Structural state | Reviewer type | C / U / S | Observation / failure |
|---|---|---|---|---|
| java-02 | ready-for-review | model | 2 / 3 / 2 | Correct field-shadowing fix, but adds a missing-device-null assertion inconsistent with official exception guidance; source support is mixed. |
| mechanical-01 | ready-for-review | model | 2 / 2 / 2 | Motor conclusion is too categorical; does not ask whether binding persists unloaded. |
| auto-04 | ready-for-review | model | 2 / 1 / 3 | Discusses direct following/Ivy but never asks for the installed Pedro version. |
| rules-01 | ready-for-review | model | 3 / 2 / 2 | Starting-size facts are supported by a narrow official-manual spot check, but the answer omits indexed revision/freshness limits. |
| tutor-01 | failed | none; unscored | — | Relevant hint appears only as uncited reasoning; grounded answer and evidence claims are empty. |
| diagnostic-02 | ready-for-review | model | 3 / 3 / 3 | Provisional pass: uses the successful hardware test to narrow to the active configuration/name check; wording about wiring remains too broad for a top score. |

Five cases received numeric model review: **one provisional pass and four model
failures**. The hint case failed its structural gate. Human-reviewed count: **0**.

## Five-case regression run

Recorded timestamp from the run file: **2026-11-08T21:13:57.133Z (UTC)**.
The operator identified deployment `6e45c556-5a86-4faa-a021-40f4add62bcb`; the
benchmark did not independently read a deployment ID from an API response.

| Case | Structural state | Reviewer type | C / U / S | Observation / failure |
|---|---|---|---|---|
| java-02 | ready-for-review | model | 3 / 3 / 1 | Incorrect extra null assertion is gone; the cited passage addresses initialization timing rather than the submitted local-variable shadowing issue. |
| mechanical-01 | ready-for-review | model | 3 / 3 / 1 | Recommendation is qualified and diagnostic metadata asks about supported load/binding; malformed two-equals delimiters collapse the grounded/uncited sections and leak into evidence. |
| auto-04 | ready-for-review | model | 4 / 3 / 4 | Provisional pass for requesting installed version/dependency evidence before proposing a replacement API; does not establish code-generation quality. |
| rules-01 | ready-for-review | model | 3 / 2 / 2 | Still omits indexed revision/date, a current-source verification limit, and rule numbers. |
| tutor-01 | failed | none; unscored | — | Hint is more conceptual, but remains entirely uncited; suggested hub-restart/OpMode-stop replies do not match the submitted code issue. |

Four cases received numeric model review: **one provisional pass and three model
failures**, plus the structural hint failure. The mechanical stream passed the
existing transport checks but failed model review for mixed trust lanes.

These small, single-response samples are **not general accuracy estimates or
proof of improvement**. The second run excludes the original sixth case, and model
grading is fallible. Human-reviewed count remains **0**; neither run establishes
answer quality.

## Subsequent software guards

The observed failures prompted further software guards covered by regression
tests: handling two-equals grounded/beyond delimiters, adding a server-generated
indexed-manual disclosure, keeping code hints free of unrelated reboot choices,
and retaining uncited hint history in memory for follow-ups. These guards address
specific protocol and conversation failures. **The final guarded version was not
live-reviewed in the runs above**, and passing its software tests does not prove
factual accuracy, source entailment, or good teaching.

The manual spot check during review found the official URL serving **TU08** while
the indexed source metadata was **TU04**. This summary does not claim the corpus
was refreshed. The appropriate limitation is explicit indexed-version disclosure
and verification against current official sources.

## Local provenance and review limits

Full logs remain local in Git-ignored `eval/results/`:

- Original actual outputs: `live-six.json`, `live-six.md`; MODEL judgments:
  `live-six-judgments.json`; reviewed reports: `live-six-reviewed.json`,
  `live-six-reviewed.md`; limitations: `live-six-review-notes.md`.
- Regression actual outputs: `regression-five.json`, `regression-five.md`; MODEL
  judgments: `regression-five-judgments.json`; reviewed reports:
  `regression-five-reviewed.json`, `regression-five-reviewed.md`; comparison:
  `regression-five-comparison.md`.

Only this summary is intended for the repository. No full third-party excerpts
are reproduced here. Model notes for the hint cases exist in the judgments, but
their numeric scores were rejected by the structural gate. Both reviewed reports
keep `qualityEstablished: false` and separate model assessments from human review.

Primary-source spot checks were limited to relevant passages in
[FTC Docs — Creating and Running an OpMode AS](https://ftc-docs.firstinspires.org/en/latest/programming_resources/tutorial_specific/android_studio/creating_op_modes/Creating-and-Running-an-Op-Mode-(Android-Studio).html#examining-the-structure-of-your-opmode),
[Pedro — Following a Path](https://pedropathing.com/docs/pathing/guide/path-following),
and the [official Competition Manual](https://ftc-resources.firstinspires.org/ftc/game/manual).
They do not verify the rest of the corpus.
