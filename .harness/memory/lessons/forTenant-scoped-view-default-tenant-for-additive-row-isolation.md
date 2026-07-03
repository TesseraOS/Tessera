---
id: forTenant-scoped-view-default-tenant-for-additive-row-isolation
kind: lesson
title: Retrofit per-tenant row isolation with a forTenant scoped view whose base is the default tenant (additive, enforced in-adapter, proven by a shared conformance case)
links:
  - packages/core/src/tenant.ts
  - packages/memory/src/adapters/sqlite-memory-store.ts
  - packages/knowledge-graph/src/adapters/sqlite-graph-store.ts
  - packages/storage/src/adapters/sqlite-vec/index.ts
  - packages/storage/src/adapters/pgvector/index.ts
  - packages/context-compiler/src/compiler.ts
  - packages/observability/src/instrument-services.ts
  - docs/adr/0033-data-plane-tenant-isolation.md
confidence: 0.9
created: 2026-07-03
---

**What happened:** F-037 added real per-tenant row isolation (FR-52) across ~7 verified packages
(memory, knowledge-graph, retrieval, vector store, compiler + the two surfaces) without breaking a single
existing test or changing the API/SDK contract. What made it tractable:

1. **`forTenant(tenantId): Self` scoped views, base = a `DEFAULT_TENANT_ID`.** Add one method to each
   store/retriever/service that returns a view confined to a tenant; the factory's own return value is the
   default-tenant view. **No existing method signature changes.** Every current caller/test + the zero-auth
   Local profile keep operating in the default tenant → byte-for-byte unchanged; tenancy engages only when a
   non-default `tenantId` is threaded. This beats threading a `tenant` parameter through every method (which
   would rewrite every signature + conformance call site — non-additive, breaks green-at-every-step).

2. **Enforce in the adapter, not a wrapper.** A `tenant`/`tenant_id` column (or a vec0 per-tenant table)
   injected on write and filtered on **every** read — a wrapper could be bypassed. For a recursive traversal
   (graph `getEffects` CTE) the tenant predicate must be in **both** the anchor and recursive arms, else
   effects leak. Where the row id is **deterministic** (graph `nodeIdFor(kind,key)`) the PK must be composite
   `(tenant, id)` so the same logical id can exist per tenant; a global PK collides. (sqlite-vec's partition
   key also keeps a globally-unique PK, so per-tenant tables were simpler + version-robust there.)

3. **Prove it with a shared conformance isolation case.** Add "write under A → invisible under B, intact under
   A" to each port's shared conformance suite, so every current *and future* adapter must satisfy it — and run
   it **live** against the container for the cloud adapter (pgvector).

4. **Keep tenancy off the wire.** No `tenantId` on `Memory`/`ContextPackage`/`CompileRequest`/REST/MCP schemas
   — isolation is a server-side storage guarantee driven by `AuthContext.tenantId`. So OpenAPI + the generated
   SDK are untouched. The tenant primitive lives in `@tessera/core` (dependency-free) so domain packages scope
   without depending on the API package.

5. **Watch cross-cutting decorators.** A tracing `Proxy` (`@tessera/observability`) that wraps *every* method
   as an async call turned the synchronous `forTenant` into a `Promise`, breaking callers. A method that
   returns a scoped object must be special-cased (re-wrap the result, keep it synchronous).

**How to apply:**
- Retrofit isolation/scoping across many stores via a `forTenant`/`forScope` **view method with a default**,
  not a new parameter on every signature.
- Put the enforcing predicate **in the adapter query** (and in *all* arms of recursive SQL); make the PK
  composite when the row id is deterministic.
- Add the isolation assertion to the **shared conformance suite**; verify the cloud adapter live.
- Keep the scoping key **off the public contract**; put its primitive in the dependency-free base package.
- Audit method-wrapping decorators (Proxies) for any new **synchronous** method that returns an object.
