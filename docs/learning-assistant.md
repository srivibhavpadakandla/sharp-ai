# Learning assistant

Sharp AI supports four help modes in its chat and the Telemark lesson panel:
**explain**, **hint**, **solution**, and **diagnose**. A learner can ask explicitly
for a worked solution even after starting with hints. Diagnostic suggestions use
the newest reported observation and distinguish failed checks from passed ones.
They guide the next question; they are not evidence of a root cause.

## Code and lesson context

The public chat accepts Java/text files or pasted code, the exact error or
observed behavior, and the learner's attempt. Telemark can capture an explicit
snapshot of its currently loaded simulator project, including multiple Java
files, and includes the current lesson section when selected. The attachment
list previews each file, and individual files can be removed. Refresh the
snapshot after changing the simulator. `Explain this code` requests an explanation
and one small test. Source code is never executed or automatically applied.

`POST /api/ask` accepts an optional `learning` object:

```json
{
  "mode": "hint",
  "files": [{"name": "Main.java", "source": "motor.setPower(0);"}],
  "error": "The motor never moves.",
  "attempt": "I checked the configured name.",
  "lesson": "Map hardware in init, then command it in loop."
}
```

Limits: six files, 16,000 code characters in total, 2,000 error characters,
2,000 attempt characters, and 3,000 lesson characters. The server rejects
oversized attachments rather than silently truncating code. Telemark's section
capture is explicitly limited to the first 3,000 characters of that section;
the interface states that limit. The existing 500-character question limit
is separate. The entire JSON request is capped at 100,000 bytes.

Context is untrusted learner data, not an instruction or citation source.
Personalized requests bypass both reads and writes of the shared answer cache
and do not enter the query log. Aggregate token/quota counters still apply.
Attachments are sent to the answer provider for generation. Context fields are
not automatically retained by the server; generated replies can still be saved
in the learner's browser. Browser chat history is local, not synced.

## Check the evidence

Citations include the indexed SDK/manual version or an explicit indication that
the index has no version. Library versions inferred from a versioned source URL
are labeled that way. The `evidence` SSE event maps cited paragraphs to bounded,
verbatim passages from sources that permit excerpting. Restricted or summarize-only
sources expose a link and restriction status, never a reproduced passage.

A wording match is **not** a proof that a claim is correct. Both interfaces state
this, show weak matches, and link to the full source. General engineering
suggestions remain separate and uncited. SDK symbol checks are not compilation
or robot runtime tests. The 40-case benchmark's source-support rubric is the
independent review step; see [evaluation.md](evaluation.md).

## Verification

- `npm test --prefix worker`: request bounds, real handler with mocked model
  and local corpus, privacy, modes, negative/latest diagnostic observations,
  citation indices, excerpt restrictions, and benchmark harness tests.
- `npm test --prefix web`: rendering safety and restored evidence restrictions.
- Telemark: `npm run typecheck`, `npm run test:site`, and production build checks.
- Browser QA uses isolated synthetic UI fixtures for payloads, source panels,
  simulator capture, follow-ups, copy actions, and desktop/mobile layout. It
  does not establish real Google sign-in or answer accuracy.
- Live benchmark runs record actual model replies to synthetic scenarios. Model
  reviews remain provisional and do not count as human validation.

## Limits found by live review

The first six synthetic live scenarios exposed incorrect extra API claims,
unsupported causal wording, missing version clarification, and an unstated manual
snapshot. The implementation now asks for installed library versions before API
selection, keeps code observations distinct from documentation claims, and names
the indexed rule revision and date. These guards reduce the observed failures;
they do not establish general answer correctness.

The manual remains the **TU04 snapshot indexed on 2026-10-11**. It has not been
re-ingested as part of this change. Newer revisions can exist at the same official
URL. The answer must state this limitation instead of presenting that snapshot
as current. A future corpus refresh requires coordinating D1, vectors, the full
manifest, and cache epoch; relabeling old text as a newer revision is not a fix.
