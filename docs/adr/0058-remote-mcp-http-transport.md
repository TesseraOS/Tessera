# ADR-0058: Remote MCP over streamable HTTP — stateful sessions, gateway-owned boundary auth, mounted by the composition root

- **Status:** Accepted
- **Date:** 2026-07-26
- **Deciders:** Implementing agent (F-055) — completes the follow-up recorded in ADR-0029
- **Tags:** mcp, transport, http, auth, authz, quotas, audit, security, trust-boundary

## Context

F-026 built the entire multi-client control plane for MCP — [`createMcpGateway`](../../apps/mcp/src/gateway.ts)
authenticates a credential into an `AuthContext`, authorizes the tool against `TOOL_PERMISSIONS`,
meters a per-principal `QuotaLimiter`, and (F-047) records `MCP_AUDIT_ACTIONS` into the same trail
REST writes to. It has never had more than one client, because
[ADR-0017](0017-mcp-server-surface.md) fixed the transport at **stdio**, and
[ADR-0029](0029-mcp-gateway-auth-quotas.md) wrote its own gap down plainly: *"Per-client credentials
require a multi-client transport (HTTP); stdio carries one identity"*, with the HTTP transport and
auth middleware named as follow-ups. [ADR-0036](0036-agent-first-operations.md) then made remote MCP
a product commitment.

So the gateway is a door with no building attached. This ADR builds the building.

The decision is not *whether* — FR-71 and F-055's acceptance settle that — but four things the code
cannot infer: **where the transport lives** given that `@tessera/mcp` may not import Fastify and
already depends on `@tessera/api`; **whether sessions are stateful**; **who authenticates the HTTP
connection itself**, as distinct from each tool call; and **what this does to the trust boundary**,
because the MCP surface stops being reachable only by a process the user launched on their own machine.

Facts established by reading `@modelcontextprotocol/sdk@1.29.0`, not assumed:

- `StreamableHTTPServerTransport.handleRequest(req & { auth?: AuthInfo }, res, parsedBody?)` is
  Node-shaped and delegates to `@hono/node-server`'s `getRequestListener`
  (`server/streamableHttp.js:128-144`).
- It forwards **both** credential channels the gateway already reads: `req.auth` becomes `authInfo`,
  and `requestInfo.headers` is `Object.fromEntries(req.headers.entries())`
  (`server/webStandardStreamableHttp.js:388-391`).
- `parsedBody` short-circuits `req.json()` (`webStandardStreamableHttp.js:392-395`) — the only way to
  serve this behind a framework that has already drained the request stream.
- `Protocol.connect` **throws** if a second transport is attached (`shared/protocol.js:216-218`), so
  one `McpServer` instance per connection is mandatory, not stylistic.
- The client's `close()` does **not** send a `DELETE` (`client/streamableHttp.js:280-287`); only the
  explicit `terminateSession()` does (`:431-459`).
- The SDK's `requireBearerAuth` middleware is Express-shaped (`res.set` / `res.status().json()`) and
  **rejects any token without `expiresAt`** (`server/auth/middleware/bearerAuth.js:30-35`).

## Decision

### 1. The transport is a Fastify-free module in `@tessera/mcp`, exposed as the `./http` subpath, and mounted onto the existing Fastify app by `apps/server`

Three placements were possible, and two are excluded by facts rather than taste:

- **A route in `@tessera/api`** — impossible without a workspace cycle: `@tessera/mcp` already depends
  on `@tessera/api` (`apps/mcp/package.json`). The only acyclic variant injects an opaque raw
  `(req, res)` handler into `buildServer`, punching a hole in a package whose rule is schema-first,
  thin routes.
- **A second listener on its own port** — contradicts F-055's *"served by apps/server alongside REST"*,
  forfeits every F-044 hook, and adds a port to every deployment document and compose file.
- **Chosen:** `apps/mcp/src/http.ts`, importing only `node:http` types, `node:crypto`, and the MCP SDK,
  published as `@tessera/mcp/http` and mounted by `apps/server` — the composition root, the only place
  that already holds both packages and knows the profile.

The F-012 *"no Fastify in the MCP runtime"* invariant is **preserved and sharpened, not bent**: the
invariant is about the web framework, and `node:http` is the platform. The subpath earns its keep a
second way: importing the streamable-HTTP transport pulls `hono` + `@hono/node-server` (transitive SDK
dependencies) into the module graph, and the `tessera-mcp` **stdio** binary that agent clients spawn
must not pay for them. `import '@tessera/mcp'` stays byte-identical to today; `http.js` is deliberately
**not** re-exported from the root entry.

### 2. Sessions are stateful

