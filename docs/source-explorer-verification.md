# Source browser and dependency verification

Verified 2026-11-09. The Sources page searches indexed documentation directly,
filters keyword and semantic retrieval by a registry source ID, and displays
snapshot versions and original links. Source selection is bound in SQL and in
Vectorize metadata filters; hydrated results are checked again. Summarize-only
and link-only text is never returned by the search endpoint or rendered by the
browser, including inconsistent excerpt flags.

Headed Chromium fixture checks passed for filtering, permitted excerpts,
restricted text, retry after API failure, semantic fallback, low-confidence
match labeling, abort/clear behavior, bundled coverage fallback, and mobile menu.
Fixture outputs are synthetic, not measured answer accuracy. All ten public
pages loaded without page errors. Responsive checks at390,736,768,820,1024,1280,
and1440px found no horizontal overflow after moving the navigation drawer
breakpoint to1088px. Screenshots and machine-readable results are retained
locally under `/tmp/sharp-source-qa`.

The static website was upgraded from Astro5 to7.4.8 and React19.3.1, with current
React integration/types, GSAP patch, TypeScript compiler and Wrangler. The unused
SSR adapter and scaffolding CLI were removed. No page requires runtime SSR;
the separate API Worker remains the backend. `npm audit` reported zero advisories
for both production and development web dependencies after this change. Worker
Wrangler is now locked for reproducible installs. Astro requires Node22.23.4+.

TypeScript, web tests, production build and95 Worker/evaluation tests passed.
A mutation check confirmed the source-isolation regression test fails when the
hydrated-source guard is deliberately removed. This verifies behavior, not the
truth of generated answers. Live deployment checks are recorded separately.
