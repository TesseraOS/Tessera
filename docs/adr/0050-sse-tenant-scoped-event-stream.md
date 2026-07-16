# ADR-0050: Tenant-scope the `/v1/events` SSE stream by filtering on a server-side `tenantId`

- **Status:** Accepted
- **Date:** 2026-07-16
- **Deciders:** maintainer (dev-AshishRanjan), Claude Opus 4.8 (F-060)
- **Tags:** security, api, tenancy, realtime, events

## Context

`GET /v1/events` (F-021, extended by F-038) streams live updates over SSE. Its handler
subscribes to **every** name in `API_EVENT_TYPES` on a **process-wide** event bus and writes
each payload straight to the socket:

```ts
// apps/api/src/routes/v1/events.ts:47-51 (before this ADR)
const unsubscribes = API_EVENT_TYPES.map((type) =>
  events.on(type, (payload) => {
    raw.write(sseFrame(type, payload));
  }),
);
```

There is **no per-connection filter of any kind**. Every authenticated client receives every
event emitted anywhere in the process. The payloads are not empty signals — they carry
`path` (`document.ingested`/`document.removed`), `title` (`memory.captured`), and `label`
(`source.scan.*`) (`apps/api/src/events.ts:8-36`).

**Consequence:** in any `token` or `oidc` deployment (F-034/F-036), tenant A's browser
receives tenant B's file paths and memory titles. This directly contradicts **FR-52**
(org/workspace isolation) and the data-plane isolation ADR-0033 established in F-037.

**Why this surfaced now.** The leak is pre-existing and latent: F-021 built the stream
before multi-tenancy (F-025) existed; F-044's "SSE auth" hardening added **authentication**
(a 401 for anonymous clients) but never **authorization** (which tenant's events may this
authenticated client see?). No gate catches it — every api/mcp e2e runs in the zero-auth
default tenant, the same blind spot that hid F-071. **F-060** is the forcing function: it
pipes this stream into a notifications bell and an activity feed on **every dashboard
page**, converting a latent leak into one that renders continuously in front of users. We
will not build that on an unfiltered stream.

**The constraint that shapes the decision.** Tenant attribution is available at three of the
five emit sites and not at the other two:

| Event | Tenant available at emit? |
|---|---|
| `memory.captured` | ✅ `tenantOf(request)` — `apps/api/src/routes/v1/memory.ts:44`, one line above the emit |
| `source.scan.started` / `source.scan.completed` | ✅ `record.tenantId` in scope — `packages/ingestion/src/sources/service.ts:100,115` |
| `document.ingested` / `document.removed` | ❌ **blocked by F-071** — the tenant does not travel source → queue → worker; ingestion writes unconditionally to `DEFAULT_TENANT_ID` (`packages/config/src/profiles/local.ts:291` records this as the "F-038/ADR-0040 boundary") |

So a *complete* fix is not available without first landing F-071 (`must`, R4, its own
acceptance and cross-tenant e2e). The decision must therefore choose between shipping a
partial fix now and shipping nothing now.

## Decision

**We will carry a server-side `tenantId` on every `ApiEventMap` payload and filter the
`/v1/events` subscription by the requesting principal's tenant.**

Parameters:

1. **Every `ApiEventMap` payload gains a required `tenantId: string`.** Required, not
   optional: an optional field is a filter that silently fails open, and TypeScript
   exhaustiveness at the emit sites is the only thing that will catch a future sixth event
   that forgets to attribute itself.
2. **`tenantId` is server-side only and is stripped before the wire.** The SSE frame is
   serialized from the payload minus `tenantId`, so the public event shape is **byte-
   identical** to today's. Tenancy never appears on the wire — the same rule the REST
   `toWire` projections follow (ADR-0033; `apps/api/src/routes/v1/sources.ts:26`). Existing
   web consumers therefore need no payload change.
3. **The route filters on subscribe:** `if (payload.tenantId !== tenantOf(request)) return;`
   before writing the frame. Filtering happens per connection, at the point of write.
4. **`document.ingested` / `document.removed` are attributed to the tenant that the
   ingestion pipeline actually wrote to** — today, unconditionally `DEFAULT_TENANT_ID`. We
   attribute them **honestly rather than optimistically**: the event says where the data
   really went, not where we wish it had gone. When F-071 makes the tenant travel to the
   worker, the correct value flows through this same field with no further change to the
   event contract.

## Consequences

### Positive

- **The cross-tenant leak is closed for every event whose tenant we actually know.** In
  token/OIDC deployments a client now receives only its own tenant's events.
- **FR-52 / ADR-0033 hold at the realtime boundary**, not just at the REST boundary. The
  data plane and the event plane now agree on what a tenant may observe.
- **The wire shape does not change** (`tenantId` is stripped), so F-038's `useScanEvents`
  and F-042's `useLiveActivity` keep working unmodified — golden rule 6 is respected for the
  public contract even though the internal contract changed.
- **F-071 gets a landing strip.** When the tenant travels to the worker, `document.*` events
  become correctly attributed by populating an existing field. No event-contract change, no
  second migration.
- **The filter is exhaustive by construction.** A required `tenantId` means a future event
  type cannot be added without deciding its tenant — the type checker asks the question.

### Negative / Costs

