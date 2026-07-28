# Plan: F-074 Core Web Vitals gate for public surfaces

- **Feature:** F-074 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** NFR-17, NFR-4
- **Service / package:** @tessera/web-perf (+ budgets, CI, docs)
- **Author:** Claude (Opus 5) · **Date:** 2026-07-28

## Intent

Turn NFR-17's Core Web Vitals clause from a declared number into an enforced one, on a marketing
surface whose hero runs a WebGL shader and a canvas constellation on continuous rAF — the exact
shape that defeated F-049's Lighthouse attempt.

## What was measured before anything was designed

F-049's lesson is that a CWV number chosen without measurement is worthless, so the technique was
picked from data. Probe against the **real production build**, `apps/marketing` `/`:

| Condition | window | LCP | CLS | TBT |
|---|---|---|---|---|
| motion, 4x CPU | 5 s | 384–824 ms | 0 | **2951–3577 ms** |
| motion, 4x CPU | 10 s | 364–728 ms | 0 | **6833–7420 ms** |
| reduce, 4x CPU | 5 s | 352–608 ms | 0 | 624–969 ms |
| reduce, 4x CPU | 10 s | 344–448 ms | 0 | **655–713 ms** |
| reduce, 1x CPU | 10 s | 92–124 ms | 0 | 218–228 ms |

Two facts decide the design:

1. **With motion, TBT is not a metric — it is a function of how long you watch.** Doubling the window
   doubled it (2951 → 6833). That is F-049's Lighthouse finding reproduced without Lighthouse, so the
   cause is the page, not the tool's simulation model.
2. **Under `prefers-reduced-motion: reduce`, TBT is bounded and window-independent** (655–713 ms at
   both 5 s and 10 s; the 10 s window is *tighter*, spread 58 ms vs 345 ms, because a 5 s window
   sometimes clips a late task). The art components paint one frozen frame and stop, so the trace has
   a real quiet point. This is a state the site genuinely ships — the designed still frames.

## Approach

### Technique: observed metrics via PerformanceObserver + deterministic devtools throttling

Not Lighthouse. `PerformanceObserver` gives the browser's own `largest-contentful-paint`,
`layout-shift` and `longtask` entries — no simulation model to extrapolate from noise — and CPU
throttling is applied through CDP (`Emulation.setCPUThrottlingRate`), which is *devtools*
throttling, deterministic, not Lighthouse's `simulate`.

- **CLS** implements the real metric (max over 5 s session windows with 1 s gaps), not a naive sum.
- **TBT** sums `duration - 50` over long tasks from FCP to the end of the window.
- **Calibration: 4x CPU** — Lighthouse's mobile convention, which is how a 200 ms TBT / 2000 ms LCP
  budget is normally read. The declared budgets name no device, so the gate names one and says so.
  Unthrottled localhost was rejected for the reason F-049 rejected it: an LCP of 136 ms represents
  nothing.
- **Measured under `prefers-reduced-motion: reduce`**, with the report saying so on every line. The
  honest limitation, stated in code and in the report: **this does not measure what a motion-enabled
  visitor experiences.** A pathologically expensive shader would not be caught here. What it does
  catch is every regression in the thing a budget is actually for — bundle growth, blocking scripts,
  layout instability — and it is the only condition under which a task-based metric terminates at
  all. A gate that measures one real user state honestly beats no gate.
- **Stability by construction:** 3 passes, assert on the **median**, print min–max so drift is
  visible rather than assumed (acceptance clause 3).

### Enforcement, and the one budget the app misses (lead-approved)

LCP and CLS pass with headroom and are **enforced**. TBT is ~680 ms against a 200 ms budget — one
~263 ms long task at hydration, present even unthrottled (218–228 ms at 1x). `budgets.json`'s own
rule is that a miss is "a code-splitting job or a **registered work item**; it is never a raised
number", so:

- TBT is **measured and printed against its budget**, marked as the registered miss, and does not
  fail the build.
- The miss is registered as a new backlog feature (**F-100**) for the marketing perf work — deferring
  the WebGL/shader init out of the hydration commit. That is app work on a design surface, with its
  own risk profile; it is not F-074's deliverable, which is the gate.
- `$vitalsNote` and the gate description say exactly what is enforced and what is not. No pretending.

### Increments

1. **The measurement** in `tests/web-perf/web-perf.mjs`: collector init script, real CLS session
   windows, TBT from FCP, median-of-3, 4x CPU, reduced motion.
2. **Wire it into the gate** for apps declaring a `vitals` block (marketing only today); LCP/CLS
   fail, TBT reports.
3. **Records:** `$vitalsNote`, the gate header comment, `gates.json` description, F-100 registered,
   ADR-0066, effects, progress, close.

## Files to touch

- `tests/web-perf/web-perf.mjs` — the measurement + reporting.
- `tests/web-perf/budgets.json` — `$vitalsNote` rewritten; add the throttle/condition to the vitals
  block so the numbers are self-describing.
- `.harness/verification/gates.json` — the scope-limit paragraph.
- `docs/adr/0066-*.md`, `.harness/state/{feature_list,effects,progress}.json|md`.

## Anticipated effects

- **E-005** (frontend/perf budgets) — the gate now asserts CWV, so a marketing change that regresses
  LCP or CLS fails CI.
- **E-022** (marketing/legal surface) — the marketing hero's art components are now measured; a
  change that makes the reduced-motion path do more work moves a gated number.
- CI's `pnpm test:perf` step gets slower (3 passes × ~10 s settle for marketing) — stated so the
  cost is a decision, not a surprise.

## Test plan

This gate *is* the test. Verification is:

- **Stability demonstrated, not asserted:** the median-of-3 with printed min–max, plus repeated full
  runs of the gate showing the verdict does not flip.
- **The gate can fail:** temporarily tighten a budget and confirm it goes red for the right metric —
  a perf gate that cannot fail is the same lie as a test that cannot.
- `pnpm test:perf` green end to end; workspace gates green.

## Risks / open questions

- **Reduced motion is a narrower claim than "the site is fast".** Mitigated by saying so everywhere
  the number appears, rather than by a footnote nobody reads.
- **Machine-dependent.** These are lab numbers on CI hardware; the budgets have headroom (LCP 2000
  vs ~400 measured) but a much slower runner could still flip LCP. If it does, the answer is a
  documented runner baseline, not a raised budget.
- **Gate runtime grows.** ~35 s added for marketing. Acceptable for a gate that runs after build.
