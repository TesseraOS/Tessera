# ADR-0066: Core Web Vitals are observed under reduced motion, not simulated by Lighthouse — and one budget is registered, not raised

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Project lead, Claude
- **Tags:** performance, frontend, marketing, verification, nfr-17

## Context

NFR-17 declares Core Web Vitals budgets for the public marketing surface (`lcpMs 2000`, `cls 0.05`,
`inpMs 200`), and `docs/design/marketing-design.manifest.json` has carried them since F-028. They
were never enforced.

F-049 tried, with Lighthouse, and **removed it again with evidence**: the marketing hero runs a WebGL
`ShaderField` and a canvas `Constellation` on continuous `requestAnimationFrame` loops, so the trace
is wall-to-wall long tasks. Under Lighthouse's default *simulated* throttling it reported a **TBT of
71,670 ms inside a ~10 s trace**; under `throttlingMethod: 'provided'` it returned **TBT NaN and a
performance score of 0**, with an unthrottled localhost LCP of 136 ms that represents nothing.
Neither number is gateable, so CWV was left declared-but-unenforced rather than faked — and F-074
was filed with the evidence.

The same root cause has now bitten twice: the lesson
`playwright-a11y-assertions-avoid-framework-overlays` records these infinite animations breaking
screenshot capture.

## What was measured

F-074 refused to pick from the candidate list without data. Probing the **real production build**:

| Condition | window | LCP | CLS | TBT |
|---|---|---|---|---|
| motion, 4x CPU | 5 s | 384–824 ms | 0 | **2951–3577 ms** |
| motion, 4x CPU | 10 s | 364–728 ms | 0 | **6833–7420 ms** |
| reduce, 4x CPU | 5 s | 352–608 ms | 0 | 624–969 ms |
| reduce, 4x CPU | 10 s | 344–448 ms | 0 | **655–713 ms** |
| reduce, 1x CPU | 10 s | 92–124 ms | 0 | 218–228 ms |

**With animation, TBT doubles when the observation window doubles.** It measures how long you
watched, not the page — reproduced here *without* Lighthouse, which proves the cause is the page and
not the simulation model. **Under reduced motion it is bounded and window-independent**, because the
art paints one frozen frame and stops.

## Decision

### 1. Observe the browser's own metrics; do not simulate

`PerformanceObserver` for `largest-contentful-paint`, `layout-shift`, `longtask` and `paint`,
collected by an init script so `buffered: true` cannot miss an early entry. CLS implements the real
metric (largest sum over 5 s session windows with 1 s gaps), not a naive total — a naive sum would
climb with observation length, reproducing in CLS the exact defect that makes TBT ungateable.

### 2. Measure under `prefers-reduced-motion: reduce`

Set on the browser **context**, so it is in force for the first paint; flipping a media query after
navigation would leave the art already initialised and measure a state no user is in.

This is not a test-only mode — it is the designed still-frame state the site ships, and the
accessibility-respecting default on a great many devices. It is also the only condition in which a
task-based metric terminates.

**The honest limitation, stated in the gate header, in `budgets.json`, in `gates.json`, and on every
report line: this does not measure what a motion-enabled visitor experiences.** A pathologically
expensive shader would not be caught. What is caught is every regression a budget is actually for —
bundle growth, blocking scripts, layout instability. A gate that measures one real user state
honestly beats no gate, which is what the alternative has been since F-028.

### 3. Calibrate at 4x CPU, via devtools throttling

Lighthouse's mobile convention, and how a 200 ms TBT / 2000 ms LCP budget is normally read. The
declared budgets name no device, so the gate names one and says so. Applied through CDP
`Emulation.setCPUThrottlingRate` — the browser really does run slower, as opposed to Lighthouse's
`simulate`, which models a slow machine from a fast trace and is what produced 71,670 ms.

Unthrottled was rejected for the reason F-049 rejected it: it flatters the very number the budget
exists to constrain.

### 4. Median of 3, with the spread printed

A single lab run is noise; asserting on a max makes the slowest scheduling accident the verdict. The
min–max prints beside every metric, because acceptance clause 3 asks for stability *demonstrated* and
a number whose spread you cannot see is not demonstrated. Observed across three consecutive gate
runs: LCP medians **528 / 456 / 488 ms**, CLS **0 / 0 / 0**, TBT medians **1008 / 964 / 1008 ms**.

### 5. LCP and CLS are enforced; TBT is registered, not raised

The app misses TBT — ~950–1050 ms against 200 ms, from **one ~263 ms long task at hydration** that
is present even unthrottled (218–228 ms at 1x). `budgets.json`'s standing rule is that a miss is "a
code-splitting job or a **registered work item**; it is never a raised number", so:

- the budget stays at 200 ms,
- TBT is measured and printed against it, labelled with its owner,
- the miss is registered as **F-100** (marketing app work: defer the WebGL/shader init out of the
  hydration commit),
- and `REPORTED_NOT_ENFORCED` in the gate is the single place that says so. Emptying it is F-100's
  last step.

The summary line says "every **ENFORCED** budget met" whenever such a miss is printed. A verdict that
contradicts its own report three lines above is how a gate stops being read.

### 6. The gate self-tests its metric arithmetic

`computeCls` and `computeTbt` are checked against known inputs on every run, before anything is
measured. This site's CLS is a genuine, stable **0** — so an implementation that always returned 0,
or ignored session windows, would report "ok" forever and nobody would find out. A budget assertion
nothing can drive red is not an assertion.

That check earned its place immediately: the first two versions of its 5 s-window case passed
*through a different branch* (the 1 s-gap rule, then a single split at the last element) and stayed
green with the cap deleted. The committed case is the one where the cap uniquely decides the answer —
0.6 correct, 0.1 with the anchor bug.

## Consequences

- **NFR-17's CWV clause is now satisfied by a gate for LCP and CLS**, and honestly reported as
  unsatisfied for TBT until F-100. It is no longer documentation.
- **CI's `test:perf` step is ~35 s slower** (3 passes × 10 s settle, marketing only). Paid
  deliberately: fewer passes or a shorter window is measurably less stable.
- **The numbers are lab numbers on the runner's hardware.** LCP has ~4x headroom, so a slower runner
  should not flip it; if one ever does, the answer is a documented runner baseline, not a raised
  budget.
- Only apps declaring a `vitals` block are measured — `web` and `docs` are unaffected, and adding a
  block is how they opt in.

## Alternatives considered

- **Lighthouse with `throttlingMethod: 'devtools'`** (candidate (c)). Rejected: it inherits
  Lighthouse's scoring model and its own trace window for a metric this page makes unbounded, and
  brings a heavy dependency to compute entries the browser already emits. The throttling method was
  never the problem — the unbounded trace was.
- **Freezing animation with a test-only flag.** Rejected: it measures a state no user is ever in.
  Reduced motion measures a state real users are in, and the site already designs for it.
- **Raising the TBT budget to what the app measures.** Rejected by `budgets.json`'s own rule, and it
  is the failure mode the whole file exists to prevent.

## Links

- Supersedes the "CWV are NOT gated here" scope limit in
  [`tests/web-perf/budgets.json`](../../tests/web-perf/budgets.json) and the `web-perf` gate entry.
- Related: [ADR-0021](0021-frontend-harness-and-design-skill-adaptation.md) (the budgets' origin),
  F-049 (the bundle half of this gate), F-100 (the registered TBT miss).
