# ADR-0065: The MCP stdio credential is a secret, not a new mechanism — and a missing one refuses to start

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Project lead, Claude
- **Tags:** mcp, auth, security, secrets, cli

## Context

`defaultCredentialResolver` (`apps/mcp/src/gateway.ts`) reads the MCP SDK's `authInfo.token` or an
`Authorization` header. **Both are populated only by an HTTP transport's auth middleware.** Over
**stdio** there is no request and no headers, so in `token` or `oidc` mode the resolver returns no
credential and every tool call fails `UNAUTHORIZED` — with nothing in `.env.example` offering a way
to hand `tessera-mcp` a token. The gateway's own doc comment claimed it "works over stdio (one
identity)", which was true only in zero-auth `none` mode, where the local provider authenticates
anything.

F-048 found this while writing the agent journey and worked around it by overriding the deployment
to `TESSERA_AUTH_MODE=none`, recording the gap as F-072 rather than papering over it. The workaround
also meant the journey asserted its own tenant via `TESSERA_AUTH_TENANT` instead of being
authenticated into one.

This blocks any hosted or multi-user stdio deployment: today a token-mode Tessera cannot serve a
local agent at all.

## Decision

### 1. The credential is a secret named `MCP_TOKEN`, resolved through the existing `SecretsProvider`

No new mechanism. `@tessera/config` already ships a `SecretsProvider` port with `env` and `file`
adapters, and the composition root already reads billing keys through it. One more key gives both
channels:

| Channel | How the operator supplies it |
| --- | --- |
| env (default) | `TESSERA_SECRET_MCP_TOKEN` in the agent client's `env` block |
| file | `TESSERA_SECRETS_PROVIDER=file` + `MCP_TOKEN` in the secrets JSON |

A bespoke `TESSERA_MCP_TOKEN` (+ a `_FILE` twin) was the obvious alternative and was rejected: it
would be a second secrets mechanism, with its own precedence rules and its own unreadable-file
error handling, for no capability the first one lacks.

### 2. Threat model

- **Never a command-line argument.** `ps`/`wmic process get commandline` expose argv to any user on
  the machine. An env var is not in argv; `/proc/<pid>/environ` is `0400` owned by the process user,
  and reading another process's environment on Windows requires debug privileges. That clears the
  bar F-072's acceptance sets ("not exposed casually by a process listing").
- **Never typed at a shell.** The value lives in the agent client's config file (`.mcp.json`,
  `~/.claude.json`, `~/.codex/config.toml`), written once. Consequently `tessera mcp-config` gained
  `--token` (emitting a **placeholder** to replace in the file) and `--secrets-file <path>`, but
  **no `--token <value>` flag** — that would put the secret in argv *and* in shell history,
  defeating the whole choice. A test pins that no value can reach argv.
- **Config files get synced and committed**, which is what the `file` channel answers: the client
  config then carries `TESSERA_SECRETS_PROVIDER`/`TESSERA_SECRETS_FILE`, and the secret sits in a
  file that can be `chmod 600` and gitignored.
- **Never logged, never echoed.** Errors name the *key*, never the value — the rule `requireSecret`
  already follows; a test asserts the startup error contains no token-shaped text.
- **Rotation needs a restart.** Both channels are read once at boot (the file provider also caches).
  Stated rather than discovered: an agent client restarts the process anyway.

### 3. The static resolver ignores the request context — it does not merge it

`createStaticCredentialResolver` returns the operator's credential regardless of what the call
carries. A stdio peer controls the JSON-RPC message, so a resolver that preferred `authInfo` or an
`Authorization` header from the request would let the peer name a principal the operator never
granted it — a privilege escalation across the boundary that exists precisely because the
**launcher**, not the peer, decides who this process is.

### 4. stdio only — never the HTTP transport

`createRuntimeGateway` is shared by both transports; the static credential is passed **only** from
`mcp.ts`. `mcp-http.ts` keeps `defaultCredentialResolver`, because each HTTP client presents its own
credential and a process-wide one would authenticate every remote caller as the operator. Pinned by
a test that asserts which credential the provider is handed, rather than that a call succeeds — with
the local provider accepting anything, "it resolved" would pass with the wiring backwards.

### 5. A missing credential refuses to start

In `token`/`oidc` mode with no `MCP_TOKEN`, `tessera-mcp` exits at boot with a message naming the key
and pointing at `tessera token issue` / `tessera mcp-config`. The alternative — boot cleanly, fail
all twenty tools with `UNAUTHORIZED` — is the confusing state F-048 hit, and the condition is 100%
fatal either way. Agent clients surface stderr, so this is the visible form of it.

Zero-auth `none` mode reads nothing and is byte-for-byte unchanged.

## Consequences

- **A behaviour change for anyone running stdio in token mode** — but that configuration is already
  totally broken (it is the defect), so the change can only convert a silent failure into a loud one.
- The **F-048 agent journey is now authenticated**: it drops the `none` override and presents the
  same owner token the human journey uses. The tenant is something the server decides from a
  credential rather than something the launcher declares. Verified by removing the credential and
  watching the journey fail.
- The gateway e2e now drives the **production** resolver; it previously used an inline stand-in, so
  the shipped path was never the tested one.
- `tessera mcp-config` output changed ⇒ the docs' generated CLI reference regenerates.
- A blank or whitespace-only value is treated as **absent**, and a trailing newline is trimmed — a
  token pasted into JSON or read from a file routinely carries one, and a `Bearer` value with a
  newline is rejected as a bad credential, an error that reads like a wrong token and is not.

## Alternatives considered

- **A dedicated `TESSERA_MCP_TOKEN` (+ `_TOKEN_FILE`)**. Rejected — see §1.
- **A handshake**: the client sends the credential in `initialize`. Rejected: it puts the credential
  in the peer's hands, which is exactly the escalation §3 closes, and no MCP client has a UI for it.
- **A `--token <value>` CLI flag** on `mcp-config` for convenience. Rejected: argv and shell history,
  the two exposures the env channel was chosen to avoid.

## Links

- Supersedes the "works over stdio (one identity)" claim in the F-026 gateway comment.
- Related: [ADR-0058](0058-remote-mcp-http-transport.md) (the HTTP transport's per-client credential),
  [ADR-0028](0028-api-auth-tenancy-rbac.md) (the `AuthProvider` this resolves into).
