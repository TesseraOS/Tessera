# ADR-0049: Data governance — memory retention, DSR export/erasure, and MCP-surface audit

- **Status:** Accepted
- **Date:** 2026-07-16
- **Deciders:** Project lead, Claude
- **Tags:** api, mcp, memory, security, compliance

## Context

F-047 closes the compliance gaps the PRD requires but no feature delivered:

1. **FR-15 — memory retention/expiry.** Flagged for R2, never built. The *audit trail* has had
   retention since F-027 (`AuditLog.prune` + `config.audit.retention`); memories have had none, so a
   deployment could not honor "we keep task notes for 30 days".
2. **NFR-13 — data-subject rights.** A tenant could neither obtain a copy of what Tessera holds about
   it, nor have it erased.
3. **F-027's documented seam — MCP-surface audit.** The audit trail recorded the REST boundary only.
   Tessera is an **agent-first** product (ADR-0036): the trail was blind to exactly the caller that
   matters most, so it was not a complete compliance record.

Three questions had to be decided.

## Decision

### 1. Retention deletes; it never mutates

The retention pass (`@tessera/memory` `pruneMemories`) only ever **deletes**:

- **expiry** — a lineage whose *current* version has aged past its rule's `maxAgeMs` is deleted whole;
- **compaction** — already-superseded versions past `maxSupersededVersions` / `maxSupersededAgeMs` are
  removed.

It never edits a version and never touches the current version of a lineage it keeps, so FR-12's
**never-silently-mutate** contract is preserved by construction: retention is not a supersede. Age is
measured from the **current** version's `createdAt`, so an actively-edited memory does not go stale.
Rules match by `kind` and/or `scope`, and the **most-specific matching rule wins** (kind+scope > kind >
scope > none) with only that rule's thresholds applied — one predictable answer per memory.

The policy is **config-driven** (`config.memory.retention`, authored in days, resolved to ms on the
runtime) and **empty by default** ⇒ retention is off and existing deployments are byte-stable. The pass
is applied by `POST /v1/retention/prune`; **scheduling is a seam** (the same posture as audit
retention), and runtime *mutation* of the policy is deliberately not offered — config is the source of
truth, so `GET /v1/retention` reads and the prune applies.

Erasing a memory also **de-indexes it** from the retrieval corpus (the indexing `MemoryService`
decorator removes the blob/keyword/temporal/vector entries). Without this, a "deleted" memory would
still be searchable and its text still served from the corpus — erasure with remanence is not erasure.

### 2. DSR erasure removes the data plane and **retains the audit trail**

`GET /v1/dsr/export` returns a complete bundle (every memory *version*, the whole graph, sources, and
the fully-paged audit trail). Exports are **exhaustive, never display-capped** — hence
`KnowledgeGraphService.exportAll()` alongside the capped `queryGraph`, and `MemoryStore.exportAll()`
alongside `listCurrent`. A partial answer to a right-of-access request would be a wrong answer.

`POST /v1/dsr/delete` erases memories (de-indexed), the graph, and sources — **but keeps the audit
trail**, and records the `dsr.delete` event into it.

This resolves a real tension: GDPR Art. 17 erasure vs. the audit trail's integrity obligations
(FR-55/NFR-13). We keep the trail because it is the *compliance record of the erasure itself* and, by
the NFR-7 design of `AuditEvent`, contains **no content** — only who did what, when, with what outcome.
Deleting it would destroy the proof that the erasure happened while removing no personal content.
Erasing the trail too is a documented seam (config-gated), not the default.

Both routes require `admin:manage` and act on the **caller's own tenant only** — `tenantOf(request)`,
never a tenant id off the wire — so an admin can never export or erase another tenant's data.

### 3. MCP audit records the gateway's authorization decision, on the existing taxonomy

The `McpGateway` takes an optional `AuditLog` and records **the authorization decision**: `success`
once a call is authenticated + authorized + metered, `denied` on a permission or quota refusal.

