# Plan: F-060 Dashboard: live Overview — real workspace stats + SSE activity feed + notifications

- **Feature:** F-060 (see [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-38, FR-62, FR-49 (from [`../../docs/PRD.md`](../../docs/PRD.md))
- **Service / package:** apps/web (primary) · apps/api · apps/mcp · @tessera/sdk · @tessera/memory · @tessera/knowledge-graph · @tessera/ingestion
- **Author:** planner subagent + Claude Opus 4.8 · **Date:** 2026-07-16
- **Status:** in_progress

## Intent

Replace the Overview page's hardcoded placeholder stats and permanent "No activity yet"
empty state with real, tenant-scoped data: a new `GET /v1/stats` workspace summary (REST +
MCP parity per ADR-0036) and a live activity feed + notifications bell fed by the existing
`/v1/events` SSE stream. **Done** = a user opens `/`, sees true counts for their workspace,
and watches a captured memory / completed scan appear in the feed and the bell within the
same session — with no fabricated numbers and no fabricated trends.

## Requirements — what they actually say

- **FR-38** (PRD.md:199): "**SSE/WebSocket** for live updates (ingest progress, new
  memories)." Pri S, Rel R1.
- **FR-62** (PRD.md:250): "**Runtime source management:** register/scan/remove ingestion
  sources at runtime via REST + MCP + UI; scans run through the Queue port with progress
  over SSE; incremental rescan; audited." Pri M, Rel R3.
- **FR-49** (PRD.md:214): "UX baseline: command palette (⌘K), themes, skeleton/empty/error
  states, toasts, optimistic updates, virtualized lists, WCAG AA." Pri M, Rel R0→.

## Findings (research — concrete, verified against the tree)

### The event taxonomy that ACTUALLY exists

`apps/api/src/events.ts:7-48` — `ApiEventMap` / `API_EVENT_TYPES`. Five names, verified:

| Event | Payload (exact) | Emitted by |
|---|---|---|
| `document.ingested` | `{ ref, path, kind }` | `packages/config/src/profiles/local.ts:260-266` (bridged from `IngestionEvents`, emitted by `packages/ingestion/src/pipeline/worker.ts:99`) |
| `document.removed` | `{ ref, path }` | `local.ts:267-269` (worker.ts:66) |
| `memory.captured` | `{ lineageId, kind, title }` | `apps/api/src/routes/v1/memory.ts:46` — **the only direct API emitter** |
| `source.scan.started` | `{ sourceId, kind, label }` | `local.ts:270` (from `packages/ingestion/src/sources/service.ts:100`) |
| `source.scan.completed` | `{ sourceId, kind, label, summary: { added, modified, removed, unchanged } }` | `local.ts:271-278` (service.ts:115) |

**There is no `source.scan.failed` / `scan.error` event.** `performScan` sets
`statuses.set(id, { state: 'error', ... })` and rethrows (service.ts:122-130) — no event.
So "scan lifecycle" in the acceptance means **started + completed only**. Do not invent a
failed event here (F-065's acceptance lists `scan.failed` as a notification kind — that is
where it belongs, together with the persistent store).

Payloads carry **no timestamp** and **no tenantId**. `apps/web/lib/api/events.ts:159`
already documents this ("the wire payloads carry no timestamp") and stamps client receive
time. Keep that approach; do not add a server timestamp in this feature (an additive change
to five payloads for cosmetic gain — defer to F-065, which needs persisted `occurredAt`
anyway).

### The SSE route + how auth works

`apps/api/src/routes/v1/events.ts`:
- `reply.hijack()` (L36), `writeHead` with `text/event-stream` + security headers +
  `x-request-id` (L38-45).
- Subscribes to **all** `API_EVENT_TYPES` and writes each straight through (L47-51) —
  **no tenant filter, no per-connection filter of any kind**.
- `retry: 3000` client backoff hint (L53), `: connected` handshake (L54), 15s heartbeat
  comments (L7, L56), teardown on `request.raw.on('close')` (L59-62).
- **Auth (F-044):** no special-casing. The route sits inside the `/v1` scope, so
  `registerAuth` runs `onRequest` before the handler hijacks (L15-18 doc comment;
  `apps/api/src/routes/v1/index.ts:55`). Under a non-`none` provider an unauthenticated
  request 401s. There is **no query-param token support and no cookie support** on the API.

**How the browser authenticates SSE today (load-bearing):** it does not need to.
`apps/web/lib/api/client.ts:50` — `API_ORIGIN = PROXY_BASE = '/api/tessera'`
(`apps/web/lib/auth/session.ts:15`). `EventSource` opens a **same-origin** request to the
Next proxy, which carries the httpOnly `tessera_session` cookie automatically; the proxy
reads it and sets `Authorization: Bearer <token>` upstream
(`apps/web/app/api/tessera/[...path]/route.ts:62-63`) and streams `upstream.body` through —
the route's own doc comment says "the upstream status + body stream through unchanged (so
the `{error}` envelope and SSE both work)" (L41-44). It also strips `accept-encoding` (L24)
so the upstream body is identity-encoded and streamable.

