# Plan: F-075 Tenant-key the blob corpus so file bodies can be served safely

- **Feature:** F-075 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-52 (org/workspace isolation), NFR-13 (compliance-readiness), FR-41 (search with provenance)
- **Service / package:** `@tessera/context-compiler` (port) → `@tessera/config` (key layout + migration) → `apps/api` → `@tessera/sdk` → `apps/web` → `tests/e2e-full`
- **Author:** planner subagent (reviewed + verified against HEAD before adoption) · **Date:** 2026-07-29

## Intent

The blob corpus is the last store in Tessera with **one global key space**. Every other store — memory,
graph, keyword, temporal, vector, audit, registry, projects — is scoped by `(tenant, project)`; the
corpus is not, because nothing ever read it by ref from the outside. F-061 wanted to, and had to ship
its detail Sheet with an excerpt instead of a body (its SL-2), because `GET /v1/fragments/:ref` over an
unprefixed corpus is a **cross-tenant IDOR with derivable keys** (`documentIdFor = sha256(sourceId:path)`
— a hash is not a secret).

**Done looks like:** a corpus blob physically lives under its owning `(tenant, project)`; the compiler
and search enrichment read through a scoped `FragmentSource` that *cannot* be pointed at another
tenant; `GET /v1/fragments/:ref` serves a file body and answers **404** — never 403 — when tenant A
presents tenant B's ref; and the F-061 Sheet shows the file, not just the matched line.

## The defect, confirmed in code

- [`packages/storage/src/ports/blob.ts`](../../packages/storage/src/ports/blob.ts) — `BlobStore` has
  `put/get/delete/exists/list` and **no `forTenant`**, unlike `KeywordRetriever`, `VectorStore`,
  `MemoryStore`, `GraphStore`, `AuditLog`.
- [`packages/config/src/fragment-source.ts`](../../packages/config/src/fragment-source.ts):25 —
  `putFragment` writes key = `fragment.ref`, unprefixed. :34 — `createBlobFragmentSource(blob)` reads
  any ref, from any scope, for anyone who holds the object.
- [`packages/config/src/sources/corpus-indexer.ts`](../../packages/config/src/sources/corpus-indexer.ts):90,115
  — `indexDocument`/`removeDocument` already take `tenantId`/`projectId` and scope the keyword,
  temporal and vector writes via `.forTenant().forProject()`. **Only the blob write and delete are
  unscoped**, and its own doc comment at :39-40 names F-075 as the owner of that gap.
- [`packages/config/src/profiles/assemble.ts`](../../packages/config/src/profiles/assemble.ts):285 —
  **one** `fragmentSource` is constructed and handed to both the compiler (:288) and
  `createEnrichedRetriever` (:296). Neither is rebound on `forTenant`.
- [`packages/context-compiler/src/compiler.ts`](../../packages/context-compiler/src/compiler.ts):266-293
  — `forTenant`/`forProject` rebind `retriever` and `graphStore` and **carry `fragmentSource` through
  unchanged**. There is nothing to rebind: the port
  ([`ports/fragment-source.ts`](../../packages/context-compiler/src/ports/fragment-source.ts)) is a
  single `get(ref)` with no scoped view.

Today this is safe *by construction*, and
[`search-enrichment.ts`](../../packages/config/src/sources/search-enrichment.ts):21-25 says exactly
why: the decorator only ever looks up refs an **already-scoped retriever returned**, so it cannot widen
a tenant's visibility. That reasoning is correct, and it is precisely why it does **not** transfer to a
by-ref endpoint, where the ref comes from the caller. Which is this feature.

Two things compound it:

1. **F-071 moved the goalposts.** Ingestion now writes to the *scanning* tenant's indices while the
   blob stays unprefixed, so the indices and the corpus disagree about ownership for anything scanned
   after 2026-07-22. Before that, everything went to `DEFAULT_TENANT_ID`.
2. **Tenant ids are unvalidated.** [`oidc.ts`](../../apps/api/src/auth/oidc.ts) resolves the tenant as
   `stringClaim(payload, tenantClaim) ?? DEFAULT_TENANT_ID`, and `TenantId` is a bare `string`. A
   key-prefix scheme therefore needs its own segment guard, or a tenant named `acme/x` writes into
   `acme`'s namespace. This is not theoretical for a key-based partition; it is the whole attack.

---

## D1 — Scoping goes on `FragmentSource`, **not** on `BlobStore`

### The three options, weighed against the repo's own convention

**(a) `forTenant` on the `BlobStore` port** — the obvious "match the convention" move. **Rejected**, on
four counts:

1. **The convention is narrower than it looks.** `forTenant` is on every *domain data* port and on
   **no** infrastructure port: `RelationalStore` has none, `Queue` has none, `Embeddings` has none.
   `BlobStore` is documented as *"Keys are opaque, `/`-delimited paths"* — a byte store, the sibling of
   `RelationalStore`, not of `MemoryStore`. Tenancy is a property of the *corpus*, which is one
   consumer of the byte store, not of bytes.
