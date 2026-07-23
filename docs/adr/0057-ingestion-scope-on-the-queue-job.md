# ADR-0057: Ingestion scope travels on the queue job

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** Implementing agent (F-071) — supersedes a deferral in ADR-0040
- **Tags:** ingestion, tenancy, isolation, queue, security

## Context

A scan must index into the `(tenant, project)` that registered the source. It does not.
`createIndexingDocumentSink` calls `CorpusIndexer.indexDocument({…})` with **no** `tenantId` /
`projectId`, so the indexer defaults both to `DEFAULT_TENANT_ID` / `DEFAULT_PROJECT_ID`. In any
token/OIDC (multi-tenant) deployment, a scan under tenant `acme` reports `added: 3` while the content
is written to `default` and is **invisible to `acme`** — search and compile return nothing, the graph
is empty. The graph-extraction and memory-extraction sinks share the flaw.

`SourceRecord` already carries `tenantId` + `projectId`, but **`SourceDescriptor`** — the only source
identity the coordinator places on the queue job (`ChangeEvent`) — does not, and the sink is built
**once per runtime**, not per tenant. So the worker never learns the scope. This was a *known,
deferred* gap: [ADR-0040](0040-runtime-source-management.md) explicitly rejected *"threading tenant
through every ChangeEvent/ProcessedDocument"* for F-038 ("larger contract change … the Local profile
is single-tenant"), and [ADR-0050](0050-sse-tenant-scoped-event-stream.md) records `document.*` SSE
events as *"blocked by F-071"* with this exact cause. F-050 then generalized the data plane to
`(tenant, project)` end to end **except** this seam, carving it out to F-071.

The remaining question is not *whether* to close it but *where the scope lives* on the path
`source → queue job → worker → sink`, and *how the sink is scoped*.

## Decision

### 1. The scope travels on the job envelope (`ChangeEvent`), required

`ChangeEvent` gains a required `scope: IngestionScope` (`{ tenantId, projectId }`). It is the queue
job — already specified as "plain, JSON-serializable data so it survives a real queue transport
(BullMQ) unchanged" — and two strings survive serialization by construction. The coordinator stamps
it from the `SourceRecord`; the worker reads it and resolves the destination scope from it.

**Required, not optional.** An optional scope with a `?? DEFAULT_TENANT_ID` fallback preserves the
precise failure mode being removed: a producer that forgets it writes to `default` and nobody
notices. Making it required turns the compiler into the enumerator of every producer — `ChangeEvent`
is constructed in exactly one place (`diffEntries`) and appears in four source files, so the cost is
small and paid once.

This adopts **half** of ADR-0040's rejected alternative — `ChangeEvent` **yes**, `ProcessedDocument`
**no** — and the split is the decision, see §3.

### 2. `DocumentSink` gains scoped views, not a scope parameter

The port keeps `upsert(document)` / `remove(ref)` byte-identical and gains the repository's universal
scoping idiom:

```ts
interface DocumentSink {
  upsert(document: ProcessedDocument): Promise<void>;
  remove(ref: DocumentRef): Promise<void>;
  forTenant(tenantId: TenantId): DocumentSink; // resets to the tenant's default project (ADR-0033)
  forProject(projectId: ProjectId): DocumentSink; // within the current tenant (ADR-0037)
}
```

The worker calls `sink.forTenant(scope.tenantId).forProject(scope.projectId).upsert(document)`.

Chosen over an `upsert(document, scope)` parameter because:

- It is what **every** other scoped seam already does (`MemoryStore`, `GraphStore`, `VectorStore`,
  `Retriever`, `ContextCompiler`, `SourceRegistry`, `SourceService`, and the sink's own sibling
  `createIndexingMemoryService`). One idiom, not two.
- It is **compiler-enforced**: a new *required member* makes every implementer answer "what does
  scope mean for me?", whereas a second parameter is silently droppable — `upsert(document)` is
  assignable to `upsert(document, scope)`, so `teeSink` could forget to forward scope and still
  compile. This feature exists *because* a scope was silently dropped; the port should make that
  impossible, not merely discouraged.
- Existing signatures are unchanged, so the change is additive and every step stays green.

### 3. Scope never enters `ProcessedDocument` or the plugin stages

