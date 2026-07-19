# Plan: F-052 `@tessera/cli` — one-command onboarding

- **Feature:** F-052 (see [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-70 (CLI & one-command onboarding); NFR-10 (cross-platform)
- **Decision:** [ADR-0036](../../docs/adr/0036-agent-first-operations.md) (agent-first ops — the CLI is surface #2)
- **Service / package:** `apps/cli` → `@tessera/cli`
- **Author:** Claude (generator) · **Date:** 2026-07-19

## Intent

Ship a single `tessera` binary so a human **or their agent** can stand up and operate a Local
Tessera deployment without touching the dashboard: `init` scaffolds config + data, `serve` runs the
REST API, `mcp` is the stdio MCP server agents spawn, `source add` ingests a repo, `token issue`
mints an API token, `doctor` health-checks the install, and `mcp-config` emits ready-to-paste client
config for the major agents. "Done" for a user: `npx @tessera/cli init` then wiring an agent with the
emitted config yields a connected agent operating on compiled context — proven by an integration test.

## Approach

The CLI is a **thin, testable composition** over surfaces that already exist — it invents no domain
logic (agent-first rule: the dashboard/CLI are clients of the same engine). It **reuses**:

- `@tessera/server` — `createServerRuntime`, `startApiServer`, `startMcpServer` (the exact boot the
  `tessera-api` / `tessera-mcp` / `tessera-token` bins use). The CLI unifies those three bins + adds
  `init`/`doctor`/`source add`/`mcp-config`.
- `@tessera/config` — `loadConfig`, `configSchema`/`ConfigInput`/`TesseraConfig`, and the exported
  enums (`AUTH_MODES`, `EMBEDDING_PROVIDERS`, `SUPPORTED_SOURCE_KINDS` via `local`, `DEFAULT_DATA_DIR`).
- `@tessera/api/auth` — `ROLES`/`PERMISSIONS`/`Role`/`Permission` for `token issue` validation
  (mirrors the existing `tessera-token` bin) via the Fastify-free subpath (ADR-0030).
- `@tessera/observability` — `createObservability` so `serve`/`mcp` log like the shipped bins.
- `@tessera/core` — `isTesseraError` for clean, typed error surfacing.

**Testability spine.** Every command is a function `(ctx, io) => Promise<number>` where `Io = { write,
writeErr, env, cwd }`. `bin/tessera.ts` supplies a process-backed `Io`; tests supply a capturing one.
No `process.exit`/`console.*` inside commands — the router owns the exit code. This makes unit +
integration tests deterministic (no child processes needed for most cases).

**Config artifact.** There is no file-config loader in `@tessera/config` today (config is `TESSERA_*`
env + code overrides). `init` writes a `tessera.config.json` (a validated `ConfigInput`); every command
loads it (cwd or `--config`) and passes it as the `config` override to `createServerRuntime`. Precedence
(documented in help): built-in defaults < `tessera.config.json` < explicit flags; `TESSERA_*` env still
applies for keys the file omits. The file is validated through `loadConfig` **before** being written, so
`init` fails fast on bad flags rather than writing a broken config.

**"API + MCP" reconciliation (stdio reality).** MCP stdio is *spawned by the agent client* and owns
stdout, so one foreground process cannot both serve HTTP and speak MCP to a client that did not launch
it (this is why `apps/server` ships separate `tessera-api`/`tessera-mcp` bins). Therefore: `serve` runs
the **REST API** (long-lived); `mcp` runs the **stdio MCP server** (what agents spawn — logs to stderr,
protocol on stdout); `mcp-config` emits configs that point each agent at `tessera mcp --config <abs>`.
`init` proves the profile *boots* via a smoke-boot (wire runtime → assert services → close) and prints
the next command. This is the honest, testable reading of "boots the Local profile (API + MCP)".

**`source add <path|git-url>`.** Resolve the argument: a remote (`http(s)://`, `git@`, `ssh://`, or
`*.git`) is `git clone`d into `<dataDir>/sources/<name>` then registered as a `git` source; a local path
is registered as `git` when it contains a `.git`, else `filesystem`; `config: { root }` either way —
exactly the shape `POST /v1/sources` builds. Then `scan()` (await-complete, Local profile) and print the
`ScanSummary`. Uses `createServerRuntime` directly (one-shot), mirroring `tessera-token`.

**`mcp-config` is data-driven.** A `MCP_CLIENTS` table of rows `{ id, label, file, format }` where
`format ∈ {'json-mcpservers','toml-mcp-servers'}`; two format renderers turn a shared `McpServerSpec
{ command, args, env? }` into the client's snippet. New agents are new rows, not new code (acceptance).

## Files to touch

New package `apps/cli/`:
- `package.json` — name `@tessera/cli`, `private: true` (publish lands with F-059, per the SDK
  convention), `bin: { tessera: "./dist/bin/tessera.js" }`, `files: ["dist"]`, deps above, scripts
  `build`/`typecheck`/`lint`/`test` mirroring `apps/server`.
- `tsconfig.json` (extends base, `types: ["node"]`), `vitest.config.ts` (`src/**/*.test.ts`),
  `vitest.e2e.config.ts` + `tests/e2e/` for the temp-dir integration tests, `README.md`, `eslint`
  inherits root flat config.
- `src/io.ts` — `Io` + `processIo()`.
- `src/args.ts` — typed flag parser (`--k v`, `--k=v`, `--flag`, `-h/-v`) + `flagStr/flagBool/flagList`.
- `src/errors.ts` — `CliError { message, exitCode, hint? }`.
- `src/output.ts` — `emit(io, human, json, asJson)`; `--json` mode helpers.
- `src/version.ts` — `CLI_VERSION` (constant `0.0.0`; F-059 sources it from package.json).
- `src/config-file.ts` — `resolveConfig(io, { config? }) → { input: ConfigInput; path?: string }`.
- `src/commands/{init,serve,mcp,source-add,token-issue,doctor,mcp-config,help}.ts`.
- `src/mcp-clients.ts` — the `MCP_CLIENTS` table + renderers.
- `src/cli.ts` — `run(argv, io): Promise<number>` router (`--version`, `--help`, dispatch, unknown → usage).
- `src/bin/tessera.ts` — shebang shim.
- `src/index.ts` — `export { run }` + public types (for embedding/testing).
- Beside-source unit tests: `args.test.ts`, `mcp-clients.test.ts`, `doctor.test.ts`, `mcp-config.test.ts`, `cli.test.ts`.
- `tests/e2e/`: `init-source-add.e2e.test.ts` (the one-command story), `serve.e2e.test.ts`,
  `token-issue.e2e.test.ts`.

Repo wiring:
- `.harness/state/effects.json` — record the CLI as a consumer of E-014/E-018 (+ possibly a new
  onboarding-surface effect); add F-052 → effects.
- `docs/` — a short CLI mention where onboarding is documented (README / getting-started if present).
- State files (`feature_list.json` status, `progress.md`).

## Anticipated effects

- **Consumer only of E-014** (config schema + Local-profile composition + `Runtime` boot): the CLI is a
  new runnable that boots a `Runtime` — same category as the `apps/server` bins already listed under
  E-014. No contract change.
- **Consumer only of E-018** (auth control plane / `TokenStore`): `token issue` uses
  `runtime.auth.tokenStore.issue` — same path as `tessera-token`. No contract change.
- **F-038 `SourceService`**: `source add` calls `register`+`scan` — the same service the REST/MCP
  surfaces wrap; no change to it.
- **External coupling (documented, not a code effect):** `mcp-config` output tracks the *agent clients'*
  config schemas (Claude Code/Cursor/Cline/Codex/Continue). The table isolates that coupling to data rows.
- Net: **additive** — no existing package's public contract changes; the CLI depends inward only.

## Test plan

- **Unit** (beside source): flag parser edge cases; `mcp-clients` renders each agent (JSON + TOML) from a
  fixed `McpServerSpec`; `doctor` check logic over injected env/config (good + failing node version, bad
  config, missing/unwritable data dir, `fake`/`transformers` embeddings, ollama-unreachable); `cli`
  router (`--version`, `--help`, unknown command exit codes); `mcp-config` `--agent`/`--json`.
- **Integration** (`tests/e2e`, real Local runtime in `mkdtemp` dirs, `fake` embeddings, `:memory:` or
  temp sqlite):
  - `init` writes a **valid** `tessera.config.json` + data dir, and it smoke-boots.
  - **One-command story:** `init` in a temp project, then `source add <fixture repo>` → assert
    `summary.added > 0` and documents queryable (the F-038 proof the acceptance demands).
  - `serve` boots the REST API on an ephemeral port, `GET /v1/openapi.json` (public) returns 200, then
    `close()` shuts down cleanly.
  - `token issue` with `TESSERA_AUTH_MODE=token` prints a token + record; `--json` shape asserted.
- **E2E (user-facing):** covered by the integration suite above (the CLI *is* the user surface).

## Verification

Gates (per [verification protocol](../protocols/verification.md)); capture evidence:
- `node scripts/verify-state.mjs` (state valid; F-052 has this plan).
- `pnpm --filter @tessera/cli typecheck` + workspace `turbo run typecheck`.
- `pnpm --filter @tessera/cli lint` + workspace `lint`.
- `pnpm --filter @tessera/cli test` (unit) + `test:e2e` (integration) + workspace `test`.
- `pnpm --filter @tessera/cli build` (bin emits) + workspace `build`.
- `pnpm format:check` (or `format`).
Evidence: paste the green counts (files/tests) into `progress.md`, as prior sessions do.

## Risks / open questions

- **`serve` = REST only (MCP via `tessera mcp` spawned by the client).** Resolved above by the stdio
  constraint; documented in help + README, not a deviation needing an ADR (matches `apps/server`'s
  two-bin split). If a reviewer expects `serve` to fork an MCP process too, that is a follow-up, not DoD.
- **git-url clone** adds a runtime `git clone` (execFile) — git is already assumed by the git connector;
  cross-platform via `execFile('git', …)`. Clone failures surface as a clean `CliError`.
- **Config precedence** (file-authoritative, env fills gaps) is a deliberate CLI choice, documented. If we
  later want env-over-file, that is a small, additive change to `resolveConfig`.
- **npm publish** is explicitly **out of scope** (lands with F-059); package stays `private: true` and
  version `0.0.0` like every sibling. `CLI_VERSION` is a constant until then.
- No default is deviated from → **no new ADR** (ADR-0036 already sanctions the CLI surface).