- **Until F-071 lands, non-default tenants will not see `document.ingested`/`document.removed`
  in their feed.** Their own scans ingest into the default tenant (F-071's bug), so those
  events are attributed to `default` and correctly filtered out of their stream. This is a
  **deliberate under-delivery**: showing them would mean showing every *other* tenant's
  documents too, since the events are indistinguishable. Scan lifecycle (`source.scan.*`)
  and `memory.captured` — the feed's headline events — are unaffected and per-tenant
  correct.
- **One shipped behavior changes.** `sources-view`'s live "ingested" counter
  (`apps/web/lib/api/events.ts:44-55`) attributes `document.ingested` to the running scan;
  for non-default tenants it will stop incrementing. The scan **summary** — which that
  hook's own doc comment (L13) already names as the authoritative number — is unaffected,
  so the UI remains correct, just less chatty mid-scan. Any test asserting the live counter
  must assert the summary instead.
- **Five payload types + three emit sites + one bridge must be touched** (`apps/api/src/events.ts`,
  `routes/v1/memory.ts`, `packages/ingestion/src/sources/service.ts`,
  `packages/ingestion/src/domain.ts`, `packages/config/src/profiles/local.ts`). Additive,
  but it widens F-060 by roughly one increment and touches effects E-009 and E-014.
- **A stat can now be honest and still confusing.** `GET /v1/stats` counts a tenant's
  documents via its own source registry + manifest, so under multi-tenant it may report
  `documents > 0` for content that tenant cannot search — because the corpus rows landed in
  the default tenant. That is F-071's bug surfacing *through* an honest stat. We do not
  paper over it here.

### Neutral / Follow-ups

- **F-071** (`must`) closes the `document.*` gap: when the tenant travels source → queue →
  worker → sink, `document.*` attribution becomes correct through this ADR's existing field,
  and F-060's stated feed gap disappears. F-071 should also flip the F-048 suite off the
  default tenant.
- **F-065** (persistent notification service) inherits a tenant-scoped stream and must
  preserve the property when it persists events per user. It also owns `scan.failed` (no
  such event exists today) and server-side `occurredAt` timestamps.
- **Revisit if the bus ever leaves the process.** This ADR assumes one in-process
  `ApiEventBus` shared by the server and its producers. A cross-process/broker-backed bus
  (multi-node hosted) must carry `tenantId` through the transport and filter at the same
  boundary — the property to preserve is "filter at the point of write to the socket," not
  the specific mechanism.

## Alternatives considered

- **Filter by subscribing per tenant (topic-per-tenant bus).** Cleaner in principle — the
  route subscribes only to its tenant's topic, so filtering is structural rather than a
  conditional that can be forgotten. Rejected for now: `EventBus<ApiEventMap>` (F-002) is
  keyed by event *name*, and introducing composite topics changes a core primitive used well
  beyond SSE, for a property a one-line guard already gets. Worth revisiting if/when the bus
  goes cross-process, where topic routing pays for itself.
- **Leave the payloads alone; look the tenant up per event at write time.** No type change,
  but the route would have to resolve, e.g., `lineageId → tenant` on every frame for every
  connected client — an N×M lookup storm on the hot path, and impossible for `document.*`
  (the ref carries no tenant). Rejected on both correctness and cost.
- **Make `tenantId` optional and fail open when absent.** Smaller diff, and `document.*`
  would keep flowing to everyone. Rejected: this is the leak, restated as a default. A
  filter that fails open is not a filter.
- **Gate the whole feed/bell to zero-auth deployments; defer the fix to its own feature.**
  Leaks nothing and keeps F-060 tight to its acceptance. Rejected: it disables the flagship
  live feature for exactly the hosted multi-tenant deployments it was designed for, and
  leaves a known leak in `main` for anyone who builds the next `/v1/events` consumer.
- **Fix F-071 first, then do F-060 with no gap.** The only path to a *complete* fix. Rejected
  as sequencing, not on merit: F-071 is R4 and substantial (the tenant must travel through
  the queue, likely its own ADR), and it would invert the harness's release ordering to
  close a gap that this ADR already degrades safely. F-071 remains the R4 head.
- **Ship as-is and register the leak as a finding** (the F-048 precedent that produced
  F-071/072/073). Rejected: those findings were *latent* — no shipped surface exercised them.
  F-060 would put this one on screen for every user on every page. Knowingly amplifying a
  cross-tenant leak is not a finding, it is a regression.

## References

- Related: `ADR-0033` (data-plane per-tenant isolation), `ADR-0040` (runtime source
  management / the ingestion tenant boundary), `ADR-0036` (REST/MCP parity), `ADR-0048`
  (dashboard auth: httpOnly cookie behind the same-origin proxy — why EventSource needs no
  header).
- Requirements: `docs/PRD.md` FR-52 (org/workspace isolation), FR-38 (SSE live updates),
  FR-62 (runtime source management).
- Features: `F-060` (this work), `F-071` (tenant-aware ingestion — closes the `document.*`
  gap), `F-065` (persistent notification service — inherits this property).
- Code: `apps/api/src/routes/v1/events.ts`, `apps/api/src/events.ts`,
  `packages/config/src/profiles/local.ts:291` (the ingestion tenant boundary).