`SourceDescriptor` is embedded in `ProcessedDocument.source`, which is the input/output type of the
third-party `Processor` port and the argument to `SymbolExtractor.extract()` and the memory
extractors (the plugin SDK, [ADR-0020](0020-plugin-sdk-and-host.md)). Putting scope there would (a)
place a deployment/isolation concern into the third-party stage contract — exactly what
[ADR-0033](0033-data-plane-tenant-isolation.md) refused for `Memory`/`ContextPackage` — and (b) make
tenancy **forgeable by a plugin**, since processors return a *new* `ProcessedDocument`. Isolation must
not be laundered through untrusted code. The worker holds the scope from the job and applies it at the
sink, after all plugin stages have run.

### 4. The worker validates the job; it never defaults

The queue is a boundary. The worker rejects a job whose `scope` is missing or blank with a
`ValidationError` rather than falling back to any default. This is the permanent anti-regression
device: after this ADR, ingestion has no code path that silently writes to `default`.

## The queue as a scope-bearing channel (threat model)

The job now carries an isolation-relevant field, so the queue's trust properties matter.

- **In-process (today):** the only producer is the trusted coordinator in the same process; a job
  cannot be forged by an outside party. The worker's validation guards against *bugs* (a missing
  scope), not adversaries.
- **Durable / shared broker (future BullMQ):** a job becomes a trust boundary. Enforcing isolation
  then requires either worker-side re-validation of the job's scope against the `SourceRegistry`
  (does this source really belong to this scope?), or job integrity (signing). **The worker's
  scope-presence check is the first half of that; the authenticity half is a documented seam, not
  built here.** A durable adapter also needs a job version / back-compat story, since a job enqueued
  by an older producer would lack `scope`.

## Consequences

### Positive
- Data-plane isolation (ADR-0033/0037) now covers **ingested content** — its one remaining hole.
  F-050's ingestion carve-out is closed.
- [ADR-0050](0050-sse-tenant-scoped-event-stream.md)'s documented `document.*` gap closes: the worker
  now has a tenant, so `document.ingested` / `document.removed` are attributed to the scanning tenant
  and reach that tenant's feed. (ADR-0050 anticipated this as F-071's "landing strip"; its Decision
  is unchanged, only the blocked-status note it recorded is now resolved.)
- The scope-drop class of bug is compiler-impossible on the sink and validated-against on the job.

### Negative / costs
- A required field on a queue contract and two required members on a port — an intentionally
  breaking, in-repo-only change caught entirely by `typecheck` (no external consumers of these ports).
- **SSE has no project dimension.** `ApiEventMap` is tenant-scoped only, so the event bridge threads
  `scope.tenantId` and nothing more; within a tenant, project A's paths still reach project B's
  stream. This is pre-existing (true of every `source.scan.*` event since F-050) and is left as a
  backlog finding, not addressed here.
- The blob corpus stays a single global ref space; only the indices are scoped (nothing cross-scope
  is *reachable*, but per-tenant blob keying remains **F-075**).

### Neutral
- `IngestionManifest` stays unscoped by `SourceId` deliberately — the id is globally unique and only
  reachable through a scoped registry; widening it would be YAGNI.

## Alternatives considered

- **Scope on `SourceDescriptor` / `ProcessedDocument`** — rejected, §3: leaks a deployment concern
  into the plugin contract and makes tenancy plugin-forgeable.
- **Worker resolves scope from the registry** — rejected: `SourceRegistry.get` is itself scoped, so a
  tenant-less worker would need an unscoped `getAny` (a hole in the isolation port), or a process-wide
  `SourceId → scope` map that evaporates the moment the worker is a separate BullMQ process — at which
  point the job arrives scopeless and falls back to `default`, silently reintroducing this exact bug
  under the documented future deployment.
- **Optional scope with a default fallback** — rejected, §1: it keeps the silent-default failure mode
  that caused the defect.
- **`upsert(document, scope)` parameter** — rejected, §2: silently droppable, and a second idiom for
  something the codebase already scopes with views.

## References

- Realized by **F-071**. Supersedes the deferral in [ADR-0040](0040-runtime-source-management.md);
  closes the `document.*` gap in [ADR-0050](0050-sse-tenant-scoped-event-stream.md); completes the
  ingestion carve-out from [ADR-0037](0037-multi-project-workspaces.md) / F-050. Isolation contract:
  [ADR-0033](0033-data-plane-tenant-isolation.md). Plugin boundary: [ADR-0020](0020-plugin-sdk-and-host.md).
- PRD **FR-52**, **FR-62**, **FR-6**. Effect-links **E-009**, **E-014**, **E-018**, **E-003**.
