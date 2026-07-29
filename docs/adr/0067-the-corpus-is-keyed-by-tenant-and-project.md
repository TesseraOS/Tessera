# ADR-0067: The corpus is keyed by (tenant, project); the blob store stays a dumb byte store

- **Status:** Accepted
- **Date:** 2026-07-29
- **Deciders:** Project lead, Claude
- **Tags:** storage, tenancy, security, api, migration

## Context

Every store in Tessera is scoped by `(tenant, project)` — memory, graph, keyword, temporal, vector,
audit, source registry, projects — except one. The **blob corpus**, which holds the actual text of
every ingested file and every captured memory, has a single global key space:
`putFragment` (`packages/config/src/fragment-source.ts`) writes the bare `ref` as the key, and
`createBlobFragmentSource(blob)` reads any ref for anyone holding the object.

This has been safe **by construction**, not by enforcement. Every ref that reaches the corpus came
from an already-`forTenant`-scoped retriever, so no code path could ask for a ref it was not entitled
to. `search-enrichment.ts` states that reasoning in its own doc comment — and states the exact
condition under which it stops holding: **a by-ref endpoint, where the ref comes from the caller.**

Refs are not secrets. A document ref is `sha256(sourceId:path)` (`documentIdFor`) — derivable by
anyone who can guess a source id and a path. So `GET /v1/fragments/:ref` over an unprefixed corpus
would be a **cross-tenant IDOR**: authenticated, and unauthorized. This is the ADR-0050 class of
defect.

F-061 hit this wall and did the right thing: it shipped the search detail Sheet with a matched
*excerpt* for file results instead of the *body*, and recorded the limitation (its SL-2) rather than
serving the body from an unscoped store. F-075 exists to remove the wall.

Two facts shape the design:

1. **F-071 already split ownership.** Ingestion writes to the *scanning* tenant's indices while the
   blob stays unprefixed, so since 2026-07-22 the indices and the corpus disagree about who owns
   what. Before that, everything landed under `DEFAULT_TENANT_ID`.
2. **`TenantId` is an unvalidated `string`,** taken straight from an OIDC claim
   (`stringClaim(payload, tenantClaim) ?? DEFAULT_TENANT_ID`). For a key-*prefix* partition that is
   not a detail — a tenant named `acme/x` writing into `acme`'s namespace is the whole attack.

## Decision

### 1. The key layout is `{tenantId}/{projectId}/{ref}`

One module owns it — `packages/config/src/fragment-source.ts` — exporting `CorpusScope` and
`corpusKey(scope, ref)`. Nothing else composes a corpus key.

**The project segment is deliberate, not scope creep.** F-075's acceptance says "e.g.
`{tenantId}/{ref}`" — illustrative. Every index the corpus is joined against is keyed
`(tenant, project)`, and ADR-0037 makes a project a data-isolation boundary (the audit model calls it
one in as many words). Keying blobs by tenant alone would leave `GET /v1/fragments/:ref` a
**cross-project IDOR inside a tenant** — the same defect one level down. The write site already holds
both ids, so it costs nothing.

**`_tessera/` is reserved** for Tessera's own metadata (today: the migration marker). The scope-segment
grammar excludes a leading `_`, so no tenant can ever collide with it.

### 2. Scope segments are validated, and fail closed

`corpusScopeSegment(value)` accepts only `/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/` and throws
`ValidationError` otherwise. That excludes `/`, `.`, `..`, the empty string, and the reserved `_`
prefix. It **composes with, and does not replace**, the adapters' shared `blobKeySegments` guard,
which already rejects traversal segments for both the filesystem and S3 adapters.

A tenant id that cannot be a legal segment produces an **error**, not a namespace collision.
Validating tenant ids at the *authentication* boundary is the better long-term home; it is recorded as
a limit here rather than built, because widening auth validation is a separate blast radius.

**How far fail-closed reaches, stated precisely.** This is wider than "the new route stops working".
`createEnrichedRetriever` calls `fragments.get` for **every** hit, so a tenant whose id is not a legal
segment loses `/v1/search` and `/v1/compile` as well as `/v1/fragments/:ref`. Concretely, an OIDC
deployment whose `tenant_id` claim is URL-shaped (`https://issuer.example.com/tenants/acme`),
colon-shaped (`acme:eu`), longer than 64 characters, or `_`-prefixed is affected. That is a
deliberate choice — a tenant that cannot be given a private namespace must not be given someone
else's — but it is a **behaviour change** for such a deployment, and it is why validating the claim at
authentication is registered as the real fix (**F-101**) rather than left implied. Project ids are
unaffected: they are `randomUUID()`, always legal.

