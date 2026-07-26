# Plan: F-055 Remote MCP — streamable-HTTP transport with Bearer auth through the existing gateway

- **Feature:** F-055 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-71 (remote MCP over HTTP with Bearer through the existing gateway; stdio stays
  the local default), FR-36 (MCP gateway brokering multiple clients), NFR-2 (authn/authz), NFR-1
  (validation at every boundary)
- **Service / package:** `@tessera/mcp` (new `./http` subpath) → `@tessera/config` → `@tessera/server`
  → `apps/docs`
- **Author:** planner subagent · **Date:** 2026-07-26

## Intent

Today the MCP surface is reachable only by a process the agent client spawns. F-026 already built the
whole multi-client control plane — `createMcpGateway` authenticates, authorizes by `TOOL_PERMISSIONS`,
meters `QuotaLimiter`, and records `MCP_AUDIT_ACTIONS` — but ADR-0029 recorded its own gap plainly:
*"Per-client credentials require a multi-client transport (HTTP); stdio carries one identity."* This
feature builds that transport and nothing else.

**Done looks like:** an operator sets `auth.mode=token` and `mcp.http.enabled=true`, restarts
`tessera-api`, and a remote agent points an MCP client at `https://host/mcp` with a Bearer token issued
by the F-034 token store. Its `tools/call`s run through the *existing* gateway — RBAC denials are
`FORBIDDEN`, quota exhaustion is `RATE_LIMITED`, every call lands in the same audit trail REST records
into — an unauthenticated connection gets `401` before any MCP state is created, and disconnecting the
client leaves no session, no server, and no timer behind.

## Scope guard

**In** (exactly the four `acceptance` clauses): the transport + session lifecycle; the config gate and
the `auth.mode != none` refusal; the Fastify mount in `apps/server` alongside REST; the boundary 401;
a real-MCP-client e2e over HTTP with a real F-034 token; the docs page + OpenAPI/infra doc updates.

**Out** — named so their absence reads as a decision, not an omission:

- **No stdio credential channel.** That is **F-072** (backlog, `should`), whose note explicitly names
  this feature. The F-048 agent journey keeps its `TESSERA_AUTH_MODE=none` override.
- **No OAuth / dynamic client registration / `.well-known` protected-resource metadata.** The SDK ships
  an OAuth router; Tessera's identity model is `AuthProvider` + scoped tokens (ADR-0028/0030). Adding a
  second identity model is a separate decision, and nothing in the acceptance asks for it.
- **No resumability (`EventStore`).** The SDK supports it; no clause asks for it, and it needs a durable
  event store. Recorded as a seam in the ADR.
- **No CLI change.** `tessera mcp-config` emits stdio launch configs; a `--remote` form is not in the
  acceptance (and would change `apps/docs/generated/agent-clients.json`).
- **No browser-origin MCP support.** See Risks — the global CORS `allowedHeaders` list does not carry
  `Mcp-Session-Id`, and widening it is an E-003 change for a client class that does not exist.

## What is already true (verified in the tree, not assumed)

1. **The gateway is genuinely transport-agnostic.** `McpCallContext`
   ([`apps/mcp/src/gateway.ts:116-122`](../../apps/mcp/src/gateway.ts)) is structural over
   `{ authInfo?, requestInfo? }`, and the SDK's `RequestHandlerExtra` carries exactly those two
   (`protocol.d.ts:181` / `:201`). `defaultCredentialResolver` (`gateway.ts:132-138`) prefers
   `authInfo.token`, else `Authorization`. **No gateway rewrite is needed.**
2. **The streamable-HTTP transport already populates both.** `webStandardStreamableHttp.js:388-391`
   builds `requestInfo = { headers: Object.fromEntries(req.headers.entries()), url }` — a plain
   lowercase-keyed record, exactly what the resolver and `projectOf` index into. Which means
   **`X-Tessera-Project` per-call project selection (F-050/ADR-0037) starts working the moment this
   transport lands** — `apps/mcp/src/server.ts:263` reads `extra.requestInfo.headers['x-tessera-project']`
   and there has never been a transport that could carry it. That is a free win, and a test case.
3. **`StreamableHTTPServerTransport` is Node-shaped and needs raw `req`/`res`.**
   `streamableHttp.js:128-144`: it reads `req.auth`, then hands `(req, res)` to `@hono/node-server`'s
   `getRequestListener`. Hono replies with `outgoing.writeHead(status, headers)`
   (`@hono/node-server/dist/index.js:498,567,582`) — so a Fastify `reply.header()` set earlier is
   **lost**, and headers put on `reply.raw` via `setHeader` **survive** (Node merges, `writeHead` wins).
4. **One `McpServer` per transport is mandatory.** `Protocol.connect` throws
   *"Already connected to a transport… use a separate Protocol instance per connection"*
   (`shared/protocol.js:216-218`).