2. **It would not remove the bypass it exists to remove.** The base (unscoped) view must keep existing
   for the migration and for `Runtime.stores.blob`, so an unscoped read stays one call away. A view on
   `BlobStore` buys ceremony, not a guarantee.
3. **It duplicates one line of key composition into every adapter** (filesystem, S3, and every future
   one) and forces the shared
   [`blob.conformance.ts`](../../packages/storage/tests/conformance/blob.conformance.ts) to assert a
   **corpus** key convention over a **generic** store. The next non-corpus blob use (exports, backups,
   attachments) would then have to answer "what does a tenant mean for me?" when the honest answer may
   be "nothing".
4. It is a change to E-007 — port + 2 adapters + conformance — for zero isolation the alternative
   does not give.

**(b) Key composition at `putFragment`/`createBlobFragmentSource`, port left flat** — right layer,
insufficient on its own: `createBlobFragmentSource(blob)` would still hand out an object that reads any
scope. It makes the *right* read easy, not the *wrong* read impossible.

**(c) A scoped `FragmentSource` — ADOPTED.** `FragmentSource` is the **domain corpus port** — the one
the compiler's resolve stage and search enrichment actually consume, and the only one a route would
consume. It gains the codebase's existing idiom:

```ts
export interface FragmentSource {
  get(ref: string): Promise<SourceFragment | undefined>;
  /** A view confined to `tenantId` (project reset to its default) — ADR-0033. */
  forTenant(tenantId: TenantId): FragmentSource;
  /** A view confined to `projectId` within the current tenant — ADR-0037. */
  forProject(projectId: ProjectId): FragmentSource;
}
```

`get`'s signature is **unchanged**; the members are **required, not optional** (F-071's lesson: an
optional scope with a default is the failure mode we are deleting — required means the compiler
enumerates every implementer once).

This satisfies ADR-0033's *"enforcement lives in the adapter, not a bypassable wrapper"* on a fair
reading: the **adapter of `FragmentSource`** is `createBlobFragmentSource`, and that is exactly where
the key is composed. There is no unscoped implementation to obtain — the factory's return value **is**
the `(default, default)` view, like every other base view in the repo.

### How the compiler gets the right tenant's fragments

`createContextCompiler`'s `forTenant`/`forProject` rebind `fragmentSource` alongside `retriever` and
`graphStore` (compiler.ts:266-293). That is the structural claim, and it is worth stating precisely:

> **A compiler view's fragment source is, by construction, in the same scope as its retriever.**
> There is no way to obtain a compiler whose two halves disagree, because both are derived from the
> same `forTenant`/`forProject` call.

The boundary already does its half: `POST /v1/compile`
([compile.ts](../../apps/api/src/routes/v1/compile.ts):71-74) and every MCP tool chain
`.forTenant(tenantOf(...)).forProject(projectOf(...))` with a tenant that comes from the
**AuthContext**, never from the request body. Search enrichment gets the same treatment:
`createEnrichedRetriever(inner, fragments)` currently rebinds only `inner` in its scoped views — it will
rebind **both** (a two-line change and the rewrite of a now-false paragraph in its doc comment).

A wrong-tenant read is then not "unlikely"; it is **unrepresentable**: the scoped source prefixes the
key it is bound to, and no code path lets a caller choose the prefix.

### The key layout — `{tenantId}/{projectId}/{ref}`, and why the project dimension is not scope creep

The acceptance says *"e.g. `{tenantId}/{ref}`"* — illustrative, not prescriptive. The project segment is
added deliberately:

- Every index the corpus is joined against is keyed `(tenant, project)`. A blob keyed by tenant alone
  would make `/v1/fragments/:ref` a **cross-project** IDOR inside a tenant — the same defect one level
  down, in a product where ADR-0037 declares a project a data-isolation boundary and the audit model
  calls it one in as many words.
- It costs nothing: `corpus-indexer` already holds both ids at the write, and `forProject` already
  exists on every reader chain.
- It costs nothing in the migration either: an unprefixed key's project is exactly as (un)knowable as
  its tenant — see D3.

`packages/config/src/fragment-source.ts` becomes the **single owner** of the layout:

```ts
export interface CorpusScope { readonly tenantId: TenantId; readonly projectId: ProjectId; }
export function corpusKey(scope: CorpusScope, ref: string): string;   // `${t}/${p}/${ref}`
export async function putFragment(blob, fragment, scope): Promise<void>;   // scope REQUIRED
export async function deleteFragment(blob, ref, scope): Promise<void>;     // new; corpus-indexer's blob.delete
export function createBlobFragmentSource(blob): FragmentSource;            // base view = (default, default)
```

`putFragment` gaining a **required third parameter** is compiler-enforced at every call site — unlike a
new interface *method* parameter, which TypeScript would let an implementer silently ignore (the F-071
distinction, and the reason a free function is the right shape here).

