# ADR-0059: The self-hosted profile — a shared assembler, migrations under an advisory lock, async retriever ports, and one hand-rolled adapter

- **Status:** Accepted
- **Date:** 2026-07-26
- **Deciders:** Project lead (the F-056/F-093 split) + implementing agent — completes the follow-up recorded in ADR-0026
- **Tags:** deployment, profiles, postgres, migrations, storage, s3, queue, ports, self-hosted

## Context

Every deployment page in this repository ends with a version of the same sentence: setting
`profile: "self-hosted"` is rejected by the server today. The rejection is one line —
[`packages/config/src/profiles/local.ts:222-226`](../../packages/config/src/profiles/local.ts) — and
[ADR-0026](0026-postgres-pgvector-adapters.md) §Follow-ups wrote down why it is still there: *"A full
self-hosted config profile also needs Postgres-backed graph/memory stores (the current graph/memory
adapters are SQLite-specific)."*

F-056's acceptance named four adapters to build: a Postgres `MemoryStore` and `GraphStore`, an
S3-compatible `BlobStore`, and a BullMQ `Queue`. Planning found that number to be wrong, and the
correction is the reason this ADR exists rather than a code comment. A `grep` for
`BetterSQLite3Database` across `packages/*/src` returns **twelve** files; excluding the SQLite
adapter itself, the migration runner, and `local.ts`, **nine** components bind the data path to
SQLite. Beyond memory and graph those are: the keyword (FTS5) retriever, the temporal retriever, the
ingestion manifest, the source registry, the project store, the token store, and the audit log.

That matters because the tempting shortcut — Postgres for the heavy data and a small SQLite file
beside it for the control plane — silently destroys the property self-hosted exists to provide. A
single-writer file on one node's disk cannot be shared by two replicas, so *any* SQLite in the data
path caps the deployment at one node. Self-hosted would boot, pass a smoke test, and fail the first
time an operator scaled it.