5. **`transport.onclose` set *before* `connect` is preserved.** `protocol.js:220-224` captures and
   chains the existing handler. Setting it *after* `connect` would clobber the SDK's own cleanup.
6. **The SDK's `requireBearerAuth` middleware is unusable here — twice over.**
   (a) it is Express-shaped (`res.set` / `res.status().json()`, `bearerAuth.js:52-53`); (b) it
   **rejects any token without `expiresAt`** (`bearerAuth.js:30-35`) — and Tessera issues non-expiring
   tokens (`expiresAt: string | null`). Using it would also introduce an `OAuthTokenVerifier` identity
   model beside `AuthProvider`, the precise thing ADR-0029 avoided. **We write the boundary check.**
7. **`schema: { hide: true }` really does keep a route out of the OpenAPI document.**
   `fastify-type-provider-zod/dist/esm/core.js:30-35` destructures `hide` and short-circuits.
8. **`@fastify/cors` is `fastify-plugin`-wrapped** (`@fastify/cors/index.js:3,307`) and
   `registerSecurityHeaders` / `registerRequestId` are root `addHook('onRequest')`
   ([`apps/api/src/security/headers.ts:56`](../../apps/api/src/security/headers.ts),
   [`request-id.ts:50`](../../apps/api/src/security/request-id.ts)) — all three apply to routes
   `apps/server` registers on the same instance after `buildServer` returns. Rate limiting does **not**:
   `registerRateLimit` is called inside the `/v1` child scope only
   ([`routes/v1/index.ts:63-65`](../../apps/api/src/routes/v1/index.ts)).
9. **The hijacked-reply idiom already exists.** `GET /v1/events` hijacks and re-emits
   `securityHeaders(...)` + `x-request-id` into its own `writeHead`
   ([`routes/v1/events.ts:45-56`](../../apps/api/src/routes/v1/events.ts)). We copy it exactly.
10. **`apps/server` currently owns no SDK dependency** (`apps/server/src/mcp.ts:6` says so) and
    `@tessera/mcp` depends on `@tessera/api` (`apps/mcp/package.json:26`) — so `@tessera/api` can
    **never** import `@tessera/mcp` without a cycle.

## Design decisions

### D1 — Where the transport lives: `@tessera/mcp/http`, mounted by `apps/server`

Three candidates:

| | verdict |
|---|---|
| **A Fastify route/plugin in `@tessera/api`** | **Rejected.** `@tessera/mcp` already depends on `@tessera/api` (`apps/mcp/package.json:26`); the reverse edge is a workspace cycle turbo cannot order. The only cycle-free variant injects an opaque `(req,res)=>Promise<void>` into `buildServer` — a raw-handler hole in a package whose rule is "schema-first, routes are thin" (`.harness/rules/api/api.md`). |
| **A second listener/port in `apps/server`** | **Rejected.** Contradicts *"served by apps/server alongside REST"*, forfeits every F-044 hook, and adds a port to every deployment doc and compose file. |
| **A Fastify-free handler in `@tessera/mcp/http`, mounted on the existing app by `apps/server`** | **Chosen.** |

`@tessera/mcp` gains a **new export subpath** `./http` (the established idiom — `@tessera/api` already
ships `/auth`, `/projects`, `/stats`, consumed at `apps/mcp/src/server.ts:11,13,15`). The module imports
only `node:http` types, `node:crypto`, and the MCP SDK. **The F-012 invariant is preserved and
sharpened, not bent:** the invariant is *no Fastify in the MCP runtime*, and `node:http` is the
platform, not a framework. The subpath matters for a second reason: importing
`@modelcontextprotocol/sdk/server/streamableHttp.js` pulls `hono` + `@hono/node-server` into the module
graph (SDK deps, already in the lockfile), and the `tessera-mcp` **stdio** binary agents launch must not
pay for them. A subpath keeps `import '@tessera/mcp'` byte-identical to today.

`apps/server` owns the Fastify mount — it is the composition root, it already holds both `@tessera/api`
and `@tessera/mcp`, and it is the only place that knows the profile.

### D2 — Stateful sessions (`Mcp-Session-Id`), not stateless

Stateless (`sessionIdGenerator: undefined`) is *not* "one server, no sessions": because
`Protocol.connect` refuses a second transport (finding 4), stateless means **a fresh `McpServer` per
HTTP request** — 20 tool registrations plus zod→JSON-Schema conversion on **every** `tools/call`. That
is the SDK's own stateless example, and it is the wrong trade for a server whose tool catalog is fixed.

So: **stateful**, one `{ McpServer, transport }` per session, held in a `Map<sessionId, SessionEntry>`.
Acceptance clause 2 says "session lifecycle… clean under client disconnect", which presumes sessions
exist. The cost is a leak surface, and it is a real one — see D3.

### D3 — The leak is real, and the reaper is not optional

