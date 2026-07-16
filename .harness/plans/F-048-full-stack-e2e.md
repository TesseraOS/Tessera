# Plan: F-048 Full-stack E2E — real server + fixture repo + real web + real MCP client (`e2e-full` gate)

- **Feature:** F-048 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** NFR-16 (a full-stack e2e that mimics an actual user + environment), NFR-8
  (verification/quality) — [`../../docs/PRD.md`](../../docs/PRD.md)
- **Service / package:** root — a new private workspace suite `tests/e2e-full` (`@tessera/e2e-full`)
- **Author:** Claude (orchestrator) · **Date:** 2026-07-16

## Intent
Every gate we have today proves a *slice*: `api`/`mcp` e2e drive in-process surfaces (`app.inject`,
in-memory transport), and the web e2e drives the dashboard against a **stub** or a single-purpose token
server. Nothing proves the **whole product works as one deployment**: a real server over real adapters,
a real repository ingested, the real dashboard against that live API, and a real agent over MCP seeing
the same data. F-048 builds that suite and turns it into the `e2e-full` gate.

## Approach

### Location + shape
A new **private workspace package** `tests/e2e-full` (`@tessera/e2e-full`), added to
`pnpm-workspace.yaml` via a new `tests/*` glob. It is neither an app nor a library — it is the
cross-surface suite, and the honest location says so. It owns a Playwright config whose `webServer`
list boots the two real processes, and whose specs are the two journeys.

**Determinism first** (the acceptance asks for a deterministic fixture, flake-budgeted): `workers: 1`
+ `fullyParallel: false`, so the journeys never contend; a fixed fixture corpus with hand-picked
distinctive terms; fake embeddings by default (deterministic + offline), real Transformers.js behind
`TESSERA_E2E_REAL_EMBEDDINGS=1`.

### 1. The real environment (`support/full-stack-server.mjs`)
Boots the **real** stack in one process, exactly as a self-hosted deployment does:
- `loadConfig` → **Local profile** with **file-backed** SQLite in a fresh `mkdtemp` dir (not
  `:memory:` — the agent journey is a *separate process* that must open the same database), fake
  embeddings, `auth.mode=token`, audit enabled, an **ephemeral port**.
- `createLocalRuntime` → `buildServer(runtime.services, …)` with the runtime's auth/events/tokenStore/
  memoryRetention (i.e. the same wiring `apps/server` uses).
- Issues one owner token; **registers the fixture repo as a filesystem source and scans it**, then
  asserts the scan indexed content before reporting healthy.
- Writes a **handoff JSON** (`.tmp/handoff.json`: `apiUrl`, `token`, `dataDir`, the `TESSERA_*` env)
  so the specs — and the spawned MCP process — attach to the *same* deployment. A test-only
  `/e2e/handoff` route mirrors it for the browser context (the F-045 `/e2e/token` precedent; never a
  production surface).

### 2. Fixture repository (`fixture/`)
A small, deterministic repo (a few TS modules with a clear import chain + a markdown ADR-ish doc) whose
terms are distinctive enough that keyword/semantic search assertions are stable and can't accidentally
match other content. The import chain gives `get_effects` a real dependent to return.

### 3. Human journey (`tests/human-journey.spec.ts`)
Playwright drives the **real `apps/web`** (production build via `next build && next start`, `cwd`
`apps/web`) pointed at the live API through `TESSERA_API_URL` — **not** its own stub:
sign-in (token mode, reusing the F-045 flow) → **sources** shows the scanned fixture → **search**
returns fixture content → **inspector** compiles a **cited, budget-bounded** package → **capture a
memory** → **audit** shows the trail of what we just did.

### 4. Agent journey (`tests/agent-journey.spec.ts`)
A browser-less Playwright test that spawns the **real `tessera-mcp` stdio binary** via the MCP SDK's
`StdioClientTransport`, with env pointed at the **same data dir** — i.e. exactly how an agent client
connects to a self-hosted Tessera. Exercises `search` / `compile_context` / `get_effects` /
`capture_memory` / `add_source` (ADR-0036) and asserts:
- it sees the **same fixture** the human saw (cross-surface, one engine — the real point of this test);
- **budget-bounded**: `compile_context` at budget N returns `totalTokens <= N`;
- **token-lean**: the serialized tool result stays under an asserted ceiling (no raw dumps).

SQLite is **WAL** (`sqlite-relational` sets `journal_mode = WAL`), so a second process can open the
same DB. Note `sqlite-vec` sets no pragma — cross-process vector writes are the one real contention
risk; serialized workers keep one writer at a time. **If this proves contentious it is a genuine
product finding** (a real deployment runs `tessera-api` + `tessera-mcp` over the same local DB), to be
recorded, not papered over.

### 5. Gate + CI
`gates.json` `e2e-full`: `planned` → `active`, command finalized as `pnpm -w test:e2e:full`; root
script `test:e2e:full` → `turbo run test:e2e:full`; a `test:e2e:full` task in `turbo.json` (depends on
`^build`); a CI step mirroring it (verify-state's ci-mirror guard, E-005, enforces this). CI must
install the Playwright browser for this suite too.

## Files to touch
- **new:** `pnpm-workspace.yaml` (+`tests/*`), `tests/e2e-full/{package.json,tsconfig.json,
  playwright.config.ts}`, `tests/e2e-full/support/full-stack-server.mjs`,
  `tests/e2e-full/fixture/**`, `tests/e2e-full/tests/{human-journey,agent-journey}.spec.ts`.
- **modified:** `turbo.json` (+`test:e2e:full`), root `package.json` (+script),
  `.harness/verification/gates.json` (activate), `.github/workflows/ci.yml` (+step),
  `.gitignore`/`.prettierignore` if the temp handoff needs excluding.
- **state/docs:** effects (E-005 gate/CI mirror, E-003 the surfaces exercised), progress, feature_list,
  a lesson if the cross-process run teaches one.

## Anticipated effects
- **E-005** (gates ↔ CI): a new active gate + CI step; the workspace grows a `tests/*` glob.
- **E-003** (REST/MCP contract): the full-stack suite becomes a **consumer** of both surfaces — a
  breaking route/tool change now fails here too (that is the point: it is the first test that would
  catch a cross-surface regression).

## Test plan
The suite *is* the test. Its own acceptance: the server boots + scans the fixture (asserted before
healthy); the human journey completes the six steps; the agent journey completes the five tools with
budget/token-lean assertions; both see the same data. Then the workspace gates stay green.

## Verification
`node scripts/verify-state.mjs` · `pnpm -w typecheck` · `pnpm -w lint` · `pnpm -w format` ·
`pnpm -w test` · `pnpm -w build` · `pnpm -w test:e2e` · **`pnpm -w test:e2e:full`** (the new gate).

## Risks / open questions
- **Cross-process SQLite** — WAL covers the relational store; `sqlite-vec` has no pragma. Mitigated by
  serialization; a real finding if it still contends (see above).
- **Runtime/flake budget** — this gate boots two real servers + a browser + an MCP process. Keep the
  fixture tiny, `workers: 1`, and generous `webServer` timeouts; it is a `requiredFor: release` gate,
  not a per-commit one.
- **Port collisions with the existing web e2e** (3000/3100) — use distinct ports (3200/3201) so the two
  suites can run back-to-back in one CI job.
- **`next build` cost** — the web webServer builds; reuse the existing production-build pattern and
  `reuseExistingServer` locally.
- **Scope discipline** — this feature adds *no* product code. If a journey fails, that is a genuine
  bug: fix it as a finding (or record it), never weaken the assertion.