**Scope-segment validation.** `corpusScopeSegment(value)` rejects anything that is not
`/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/`, throwing `ValidationError`. That excludes `/`, `.`, `..`, the
empty string, and a **leading `_`** — reserving `_tessera/` for the migration marker (D3). It composes
with, and does not replace, the adapters' shared `blobKeySegments` guard
([`blob-key.ts`](../../packages/storage/src/adapters/blob-key.ts)), which already rejects `.`/`..` for
both profiles. **Fail-closed:** a tenant whose OIDC claim is not a legal segment gets an error on
search/compile rather than a silent namespace collision. Validating tenant ids at the auth boundary is
the better long-term home and is registered as a limit, not built here (SL-4).

---

## D2 — The read surface: `GET /v1/fragments/:ref`

Modelled on [`memory.ts`](../../apps/api/src/routes/v1/memory.ts), which is the closest existing shape
(a by-id read that 404s on an unknown id):

```ts
app.get<{ Params: FragmentRefParam }>('/fragments/:ref', {
  preHandler: requirePermission('fragments:read'),
  schema: { tags: ['fragments'], params: fragmentRefParamSchema, response: { 200: fragmentResponseSchema } },
  config: { audit: 'fragment.read' },
}, async (request) => {
  const fragment = await requireFragments(services)
    .forTenant(tenantOf(request)).forProject(projectOf(request))
    .get(request.params.ref);
  if (fragment === undefined) throw new NotFoundError('fragment not found', { details: { ref } });
  ...
});
```

**404, never 403, and structurally so.** The handler never learns whether the ref exists in another
scope — the scoped source returns `undefined` and there is no second lookup to compare against. It
*could not* leak existence even if a future edit tried to.

**Permission: a new `fragments:read`,** added to `PERMISSIONS` and `READ_PERMISSIONS`. Rejected
alternatives and why:

- `search:read` — a ranked hit list plus an excerpt capped at 2000 chars is materially less than an
  arbitrary full body. Reusing it would **silently widen every existing scoped token**.
- `compile:read` — closest, since a compiled package does carry fragment bodies. But compile returns
  what *retrieval selected for a task, within a budget*; this is an unbounded by-ref reader. Different
  capability.
- The repo's own precedent is explicit: [model.ts](../../apps/api/src/auth/model.ts):57-60 minted
  `stats:read` rather than reuse a read, with the reasoning *"scopes are a least-privilege upper
  bound"*. Same argument, same answer.

Role-based principals (owner/admin/member/viewer, incl. every e2e-full token) get it automatically.
Only **explicitly scoped API tokens** need re-issuing — which is least privilege working, and is stated
in the ADR's consequences.

**Audit: a new `fragment.read` action** ([audit/model.ts](../../apps/api/src/audit/model.ts)). NFR-13 is
one of this feature's requirements and a full-content read is the most sensitive read in the product.
The name ends in `.read`, so the **existing mechanical rule** (`ACTIVITY_ACTIONS = AUDIT_ACTIONS.filter(a => !a.endsWith('.read'))`)
keeps it out of the Overview chart and the recent-activity feed with no special case — a body fetch per
opened result must not become an activity spike. It needs a row in
[`apps/web/lib/governance.ts`](../../apps/web/lib/governance.ts) (`Record<AuditAction, string>` is
exhaustive, so the compiler demands it — good).

**No `meter`.** Metering would need a new `UsageStore` operation and a billing-vocabulary change for a
read of content the tenant already owns. Deliberate omission, stated.

**Response body — a narrow, named projection:**

```jsonc
{ "ref": "…", "kind": "code", "text": "…", "path": "src/ledger.ts", "truncated": false }
```

- **`path` only**, not the raw `metadata` bag. The corpus fragment's metadata is written by ingestion
  and grows over time; re-emitting it wholesale would put whatever it gains next straight onto the wire
  — the same discipline `assemble.ts`'s SSE bridge states field-by-field.
- **A hard cap with a flag, not a silent trim.** `MAX_FRAGMENT_TEXT_CHARS = 131_072`; over that, `text`
  is the leading window and `truncated: true`. The `MAX_AUDIT_EXPORT_ROWS` precedent is explicit: a
  truncated result that says it is truncated is honest; a silent one is the trap.
- **JSON, not `text/plain`.** Every `/v1` surface is Zod-validated → OpenAPI → SDK; a raw-text outlier
  would be the only route without a generated type.

**Ref shape.** `:ref` is a single path segment, so `memory/<lineageId>` refs are not expressible — and
must not be: memory bodies are already served by the tenant-scoped `/v1/memory/:lineageId` (acceptance
clause 3 says so), and the dashboard already uses it. Encoding `%2F` through the dashboard's Next.js
rewrite proxy is a normalization hazard not worth taking for a path that already exists. Schema:
`z.string().min(1).max(256)`; a `.`/`..` ref is a **400 VALIDATION** from the adapter guard, not a
traversal.