**`client.close()` does not send a `DELETE`.** `client/streamableHttp.js:280-287` clears a timer, aborts
the controller, and calls `onclose` — nothing else. `terminateSession()` (`:431-459`) is the only thing
that issues `DELETE`, and clients must call it explicitly. So *the common case* — an agent process
exiting — leaves the server holding an `McpServer` + transport **forever**. Four teardown paths, all
required:

1. **`DELETE`** → `handleDeleteRequest` → `onsessionclosed` + `transport.close()`
   (`webStandardStreamableHttp.js:567-579`) → our `onclose` removes the map entry.
2. **Idle TTL sweep** — `lastSeenAt` per entry; a sweeper on `setInterval(...).unref()` closes and
   deletes entries older than `sessionTtlMs`. **`.unref()` is mandatory** or the process never exits
   (the `/v1/events` heartbeat sets the precedent).
3. **`maxSessions`** — a hard cap; an `initialize` beyond it is refused `503` with `Retry-After` rather
   than growing without bound.
4. **`handler.close()`** — closes every live server, clears the interval, empties the map.

### D4 — Session ownership binding

Each entry records the `principalId` + `tenantId` that created it. A request whose credential resolves
to a different principal is answered **`404 Session not found`** — the same code the SDK uses for an
unknown session, so the response does not confirm to a stranger that the session exists. Authorization
is already per-call through the gateway, so this is not the load-bearing control; it exists so a leaked
session id plus *any* valid token cannot attach to another tenant's notification stream. ~6 lines, one
test, and it is the kind of hole that is embarrassing to find later.

### D5 — Auth at the HTTP boundary **and** the gateway per call

`McpGateway` gains one member:

```ts
export interface McpGateway {
  guard(tool: McpToolName, context: McpCallContext): Promise<AuthContext>;
  /**
   * Authenticate a connection-level request (the HTTP transport's boundary check) using the SAME
   * credential resolver `guard` uses. No tool, so no RBAC/quota/audit — those stay per call.
   */
  authenticate(context: McpCallContext): Promise<AuthContext>;
}
```

Why the boundary check at all, when the gateway would reject the tool call anyway: without it,
`initialize` succeeds with **no credential**, a session and an `McpServer` are allocated for an
anonymous caller, and only `tools/call` fails. Clause 2 says *no unauthenticated remote MCP*; clause 3
says *unauthenticated connection rejected*. A `401` + `WWW-Authenticate: Bearer` before any state is
created is the correct reading, and it is also what every MCP client expects at the HTTP layer.

Why it lives on `McpGateway` rather than taking a separate `AuthProvider`: one object, one
`resolveCredential`, so the boundary and the tools can never disagree about where the credential comes
from. Blast radius is one implementer (`createMcpGateway` is the only one in the tree).

**The gateway stays the authority** — `guard()` re-authenticates on every tool call, so RBAC, quota, and
audit are untouched and *remote MCP never bypasses the gateway*. The double authentication is one token
lookup (SQLite) or one cached-JWKS verify per HTTP request; that is the price of a boundary that fails
closed. A revoked token stops working on the next call **mid-session** — asserted.

Two independent guards enforce "no unauthenticated remote MCP", deliberately:
`createMcpHttpHandler`'s `gateway` option is **required** (type-level), and the config refuses to start
HTTP MCP when `auth.mode === 'none'` (because in `none` mode the local provider authenticates
*anything*, so a required gateway alone would be theatre).

### D6 — `authInfo`, and why we populate it even though we do not need it

Acceptance clause 1 says "Bearer credentials populating authInfo". Strictly, `defaultCredentialResolver`
would already work off `requestInfo.headers.authorization` (finding 2). We populate `req.auth` anyway:
it is the SDK's documented channel (`handleRequest` reads it at `streamableHttp.js:131`), `requestInfo`
is *optional* in the SDK's own types, and if a future version stops forwarding raw headers the fallback
would silently vanish. The shape is `{ token, clientId: authContext.principal.id, scopes: [] }` —
`scopes` stays **empty on purpose**: Tessera permissions are not OAuth scopes, and publishing them there
would invite an SDK-side check that is not the authority. A one-line comment says so.

### D7 — F-044 parity, itemised