Recording lives **in the gateway**, not around the tool, because that is the only place the identity is
known at the moment of refusal — a `ForbiddenError` is thrown after authentication succeeds, so an
outer wrapper would have no actor to attribute the denial to. Unauthenticated calls are **not** recorded
(no identity ⇒ no tenant), mirroring the REST recorder skipping 401s.

Tools map onto the **existing REST action taxonomy** (`capture_memory` → `memory.write`, …) rather than
new `mcp.*` actions, so one trail answers "who wrote memories last month" across both surfaces and
compliance reporting never unions two vocabularies (ADR-0036 parity). `metadata.surface = 'mcp'`
distinguishes them when that matters. Recording is best-effort and failure-isolated — a sink error
never fails a tool call.

The audit model/port stays **type-only** in `@tessera/mcp`, so the F-012 no-Fastify invariant holds
(verified: the built `gateway.js` imports `@tessera/core` alone).

### 4. Encryption at rest is a deployment concern, documented not enforced

NFR-13 asks that the posture be **documented**. Tessera does not implement application-level
encryption-at-rest: SQLite (SQLCipher / OS-level FDE) and Postgres (TDE / encrypted volumes) are
configured at the deployment layer, and keys flow through the existing `SecretsProvider` — never the
repo. See [`docs/compliance/data-governance.md`](../compliance/data-governance.md).

## Consequences

### Positive
- FR-15 is delivered; FR-55/NFR-13 are complete across **both** surfaces.
- One trail, one taxonomy, covering REST + MCP — the F-027 seam is closed.
- Erasure is real: no searchable remanence in the retrieval corpus.
- Retention is off by default ⇒ zero behavior change for existing deployments.

### Negative / Costs
- Four new audit actions ripple through the OpenAPI doc → SDK regen → the web `AuditAction` mirror.
- The gateway records one event per guarded tool call (the same volume posture REST already has).
- `MemoryStore` gained three port methods (`exportAll`/`deleteVersion`/`deleteLineage`), so every
  adapter must implement them — covered by the shared conformance suite.

### Neutral / Follow-ups
- **Scheduling** the prune pass (cron/timer) is a seam; the route is the trigger.
- **Config-gated audit erasure** for jurisdictions that require it is a seam.
- A **distributed/streaming export** for very large tenants (the bundle is assembled in memory) is a
  seam; today's bundle is a single JSON response.
- Per-project retention scope arrives with F-050's `(tenantId, projectId)` model.

## Alternatives considered

- **Retention as a supersede ("tombstone version")** — rejected: it would write content-bearing
  versions to express deletion, growing the lineage it is meant to shrink, and it would not actually
  erase anything (NFR-13 needs the bytes gone).
- **Erase the audit trail with the data plane** — rejected: it destroys the record of the erasure while
  removing no content (the trail holds none, by NFR-7). Kept as a config-gated seam.
- **New `mcp.*` audit actions** — rejected: it would fork the taxonomy and force every compliance query
  to union two vocabularies for the same act (ADR-0036 says one engine, two surfaces).
- **Record MCP audit around the tool call instead of in the gateway** — rejected: denials throw before
  the wrapper can learn the identity, so denied calls (the ones that matter most) would be unattributed.
- **Reuse `queryGraph` with a large limit for export** — rejected: completeness by luck. `exportAll` is
  unbounded by contract.
- **Runtime-mutable retention policy (`PUT /v1/retention`)** — rejected: two sources of truth for a
  destructive policy. Config wins; the route reads and applies.

## References
- [ADR-0034](0034-audit-trail-and-governance.md) (the audit trail this extends),
  [ADR-0033](0033-data-plane-tenant-isolation.md) (`forTenant` scoping),
  [ADR-0036](0036-agent-first-operations.md) (REST+MCP parity),
  [ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md) (self-hosted data residency).
- Operator runbook: [`docs/compliance/data-governance.md`](../compliance/data-governance.md).
- Requirements: FR-15, FR-55, NFR-13, NFR-7, FR-12. Effects **E-010**, **E-003**, **E-020**.