### 3. Scoping lives on `FragmentSource`. `BlobStore` deliberately does **not** get `forTenant`

`FragmentSource` (`@tessera/context-compiler`) gains **required** `forTenant`/`forProject`, matching
the idiom every domain port in this repo already uses. `get(ref)`'s signature is unchanged. Required,
not optional — ADR-0057's rule: an optional scope with a default keeps exactly the silent-default
failure mode being removed, and required members make the compiler enumerate every implementer once.

`createContextCompiler`'s scoped views rebind `fragmentSource` alongside `retriever` and `graphStore`,
which is what makes the guarantee structural:

> A compiler view's fragment source is, by construction, in the same scope as its retriever. There is
> no way to obtain a compiler whose two halves disagree, because both derive from the same
> `forTenant`/`forProject` call.

`createEnrichedRetriever` gets the same treatment (it rebinds only its inner retriever today).

**`BlobStore` does not gain `forTenant`, and this entry exists so nobody "restores the convention"
later.** Four reasons:

1. **The convention is narrower than it looks.** `forTenant` is on every *domain data* port and on
   **no** infrastructure port — `RelationalStore`, `Queue` and `Embeddings` all lack it. `BlobStore`
   is documented as "keys are opaque, `/`-delimited paths": a byte store, sibling to
   `RelationalStore`, not to `MemoryStore`. Tenancy is a property of the **corpus**, which is one
   consumer of the byte store.
2. **It would not remove the bypass it exists to remove.** The unscoped base view must survive for the
   migration and for `Runtime.stores.blob`, so an unscoped read stays one call away either way. A view
   on `BlobStore` buys ceremony, not a guarantee.
3. **It would duplicate one line of key composition into every adapter** and force the shared blob
   conformance suite to assert a *corpus* convention over a *generic* store — so the next non-corpus
   blob use (exports, attachments) would have to answer "what does a tenant mean for me?" when the
   honest answer may be "nothing".
4. ADR-0033 requires enforcement in the adapter rather than a bypassable wrapper. That is satisfied:
   the **adapter of `FragmentSource`** is `createBlobFragmentSource`, and that is precisely where the
   key is composed. Its return value **is** the `(default, default)` view, like every other base view
   in the repo.

`putFragment` takes the scope as a **required third parameter**. A free function's arity is enforced
at every call site; a new *interface method* parameter can be silently ignored by an implementer.

### 4. The migration is a boot-time, marker-guarded blob pass — not SQL, not a CLI command

`packages/storage/src/migrations/runner.ts` is **SQL-only** (`Migration = { id, up }` over a
`MigrationDb`, applied ids recorded in `_tessera_migrations`). It cannot move blobs. Rather than
pretend the existing mechanism fits, F-075 adds one:
`migrateCorpusToScopedKeys(blob, scope)` in `@tessera/config`, called from `assembleRuntime` before
any service is constructed.

- **Marker:** `_tessera/migrations/corpus-scope-keys.json`. Present ⇒ return immediately. One
  `exists()` per boot, forever after the first.
- **Pass:** list; skip `_tessera/`; skip keys already under the target prefix; `get` → `put` at the
  scoped key → `delete` the old key; then write the marker.
- **Idempotent and replica-safe** by the same posture `runMigrations` documents for itself: a
  half-finished pass leaves the marker absent so the next boot completes it, and a key another replica
  already moved reads `undefined` and is skipped.
- **Target scope:** `(config.auth.tenant, default)` when `auth.mode === 'none'`, else
  `(default, default)`. For the zero-auth Local profile — the only profile with real corpora today —
  that is exactly right: every request already resolves to `config.auth.tenant`.

It runs over the **port**, so filesystem and S3 behave identically with no profile branch.

### 5. `GET /v1/fragments/:ref` gets its own permission, its own audit action, and 404 by construction

- **`fragments:read`**, a new entry in the permission catalog and in `READ_PERMISSIONS`. Not
  `search:read` — a ranked list plus a 2000-char excerpt is materially less than an arbitrary full
  body, and reusing it would silently widen every already-issued scoped token. Not `compile:read` —
  compile returns what retrieval selected for a task within a budget; this is an unbounded by-ref
  reader. The precedent is `stats:read`, minted for exactly this reason: scopes are a least-privilege
  upper bound.
- **`fragment.read`** in the audit vocabulary (NFR-13; a full-content read is the most sensitive read
  in the product). Its `.read` suffix keeps it out of `ACTIVITY_ACTIONS` and `RECENT_ACTIVITY_ACTIONS`
  **mechanically** — a body fetch per opened result must not read as an activity spike.