**No MCP tool.** ADR-0036 parity is about capability, and an agent's fragment-reading path is
`compile_context` — budget-bounded and provenance-tagged. A by-ref bulk reader is a *cheaper way to
exfiltrate a corpus with no budget accounting*, which is the opposite of what the agent surface is for.
`apps/mcp`'s tool-count assertion is therefore **untouched**. Stated as a deliberate non-goal (SL-2).

**`ApiServices` gains `fragments?: FragmentSource`** — optional, mirroring `sources`/`projects`, with a
`requireFragments()` that throws a clean "not configured" error for the doc-generation path. **This
walks straight into the E-015 trap** (`instrumentServices` rebuilds `ApiServices` member by member; a
dropped member 500s its routes in production — twice already). Mitigation is not "be careful":
increment 2 extends the existing forwarding regression test at
[`instrument-services.test.ts`](../../packages/observability/src/instrument-services.test.ts) to cover
`fragments`. `traceObject` already re-wraps `forTenant`/`forProject` correctly (verified at
`instrument-services.ts`:14-21), so no new tracing code is needed.

---

## D3 — The migration

**What exists today:** [`packages/storage/src/migrations/runner.ts`](../../packages/storage/src/migrations/runner.ts)
is **SQL-only** — `Migration = { id, up: string | string[] }` executed through a `MigrationDb`, with
applied ids recorded in `_tessera_migrations`. Registration is a single `ALL_MIGRATIONS` array in
[`self-hosted.ts`](../../packages/config/src/profiles/self-hosted.ts), applied at boot under a Postgres
advisory lock. **There is no mechanism for a non-SQL migration**, and the SQL runner cannot be made to
move blobs. So this needs a mechanism — the honest thing is to say so rather than pretend it fits.

**Decision: a boot-time, marker-guarded, idempotent blob migration in the composition root.** Not a CLI
command, not a hand-run script.

`packages/config/src/sources/corpus-migration.ts`:

```ts
export async function migrateCorpusToScopedKeys(
  blob: BlobStore, scope: CorpusScope,
): Promise<{ moved: number; skipped: boolean }>;
```

**Exact semantics:**

1. **Marker check.** If `_tessera/migrations/corpus-scope-keys.json` exists → return
   `{ moved: 0, skipped: true }`. One `exists()` per boot, forever after the first.
2. **List.** `blob.list()`; ignore anything under `_tessera/`.
3. **Per key:** skip if it already starts with `${tenantId}/${projectId}/` (defence — see the footgun
   below); `get(key)`; if `undefined`, skip (another replica already moved it);
   `put(corpusKey(scope, key), bytes)`; `delete(key)`.
4. **Marker write** — JSON `{ tenantId, projectId, moved, at }`, so an operator can see what happened
   and when.

**Which keys, to what.** *Every* key, because before this feature there was exactly **one** layout —
there is nothing to sniff and no heuristic to get wrong. The target scope:

```
auth.mode === 'none'  →  (config.auth.tenant, DEFAULT_PROJECT_ID)     // the deployment's single tenant
otherwise             →  (DEFAULT_TENANT_ID,  DEFAULT_PROJECT_ID)
```

For the zero-auth Local profile — the only profile with real corpora today — this is exactly right:
`createLocalAuthProvider({ tenantId: config.auth.tenant })` means *every* request already resolves to
that tenant, so a Local deployment configured `auth.tenant: acme` correctly lands in `acme/default`.

**Idempotency & concurrency.** Copy-then-delete is re-runnable: a half-finished pass leaves the marker
absent, so the next boot completes it; a key already moved reads `undefined` and is skipped. Two
replicas racing both do safe work and both write the same marker — the same posture `runMigrations`
documents for itself (*"idempotence by id makes the end state survivable"*).

**Where it is triggered:** `assembleRuntime`, early, before any service is constructed — so it is
complete before the server accepts a request. Profile-independent by construction: it runs over the
`BlobStore` port, so filesystem and S3 behave identically.

**The honest limit, stated plainly.** A deployment that ingested under **non-default tenants between
F-071 (2026-07-22) and this feature** has blobs whose true owner is recorded nowhere in the blob store;
they land under the deployment's default tenant and their owning tenant sees "no content for ref" on
compile. Reconstructing ownership would need an **unscoped enumeration of the source registry** —
precisely the hole F-071 refused to punch in that port. The window is one feature wide, there is no
released build and no remote, and the remedy (re-register + re-scan the source) is documented. Inventing
a cross-tenant enumeration to serve a case that does not exist would be the worse trade.

**The footgun, not hidden:** the marker is **data, not a cache**. Deleting it and rebooting would
re-prefix an already-migrated corpus — hence the step-3 prefix check, which makes that harmless in every
case except a tenant literally named after a legacy key's first segment (`memory`). Said in the code, in
the ADR, and here.

---

## D4 — The dashboard

[`search-detail.tsx`](../../apps/web/components/search/search-detail.tsx):199-217 already has the
pattern: `MemoryBody` fetches through the tenant-scoped memory route and renders skeleton → nothing →
body. `FileBody` is its twin, rendered when `kindOf(result) === 'file'`:

- `apps/web/lib/api/client.ts` — `getFragment(ref)`.
- `apps/web/lib/api/hooks.ts` — `useFragment(ref, enabled)`, mirroring `useMemoryHistory`
  (`queryKey: ['fragment', ref]`, `enabled`). The project header rides along automatically via the
  project-scoped fetch in `client.ts`.
- Types come from **`@tessera/sdk`**, not the hand-written `types.ts` mirror — ADR-0048's direction for
  new surfaces. No new mirror row, no new drift.
- States, per the design system and the existing sections in this file: `Skeleton` while pending;
  *"Could not load the file body."* on error (matching `EffectsSection`'s copy register); **absent, not
  disabled-with-a-lie**, when the hit has no fragment (a symbol result); a muted line
  *"Showing the first 128,000 characters."* when `truncated`.
- Rendering: `whitespace-pre-wrap font-mono text-xs` in a `max-h` scroll box, tokens only.
  **No syntax highlighter** — a new dependency would put the first-load JS budget and the F-074 CWV gate
  at risk for a detail panel. Stated as SL-3.
- The **matched excerpt section stays**: it is *why this ranked*, with real offsets; the body is *what
  this is*. Removing it would lose the provenance the feature exists to show.

---

## D5 — ADR-0067

Two decisions deviate from documented defaults and must be recorded **before** coding (golden rule 7).
`docs/adr/0067-the-corpus-is-keyed-by-tenant-and-project.md` (0067 is the next free number; 0066 is the
latest). It records:

1. **Key layout** `{tenantId}/{projectId}/{ref}`, the reserved `_tessera/` namespace, and the
   scope-segment grammar (fail-closed on an illegal tenant id).
2. **Where scoping lives:** `FragmentSource` gains `forTenant`/`forProject`; **`BlobStore` deliberately
   does not** — with the reading of ADR-0033 that justifies it (infrastructure ports don't scope;
   `createBlobFragmentSource` *is* the adapter where enforcement lives). This is the entry that stops a
   future reader "fixing" the missing `forTenant` on `BlobStore`.
3. **The migration mechanism** — boot-time + marker, because the SQL runner cannot move blobs — its
   idempotency/concurrency posture, and its stated ownership limit.
4. **The read surface's authorization posture** — its own permission, 404-never-403, no MCP tool,
   capped body with `truncated`, audited as `fragment.read`.

---

## Approach — six increments, gates green between commits

**0 · Governance.** ADR-0067. Add **`e2e-full`** to F-075's `verification` array in
`feature_list.json` (acceptance clause 4 demands that gate and the entry currently lists only
`typecheck/lint/test/e2e`). Commit this plan.
_Gate:_ `state`.

**1 · The corpus moves to scoped keys — write, read, and migration in one commit.**
This is deliberately **not** split: between a "write side" commit and a "read side" commit an existing
corpus would be unreadable, and the migration is the thing that makes step 1 safe at all.
- `FragmentSource` gains required `forTenant`/`forProject`; the compiler rebinds it in its own scoped
  views; every implementer (1 production + ~6 test doubles) grows two lines.
- `fragment-source.ts`: `CorpusScope`, `corpusKey`, `corpusScopeSegment`, `putFragment(…, scope)`,
  `deleteFragment`, scoped `createBlobFragmentSource`.
- `corpus-indexer.ts` writes/deletes through the scope it already holds; **delete** the
  "per-tenant blob keying is the separate F-075" comment as it becomes false, not after.
- `search-enrichment.ts` rebinds `fragments` in both scoped views; rewrite its now-false
  "why the unscoped BlobStore is acceptable here" paragraph.
- `memory-indexing.ts` — `deleteLineage` passes `projectId` (see RISK-2; a one-line pre-existing
  erasure bug that this feature would upgrade from *index* remanence to *content* remanence).
- `corpus-migration.ts` + the `assembleRuntime` call site.
_Gates:_ `typecheck lint format test build`, plus the captured red-before output.

**2 · The route.** `schemas/fragments.ts`, `routes/v1/fragments.ts` + registration, `fragments:read` in
the permission catalog, `fragment.read` in the audit vocabulary + the web label map,
`ApiServices.fragments` + **`instrumentServices` forwarding and its extended regression test**,
`pnpm --filter @tessera/sdk generate` (commit `openapi.json` + `src/generated/schema.ts`, re-export any
new type from `packages/sdk/src/index.ts` — F-060's trap), then the docs generation. New api e2e for the
IDOR.
_Gates:_ `typecheck lint format test build e2e`.

**3 · The dashboard.** `client.ts` + `hooks.ts` + `FileBody` in `search-detail.tsx` + RTL + axe with
the Sheet open.
_Gates:_ `typecheck lint format test build e2e web-perf`.

**4 · Prove it over the real deployment.** A fragments case in the e2e-full scope-isolation spec (real
tokens, real tenants, real blob keys) and a body assertion in the human journey.
_Gates:_ `e2e-full`, and `perf` as the release gate (expect **no movement** — the default search/compile
answers are byte-identical; a move means something unintended changed).

**5 · Record.** `effects.json` (E-013/E-007/E-003/E-014/E-015/E-018/E-020), `progress.md` with the
captured red-before output, `feature_list.json` → `done`, F-061's SL-2 marked closed, a memory lesson.
_Gate:_ `state`.

## Files to touch

**`@tessera/context-compiler`**
- `src/ports/fragment-source.ts` — `forTenant`/`forProject` on `FragmentSource` (required).
- `src/compiler.ts`:266-293 — rebind `fragmentSource` in both scoped views.
- `tests/integration/{corpus.ts,compression.test.ts,reproducibility-cache.test.ts}` — doubles.
- `tests/integration/scoped-fragment-source.test.ts` **(new)**.

**`@tessera/config` — the heart**
- `src/fragment-source.ts` (+ **new** `.test.ts`) — the key layout, in one module.
- `src/sources/corpus-migration.ts` (+ **new** `.test.ts`).
- `src/sources/corpus-indexer.ts` (+ `.test.ts`) — scoped write/delete; stale comment removed.
- `src/sources/search-enrichment.ts` (+ `.test.ts`) — rebind `fragments`; rewrite the doc comment.
- `src/sources/memory-indexing.ts` — the `deleteLineage` project fix.
- `src/profiles/assemble.ts` — run the migration; `services.fragments`.
- `src/index.ts` — export the migration.
- `tests/integration/{local-profile,self-hosted-profile,runtime-sources}.test.ts` — `putFragment`
  call sites + the `blob.list()` prefix filters at `runtime-sources.test.ts`:81,108.
- `tests/integration/runtime-corpus-scope.test.ts` **(new)** — the red-before proof.

**`apps/api`**
- `src/schemas/fragments.ts` **(new)**, `src/routes/v1/fragments.ts` **(new)**, `src/routes/v1/index.ts`.
- `src/services.ts` — `fragments?: FragmentSource`.
- `src/auth/model.ts` — `fragments:read` in `PERMISSIONS` + `READ_PERMISSIONS`.
- `src/audit/model.ts` — `fragment.read`.
- `tests/e2e/support/in-memory-services.ts` — a **scope-aware** fake fragment source.
- `tests/e2e/fragments.e2e.test.ts` **(new)**.

**`@tessera/observability`**
- `src/instrument-services.ts` + `src/instrument-services.test.ts` — forward + assert `fragments`.

**SDK / docs**
- `packages/sdk/src/client.ts` (interface + impl), `src/index.ts`, `openapi.json`,
  `src/generated/schema.ts` — regenerated, committed; `apps/docs/generated/**`.

**`apps/web`**
- `lib/api/client.ts`, `lib/api/hooks.ts`, `lib/governance.ts` (the label row),
  `components/search/search-detail.tsx`, `components/search/search-detail.test.tsx` **(new)**,
  `tests/e2e/search.spec.ts` (axe with the Sheet open).

**e2e-full / governance / state**
- `tests/e2e-full/tests/{scope-isolation,human-journey}.spec.ts`.
- `docs/adr/0067-the-corpus-is-keyed-by-tenant-and-project.md` **(new)**;
  `.harness/state/{effects,feature_list}.json`, `.harness/state/progress.md`,
  `.harness/memory/lessons/`.

## Anticipated effects

- **E-013 — `@tessera/context-compiler` ports (the primary).** `FragmentSource` gains **required**
  `forTenant`/`forProject`; `get` is unchanged. Dependents: `createBlobFragmentSource`
  (`@tessera/config`), the compiler's own scoped views (**which must rebind it — the whole guarantee**),
  `createEnrichedRetriever`, and every double: `apps/api/tests/e2e/support/in-memory-services.ts`,
  `apps/mcp/tests/e2e/support/in-memory-services.ts`, three compiler test files,
  `search-enrichment.test.ts`. `quality.ts` and `stages/resolve.ts` take a `FragmentSource` argument and
  need no change.
- **E-007 — `@tessera/storage` ports.** Record a **negative** decision, deliberately: `BlobStore` does
  **not** gain `forTenant` and `blob.conformance.ts` is **unchanged** — with a pointer to ADR-0067 so
  the next reader does not "restore the convention". Add the corpus key convention
  (`{tenant}/{project}/{ref}`) and the reserved `_tessera/` namespace as a documented convention
  *over* the port.
- **E-003 — REST/MCP contract.** New `GET /v1/fragments/:ref`; the RBAC catalog and `/v1/me` permission
  enums gain `fragments:read`; the audit query/event enums gain `fragment.read` ⇒ OpenAPI +
  `@tessera/sdk` (committed) + `apps/docs/generated/**` regenerate ⇒ `apps/web/lib/governance.ts`.
  Additive per NFR-11. **No MCP tool** ⇒ the gateway's tool-count assertion and the mcp e2e are
  untouched.
- **E-014 — composition root.** `assembleRuntime` runs the corpus migration at boot and wires
  `services.fragments`; the corpus write path becomes scope-keyed.
- **E-015 — `instrumentServices`.** A **new `ApiServices` member**, which is the trap that has 500ed
  routes twice. Forward it and extend the forwarding regression test in the same commit.
- **E-018 — auth/tenancy.** New permission in the catalog + `READ_PERMISSIONS`; the ADR-0033/0037
  data-plane guarantee now covers the **corpus body store** — its last unscoped member — and F-061's
  SL-2 is closed.
- **E-020 — audit trail.** `AUDIT_ACTIONS` gains `fragment.read`; it inherits the `.read` exclusion from
  `ACTIVITY_ACTIONS`/`RECENT_ACTIVITY_ACTIONS` mechanically (no special case), and the dashboard label
  map is exhaustive so the compiler demands the row.

## Test plan

**Red before green.** `packages/config/tests/integration/runtime-corpus-scope.test.ts` is written
against **today's** API (`rt.stores.blob.list()` must contain a `{tenant}/{project}/`-prefixed key after
indexing under `acme`) so it compiles and **fails at HEAD**. Run it first, capture the output into
`progress.md` and the increment-1 commit message, then implement.

- **Unit — key layout** (`packages/config/src/fragment-source.test.ts`): `corpusKey` composition;
  the factory's base view is `(default, default)`; `forTenant` **resets the project** (mirroring every
  other store); a fragment written under `(acme, default)` is `undefined` from `(globex, default)` and
  from `(acme, beta)`; round-trip incl. metadata; a malformed blob still resolves to `undefined`;
  `corpusScopeSegment` rejects `a/b`, `..`, `.`, `''`, `_tessera`, and an over-long id.