⇒ **EventSource is viable and no token goes in a URL.** This is the decisive fact for the
SSE-client design question.

### Existing web SSE consumers (the acceptance's "none exists today" is stale)

`apps/web/lib/api/events.ts`:
- `useScanEvents()` (L92-133) — `new EventSource(`${API_ORIGIN}/v1/events`)` (L98),
  listens to `source.scan.started/completed` + `document.ingested`, pure reducer
  `scanEventsReducer` (L38-73). Consumed by `apps/web/components/sources/sources-view.tsx:60`.
- `useLiveActivity(limit = 50)` (L168-201) — a **second** `EventSource` (L174), accumulates
  `LIVE_ACTIVITY_TYPES = ['memory.captured','document.ingested','source.scan.completed']`
  (L147-151) into `LiveEvent[]`. Consumed by
  `apps/web/components/timeline/timeline-view.tsx:40`.

Neither has backoff, connection-state reporting, or 401 handling. Both rely on
EventSource's native retry (driven by the server's `retry: 3000`).

### The Overview page — exact locations of the dishonest UI

- `apps/web/app/page.tsx:6` → `<Dashboard />` (`apps/web/components/dashboard.tsx:32`).
- **Hardcoded stat cards:** `apps/web/components/stats.tsx:12-17` —
  `{ label: 'Indexed documents', value: '—' }`, `{ 'Active memories', '—' }`,
  `{ 'Effect-links', '—' }`, `{ 'Connected sources', '0' }`. `DashboardStats` (L19-42) is a
  **server component over a module-level `const`** — no fetching at all.
  Note `Stat.delta?: number` already exists with the comment "Rendered only when real data
  is available" (L7-8) and is gated at L30 — the honest contract is already coded, just
  never fed.
- **Permanent empty activity state:** `apps/web/components/dashboard.tsx:52-77` — the
  "Recent activity" `CardContent` is a hardcoded dashed-border block ("No activity yet",
  L56) with a `<Mascot mood="watching" />`. No data path.
- **Notifications bell shell:** `apps/web/components/app-header.tsx:57-80` —
  `NotificationsMenu()`, comment "functional shell with an honest empty state (feed wired
  when events land)" (L56), renders "You're all caught up" (L72). Rendered at L48.

### Where each stat must come from (and what is missing)

`ApiServices` (`apps/api/src/services.ts:31-56`): `search: HybridRetriever`,
`compiler`, `graph: KnowledgeGraphService`, `memory: MemoryService`, `sources?: SourceService`,
`billing?`, `readiness?`.

| Stat | Real source | Method exists? |
|---|---|---|
| Indexed documents | `IngestionManifest.snapshot(sourceId)` (`packages/ingestion/src/ports/manifest.ts:11`) summed over the tenant's registered sources | **NO** — and the manifest is not on `ApiServices` at all. `SourceService` already holds `registry` + `manifest` + `forTenant` (`packages/ingestion/src/sources/service.ts:34-67`) ⇒ add `documentCount()` there. |
| Active memories | `MemoryStore.listCurrent(filter?)` (`packages/memory/src/ports/memory-store.ts:31`) | **NO count.** Only list. |
| Graph nodes | `GraphStore.listNodes(filter?)` (`packages/knowledge-graph/src/ports/graph-store.ts:48`) | **NO count.** |
| Effect-links | `GraphStore.listEdges({ kind: EFFECT_LINK_KIND })` (graph-store.ts:49) | **NO count.** |
| Connected sources | `SourceService.forTenant(t).list()` (service.ts:54) | **YES** — sources are few; `list().length` is honest and cheap. |
| Last scan | `SourceService.scanStatus(id).lastScan.at` (service.ts:168-173) | **YES, but in-memory only** — see limitation L3 below. |

Verified: `packages/{memory,knowledge-graph}/src/adapters/` each have exactly **two**
adapters (`in-memory-*`, `sqlite-*`). A grep for `async count|COUNT(*)` across `packages/`
returns only test/migration hits — **no production count path exists anywhere.**

### Route / schema / OpenAPI precedent

Closest precedent = **sources** (`apps/api/src/routes/v1/sources.ts`, schema
`apps/api/src/schemas/sources.ts`). Pattern to mirror:
- Zod schemas in `apps/api/src/schemas/<name>.ts` — "the single source of validation +
  serialization + OpenAPI" (sources.ts:4-5), `zod/v4`.
- Route: `app.get('/stats', { preHandler: requirePermission(...), schema: { tags, summary,
  response: { 200: … } }, config: { audit?: … } }, handler)`.
- **Tenant scoping (ADR-0033, F-037):** `services.X.forTenant(tenantOf(request))` — every
  handler does this (sources.ts:63, 83, 103, 125, 146, 165). Tenancy **never** appears on
  the wire (`toWire` drops `tenantId`, sources.ts:26-41; schema comment L28).
