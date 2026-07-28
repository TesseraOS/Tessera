# Plan: F-072 MCP stdio credential channel

- **Feature:** F-072 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-36, FR-52, NFR-2
- **Service / package:** @tessera/mcp (+ apps/server, @tessera/cli, tests/e2e-full, docs)
- **Author:** Claude (Opus 5) · **Date:** 2026-07-28

## Intent

An agent launched over **stdio** against a `token`- or `oidc`-mode deployment can present a
credential and be authenticated into the right principal and tenant. Today it cannot: every tool call
returns UNAUTHORIZED and nothing in `.env.example` offers a way to hand `tessera-mcp` a token — the
gap F-048 found and worked around with `TESSERA_AUTH_MODE=none`.

Done looks like: the F-048 agent journey drops that override and runs authenticated as `acme`.

## The defect, precisely

`defaultCredentialResolver` (`apps/mcp/src/gateway.ts`) reads the SDK `authInfo.token` or an
`Authorization` header. **Both are populated only by an HTTP transport's auth middleware.** Over
stdio there is no request and no headers, so the resolver returns `{ authorization: undefined }` and
the token provider refuses every call. The gateway's own doc comment claims it "works over stdio (one
identity)" — true only in zero-auth `none` mode, where the local provider authenticates anything.

## Approach

### The credential is a secret, resolved through the existing provider

**No new mechanism.** `@tessera/config` already ships a `SecretsProvider` port with `env` and `file`
adapters, and the composition root already reads billing keys through it. The stdio credential
becomes one more key — **`MCP_TOKEN`** — which gives both channels for free:

| Channel | How the operator supplies it |
| --- | --- |
| env (default) | `TESSERA_SECRET_MCP_TOKEN` in the agent client's `env` block |
| file | `TESSERA_SECRETS_PROVIDER=file` + `MCP_TOKEN` in the secrets JSON |

Reusing the documented default is the point: a bespoke `TESSERA_MCP_TOKEN` + `_TOKEN_FILE` pair would
be a second secrets mechanism with its own error handling, for no capability the first one lacks.

### Threat model (recorded in ADR-0065)

- **Never a CLI argument.** `ps`/`wmic process get commandline` expose argv to any user on the box.
  An env var is not in argv; `/proc/<pid>/environ` is `0400` owned by the process user, and reading
  another process's environment on Windows needs debug privileges. That clears the "casual process
  listing" bar the acceptance sets.
- **Never typed at a shell.** The value lives in the agent client's config file
  (`.mcp.json`, `~/.claude.json`, `~/.codex/config.toml`), written once by the operator — not in
  shell history. Consequently `tessera mcp-config` gains **`--token-file`** (a path) and a
  **placeholder** switch, but deliberately **no `--token <value>` flag**: that would put the secret
  in argv and in the operator's history, defeating the whole choice.
- **Config files get synced and committed**, which is what the `file` secrets provider answers: the
  client config then holds only `TESSERA_SECRETS_PROVIDER`/`TESSERA_SECRETS_FILE`, and the secret
  sits in a file that can be `chmod 600` and gitignored.
- **Never logged.** The resolver holds the token; nothing echoes it, and errors name the *key*, never
  the value (the `requireSecret` rule already in `secrets/provider.ts`).

### Fail fast, not fail-per-call

In `token`/`oidc` mode with **no** `MCP_TOKEN`, `tessera-mcp` **refuses to start** with a message
naming the key — rather than starting cleanly and failing all twenty tools. An agent client surfaces
stderr, so this is the visible, actionable form of a condition that is 100% fatal anyway; the state
it replaces is the confusing one F-048 hit. `none` mode reads nothing and is unchanged.

### The static credential is stdio-only

`createRuntimeGateway` is shared by both transports. The static resolver is passed **only** from
`mcp.ts` (stdio); `mcp-http.ts` keeps `defaultCredentialResolver`, because each HTTP client presents
its own credential and a process-wide one would authenticate every caller as the operator. Pinned by
a test, not left to reading order.

### Increments

1. **`@tessera/mcp`** — `createStaticCredentialResolver(token)`: a `CredentialResolver` that ignores
   the (empty) stdio context and returns a Bearer credential. Unit tests incl. "an HTTP-shaped
   context does not smuggle a different credential past it".
2. **`apps/server`** — resolve `MCP_TOKEN` via `runtime.secrets`, pass the resolver into
   `createRuntimeGateway` from the stdio path only, and refuse to start when the mode requires a
   credential and none is set. Tests for both branches + the HTTP path staying per-request.
3. **`@tessera/cli`** — `tessera mcp-config --token-file <path>` / `--token-placeholder` emit the
   right `env` block per client; no value flag. Tests pin that no secret can reach argv.
4. **e2e** — an authenticated stdio path in `apps/mcp`'s e2e, and the F-048 agent journey switched
   off `TESSERA_AUTH_MODE=none` onto the handoff token it already issues.
5. **Docs + `.env.example` + ADR-0065 + effects + progress + close.**

## Files to touch

- `apps/mcp/src/gateway.ts` (+ `index.ts`) — the static resolver; correct the doc comment that claims
  stdio already works.
- `apps/server/src/mcp.ts`, `src/mcp-gateway.ts`, `src/mcp-http.ts` — credential wiring, stdio-only.
- `apps/cli/src/commands/mcp-config.ts`, `src/mcp-clients.ts` — operator-facing config emission.
- `tests/e2e-full/tests/agent-journey.spec.ts` — drop the override and its note.
- `.env.example`, `apps/docs/content/docs/guides/tokens-and-auth.mdx`, `docs/adr/0065-*.md`.

## Anticipated effects

- **E-018** (auth/tenancy): a new way to resolve a principal — the stdio surface joins the ones that
  authenticate for real.
- **E-020** (audit): gateway audit now attributes stdio calls to a real principal instead of the
  local stand-in.
- `@tessera/cli` `mcp-config` output changes ⇒ the docs' generated `agent-clients.json` artifact
  regenerates (the drift gate will say so).

## Test plan

- **Unit:** the static resolver; the boot guard (missing credential in token mode → typed error;
  `none` mode → no read, no throw); the CLI emission per client format.
- **Integration:** `apps/mcp` e2e — a gated server with a token-mode provider authenticates a stdio
  call into the right tenant, and a *wrong* token is a clean UNAUTHORIZED (not a 500, not a leak).
- **E2E:** the F-048 agent journey runs authenticated end to end.

## Verification

`typecheck`, `lint`, `format`, `test`, `test:e2e` across the workspace, plus
`node scripts/verify-state.mjs`. Evidence in `progress.md`, including the agent journey passing
without the `none` override — which is the acceptance's own definition of done.

## Risks / open questions

- **Refusing to start is a behaviour change.** Anyone running stdio in token mode today is already
  fully broken, so the change can only convert a silent failure into a loud one — but it must be
  stated in the docs and the ADR rather than discovered.
- **`tests/e2e-full` needs the real binary rebuilt** before the journey runs; the suite already
  depends on `apps/server/dist`, so this is ordering, not new coupling.
- The secrets **file** provider caches on first read, so a rotated token needs a process restart —
  true of the env channel too, and worth stating rather than surprising an operator.
