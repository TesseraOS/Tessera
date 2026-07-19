# @tessera/cli

One-command onboarding for a **Local** Tessera deployment (F-052; FR-70; [ADR-0036](../../docs/adr/0036-agent-first-operations.md)).

Tessera's primary consumer is the agent — so a human _or their agent_ must be able to
stand up and operate Tessera without touching the dashboard. This package is the `tessera`
binary that makes that one command:

```bash
npx @tessera/cli init          # scaffold config + data dir
npx @tessera/cli source add .  # ingest a repo into the corpus
npx @tessera/cli mcp-config     # print the config to wire your agent
```

## Design

The CLI is a **thin, testable composition** over the existing engine — it invents no
domain logic. Every command wraps `@tessera/server`'s boot surface
(`createServerRuntime` / `startApiServer` / `startMcpServer`) or a service already exposed
by REST/MCP, so there is exactly one implementation of each operation (agent-first parity).

Commands write only through an injected `Io` and return an exit code (never
`process.exit`/`console.*`), so `run(argv, io)` is unit-testable and the integration tests
boot the real Local runtime in temp dirs.

## Commands

| Command | What it does |
| --- | --- |
| `init` | Write `tessera.config.json` + create the data dir (default `.tessera`). Validates the config before writing. `--verify` boots the profile once to prove it wires. |
| `serve` | Run the REST `/v1` API (long-running) with observability + graceful shutdown. |
| `mcp` | Run the MCP server over **stdio** — the transport agent clients spawn. |
| `source add <path\|git-url>` | Register + scan a repo through the same service as `POST /v1/sources`. A git URL is shallow-cloned into `<data-dir>/sources/`. |
| `token issue --roles …` | Issue a scoped API token (requires `auth.mode=token`). Prints the secret once. |
| `doctor` | Health-check node / config / storage / embeddings; non-zero exit on failure. |
| `mcp-config` | Emit ready-to-paste MCP client config for Claude Code, Cursor, Cline, Codex, Continue. |

Global: `--version`, `--help`, and `<command> --help`. Machine-readable output: `--json`
(where supported), the agent-facing path (ADR-0036).

## Config & precedence

`init` writes a `tessera.config.json` (a validated `ConfigInput`). Commands read it from
the cwd (or `--config <path>`). Precedence:

```
built-in defaults  <  tessera.config.json  <  TESSERA_* env  <  flags
```

> The config file is passed to `loadConfig` as overrides, so it wins over `TESSERA_*` env
> for keys it sets; env fills the keys it omits. Storage paths in the file are relative and
> resolved against the current directory at runtime — run the commands from the project dir,
> or pass an absolute `--data-dir` to `init` for a location-independent config.

## Serving API + MCP

MCP stdio is spawned _by the agent client_ (it owns stdout), so — like the shipped
`tessera-api` / `tessera-mcp` bins — the two surfaces are separate processes: `serve` runs
the REST API, and each agent launches `tessera mcp` per the snippet `mcp-config` prints.

## Tests

- Unit (`pnpm --filter @tessera/cli test`): arg parsing, router, mcp-config rendering,
  doctor checks, and every pure validation/dispatch path.
- Integration (`pnpm --filter @tessera/cli test:e2e`): boots the real Local runtime in temp
  dirs — the one-command story (`init` → `source add` ingests a repo), `serve`
  (`GET /v1/openapi.json`), and `token issue`.

## Status

`private` (like every sibling package); the npm publish pipeline lands with **F-059**.