- Not-configured guard: `requireSources()` throws `InternalError` (sources.ts:18-24).
- Error envelope: `{ error: { code, message } }` via `@tessera/core` errors +
  `apps/api/src/errors/envelope.ts`; registered in `apps/api/src/routes/v1/index.ts`.

### SDK generation (F-022)

`packages/sdk/scripts/generate.mjs` — boots `buildServer({})`, captures `app.swagger()`,
writes `packages/sdk/openapi.json`, emits `packages/sdk/src/generated/schema.ts` via
`openapi-typescript`. Command: **`pnpm --filter @tessera/sdk generate`**
(`packages/sdk/package.json:22`). **Both generated artifacts are committed** and must be in
the same change as the route. Then add the method to `createTesseraClient` and to
`apps/web/lib/api/client.ts`'s `api` object (L53-105).

### MCP registration (F-012, ADR-0036 parity)

Mirror `query_graph` — `apps/mcp/src/server.ts:218-233`:
`server.registerTool('query_graph', { description, inputSchema: queryGraphShape }, (args, extra) => runTool(async () => { const ctx = await guard('query_graph', extra); return services.graph.forTenant(tenantOf(ctx)).queryGraph({...}); }))`.
Also required: `McpToolName` union (`apps/mcp/src/gateway.ts:26-39`), `TOOL_PERMISSIONS`
(gateway.ts:41-55), `MCP_AUDIT_ACTIONS` (gateway.ts:62+), and the tool-name list assertion
in `apps/mcp/src/gateway.test.ts:34-48` (it asserts the **exact sorted set** — it will fail
until updated; that is the parity guard working).

### Web conventions

- `apps/web/.harness/rules/frontend.md:7-8` — "Talk to the backend **only** through the
  generated `@tessera/sdk` + TanStack Query. No ad-hoc `fetch` scattered in components."
  SSE is the standing exception (openapi-fetch cannot stream SSE); it stays centralized in
  `lib/api/events.ts`, precedent set by F-038.
- Query hooks: `apps/web/lib/api/hooks.ts` — `useQuery({ queryKey, queryFn: () =>
  api.X(), staleTime })` (e.g. `useSources` L87-93, `useGraph` L155-161).
- Session: `apps/web/lib/auth/use-session.tsx`, `apps/web/lib/auth/session.ts`.
- Client state: Zustand, `apps/web/lib/store/command.ts` is the precedent.
- States: `apps/web/components/empty-state.tsx`, `apps/web/components/error-state.tsx`.
- Design system: `docs/design/DESIGN-SYSTEM.md` (ADR-0009/ADR-0021) — **tokens only**,
  never hardcode. 4 themes × 2 modes (F-070, ADR-0047): `globals.css` + `app/themes.css`,
  `lib/theme.tsx`. Contrast gate: `apps/web/tests/contrast.test.ts` asserts registered token
  pairs across all 4×2. **Note:** `components/delta.tsx:42-43,58-59` uses raw
  `emerald-500/red-500` — a pre-existing, deliberate "only functional accent" exception
  (L8-9). Since we render no deltas, do not touch it.

### Web tests

- RTL component tests: `*.test.tsx` beside the component (e.g.
  `apps/web/components/sources/sources-view.test.tsx`, which mocks the SSE hook at L22:
  `vi.mock('@/lib/api/events', () => ({ useScanEvents: () => ({ bySource: {} }) }))`).
  Pure reducers get plain unit tests (`apps/web/lib/api/events.test.ts`).
- Playwright: `apps/web/playwright.config.ts` — port 3100, **production build**
  (`command: 'pnpm build && pnpm start --port 3100'`, L32) with
  `env: { TESSERA_API_URL: tokenApiUrl }` (L34). It boots a **real token-mode Local
  runtime** first: `apps/web/tests/e2e/support/token-api-server.mjs` — `:memory:` SQLite,
  fake embeddings, `buildServer(runtime.services, { auth, events: runtime.events, tokenStore })`
  (L35-40), an owner token for tenant **`acme`** (L28-33), exposed via a test-only
  `/e2e/token` route (L43).
- Fixtures: `apps/web/tests/e2e/support/fixtures.ts` stubs `**/v1/me` → `LOCAL_IDENTITY`
  (L77) and `**/v1/rbac` → `LOCAL_RBAC` (L78). **Both hardcode permission arrays** (L12-22,
  L28-38) — a new permission must be added here or the Overview 403s in e2e.
- axe: `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])` —
  `apps/web/tests/e2e/home.spec.ts:22-30`. `home.spec.ts:9` already asserts
  `getByText('Indexed documents')` is visible.

⇒ **The e2e for "an emitted event appears in the feed" is genuinely achievable**: the e2e
API is a real runtime with a real bus, so `POST /v1/memory` (as the `acme` owner token)
emits a real `memory.captured` that flows over real SSE into the feed. No stub needed.

## Design decisions (and their justification)

