# ADR-0063: Parity is asserted, not screenshotted; and the i18n migration ships as a guard plus an enumerated allowlist

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Project lead, Claude
- **Tags:** frontend, accessibility, i18n, testing, ux-baseline

## Context

F-064 completes the FR-49 UX baseline and adds NFR-14 i18n readiness. Two of its acceptance clauses
turned out to say something different from what the repository should actually do, and both were put
to the lead rather than quietly reinterpreted.

**1. The clause asked for "a screenshot matrix (light/dark × desktop/mobile) across all routes".**
F-057 had already considered and rejected screenshots for exactly this job, and its reasoning is
still in the code (`apps/web/tests/e2e/analytics.spec.ts`): a screenshot "proves a page looked right
on the day someone looked at it", whereas an assertion fails the build when it stops being true.
That feature shipped executable WCAG assertions across 4 themes × light/dark instead — 195 cases in
`tests/contrast.test.ts`. Adding a screenshot matrix now would either produce artifacts nobody diffs,
or pixel baselines that are platform-specific and chronically flaky.

**2. The clause asked for "user-facing strings externalized into a locale catalog".** Written as one
line. Measured: **421 strings across 52 component files**. The difficulty is not the work, it is that
a mistake is invisible — a wrong or missing string renders as a blank or the wrong words, and no test
fails. That risk is not hypothetical: during the migration a catalog value was seeded from a
*truncated lint message* and silently lost half a sentence, caught only by reading the source.

## Decision

### 1. Parity is proved by assertions; screenshots are non-gating artifacts

Layout parity is asserted directly (`apps/web/tests/e2e/parity.spec.ts`): every route at mobile and
desktop widths must not overflow horizontally, and `prefers-reduced-motion: reduce` must collapse
computed animation and transition durations. Colour parity across themes stays where F-057 put it.

Screenshots may still be captured for human review, but **nothing gates on pixels**. This is a
deliberate interpretation of the acceptance rather than compliance with its literal wording, and it
is recorded here so the difference is visible.

Two implementation notes that are load-bearing:

- The parity routes are visited with **no API stubs**, so each renders its error or empty state.
  Those are the layouts nobody inspects on a phone, and a page that fits when full of data and bursts
  its viewport when showing an error is still broken.
- Reduced motion is asserted on **computed durations**, not on the presence of a media query — the
  query can be present and still not apply to the elements that animate. Chromium reports the
  override as `1e-05s`, so the check parses durations rather than string-matching them.

### 2. i18n ships as a catalog, a typed accessor, an enforced guard, and an enumerated allowlist

`apps/web/lib/i18n` holds a **flat** English catalog and `t()`. Flat dotted keys rather than nested
objects: nesting would make `t()` walk paths, stop the key type being a plain union, and turn a typo
into `undefined` at runtime instead of a build error. `t()` has **no fallback-to-key** for the same
reason — a fallback makes a missing message look shipped. Interpolation is `{name}` substitution
only; plurals, dates and numbers belong to an ICU runtime, and `lib/format.ts` already owns
locale-aware formatting.

A custom ESLint rule (`tessera/no-hardcoded-strings`) fails hardcoded user-facing copy in components.
It flags exactly two things: JSX text nodes, and string values on a curated list of copy props. It
deliberately ignores object literals, template strings, `const` copy tables and unrecognised props —
**the failure mode of a noisy rule is that someone disables it**, and then it protects nothing.

The remaining files sit in an **enumerated allowlist**, generated from what the rule actually reports
rather than hand-written, and documented as remove-only. An allowlist rather than a warning level
because a warning lets the count grow silently, whereas a list keeps the remaining work countable and
makes shrinking it the only way to touch those files.

**Every migrated value is byte-identical to the string it replaced.** That is what makes the
migration safe to do in batches: no test needed rewriting across the whole feature, so anything that
breaks later is a real regression rather than churn.

## Consequences

### Positive

- A responsive or reduced-motion regression fails CI instead of waiting for someone to notice.
- New hardcoded copy cannot land in a migrated file, and the unmigrated set cannot grow.
- The i18n groundwork (catalog, accessor, guard) is complete even though the migration is not, so the
  remaining work is mechanical and countable rather than a design question.

### Negative / Costs

- **F-064 closes with its i18n clause only partly met** — 3 of 52 files migrated. This is stated on
  the feature and tracked as its own item, not buried.
- A file-level allowlist is coarse: a partly-migrated file is unguarded until it is finished.
- The parity spec asserts layout, not appearance. A page can pass it and still look wrong; that is
  the honest limit of not gating on pixels.

### Neutral / Follow-ups

- Completing the i18n migration, with the allowlist as its checklist.
- **axe audits that run immediately after opening an animated surface measure transitional colours.**
  Found in F-064: auditing during a dialog's fade-in produced 727 spurious contrast violations. The
  shortcuts spec now awaits `document.getAnimations()` first; other specs that audit right after
  opening an animated surface may be passing by timing luck and should adopt the same wait.

## Alternatives considered

- **Pixel-diff snapshot matrix.** Literally satisfies the clause and catches unintended visual
  change, but baselines are platform-specific — generated on Windows here, failing on CI's Linux
  runners until regenerated — and font rendering makes them chronically flaky. Rejected.
- **Screenshots as artifacts only, asserting nothing.** Closest to the clause's wording, cheapest,
  and catches a regression only if a person happens to look. Rejected.
- **Migrate all 52 files in one sweep.** Fully meets the i18n clause and needs no allowlist.
  Rejected by the lead: the risk is silent UI regressions across surfaces with no failing test, and
  the truncated-string mistake above shows the failure mode is real rather than theoretical.
- **Scope the lint rule to migrated files only.** No allowlist to maintain, but new hardcoded strings
  keep landing freely in the other 49 files — the exact outcome the guard exists to prevent.

## References

- Implements F-064 (FR-49, NFR-14, NFR-9). Touches effect **E-004** (design tokens → components).
- Related: [ADR-0021](0021-frontend-harness-and-design-skill-adaptation.md),
  [ADR-0022](0022-interim-dashboard-data-client.md) (never render a fake control),
  [ADR-0047](0047-dashboard-multi-theme-illustration-layer-contrast-gate.md) (the contrast gate),
  [ADR-0060](0060-usage-metering-analytics-and-the-metered-predicate.md) (F-057, whose
  screenshots-versus-assertions reasoning this follows).
