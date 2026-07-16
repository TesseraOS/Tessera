# Plan: F-049 Performance benchmarks & budgets — NFR-4 enforced + `web-perf` activation

- **Feature:** F-049 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** NFR-4 (performance targets enforced by a repeatable benchmark suite), NFR-12 (cost
  control), NFR-17 (public-web CWV budgets) — [`../../docs/PRD.md`](../../docs/PRD.md)
- **Service / package:** root — a new private suite `tests/bench` (`@tessera/bench`) + `test:perf`
  scripts in `apps/web` / `apps/marketing`
- **Author:** Claude (orchestrator) · **Date:** 2026-07-16

## Intent
NFR-4 is an **R0 exit criterion that was never measured** (flagged 2026-07-04) — "search p95 < 300 ms",
"compile p95 < 2 s", "token-lean" are claims with no evidence behind them. ADR-0021's bundle budget has
sat as documentation since F-028. F-049 turns both into **gates that fail**, so the claims become facts.

Two gates activate: **`perf`** (backend latency + token-efficiency) and **`web-perf`** (frontend bundle
+ Core Web Vitals).

## Approach

### The flakiness problem, decided up front
A perf gate that flakes gets ignored, then disabled — the F-048 lesson (*a flaky gate is a lie*) applies
doubly here. Three decisions keep it honest **and** stable:
1. **Absolute thresholds from NFR-4**, not baseline-diffing. CI hardware varies run to run; a
   baseline-delta gate would flake constantly. NFR-4's numbers are the contract.
2. **Deterministic providers by default** — fake embeddings + a seeded corpus. This measures **our
   engine**, not Transformers.js's model, and the engine should sit *orders of magnitude* under the
   NFR-4 ceilings. That headroom is exactly what makes the gate stable while still catching a real
   (10×) regression. A real-embeddings run stays available behind an env guard, and its number is
   recorded for the NFR-4 claim rather than gated on.
3. **Lab metrics named honestly.** Lighthouse cannot measure INP (a field metric); **TBT** is its lab
   proxy. The manifest's `inpMs` maps to a TBT assertion, and the doc says so — no pretending.

### 1. `tests/bench` (`@tessera/bench`) — the `perf` gate
- **Versioned fixture corpus** (`corpus/generate.mjs`): a **seeded, deterministic generator** (fixed
  PRNG seed + `CORPUS_VERSION`) emitting a realistic mix of code + markdown into a temp dir. Generated,
  not committed — hundreds of committed lorem files is noise; the *generator + seed + version* is the
  thing that must be stable, and it is. Bump `CORPUS_VERSION` when the shape changes, so old reports are
  visibly incomparable.
- **Harness** (`bench.mjs`): boots the real Local runtime **in-process** (that is the thing under test;
  HTTP framing is measured separately), ingests the corpus, then measures:
  | metric | how | threshold |
  |---|---|---|
  | `searchP95Ms` | N iterations × varied queries through the real hybrid retriever | **< 300** (NFR-4) |
  | `compileP95Ms` | N iterations at the configured default budget (8000) | **< 2000** (NFR-4) |
  | `incrementalIngestMs` | edit ONE file → re-scan → p95 | measure, then set with headroom |
  | `searchAnswerTokens` / `compileAnswerTokens` | `estimateTokens` over the REST **and** MCP payloads | measure, then set |
  `estimateTokens` (chars/4, `@tessera/context-compiler`) is the repo's canonical counter **and the one
  the budget itself is enforced with** — using anything else would measure a different thing than the
  product promises.
- **Report**: `results/latest.json` (per-run, gitignored) + a **committed `results/baseline.json`**
  (corpusVersion, recordedAt, machine, metrics) — the in-repo record. The gate asserts **thresholds**;
  the baseline delta is *printed for information*, never enforced (see decision 1).
- **Thresholds** live in a committed `thresholds.json` beside the report, sourced from NFR-4 where the
  PRD states a number. Where it doesn't ("near-real-time", "token-lean") I measure first, then set a
  documented threshold **with headroom** — establishing a bar, not lowering one. Per the acceptance, a
  miss becomes a **tuning work item**, never a relaxed number.

### 2. `web-perf` — bundle budget + Lighthouse
- **Bundle budget**: Next 16/Turbopack no longer prints first-load JS
  ([[turbopack-route-table-no-first-load-js]]), so measure **over the wire**: build → start → load the
  page → sum the JS responses gzipped. Asserted against the manifest's `firstLoadJsGzipKb: 240` for
  marketing, and an equivalent for the dashboard.
- **Lighthouse** against the production build, reusing **Playwright's chromium** (already installed for
  the e2e gates — no second browser download). Assert LCP / CLS / **TBT** + the performance score
  against the manifest's `webVitals`.
- Wired as `test:perf` in `apps/web` + `apps/marketing`; root `test:perf` → `turbo run test:perf`.

### 3. Gates + CI
`gates.json`: `web-perf` and `perf` `planned` → `active`; root scripts (`bench`, `test:perf`); turbo
tasks (`dependsOn: ["^build"]`); CI steps for both (verify-state's ci-mirror guard enforces the pairing).

## Files to touch
- **new:** `tests/bench/{package.json,tsconfig.json,corpus/generate.mjs,bench.mjs,thresholds.json,
  results/baseline.json}`; `apps/web/scripts/perf.mjs`, `apps/marketing/scripts/perf.mjs` (or a shared
  helper).
- **modified:** root `package.json` (+`bench`, +`test:perf`), `turbo.json` (+2 tasks),
  `apps/{web,marketing}/package.json` (+`test:perf`), `.harness/verification/gates.json` (activate ×2),
  `.github/workflows/ci.yml` (+2 steps), `.gitignore` (bench results).
- **docs/state:** a perf section documenting what is measured, with what provider, and why the lab
  metric is TBT not INP; effects (E-005 gates/CI, E-013 compiler perf surface); progress; feature_list.

## Anticipated effects
- **E-005** (gates ↔ CI): two more active gates + steps; `pnpm -w bench` / `pnpm -w test:perf`.
- **E-013** (compiler): the compile pipeline gains a *measured* latency + token contract — a change that
  slows compilation or fattens the package now fails a gate.

## Test plan
The harness is the test. Its own correctness: the corpus generator is deterministic (same seed → same
corpus hash, asserted); p95 math is unit-tested; thresholds are read from the committed file, not
inlined. Then: the gate passes on this machine, and the report is committed.

## Verification
`node scripts/verify-state.mjs` · `pnpm -w typecheck` · `pnpm -w lint` · `pnpm -w format:check` ·
`pnpm -w test` · `pnpm -w build` · `pnpm -w test:e2e` · `pnpm -w test:e2e:full` · **`pnpm -w bench`** ·
**`pnpm -w test:perf`**.

## Risks / open questions
- **CI hardware variance** — mitigated by absolute NFR-4 thresholds with large headroom + deterministic
  providers. If a metric lands near its ceiling, that is a finding (tune or register), not a nudge.
- **Lighthouse weight/flake** — reuse Playwright's chromium; assert with generous bounds; if CWV proves
  genuinely unstable in this environment, record it honestly and gate on the bundle budget alone rather
  than ship a gate that lies.
- **Fake vs real embeddings** — the gate measures the engine; the real-provider number is env-guarded
  and recorded. Documented explicitly so nobody reads the gate as proof of end-user latency.
- **Scope** — this feature adds no product code. A missed threshold becomes a work item (like F-048's
  F-071/72/73), never a silently relaxed number.