**D1 — `GET /v1/stats` does real COUNTs per request; no cache.**
The feature exists because the 2026-07-04 review found stats that *lied*. Replacing a
hardcoded lie with a stale cached number is the same sin with extra steps. Freshness is the
product claim, so we count for real. Cheapness is bought at the **store**, not with a cache:
add true count methods rather than `list().length`. Materializing every graph node + every
memory to `.length` them on every Overview load is exactly the toy shortcut golden rule 9
forbids, at the one place it matters (this endpoint is hit on every dashboard load).
Freshness in the client comes from TanStack Query `staleTime` + SSE-triggered invalidation
(D6), not from server caching.

**D2 — Count methods: additive at the port for graph/memory, at the service for documents.**
- `GraphStore.countNodes(filter?)` + `GraphStore.countEdges(filter?)` — port + 2 adapters
  (in-memory, sqlite `SELECT count(*)`) + a conformance case incl. cross-tenant isolation.
  Precedent: F-047 added 3 `MemoryStore` methods this exact way (E-010).
  `KnowledgeGraphService.counts()` composes them (`{ nodes, effectLinks }`, effect-links =
  `countEdges({ kind: EFFECT_LINK_KIND })`).
- `MemoryStore.countCurrent(filter?)` — port + 2 adapters + conformance case.
  `MemoryService.count(filter?)` over it.
- `SourceService.documentCount()` — **service-level only, no port change**: iterate
  `registry.list()` (already the tenant view) and sum `manifest.snapshot(id).size`.
  Tenant-correct because the *registry* is scoped. This deliberately does **not** touch
  `IngestionManifest` (E-009), keeping the blast radius off the connector/sink contracts.
- Sources count = `list().length` (few rows; no method needed).

**D3 — Put nothing new on `ApiServices`. ⚠️ E-015 trap.**
`instrumentServices` **rebuilds** the `ApiServices` object; a member it omits is silently
dropped from the shipped server and that member's routes 500 in production. This is not
hypothetical — it happened to `sources` + `billing` (F-038/F-030 latent bug, caught by
F-041). Every stat is reachable through an **existing** member (`memory`, `graph`,
`sources`), so `/v1/stats` composes those and adds **no** new member. Confirmed
`instrumentServices` already forwards + traces `sources`.