- **404, never 403 — structurally.** The handler resolves through the scoped source and has no second,
  unscoped lookup to compare against, so it cannot distinguish "absent" from "another tenant's" even
  if a later edit tried to.
- **A narrow projection** — `{ ref, kind, text, path?, truncated }` — not the raw metadata bag, whose
  contents grow with ingestion and would otherwise reach the wire unreviewed. Text is capped at
  `MAX_FRAGMENT_TEXT_CHARS` (131,072) with an explicit `truncated` flag: a truncated body that says so
  is honest; a silently trimmed one is the trap.
- **Single path segment only.** `memory/<lineageId>` refs are not expressible and must not be — memory
  bodies are already served by the tenant-scoped `/v1/memory/:lineageId`, and `%2F` through the
  dashboard's Next.js rewrite proxy is a normalization hazard taken for nothing.
- **No MCP tool.** ADR-0036 parity is about capability, and an agent's fragment path is
  `compile_context` — budget-bounded and provenance-tagged. A by-ref bulk reader is a cheaper way to
  exfiltrate a corpus with no budget accounting.

## Consequences

- The corpus becomes the **last** store to join the ADR-0033/0037 data-plane guarantee. F-061's SL-2
  closes: the search detail Sheet can render file bodies.
- **Explicitly scoped API tokens must be re-issued** to gain `fragments:read`. Role-based principals
  (owner/admin/member/viewer) get it automatically. That is least privilege working as designed, not
  a regression.
- `ApiServices` gains a member, which is the **E-015 trap** — `instrumentServices` rebuilds the object
  member by member and a dropped one has 500ed routes in production twice. The forwarding regression
  test is extended in the same commit.
- **Pre-F-075 blob ownership is not reconstructed.** Content ingested under a non-default tenant in
  the F-071 → F-075 window lands under the deployment's default tenant, and its owning tenant sees "no
  content for ref" on compile. Recovering it would need an unscoped enumeration of the source registry
  — the exact hole F-071 refused to punch. The window is one feature wide, there is no released build,
  and the remedy is to re-scan the source.
- **The marker is data, not a cache.** Deleting it and rebooting would re-prefix an already-migrated
  corpus; the already-prefixed check makes that harmless except for a tenant named after a legacy
  key's first segment (`memory`). Stated in the code as well as here.
- One `list()` on first boot of a self-hosted deployment (a full bucket listing on S3), then one
  `exists()` per boot forever. A failed migration rejects the boot (there is no `catch` between
  `assembleRuntime` and `startApiServer`) and re-lists on the next attempt — correct behaviour for an
  incomplete migration. A pass that **moves** anything logs the count; a pass with nothing to move is
  silent, so the common path adds no noise.
- This partitions; it does **not** encrypt. NFR-13's "configurable encryption" is a separate concern.
- Isolation remains only as good as `tenantOf(request)`: this removes an authorization hole, it is not
  an authentication control.

## Alternatives considered

- **`forTenant` on `BlobStore`** — rejected in §3, with the four reasons recorded there precisely
  because it is the intuitive move.
- **Key composition alone, port and `FragmentSource` both left flat** — right layer, insufficient:
  `createBlobFragmentSource(blob)` would still hand out an object that reads any scope. It makes the
  right read easy rather than the wrong read impossible.
- **Tenant-only keys (`{tenantId}/{ref}`)**, as the acceptance's example suggests — rejected: it
  leaves a cross-project IDOR inside a tenant, in a product that calls a project an isolation
  boundary.
- **A CLI migration command** — rejected: a developer's local `.tessera` must keep working across a
  `git pull` with no instructions, and an unmigrated corpus is unreadable after the key change.
- **Serving `text/plain`** — rejected: every `/v1` surface is Zod-validated → OpenAPI → SDK, and a
  raw-text outlier would be the only route without a generated type.

## Links

- Feature: F-075 · Plan: [`.harness/plans/F-075-tenant-keyed-blob-corpus.md`](../../.harness/plans/F-075-tenant-keyed-blob-corpus.md)
- Requirements: FR-52 (isolation), FR-41 (search with provenance), NFR-13 (compliance-readiness)
- Builds on: [ADR-0033](0033-data-plane-tenant-isolation.md) (scoped views),
  [ADR-0037](0037-multi-project-workspaces.md) (project as a boundary),
  [ADR-0057](0057-ingestion-scope-on-the-queue-job.md) (required scope, never optional),
  [ADR-0050](0050-sse-tenant-scoped-event-stream.md) (authenticated-but-unauthorized)
- Closes: F-061's SL-2 (excerpt-only file results)