Stateless mode (`sessionIdGenerator: undefined`) is not "one server without sessions". Because
`Protocol.connect` refuses a second transport, stateless means constructing a **fresh `McpServer` per
HTTP request** — twenty tool registrations plus Zod→JSON-Schema conversion on every `tools/call`. For a
server whose tool catalog is fixed at build time that is the wrong trade.

So: one `{ McpServer, transport }` per session in a `Map`, keyed by the SDK-generated session id.
F-055's acceptance ("session lifecycle + connection teardown are clean under client disconnect")
presumes sessions exist. The cost is a leak surface, and it is real — see §3.

### 3. Four teardown paths, because the common one is a leak

`client.close()` sends nothing. An agent process that simply exits leaves the server holding an
`McpServer` and a transport **forever**. Teardown is therefore not one mechanism but four, and the
idle sweeper is not optional:

1. **`DELETE`** → the SDK's `onsessionclosed` + `transport.close()` → our `onclose` deletes the entry.
2. **Idle TTL sweep** — a per-entry `lastSeenAt` and a sweeper on an **`.unref()`'d** `setInterval`
   (unref'd or the process never exits; the `/v1/events` heartbeat sets the precedent).
3. **`maxSessions`** — a hard cap; an `initialize` beyond it is refused `503` + `Retry-After` rather
   than growing unbounded.
4. **`close()`** — closes every live server, clears the interval, empties the map.

`transport.onclose` is assigned **before** `server.connect`, because `Protocol.connect` captures and
chains the existing handler (`protocol.js:220-224`); assigning after would clobber the SDK's own cleanup.

### 4. Each session is bound to the principal that opened it

An entry records the opening `principalId`/`tenantId`. A request whose credential resolves to a
different principal is answered **`404 Session not found`** — the same status the SDK uses for an
unknown session, so the response never confirms to a stranger that the session exists. Per-call
authorization through the gateway is the load-bearing control; this exists so that a leaked session id
plus *any* valid token cannot attach to another tenant's notification stream.

### 5. The gateway owns the connection-level check too — `McpGateway.authenticate`

`McpGateway` gains one member beside `guard`:

```ts
authenticate(context: McpCallContext): Promise<AuthContext>;
```

Same `resolveCredential`, no tool, therefore **no RBAC, no quota, no audit** — those stay per call.
The HTTP handler calls it before allocating anything and answers `401` +
`WWW-Authenticate: Bearer` otherwise.

Without it, `initialize` would succeed with **no credential at all**: a session and an `McpServer`
allocated for an anonymous caller, with only `tools/call` failing. F-055 requires that no
unauthenticated remote MCP exists and that an unauthenticated connection is rejected — the correct
reading is a 401 before any state is created, and it is what MCP clients expect at the HTTP layer.

It lives on `McpGateway` rather than taking a separate `AuthProvider` so there is **one object and one
credential resolver**: the boundary and the tools can never disagree about where a credential comes
from. The gateway remains the authority — `guard()` re-authenticates on every tool call, so remote MCP
never bypasses it, and a token revoked mid-session stops working on the next call.

The SDK's own `requireBearerAuth` is not used, for three independent reasons: it is Express-shaped; it
rejects non-expiring tokens, which Tessera issues (`expiresAt: string | null`); and it would introduce
an `OAuthTokenVerifier` identity model beside `AuthProvider` — precisely what ADR-0029 avoided.

**Two independent guards** enforce "no unauthenticated remote MCP": the handler's `gateway` option is
required at the type level, *and* the config refuses to enable HTTP MCP when `auth.mode` is `none`
(in `none` mode the local provider authenticates anything, so a required gateway alone would be
theatre). NFR-2.

### 6. `req.auth` is populated even though the header fallback would suffice

`defaultCredentialResolver` already prefers `authInfo.token` and falls back to the `Authorization`
header, and the transport populates `requestInfo.headers`. We still set `req.auth` — it is the SDK's
documented channel, `requestInfo` is optional in the SDK's own types, and relying solely on the
fallback would let a future SDK version silently remove our credential path. `scopes` is left
**empty on purpose**: Tessera permissions are not OAuth scopes, and publishing them there would invite
an SDK-side check that is not the authority.

### 7. The route is excluded from OpenAPI, and the document says so

`/mcp` carries `schema: { hide: true }`. JSON-RPC-over-HTTP is not a REST operation; describing it
would emit a nonsense operation into the generated `@tessera/sdk` client. Because silence would read
as an omission, the OpenAPI `info.description` gains one sentence stating that a deployment may
additionally expose MCP at `/mcp`, that it is not described here, and where the docs are.

## Threat model — a process boundary becomes a network boundary

This is the consequential part, and it is why this ADR exists rather than a code comment.

- **Before:** reaching the MCP tools required the ability to spawn a process on the host. The gateway's
  authentication was defence in depth over an already-local caller.
- **After (only when explicitly enabled):** the tools are reachable by anyone who can reach the API
  port. A leaked token now grants **network** access, not merely local access. The gateway stops being
  defence in depth and becomes the primary control — which is why the boundary check fails closed, the
  config refuses `auth.mode: none`, and the transport ships **disabled by default**.
- **Session state is per-process and in-memory.** A multi-replica deployment needs sticky sessions, or
  an `EventStore` for resumability. Documented as a seam; not built.
- **`@hono/node-server` now terminates remote connections.** It is an existing transitive dependency of
  a pinned SDK rather than a new direct one, but "prefer first-party on sensitive paths" applies, so it
  is named here rather than discovered later. The `./http` subpath keeps it out of the stdio binary.
- **Not mitigated here:** `maxSessions` is global, so an authenticated principal can crowd others out
  (a per-principal cap is the obvious next knob). Browser-origin MCP is unsupported — the global CORS
  `allowedHeaders` does not carry `Mcp-Session-Id`, and widening it for a client class that does not
  exist would be an unforced contract change.

## Consequences

### Positive
- ADR-0029's recorded gap closes: the gateway finally has the multi-client transport it was designed
  for, and per-client credentials are real.
- **`X-Tessera-Project` per-call project selection starts working.** `apps/mcp/src/server.ts` has read
  `requestInfo.headers['x-tessera-project']` since F-050/ADR-0037, and no transport could carry it.
  This one can, and a test proves it for the first time.
- One identity model across both surfaces: the same F-034 token authenticates REST and remote MCP, and
  both write one audit trail (ADR-0036 parity).
- F-044 hardening is inherited, not reimplemented: security headers, `x-request-id`, the body limit,
  and — because `rateLimitKey` falls through to `ip:` outside `/v1` — per-IP rate limiting.

### Negative / costs
- **Two authentications per HTTP request** (boundary + per-call `guard`): one token lookup or one
  cached-JWKS verify. Accepted; it is what makes the boundary fail closed, and REST pays the same.
- A session map is state the stdio transport never had, with a genuine leak if the sweeper regresses.
- Headers set via Fastify's `reply.header()` are **lost** on a hijacked reply (hono replies with
  `writeHead`), so F-044 headers must be written onto `reply.raw` — the `/v1/events` idiom, now used
  twice and therefore a pattern.