So "boots for real" is eleven adapters, not four. The lead was asked and **approved splitting the
feature**: F-056 keeps the profile (this ADR's subject), and a new **F-093** takes the Dockerfiles,
app containers, compose-boot smoke, release CD, and deployment guides. Release contents are unchanged;
only the unit of work moved.

## Decision

### 1. A shared assembler, two thin profile modules, and a dynamically-imported self-hosted branch

`createLocalRuntime` is ~200 lines of composition. Neither branching inside it nor duplicating it is
acceptable — the first produces thirteen `profile === 'local' ? … : …` ternaries, the second
duplicates ~140 lines of retriever/compiler/sink/SSE-bridge wiring that every future feature must then
remember to change twice.

- **`profiles/assemble.ts`** — `assembleRuntime(parts)` takes **already-constructed** adapters and
  performs every profile-independent step: retrievers, hybrid search, fragment source, compiler,
  enriched search, indexer, indexed memory, the three-way sink, source service + worker, SSE bridge,
  `ApiServices`, readiness, `close()`. **It never branches on profile.**
- **`profiles/local.ts`** keeps its signature and export, constructs SQLite/filesystem/in-process
  adapters, and delegates. Its behaviour must be byte-identical, and the proof is that the five
  existing `packages/config/tests/integration/runtime-*.test.ts` suites are **not edited**.
- **`profiles/self-hosted.ts`** constructs the Postgres/S3/BullMQ set and delegates.
- **`createRuntime`** selects, reaching self-hosted through a **dynamic `import()`**.

The dynamic import is load-bearing, not stylistic. A static `import { createBullMqQueue }` in the
profile index drags `bullmq` + `ioredis` + `pg` into the **local** process graph — including the
`tessera-mcp` stdio binary an agent client spawns on a laptop. FR-50 promises a local mode with zero
external services; loading a Redis client to run offline breaks that promise even if no connection is
opened. This is the [ADR-0058](0058-remote-mcp-http-transport.md) subpath argument one level up.

**`cloud` maps to the same adapter set.** The acceptance says the deferral covers non-local
*profiles*; there is no adapter difference between self-hosted and cloud today, and inventing one
before F-057 needs it would be speculation.

### 2. Postgres adapters do not create their own tables; the composition root migrates under an advisory lock

The SQLite adapters keep their `CREATE TABLE IF NOT EXISTS` self-provisioning — nothing about Local
changes. The Postgres adapters do the opposite:

- **Each package exports its own `Migration[]`** (`pgMemoryMigrations`, `pgGraphMigrations`,
  `pgRetrievalMigrations`, `pgConfigMigrations`). The package that owns a schema owns its DDL; a
  central list in the composition root would encode every other package's schema there.
- **The composition root applies them once, at boot, under `pg_advisory_lock`.** The existing runner
  ([`packages/storage/src/migrations/runner.ts:75-96`](../../packages/storage/src/migrations/runner.ts))
  **reads applied ids, then applies** — two replicas starting together both read an empty table and
  both apply. `runMigrations` is already idempotent by id; the lock removes the window in which they
  race. Because `pg_advisory_lock` is **session-scoped**, the lock and the migrations must run on the
  *same* connection, so `@tessera/storage` gains `pgClientMigrationDb(client)` and
  `withPgAdvisoryLock(pool, key, fn)` — additive, no new dependency, no drizzle-kit (consistent with
  [ADR-0027](0027-backup-restore-and-migration-runner.md)'s explicit rejection of it).
- **Adapters assume their tables exist** and fail loud (`relation does not exist`) rather than
  returning a silent empty result.

### 3. Test isolation is a per-test Postgres schema, not a table-name option

Guarded Postgres tests each get a random schema via `search_path`. The alternative — a `tableName`
option on every adapter — puts a test concern into production constructors, eleven times over.

### 4. The retriever ports become fully `async`

`KeywordRetriever.index/remove` and the temporal equivalents are synchronous today because SQLite is.
Postgres cannot be. The choice is between a `void | Promise<void>` union that compiles everywhere
unchanged, and a real `Promise<void>`:

```ts
index(ref: string, content: string): Promise<void>;   // was: void
remove(ref: string): Promise<void>;                    // was: void
```

The union is rejected for the reason [ADR-0057](0057-ingestion-scope-on-the-queue-job.md) rejected an
optional scope: **a union is silently ignorable**, and the thing that can be silently dropped
eventually is. A returned promise nobody awaits is a write nobody waits for — exactly the class of bug
that produces "the scan said it indexed and search finds nothing." This is an **E-012 port change** and
ships in its own commit so a regression bisects cleanly. Every existing assertion must survive
unchanged; if one has to move, the change was not behaviour-preserving.

### 5. BullMQ is taken as a dependency; S3 is hand-rolled

**BullMQ: take it.** Atomic move-to-active, stalled-job recovery, and backoff are precisely what must
not be hand-rolled, and it is named in the acceptance. It lands behind a `@tessera/storage/bullmq`
subpath so the stdio binary never loads a Redis client.

Two honest port consequences:

- `drain?()` **stays absent** on BullMQ, exactly as the port already documents. So a self-hosted scan
  returns without `indexed` — the field F-071 made optional *for this adapter*. Verification polls
  scan status instead of assuming synchronous completion. This is the design working, not a gap.
- The queue conformance suite assumes enqueue→`shutdown()` drains. That is fixed with a harness hook
  (`settle?()`), not a weakened assertion.

**S3: hand-roll SigV4 over `fetch`.** `@aws-sdk/client-s3` pulls ~60 `@smithy/*` packages into the
server image for five operations. This repo has ruled the same way twice —
[ADR-0024](0024-github-connector-and-auto-memory-extraction.md) chose `fetch` over Octokit,
[ADR-0026](0026-postgres-pgvector-adapters.md) chose a text vector literal over the `pgvector`
helper — and NFR-18 points the same way.

**The counter-argument, recorded because it is real:** SigV4 is easy to get subtly wrong (canonical
URI encoding of keys with `/` or non-ASCII, the payload hash, header canonicalization). Mitigations:
the signer is a pure function tested offline against published AWS test vectors *and* a canonical
MinIO request; there are only five operations; key validation is **shared with the filesystem adapter**
so both reject `../evil` identically. And the escape hatch is cheap: **swapping to the SDK changes
nothing outside `s3-blob/`** — the `BlobStore` interface and its conformance suite are identical
either way. That reversibility is why hand-rolling is defensible here and would not be for, say, the
queue.

## Consequences

### Positive
- ADR-0026's recorded follow-up closes; the deployment docs stop ending in a disclaimer.
- Self-hosted is genuinely multi-node: no SQLite anywhere in the data path, so replicas are possible.
- `assembleRuntime` means a future profile (cloud, F-057) is an adapter list, not a fork.
- Every Postgres adapter is held to the **same** shared conformance suite as its SQLite twin,
  including tenant/project isolation — the F-023 pattern, applied nine more times.

### Negative / costs
- Eleven adapters is a large surface, and the guarded-test pattern means CI without Postgres proves
  less than a developer with Docker does. The compose-boot verification (F-093) is what closes that.
- A hand-rolled signer is a correctness risk carried deliberately; see the mitigations and the
  reversibility note above.
- `bullmq`/`ioredis`/`pg` enter the repo's dependency graph, kept out of the local process only by the
  dynamic import and the subpath. That discipline is now load-bearing and must survive review.
- An async port change touches ~25 test lines across four packages.

### Neutral
- Local is untouched, byte-for-byte, and its untouched integration suites are the evidence.

## Alternatives considered

- **SQLite for the control plane, Postgres for data** — rejected: caps the deployment at one node,
  which is the entire point of self-hosted.
- **Branch inside `createLocalRuntime`** / **duplicate the composition** — rejected, §1.
- **A central migration list in the composition root** — rejected: encodes other packages' schemas.
- **A `tableName` option per adapter for test isolation** — rejected: a test concern in eleven
  production constructors.
- **`void | Promise<void>` retriever ports** — rejected, §4: silently ignorable.
- **`@aws-sdk/client-s3`** — rejected on dependency weight, §5; explicitly reversible.
- **Keeping F-056 whole** — rejected by the lead: four clauses whose first clause alone is ~11
  adapters cannot close honestly as one unit.

## References

- Realized by **F-056** (this ADR's subject) and **F-093** (artifacts). Closes the follow-up in
  [ADR-0026](0026-postgres-pgvector-adapters.md); extends
  [ADR-0018](0018-config-loader-and-local-profile.md) (composition root),
  [ADR-0027](0027-backup-restore-and-migration-runner.md) (migration runner),
  [ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md) (ports & adapters).
- Isolation contract: [ADR-0033](0033-data-plane-tenant-isolation.md),
  [ADR-0037](0037-multi-project-workspaces.md). Subpath/dependency-graph precedent:
  [ADR-0058](0058-remote-mcp-http-transport.md).
- PRD **FR-51**, **FR-53**, **NFR-10**, **NFR-15**, **NFR-18**. Effect-links **E-001**, **E-007**,
  **E-012**, **E-014**.