- **Unit — migration** (`corpus-migration.test.ts`): moves unprefixed keys to the target scope; is a
  **no-op on the second run** (marker); leaves `_tessera/` alone; skips a key already under the target
  prefix; survives a key that vanished mid-run (the concurrent-replica case); an empty store writes the
  marker and moves nothing.
- **Unit — indexer/enrichment:** `indexDocument` under `(acme, beta)` writes `acme/beta/<ref>` and
  `removeDocument` deletes exactly that; `createEnrichedRetriever.forTenant(B)` cannot read tenant A's
  fragment; **a ref with no fragment still passes through unchanged, not dropped** (F-061's guard must
  stay green **unmodified**).
- **Unit — compiler** (`tests/integration/scoped-fragment-source.test.ts`): `compiler.forTenant('acme')`
  resolves through `fragmentSource.forTenant('acme')`; a package compiled as `globex` contains **no**
  acme fragment and traces `no content for ref`.
- **Unit — erasure:** `deleteLineage` on a non-default project removes the blob **and** the indices
  (RISK-2), guarding the `erasure-must-de-index-not-just-delete` lesson.
- **Conformance:** `blob.conformance.ts` is **unchanged** — the port did not change. That is a result
  worth asserting by absence, and the effect entry says why.
- **API e2e** (`apps/api/tests/e2e/fragments.e2e.test.ts`, over a **scope-aware** fake source): tenant A
  reads its own ref → 200 with the body; **tenant A presenting tenant B's ref → 404** (clause 2);
  unknown ref → 404 (indistinguishable from the cross-tenant case — that is the point); a token without
  `fragments:read` → 403; a `..` ref → 400; a body over the cap returns `truncated: true` and exactly
  `MAX_FRAGMENT_TEXT_CHARS`.