| F-044 control | on `/mcp` | how |
|---|---|---|
| Security headers | ✅ | `securityHeaders({hsts})` written onto `reply.raw` before delegation (the `/v1/events` idiom) |
| `x-request-id` echo | ✅ | same |
| Body limit (1 MiB) | ✅ | Fastify parses the POST body; `bodyLimit` applies before we see it |
| Zod/JSON validation | ✅ | the transport parses with `JSONRPCMessageSchema`; tool args by the SDK against our shapes |
| Rate limiting | ✅ | `registerRateLimit(scope, { limiter })` inside the MCP scope. **No new code**: outside `/v1` there is no `request.authContext`, so the existing `rateLimitKey` falls straight through to `ip:<ip>` (`security/rate-limit.ts:83-89`) — exactly the per-IP limiter an unauthenticated flood needs, complementing the gateway's per-principal quota. Its own limiter instance (REST and MCP do not share a bucket); `RateLimitOptions.limiter` makes sharing a one-line change if review prefers it. |
| CORS | ⚠️ | The `onRequest` hook runs, and preflight is answered normally — but headers set on a **hijacked** reply are lost, and `allowedHeaders` (`server.ts:199`) does not list `Mcp-Session-Id`. Browser-origin MCP is a documented non-goal (see Risks). |
| `onResponse` latency metric | ⚠️ | Fastify does not run `onResponse` for hijacked replies, so MCP calls are not in `httpServerDuration`. **Pre-existing and identical for `/v1/events`.** Documented, not built. |

### D8 — Config

```ts
/** Remote MCP over streamable HTTP (F-055; FR-71). Off by default — stdio stays the local default. */
const mcpHttpSchema = z.object({
  enabled:      z.boolean().default(false),
  path:         z.string().regex(/^\/[\w\-/]*$/).default('/mcp'),
  sessionTtlMs: z.number().int().positive().default(300_000),
  maxSessions:  z.number().int().positive().default(100),
}).default({});
const mcpSchema = z.object({ http: mcpHttpSchema }).default({});
```

added to `configSchema` as `mcp`, plus a **root-level `.superRefine`** (the cross-section rule cannot
live inside `authSchema` or `mcpSchema`):

> `mcp.http.enabled` requires `auth.mode` to be `token` or `oidc` — *"remote MCP must not be
> unauthenticated (NFR-2)"*.

Root `superRefine` is safe: `configSchema` is only ever `.parse`/`.safeParse`'d and fed to
`z.input`/`z.output` (grep: `load.ts:172`, `schema.ts:254-256`, `schema.test.ts:50`) — no `.shape`
access anywhere. Failing in the schema means the boot dies with the standard `ValidationError` *before
any adapter is constructed*, which is `load.ts`'s stated contract.

Env vars (mapped in `configFromEnv`, house `section()` style): `TESSERA_MCP_HTTP_ENABLED`,
`TESSERA_MCP_HTTP_PATH`, `TESSERA_MCP_HTTP_SESSION_TTL_MS`, `TESSERA_MCP_HTTP_MAX_SESSIONS`, plus a
`mergeConfig` line for the `mcp` section.

**Every one of these must land in `.env.example` in the same commit** — `scripts/verify-state.mjs:331-359`
scans `packages/config/src/load.ts` and `apps/server/src` for `TESSERA_*` and fails the `state` gate
otherwise. And `.env.example` is the input to `apps/docs/generated/env-reference.json`
(`apps/docs/scripts/generate.mjs:208-258`), byte-compared by `generated-drift.test.ts` in the **`test`**
gate — so the docs regeneration is required work *inside that same increment*, not a follow-up.

### D9 — OpenAPI: the route is hidden, the document gains one sentence

The `/mcp` route carries `schema: { hide: true }`, so `GET /v1/openapi.json` gains **no path** (finding
7). JSON-RPC-over-HTTP is not a REST operation; describing it would produce a nonsense operation in the
generated `@tessera/sdk` client. But clause 4 names OpenAPI, and silence reads as an omission — so the
`info.description` in [`apps/api/src/plugins/openapi.ts`](../../apps/api/src/plugins/openapi.ts) gains
one sentence stating that a deployment may additionally expose the MCP endpoint at `POST/GET/DELETE
/mcp`, that it is not described here, and where the docs are. Cost: regenerate
`packages/sdk/openapi.json` (+ `src/generated/schema.ts`) and `apps/docs/generated/openapi.json` — both
mechanical, both drift-gated, committed in-change.

## Approach — five increments, gates green between commits

**0 · Governance.** [`docs/adr/0058-remote-mcp-http-transport.md`](../../docs/adr/0058-remote-mcp-http-transport.md)
(next free number — `docs/adr/` currently ends at 0057). It decides D1–D6 and states the **threat
model**: the MCP surface moves from a process boundary to a network boundary. Required by golden rule 7
and, explicitly, by `.harness/rules/security/security.md` — *"A security-relevant change or a new trust
boundary requires an ADR and explicit review."* It closes ADR-0029's "HTTP/streamable transport + auth
middleware … are follow-ups" and updates ADR-0017's "Transport = stdio". Commit this plan alongside it.
_Gate:_ `state`.

**1 · `@tessera/mcp/http` — the transport, Fastify-free.**
`McpGateway.authenticate` + `createMcpHttpHandler` + the `./http` subpath. No consumer yet; the tree
stays green. Tested end-to-end here over a bare `node:http` server (no Fastify) with a **real** SDK
`Client` — proving the handler is host-independent.
_Gates:_ `typecheck lint format test build e2e`.