**D4 — No deltas. Say why.**
Acceptance permits this by construction ("deltas render only when real prior-period data
exists"). **No prior-period data source exists.** `GraphNode` has no `createdAt`; the
ingestion manifest stores only `path → contentHash` (no timestamps). Memory and sources do
have `createdAt`, but deriving "count at T-7d" from it assumes nothing was ever deleted —
and retention (FR-15/F-047) **deletes** memories, so such a delta would be wrong in exactly
the deployments that use retention. An honest delta needs a snapshot/time-series store,
which does not exist and **must not be invented here** (that is analytics, FR-47).
⇒ `stats.tsx` keeps its already-optional `delta?: number` (L8) and its render gate (L30);
we simply never pass a value. The footnotes stay. This is the F-049 precedent: a scope limit
stated, not hidden.

**D5 — SSE client: EventSource + a manual backoff supervisor, consolidated to ONE connection.**
- *EventSource vs fetch-stream:* **EventSource.** The classic objection (no `Authorization`
  header) does not apply — the same-origin proxy injects the bearer from the httpOnly cookie
  (`app/api/tessera/[...path]/route.ts:62-63`, which explicitly streams SSE). No token in a
  query param, no token in client JS. fetch-stream would buy status-code visibility at the
  cost of hand-rolling SSE framing, and would deviate from the F-038 precedent for no gain.
- *Consolidate:* today `useScanEvents` and `useLiveActivity` each open a socket; the feed +
  bell would make four. Introduce **one** `EventsProvider` (React context, mounted in the
  app shell) owning a single `EventSource`, and re-express `useScanEvents` /
  `useLiveActivity` over it. Net sockets: 1 (down from 2). This *is* the "resilient client"
  the acceptance asks for.
- *Reconnect + backoff:* EventSource auto-retries transient drops using the server's
  `retry: 3000` hint (events.ts:53) — keep that. But EventSource **gives up permanently** on
  a non-2xx (e.g. 401 after session expiry) — `readyState === CLOSED`. So the supervisor:
  on `error`, if `readyState === CONNECTING` → status `reconnecting` (let it retry); if
  `CLOSED` → close, and reconnect manually with **exponential backoff + jitter, 1s → 30s
  cap**, surfacing status. Never hot-loop.
- *Auth-aware:* gate the connection on `useSession()` — no session, no socket; on sign-out,
  tear down. Expose `'connecting' | 'open' | 'reconnecting' | 'error'` so the feed can show
  an honest "reconnecting…" affordance instead of silently going stale.
- Keep the state math in **pure reducers** (the existing `scanEventsReducer` pattern,
  events.ts:38) so it unit-tests offline with no socket.

**D6 — SSE-triggered stats invalidation.** On `document.ingested/removed`,
`memory.captured`, `source.scan.completed`, `queryClient.invalidateQueries({ queryKey:
['stats'] })` (debounced ~500ms so a 300-file scan doesn't fire 300 refetches). This is how
the cards stay live without polling and without a server cache.

**D7 — Bell unread state: live-session Zustand, per the spec.** `lib/store/notifications.ts`
mirroring `lib/store/command.ts`. Unread count = events received since last bell-open;
opening marks read. **Lost on reload — by design** (feature note; F-065 makes it
persistent). The bell must not imply history it does not have: keep the "You're all caught
up" copy for the empty case and label the list "This session".

**D8 — New permission `stats:read`.** `/v1/stats` aggregates across documents, memory,
graph and sources. Guarding it with one existing read permission would let a *scoped token*
(e.g. `memory:read` only) learn graph/document/source counts it was never scoped to —
`Principal.scopes` is an explicit least-privilege upper bound (`auth/model.ts:71-77`), so
that is a real (if minor) privilege leak. `PERMISSIONS` is designed for extension
("Extend the catalog here — every consumer derives from these two constants",
`apps/api/src/auth/model.ts:49-53`). Add `stats:read` to `PERMISSIONS` (L27-37) and to
`READ_PERMISSIONS` (L41-47) so viewer+ get it; `ROLE_PERMISSIONS` and `GET /v1/rbac` derive
automatically. **Must also update** the hardcoded arrays in
`apps/web/tests/e2e/support/fixtures.ts` (L12-22, L28-38) or the Overview 403s in e2e.

**D9 — Do not audit `GET /v1/stats`.** It is a low-sensitivity aggregate read hit on every
dashboard load; auditing it would flood the trail F-027 built and degrade the compliance
signal. So: no `config: { audit: ... }` on the route, and no new `AuditAction`. The MCP
`get_stats` tool still needs a `MCP_AUDIT_ACTIONS` entry (the record is exhaustive over
`McpToolName`) — map it to the existing `source.read`-class action rather than minting a new
one.

**D10 — Response shape (token-lean).** Flat, numeric, no labels, ~7 values:
```json
{ "documents": 128, "memories": 14,
  "graph": { "nodes": 512, "effectLinks": 87 },
  "sources": 3, "lastScanAt": "2026-07-16T10:00:00Z" }
```
`lastScanAt: string | null` (nullable, not omitted — the dashboard must distinguish "never
scanned" from "unknown"). Tenancy stays off the wire (ADR-0033).

## ⚠️ OQ-1 — SSE tenant scoping: NEEDS AN ADR BEFORE CODING

**The defect (independently verified against the tree, not just reported):**
`apps/api/src/routes/v1/events.ts:47-51` streams **every** event on the process-wide bus to
**every** authenticated client, with **no tenant filter**. Payloads carry `path`, `title`,
`label` (`apps/api/src/events.ts:8-36`). In token mode, tenant A receives tenant B's file
paths and memory titles. This is pre-existing (F-021 → F-038 → F-044 never closed it;
F-044's SSE hardening added *authentication*, not *authorization*).

**Why F-060 cannot ignore it:** this feature pipes that stream into a **notifications bell**
and an **activity feed** — it takes a latent leak and puts it in front of the user on every
page. Shipping that knowingly is not acceptable (golden rule 9).

**What is actually fixable today** (verified):
- `memory.captured` — ✅ `tenantOf(request)` is already on the line above the emit
  (`routes/v1/memory.ts:44`, emit at L46).
- `source.scan.started` / `source.scan.completed` — ✅ `record` is in scope at both emit
  sites (`packages/ingestion/src/sources/service.ts:100, 115`); `SourceRecord.tenantId`
  exists (`routes/v1/sources.ts:26` drops it from the wire).
- `document.ingested` / `document.removed` — ❌ **blocked by F-071.** The tenant does not
  travel source → queue → worker; ingestion writes unconditionally to `DEFAULT_TENANT_ID`
  (`packages/config/src/profiles/local.ts:291` states this outright: "Ingestion runs in the
  default tenant (F-038/ADR-0040 boundary)").

**Recommended decision (for the ADR):** add a server-side `tenantId` to `ApiEventMap`
payloads (stripped before the wire — tenancy stays off the wire per ADR-0033) and filter in
the SSE route by `tenantOf(request)`. Accept the F-071 consequence explicitly: until F-071
lands, `document.*` events are default-tenant-attributed, so a **non-default tenant will not
see `document.ingested` in the feed** for its own scans. That is the honest trade — under-
delivering events beats leaking them. Scan lifecycle + memory capture (the feed's headline
events) still work per-tenant.

**Known cost — this changes existing verified behavior (golden rule 6):**
`sources-view`'s live "ingested" counter (`lib/api/events.ts:44-55`, which attributes
`document.ingested` to whatever scan is running) will stop incrementing for non-default
tenants — including the `acme` tenant used by the web e2e. Its scan *summary* (the
authoritative number, per the hook's own doc comment at L13) is unaffected. Any existing
assertion on the live counter must be re-pointed at the summary.

**Alternatives weighed:** (a) fix it here (recommended); (b) register it as its own feature
and ship F-060's feed gated to zero-auth/default-tenant only — safe but guts the feature for
hosted; (c) ship as-is — **rejected, knowingly ships a cross-tenant leak**.

**Do not fix F-071 here.** It is `must`/R4 with its own acceptance and cross-tenant e2e.

## Approach — verifiable increments

Each increment ends green on `pnpm -w typecheck && pnpm -w lint && pnpm -w test`.

**0. ADR for OQ-1** (before any code). `docs/adr/00NN-sse-tenant-scoping.md` via the
`write-adr` skill. Blocks increments 3-6.

**1. Counts at the stores** (no HTTP yet).
`GraphStore.countNodes/countEdges` + 2 adapters + conformance (incl. tenant isolation);
`MemoryStore.countCurrent` + 2 adapters + conformance; `KnowledgeGraphService.counts()`;
`MemoryService.count()`; `SourceService.documentCount()` + unit test.
✅ Verify: `pnpm -w test` — new conformance cases pass on **both** adapters of each port.

**2. `GET /v1/stats`** — `apps/api/src/schemas/stats.ts` + `apps/api/src/routes/v1/stats.ts`
+ register in `routes/v1/index.ts`; `stats:read` in `auth/model.ts`; api e2e.
✅ Verify: api e2e — real counts, tenant A ≠ tenant B, 403 without `stats:read`.

**3. SSE tenant scoping** (per the ADR) — `ApiEventMap` + emitters + route filter +
`local.ts` bridge. ✅ Verify: api e2e — tenant A's client does not receive tenant B's event.

**4. SDK + MCP parity** — `pnpm --filter @tessera/sdk generate` (commit `openapi.json` +
`src/generated/schema.ts`), SDK method, `get_stats` tool + gateway maps + the gateway
tool-name test. ✅ Verify: mcp e2e; `gateway.test.ts` sorted-set assertion green.

**5. Web — shared SSE client** — `EventsProvider` + backoff supervisor; re-express
`useScanEvents`/`useLiveActivity` over it (no behavior change for sources/timeline).
✅ Verify: reducer unit tests; sources + timeline RTL/e2e still green (regression guard).

**6. Web — real stat cards** — `useStats()` hook; `stats.tsx` client component consuming it,
with skeleton / error / zero states; no deltas. ✅ Verify: RTL (loading, error, real values,
**no delta rendered**); `home.spec.ts:9` still green.

**7. Web — activity feed + bell** — replace `dashboard.tsx:52-77` with a live feed (honest
empty state retained for a genuinely empty session); `NotificationsMenu`
(`app-header.tsx:57-80`) consumes the same events + Zustand unread; D6 invalidation.
✅ Verify: RTL; e2e (emit → feed → bell badge); axe AA; screenshots on all 4 themes × 2 modes.

**8. Record** — effects, `progress.md`, `feature_list.json` → `done`.

## Files to touch

**Ports / domain (increment 1)**
- `packages/knowledge-graph/src/ports/graph-store.ts` — + `countNodes`/`countEdges`.
- `packages/knowledge-graph/src/adapters/{in-memory,sqlite}-graph-store.ts` — implement.
- `packages/knowledge-graph/tests/conformance/graph-store.conformance.ts` — + cases.
- `packages/knowledge-graph/src/service/knowledge-graph-service.ts` — + `counts()`.
- `packages/memory/src/ports/memory-store.ts` — + `countCurrent`.
- `packages/memory/src/adapters/{in-memory,sqlite}-memory-store.ts` — implement.
- `packages/memory/tests/conformance/memory-store.conformance.ts` — + case.
- `packages/memory/src/service/memory-service.ts` — + `count()`.
- `packages/ingestion/src/sources/service.ts` — + `documentCount()` (service-level).

**API (2, 3)**
- `apps/api/src/schemas/stats.ts` — **new**, mirrors `schemas/sources.ts`.
- `apps/api/src/routes/v1/stats.ts` — **new**, mirrors `routes/v1/sources.ts`.
- `apps/api/src/routes/v1/index.ts` — register (~L70).
- `apps/api/src/auth/model.ts` — `stats:read` in `PERMISSIONS` (L27) + `READ_PERMISSIONS` (L41).
- `apps/api/src/events.ts` — `tenantId` on payloads (ADR).
- `apps/api/src/routes/v1/events.ts` — tenant filter at L47-51 (ADR).
- `apps/api/src/routes/v1/memory.ts` — emit with `tenantOf(request)` (L46).
- `packages/ingestion/src/sources/service.ts` — emit `record.tenantId` (L100, L115).
- `packages/ingestion/src/domain.ts` — `IngestionEvents` tenant field (L91-104).
- `packages/config/src/profiles/local.ts` — bridge forwards tenant (L259-279).
- `apps/api/tests/e2e/sse.e2e.test.ts` — tenant isolation case.

**SDK / MCP (4)**
- `packages/sdk/openapi.json` + `packages/sdk/src/generated/schema.ts` — **regenerated, committed**.
- `packages/sdk/src/client.ts` — + `getStats()`.
- `apps/mcp/src/server.ts` — `get_stats` (mirror `query_graph`, L218-233).
- `apps/mcp/src/gateway.ts` — `McpToolName` (L26), `TOOL_PERMISSIONS` (L41), `MCP_AUDIT_ACTIONS` (L62).
- `apps/mcp/src/gateway.test.ts` — sorted tool list (L34-48).

**Web (5-7)**
- `apps/web/lib/api/events.ts` — `EventsProvider` + backoff supervisor; re-express both hooks.
- `apps/web/lib/api/events.test.ts` — reducer + backoff tests.
- `apps/web/lib/api/client.ts` — + `getStats` (L53-105) + `WorkspaceStats` type.
- `apps/web/lib/api/types.ts` — re-export.
- `apps/web/lib/api/hooks.ts` — + `useStats()`.
- `apps/web/lib/store/notifications.ts` — **new** (mirror `lib/store/command.ts`).
- `apps/web/components/stats.tsx` — **the fix**: L12-17 hardcoded → real; client component.
- `apps/web/components/stats.test.tsx` — **new**.
- `apps/web/components/dashboard.tsx` — L52-77 empty block → `<ActivityFeed />`.
- `apps/web/components/activity-feed.tsx` (+ test) — **new**.
- `apps/web/components/app-header.tsx` — `NotificationsMenu` L57-80 → live + unread.
- `apps/web/app/providers.tsx` — mount `EventsProvider`.
- `apps/web/tests/e2e/support/fixtures.ts` — `stats:read` in `LOCAL_IDENTITY` (L12-22) + `LOCAL_RBAC` (L28-38). **Required or the Overview 403s.**
- `apps/web/tests/e2e/home.spec.ts` — real values, feed, bell, axe.

**Docs / state (8)**
- `docs/adr/00NN-sse-tenant-scoping.md` — **new** (OQ-1).
- `.harness/state/effects.json`, `.harness/state/progress.md`, `.harness/state/feature_list.json`.

## Anticipated effects

- **E-003** (REST `/v1` + MCP contracts) — **primary**. New `/v1/stats` + `get_stats` ⇒
  regenerate OpenAPI + `@tessera/sdk` (committed) ⇒ web client. `ApiEventMap` changes ⇒ the
  SSE stream contract. Additive (NFR-11).
- **E-004** (design tokens / web) — new Overview surfaces (stat cards, feed, bell) must be
  tokens-only and hold across 4 themes × 2 modes; `apps/web/tests/contrast.test.ts` covers
  any new token pair.
- **E-010** (`MemoryStore` port) — `countCurrent` ⇒ **both** adapters + conformance.
- **E-011** (`GraphStore` port) — `countNodes`/`countEdges` ⇒ **both** adapters + conformance.
- **E-009** (ingestion contracts) — `IngestionEvents` gains a tenant field (ADR).
  `IngestionManifest` **unchanged** by design.
- **E-014** (`@tessera/config` composition root) — `local.ts` event bridge.
- **E-018** (auth/tenancy/RBAC) — `stats:read` ⇒ `ROLE_PERMISSIONS`, `/v1/rbac`, web fixtures.
- **E-015** (`instrumentServices`) — **no new `ApiServices` member, deliberately** (D3), so
  the F-041 trap is avoided. If a future revision adds one, it MUST be forwarded there.
- **E-005** — no gate changes (all four required gates already active).

## Test plan

- **Unit:** graph/memory count adapters; `SourceService.documentCount()`;
  `scanEventsReducer` + the new activity reducer; the backoff schedule (fake timers,
  exponential + jitter, 30s cap, `CLOSED` → manual reconnect, `CONNECTING` → let it ride);
  `stats.tsx` RTL (loading / error / real values / **asserts no delta node**);
  `ActivityFeed` RTL (empty / populated); bell unread (increments, clears on open).
- **Conformance:** the count cases run against **both** adapters of each port, incl.
  cross-tenant isolation (a tenant's count must exclude another's rows).
- **Integration (api e2e):** `/v1/stats` real counts; tenant A ≠ tenant B; 403 without
  `stats:read`; empty workspace → all zeros + `lastScanAt: null`; SSE tenant isolation.
- **MCP e2e:** `get_stats` returns the same numbers as REST for the same tenant (ADR-0036
  parity).
- **E2E (web):** against the real token-mode runtime — sign in, `POST /v1/memory`, assert
  `memory.captured` appears in the feed **and** the bell badge increments (this is the
  acceptance's "an emitted event appears in the feed"); stat cards show real values (not
  `—`); axe WCAG A/AA clean on `/`; screenshots across 4 themes × 2 modes incl. reduced
  motion.

## Verification

Run in gate order ([`../verification/gates.json`](../verification/gates.json)); stop at
first failure. Feature-declared: `typecheck`, `lint`, `test`, `e2e`.

| Gate | Command | Evidence |
|---|---|---|
| state | `node scripts/verify-state.mjs` | plan-before-code, effects/schema sync |
| typecheck | `pnpm -w typecheck` | clean |
| lint | `pnpm -w lint` | clean |
| format | `pnpm -w format:check` | clean |
| test | `pnpm -w test` | conformance on both adapters ×2 ports; contrast; RTL |
| build | `pnpm -w build` | clean |
| e2e | `pnpm -w test:e2e` | api + mcp + web (incl. axe AA) |
| web-perf | `pnpm -w test:perf` | first-load JS budget — the feed/bell must not blow it |
| e2e-full | `pnpm -w test:e2e:full` | **required** — Overview is on the human journey |

Also: `pnpm --filter @tessera/sdk generate` must produce **no diff** after commit (proves
the committed SDK matches the live OpenAPI).

## Scope limits & deferrals (stated, not hidden — the F-049 precedent)

1. **No deltas.** No prior-period data exists; retention deletes make a `createdAt`-derived
   trend wrong. Needs a snapshot store (analytics, FR-47). *Not faked.* (D4)
2. **Feed + bell are live-session only.** SSE-fed, lost on reload — per the feature note;
   F-065 makes it persistent. The UI must not imply history it lacks.
3. **`lastScanAt` is process-lifetime only.** `packages/ingestion/src/sources/service.ts:75`
   — `statuses` is an in-memory `Map`. After an API restart it reads `null` even though
   scans happened. **Nothing persists a scan timestamp today** (the manifest stores only
   `path → contentHash`). Surface it honestly ("No scan this session" ≠ "never scanned") or
   persist it — the latter is a registry/manifest schema change and is **out of scope**.
4. **No `scan.failed` event exists.** "Scan lifecycle" = started + completed only. Errors are
   status-only (service.ts:122-130). Do not invent one; F-065 owns `scan.failed`.
5. **`document.*` events stay default-tenant until F-071** ⇒ non-default tenants won't see
   `document.ingested` in the feed. Consequence of OQ-1's honest fix. (F-071 = out of scope.)
6. **F-071 impact on stats correctness — flagged, not fixed.** Ingestion writes to
   `DEFAULT_TENANT_ID` (`local.ts:291`). So under multi-tenant, `documents` (counted via the
   tenant's **source registry** + manifest) can report **> 0 for content the tenant cannot
   actually search**, because the corpus/index rows landed in the default tenant. The stat is
   right about *what was ingested for their sources*; the data is in the wrong tenant. This
   is F-071's bug surfacing through an honest stat — **do not paper over it**. Note it in the
   ADR and let F-071 close it. (Zero-auth Local — the default — is unaffected: one tenant.)
7. **Acceptance criterion 3's "none exists today" is stale.** Two consumers exist
   (`lib/api/events.ts:92` F-038, `:168` F-042). Recorded as-built: this is the first
   **Overview/notifications** consumer, and it **consolidates** the two ad-hoc sockets into
   one resilient client (net −1 socket).
8. **No server-side event timestamps.** Client receive-time is used (existing behavior,
   `lib/api/events.ts:159`). F-065 needs persisted `occurredAt`; that is its concern.

## Risks / open questions

- **OQ-1 (ADR REQUIRED, blocks increments 3-6):** SSE tenant scoping. See the dedicated
  section. Recommendation: fix in this feature, accept the F-071-shaped gap, accept the
  `sources-view` live-counter behavior change.
- **Risk — golden rule 6 (never break verified code):** re-expressing `useScanEvents` /
  `useLiveActivity` over a shared provider touches shipped F-038/F-042 surfaces. Mitigation:
  keep the hook signatures and the pure reducers byte-identical; the existing sources +
  timeline tests are the regression guard and must stay green **unmodified** (except the
  live-counter assertion noted in OQ-1).
- **Risk — port churn:** 2 ports × 2 adapters × conformance. Additive and well-precedented
  (F-047), but it is the bulk of increment 1. The rejected fallback is service-level counts
  over `listNodes`/`listCurrent` — cheaper to write, but materializes every row on every
  Overview load (rejected as D1/D2; documented so the trade is visible).
- **Risk — e2e flake:** the SSE e2e is inherently timing-sensitive. Mitigation: assert via
  Playwright web-first retrying assertions (`toBeVisible`), never a fixed sleep; the emit is
  triggered *after* the feed is confirmed subscribed.
- **Risk — Next proxy + SSE under production build:** the proxy streams `upstream.body`
  (route.ts:85) and strips `accept-encoding` (L24) — correct in principle and already relied
  on by F-038's `useScanEvents`, but the web e2e runs a **production** build; confirm no
  buffering regression early (increment 5), not at the end.