- **E2E-full** (scope-isolation spec, over the **real** blob store, real tokens, `acme`/`globex` from
  F-071): acme searches, takes the winning ref, `GET /v1/fragments/{ref}` → 200 containing the term; the
  **same ref as globex → 404**. This is the claim the acceptance actually makes, proved against real
  keys rather than a fake.
- **E2E-full — human journey:** the search detail Sheet renders the fixture file's body (clause 3),
  replacing the excerpt-only expectation.
- **RTL** (`search-detail.test.tsx`): body renders for a file hit; skeleton while pending; the error
  copy on failure; **absent** for a symbol hit; the truncation line when `truncated`; a body containing
  `<script>alert(1)</script>` renders as **visible text** (the same XSS regression guard F-061 wrote for
  snippets — this is a much larger slice of attacker-influenceable repo content).
- **Regression:** every existing default-scope test must pass **unmodified** except the ones whose call
  sites genuinely change (`putFragment` arity, the two `blob.list()` prefix filters). A default-scope
  assertion that needs editing means the base view drifted off `(default, default)` — investigate, do
  not edit the assertion.

## Verification

Run in gate order ([`../verification/gates.json`](../verification/gates.json)); stop at first failure.
Feature-declared: `typecheck`, `lint`, `test`, `e2e`, **plus `e2e-full` (added in increment 0)**.