**2 · Config gate + the mount in `apps/server`.**
`mcp` config section + root refinement + env mapping + `.env.example`; `apps/server/src/mcp-gateway.ts`
(the gateway factory extracted from `mcp.ts` so stdio and HTTP build it identically); `mcp-http.ts`
(the Fastify scope: rate limiter, hijack, raw headers, delegate); `api.ts` wires + tears down; new
`apps/server` vitest configs + `test:e2e` script + the real-token e2e; the OpenAPI description sentence;
**and both regenerations** (`@tessera/sdk generate`, `@tessera/docs generate`) so `pnpm -w test` is never
red between commits.
_Gates:_ `state typecheck lint format test build e2e`.

**3 · Docs.**
`apps/docs/content/docs/agents/remote-mcp.mdx` + `agents/meta.json`; rewrite the now-false closing
paragraph of `agents/index.mdx` (it literally says *"remote agents connecting over HTTP with Bearer
tokens is the upcoming remote-MCP transport (F-055)"*); a cross-link from
`guides/tokens-and-auth.mdx`; ARCHITECTURE §3 + §11 corrected.
_Gates:_ `typecheck lint format test build e2e`.

**4 · Effects + state.** `effects.json` (E-003/E-018/E-014/E-026, +E-020 if D-audit lands),
`progress.md`, `feature_list.json` → `done`, a memory lesson if one is worth keeping.
_Gate:_ `state`.

## Files to touch

**`@tessera/mcp`**
- `apps/mcp/src/gateway.ts` — add `authenticate` to `McpGateway` + `createMcpGateway`; rewrite the
  module doc comment's "a future multi-client HTTP transport" (it exists now); **optional**
  `transport?: 'stdio' | 'http'` on `McpGatewayOptions` folded into the audit `metadata` — argued below.
- `apps/mcp/src/gateway.test.ts` — `authenticate` cases (success, `UnauthorizedError` passthrough, uses
  the injected resolver); the metadata label if it lands (existing assertions are `toMatchObject`, so
  they are unaffected — checked).
- `apps/mcp/src/http.ts` **(new)** — `createMcpHttpHandler`, the session map, the boundary 401, the
  reaper, `close()`.
- `apps/mcp/src/http.test.ts` **(new)** — raw-HTTP unit coverage over a `node:http` server.
- `apps/mcp/src/result.ts` — export `toEnvelope` so the HTTP error bodies use the *same* masking policy
  as tool errors (no second policy).
- `apps/mcp/tests/e2e/http.e2e.test.ts` **(new)** — the real-client journey.
- `apps/mcp/package.json` — `exports["./http"] → ./dist/http.js`.
- `apps/mcp/src/index.ts` — module doc comment (stdio is the default; HTTP is the remote transport at
  `@tessera/mcp/http`). **Do not** re-export `http.js` from the root entry — that would put hono back in
  the stdio graph.

**`@tessera/config`**
- `packages/config/src/schema.ts` — `mcpSchema` + `configSchema.mcp` + the root `superRefine`.
- `packages/config/src/load.ts` — the four `TESSERA_MCP_HTTP_*` vars + a `mcp` line in `mergeConfig`.
- `packages/config/src/schema.test.ts` — defaults, the `auth.mode=none` refusal, env parsing.

**`@tessera/server`**
- `apps/server/src/mcp-gateway.ts` **(new)** — `createRuntimeGateway(runtime)`, lifted verbatim from
  `mcp.ts:33-43` so stdio and HTTP cannot drift.
- `apps/server/src/mcp.ts` — use it (behaviour byte-identical).
- `apps/server/src/mcp-http.ts` **(new)** — `registerMcpHttp(app, runtime, services, { security })`.
- `apps/server/src/api.ts` — mount when enabled; `handle.close()` closes MCP sessions **before**
  `app.close()` (see Risks).
- `apps/server/src/mcp-http.test.ts` **(new)** — the disabled-by-default path, the `none`-mode refusal.
- `apps/server/vitest.config.ts` **(new)**, `apps/server/vitest.e2e.config.ts` **(new)** — mirrors
  `apps/mcp` (`include: ['src/**/*.test.ts']` / `['tests/e2e/**/*.test.ts']`); without the first, the
  default `test` script would swallow the e2e too.
- `apps/server/tests/e2e/mcp-http.e2e.test.ts` **(new)** — the acceptance-clause-3 journey.
- `apps/server/package.json` — `"test:e2e"` script; `@modelcontextprotocol/sdk` as a **devDependency**
  (test-only; the production graph keeps its no-direct-SDK property, and the comment at `mcp.ts:6`
  should be qualified rather than deleted).

**Surfaces / generated**
- `apps/api/src/plugins/openapi.ts` — one sentence in `info.description` (D9).
- `packages/sdk/openapi.json`, `packages/sdk/src/generated/schema.ts`, `apps/docs/generated/openapi.json`,
  `apps/docs/generated/env-reference.json` — **regenerated, never hand-edited**.

**Docs**
- `apps/docs/content/docs/agents/remote-mcp.mdx` **(new)**, `agents/meta.json`, `agents/index.mdx`
  (lines 76-81), `guides/tokens-and-auth.mdx` (a cross-link), `docs/architecture/ARCHITECTURE.md`
  (§3 row *"MCP server … embedded in API (gateway later)"*, §11 bullet *"embedded in the API process
  now"*).
- Optionally add `/docs/agents/remote-mcp` to `apps/docs/tests/e2e/docs.spec.ts`'s `PAGES`.
- **`docker-compose.yml` is deliberately untouched** — the endpoint shares the REST listener and port,
  so no compose change and therefore no `compose-doc-drift.test.ts` ripple.

**Governance / state**
- `docs/adr/0058-remote-mcp-http-transport.md` **(new)**; `.harness/state/{effects,feature_list}.json`,
  `.harness/state/progress.md`, `.harness/memory/` (+ its index if a lesson lands).

### On the audit transport label (argued, not smuggled)

This feature makes it possible for an MCP call to originate off-machine, and the trail cannot say which
did: the gateway records `metadata: { surface: 'mcp' }` for stdio and HTTP alike. An auditor asking
*"which agent calls came from outside?"* has no answer, and **this feature is what creates the
ambiguity**. The fix is an optional `transport` on `McpGatewayOptions` folded into `metadata`; omitted
(stdio today) the recorded event is byte-identical. ~5 lines, one E-020 note. I am flagging it here
rather than deciding it silently: if review reads it as creep, dropping it touches nothing else.

## Anticipated effects

Run the [effect-link protocol](../protocols/effect-link.md) before finishing; the dependents are known now.

- **E-003 (REST `/v1` + MCP tool contracts)** — extend. `McpGateway` gains a required `authenticate`
  (one implementer: `createMcpGateway`). `@tessera/mcp` gains the `./http` export subpath, whose
  consumer is `apps/server`. **The REST path set is unchanged** — the `/mcp` route is `hide: true`, so
  no new OpenAPI operation and no new generated SDK method; only `info.description` changes, so
  `packages/sdk/openapi.json` + `src/generated/schema.ts` + `apps/docs/generated/openapi.json`
  regenerate. Say the "no new path" part explicitly in the effect note so a future reader does not go
  hunting. Tool inputs/outputs, `TOOL_PERMISSIONS`, and `MCP_AUDIT_ACTIONS` are **untouched** (20 tools
  in, 20 tools out) — so `apps/docs/generated/mcp-tools.json` does not move.
- **E-018 (auth control plane)** — extend, and this is the important one. The `AuthProvider` now guards
  a **network** boundary, not just an in-process one; the same token authenticates REST and remote MCP.
  Rewrite the two now-false notes: `gateway.ts`'s *"a future multi-client HTTP transport"*, and the part
  of F-072's note claiming `authInfo`/`Authorization` are populated "only by an HTTP transport's auth
  middleware" — there is one now, ours, and it is not the SDK's. F-072's stdio gap is **unchanged**.
- **E-014 (config schema + Local profile composition)** — extend. `TesseraConfig` gains `mcp.http.*` and
  its first **cross-section** refinement (`mcp.http.enabled` ⇒ `auth.mode != none`); four new
  `TESSERA_MCP_HTTP_*` vars ⇒ `.env.example` (verify-state env-docs, `scripts/verify-state.mjs:333`).
  `Runtime` itself is unchanged — `runtime.config` already carries the whole `TesseraConfig`.
- **E-026 (docs generated-reference inputs)** — extend. `.env.example` → `generated/env-reference.json`
  and the OpenAPI description → `generated/openapi.json`, both byte-compared by
  `tests/generated-drift.test.ts` in the `test` gate; regenerate **in the same increment** as the input
  change. `link-check.test.ts` covers the new page's internal links. **`prose-counts.test.ts` is a live
  trap for the new page**: never write the literal tool count in a paragraph containing the word
  "tool" — use `<McpToolCount />`.
- **E-020 (audit trail)** — only if the `transport` metadata label lands; record it if so.
- **E-005 (gate ↔ CI mirror)** — **no change**. `apps/server` gains a `test:e2e` script, which the
  existing `pnpm -w test:e2e` (`turbo run test:e2e`) picks up automatically. `gates.json` is untouched.

## Test plan

**Red before green.** Before touching `src/`, write `apps/server/tests/e2e/mcp-http.e2e.test.ts` against
the intended surface and capture its failure (`connect ECONNREFUSED`/404 at `${url}/mcp`) into
`progress.md` and the increment-2 commit message. Never commit it red.

**Unit — `@tessera/mcp`**
- `gateway.test.ts`: `authenticate` returns the `AuthContext`; propagates `UnauthorizedError`; uses the
  injected `resolveCredential`; performs **no** RBAC/quota/audit (an audit sink stays empty).
- `http.test.ts` (a real `node:http` server, raw `fetch` — no MCP client, so the assertions are about
  HTTP, not protocol):
  - no `Authorization` → **401**, `WWW-Authenticate: Bearer error="invalid_token"`, body
    `{error:{code:'UNAUTHORIZED'}}`, and **`sessionCount === 0`** (nothing was allocated);
  - a garbage token → 401, same shape;
  - a valid token, POST without `Mcp-Session-Id` and a non-`initialize` body → **400**;
  - an unknown `Mcp-Session-Id` → **404**;
  - a session opened by principal A, reused with principal B's valid token → **404** (D4);
  - `maxSessions: 1` → the second `initialize` is **503** with `Retry-After`;
  - `responseHeaders` are present on a transport-level response (the hijack-safety proof);
  - the sweeper evicts an idle session at `now() > lastSeenAt + ttl` and leaves a fresh one;
  - `close()` empties the map and the returned promise resolves.

**Unit — `@tessera/config`** (`schema.test.ts`): `mcp.http` defaults (`enabled:false`, `path:'/mcp'`);
`{mcp:{http:{enabled:true}}}` with `auth.mode` absent/`none` **throws** with a message naming both keys;
with `token`/`oidc` it parses; `path: 'mcp'` (no leading slash) is rejected;
`TESSERA_MCP_HTTP_*` map through `configFromEnv`.

**Unit — `@tessera/server`** (`mcp-http.test.ts`): disabled config registers **no** route (assert
`app.inject({url:'/mcp'})` → 404); `auth.mode:'none'` + enabled fails at `startApiServer` with the
config `ValidationError`, not at first request.

**E2E — `apps/mcp/tests/e2e/http.e2e.test.ts`** — a real `Client` + `StreamableHTTPClientTransport`
against a bare `node:http` server wrapping `createMcpHttpHandler` over `createInMemoryServices()`.
**Uses `defaultCredentialResolver`** — deliberately, because every existing gateway e2e injects a fixed
resolver (`gateway.e2e.test.ts:61`) and so has *never* exercised the real credential path:
1. connect with `requestInit: { headers: { authorization: 'Bearer …' } }` → `initialize` succeeds and
   `transport.sessionId` is defined;
2. `tools/list` advertises the same set the in-memory transport does;
3. `search` as `viewer` succeeds; `capture_memory` as `viewer` → `FORBIDDEN`; as `member` → ok;
4. quota `limit: 2` → the third call is `RATE_LIMITED`;
5. `X-Tessera-Project` in `requestInit.headers` scopes a data tool to that project, and a foreign
   project id is rejected — **the first test in the repo that can prove this at all** (finding 2);
6. **teardown matrix**: `transport.terminateSession()` → `sessionCount === 0`; a client that only calls
   `client.close()` leaves the session until `sweep()` removes it (asserted with an injected clock —
   this is the leak, made visible); `handler.close()` with a live client resolves and empties the map.

**E2E — `apps/server/tests/e2e/mcp-http.e2e.test.ts`** — acceptance clause 3, over the **real**
composition root: `startApiServer({ port: 0, config: { auth: { mode: 'token' }, mcp: { http: { enabled: true } }, storage: { … ':memory:' }, embeddings: { provider: 'fake' } } })`,
token issued from `handle.runtime.auth.tokenStore` (the F-034 store — the `api.test.ts:68-74` idiom):
- a real `Client` over HTTP calls `search` and `capture_memory` through the whole stack;
- **the audit trail is queried through `handle.runtime.audit`** and shows the call with
  `surface: 'mcp'`, the right actor/tenant and `outcome: 'success'` — clause 1's "audits every call",
  proven on the real sink rather than an in-memory double;
- an RBAC denial and a quota denial (a second server with `auth.quota.enabled`);
- **raw `fetch` with no `Authorization` → 401 + `WWW-Authenticate`**, and the response still carries
  `x-request-id` + `content-security-policy` (F-044 parity through the hijack);
- **`GET /v1/openapi.json` has no `/mcp` path** (the `hide:true` proof);
- `GET /v1/search` still works unchanged (the REST surface is untouched);
- **revocation mid-session**: revoke the token, call again → `UNAUTHORIZED` without reconnecting;
- **`handle.close()` resolves within the test timeout while a client is connected** — the shutdown-hang
  guard (see Risks).

**Regression** — `apps/mcp` unit + all five existing e2e files, `apps/server/src/{api,mcp}.test.ts`, the
`apps/api` e2e suite, and `tests/e2e-full` stay green untouched. Any change to a stdio assertion means
the refactor of the gateway factory was not behaviour-preserving — investigate, do not edit the
assertion.

## Verification

Gates in order, stop at first failure ([protocol](../protocols/verification.md)):

```
node scripts/verify-state.mjs
pnpm -w typecheck
pnpm -w lint
pnpm -w format:check
pnpm -w test
pnpm -w build
pnpm -w test:e2e
pnpm -w test:e2e:full
```

`e2e-full` is not in F-055's `verification` array and is not required by the acceptance, but run it
once at the end: `startApiServer` changed, and that is the entry point the full-stack harness boots.

Targeted during the loop:

```
pnpm install                                   # after the package.json edits
pnpm --filter @tessera/mcp test
pnpm --filter @tessera/mcp test:e2e
pnpm --filter @tessera/config test
pnpm --filter @tessera/server test
pnpm --filter @tessera/server test:e2e
pnpm --filter @tessera/sdk generate            # then commit openapi.json + src/generated/schema.ts
pnpm --filter @tessera/docs generate           # then commit generated/*   (requires pnpm -w build first)
pnpm --filter @tessera/docs test               # drift + link-check + prose-counts
```

**Evidence for `progress.md`:** per-gate pass counts; the captured pre-fix failure of the clause-3 e2e;
the `sessionCount` transitions in the teardown matrix; the observed 401 headers; and the assertion
output showing `/v1/openapi.json` gained no path.

## Risks / open questions

- **OQ-1 — ADR required before coding (increment 0).** This is a **new trust boundary**: the MCP surface
  becomes network-reachable. `.harness/rules/security/security.md` makes an ADR mandatory, and golden
  rule 7 independently requires one for D2 (stateful), D5 (boundary auth on `McpGateway` rather than the
  SDK's middleware), and D9 (a route deliberately excluded from OpenAPI). **ADR-0058 — Remote MCP over
  streamable HTTP: stateful sessions, gateway-owned boundary auth, mounted by the composition root.**
  Its threat model must state: a leaked token now grants network access, not just local access; sessions
  are per-principal, in-memory, and per-process (a multi-replica deployment needs sticky sessions or an
  `EventStore` — a documented seam, not built).
- **Shutdown hang — the concrete one.** Fastify 5's `close()` defaults to `forceCloseConnections:'idle'`;
  an open MCP `GET` SSE stream is *not* idle, so `app.close()` would wait forever. `handle.close()` must
  close MCP sessions **first**, then the app, then the runtime. This is asserted by a test, not assumed.
- **Fastify already consumed the body.** `getRequestListener` would try to read the request stream, which
  Fastify has drained for `application/json`. We pass `request.body` as `parsedBody`, which the transport
  short-circuits on (`webStandardStreamableHttp.js:393-395`). Getting this wrong hangs the POST — it is
  the single most likely implementation bug in this feature.
- **`transport.onclose` must be set before `server.connect`** (finding 5). After, and the Protocol's own
  cleanup is clobbered and sessions leak in a way no test would obviously catch.
- **`exactOptionalPropertyTypes: true`** — every optional passed into `StreamableHTTPServerTransportOptions`
  and into `BuildMcpServerOptions` must use conditional spread, never `key: undefined` (the existing
  `apps/server/src/mcp.ts:37,42,47` style).
- **`@hono/node-server` enters the server's runtime graph** via the SDK. It is an existing transitive
  dependency of a pinned SDK, not a new direct one — but it is worth one line in the ADR, because
  "prefer first-party for sensitive paths" (`rules/security`) applies to the thing now terminating remote
  connections. The `./http` subpath keeps it out of the stdio binary.
- **Browser-origin MCP is not supported, on purpose.** `@fastify/cors`'s `allowedHeaders` list
  (`apps/api/src/server.ts:199`) lacks `Mcp-Session-Id` / `Mcp-Protocol-Version` / `Last-Event-Id`, and
  `exposedHeaders` lacks `Mcp-Session-Id`, so a browser preflight for `/mcp` fails. Real remote MCP
  clients (Claude Code, Cursor, hosted connectors) are server-side and unaffected. Widening the global
  CORS lists is an E-003 change for a client class that does not exist yet — record it, do not build it.
- **No `onResponse` metric for `/mcp`** (hijacked replies). Identical to `/v1/events` today. Documented;
  a transport-level duration metric is a separate item.
- **Double authentication per HTTP request.** One extra token lookup or JWKS-cached verify per request.
  Accepted: it is what makes the boundary fail closed, and it is the same cost REST pays.
- **Per-principal session capping is not built.** `maxSessions` is global, so an authenticated principal
  could crowd others out. Below the acceptance line; recorded as a seam with the per-principal cap as the
  obvious next knob.
- **Scope creep to refuse:** OAuth/DCR and `.well-known` protected-resource metadata; resumability via
  `EventStore`; a `tessera mcp-config --remote` CLI form; switching the F-048 agent journey onto HTTP;
  a distributed session store; project-scoped SSE; **stdio credentials (F-072)**.