- No `onResponse` latency metric for `/mcp`: Fastify does not run the hook for hijacked replies. This
  is pre-existing and identical for `/v1/events`; documented, not fixed here.

### Neutral
- Off by default. Nothing changes for existing deployments, and stdio remains the local default.
- No new REST path, so the generated SDK gains no method; only `info.description` moves.

## Alternatives considered

- **Stateless mode** — rejected, §2: it means a fresh 20-tool `McpServer` per request, because
  `Protocol.connect` refuses transport reuse.
- **The SDK's `requireBearerAuth` / OAuth router + DCR** — rejected, §5: Express-shaped, rejects
  non-expiring tokens, and adds a second identity model beside `AuthProvider`.
- **A route inside `@tessera/api`** — rejected, §1: workspace cycle.
- **A separate MCP port/process** — rejected, §1: contradicts the acceptance and forfeits F-044.
- **Boundary auth via a plain `AuthProvider` injected beside the gateway** — rejected, §5: two objects
  resolving credentials two ways is exactly how a boundary and its tools come to disagree.
- **Resumability via `EventStore`** — deferred: nothing requires it, and it needs a durable store.

## References

- Realized by **F-055**. Completes the follow-up recorded in
  [ADR-0029](0029-mcp-gateway-auth-quotas.md); extends the transport decision in
  [ADR-0017](0017-mcp-server-surface.md) (stdio remains the local default); delivers the remote-MCP
  commitment in [ADR-0036](0036-agent-first-operations.md).
- Auth model: [ADR-0028](0028-api-auth-tenancy-rbac.md), [ADR-0030](0030-auth-composition-root-wiring.md),
  [ADR-0032](0032-oidc-auth-provider.md). Isolation: [ADR-0033](0033-data-plane-tenant-isolation.md),
  [ADR-0037](0037-multi-project-workspaces.md). Audit: [ADR-0049](0049-data-governance-retention-dsr-mcp-audit.md).
- PRD **FR-71**, **FR-36**, **NFR-2**. Effect-links **E-003**, **E-018**, **E-014**, **E-026**.
- The stdio credential channel remains open as **F-072**; this ADR does not address it.