```
node scripts/verify-state.mjs
pnpm -w typecheck
pnpm -w lint
pnpm -w format:check
pnpm -w test
pnpm -w build
pnpm -w test:e2e
pnpm -w test:perf
pnpm -w test:e2e:full
pnpm -w bench
```

Targeted during the loop: `pnpm --filter @tessera/config test`,
`pnpm --filter @tessera/context-compiler test`, `pnpm --filter @tessera/api test:e2e`. After increment 2:
the SDK generate then the docs generate — both must produce **no diff** on re-run (the docs drift test
fails the `test` gate if either is stale).

Evidence for `progress.md`: per-gate pass counts; the **captured pre-fix failure** of
`runtime-corpus-scope.test.ts`; the e2e-full line showing globex getting **404** on acme's ref; and the
`bench` numbers showing `tokensPerAnswer` unmoved.

## Scope limits & deferrals (stated, not hidden)

1. **SL-1 — This does not protect against a compromised tenant boundary.** Isolation is only as good as
   `tenantOf(request)`. If auth resolves the wrong tenant, a scoped fragment source faithfully serves
   the wrong tenant's bytes. This feature removes an *authorization* hole; it is not an authentication
   control.
2. **SL-2 — No MCP `get_fragment` tool.** Deliberate (D2). Agents read fragments through
   `compile_context`, which is budget-bounded and provenance-tagged.
3. **SL-3 — No syntax highlighting in the Sheet.** A highlighter is a new dependency against the
   first-load JS budget and the F-074 CWV gate, for a detail panel. Plain, wrapped, monospaced text.
4. **SL-4 — Tenant ids are validated at the corpus, not at the boundary.** An OIDC `tenant_id` claim
   containing `/` now fails **closed** instead of colliding namespaces. Rejecting it at authentication
   is the better home and is a registered limit, not built here.
5. **SL-5 — Ownership of pre-F-075 blobs is not reconstructed.** See D3. The migration targets the
   deployment's declared tenant; multi-tenant content ingested in the F-071→F-075 window must be
   re-ingested.
6. **SL-6 — `Runtime.stores.blob` is still an unscoped handle**, used by config integration tests and
   by the migration itself. It is the byte store, not the corpus; there is no product code path that
   reads a corpus fragment through it. Removing it is not this feature's business, but it is the one
   remaining way to read an arbitrary key — said out loud rather than claimed away.
7. **SL-7 — Blob-level encryption is untouched.** NFR-13 names "configurable encryption"; this feature
   partitions, it does not encrypt. Separate concern, separate feature.

## Risks / open questions

- **OQ — ADR required before coding (increment 0).** Two decisions deviate from documented defaults:
  (i) `BlobStore` deliberately does **not** get the `forTenant` every other scoped port has;
  (ii) a boot-time blob migration outside the SQL `runMigrations` mechanism. **ADR-0067**, drafted
  above. Do not start increment 1 without it.
- **RISK-1 (highest) — the window between commits.** After increment 1, a corpus that has not been
  migrated is unreadable. This is why the migration ships **in the same commit** as the key change, and
  why the migration is boot-time rather than operator-run: a developer's local `.tessera` must keep
  working across a `git pull` with no instructions.
- **RISK-2 — `memory-indexing.ts` upgrades a latent bug.** `deleteLineage` calls
  `removeDocument({ ref, tenantId })` with **no `projectId`**, so for a non-default project it already
  clears the wrong indices. With scope-keyed blobs it would also fail to delete the **body** — turning
  index remanence into content remanence, against the recorded
  `erasure-must-de-index-not-just-delete` lesson and NFR-13. Fixed here (one line + a test), flagged
  rather than smuggled: the key change is what forces the question.
- **RISK-3 — E-015, the `instrumentServices` trap.** A new `ApiServices` member is exactly the shape
  that has already 500ed routes in production twice. The regression test extension is not optional.
- **RISK-4 — golden rule 6 across ~7 `FragmentSource` doubles.** Required members mean every double
  must be updated in the same commit or typecheck fails — which is the *desired* failure mode, but it
  makes increment 1 wide. Mitigation: `get` is unchanged, so each double grows two `return this;`
  lines and nothing else.
- **RISK-5 — a `list()` at boot on S3.** One full bucket listing on the first boot of a self-hosted
  deployment, then one `exists()` forever. If the migration fails it re-lists each boot until it
  succeeds — visible in the logs, and correct behaviour for a migration that has not completed.
- **RISK-6 — the `perf` gate.** No default REST/MCP answer changes, so `tokensPerAnswer` must stay put.
  If it moves, something unintended reached the wire — investigate; **never rebaseline**.
- **Scope creep to refuse:** `forTenant` on `BlobStore`; an MCP fragment tool; syntax highlighting;
  blob encryption; validating tenant ids at the auth boundary; unifying the document and graph-node ref
  spaces (**F-076**); de-indexing on `source.remove`.
