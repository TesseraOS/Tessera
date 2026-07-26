# Plan: F-056 Self-hosted profile completion + deployment artifacts

- **Feature:** F-056 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-51 (Self-Hosted mode: Postgres + pgvector + object store + Redis/BullMQ via
  Docker Compose), FR-53 (deployment profiles select adapters by config; no code change between
  modes), NFR-15 (CI/CD — releases build + publish deployment artifacts), NFR-10 (portability /
  containerizable)
- **Service / package:** `root` — `@tessera/storage` → `@tessera/memory` / `@tessera/knowledge-graph`
  / `@tessera/retrieval` → `@tessera/config` → `@tessera/server` → `docker/` + `.github/workflows/`
  → `apps/docs`
- **Author:** planner subagent · **Date:** 2026-07-26

## Intent

Every deployment doc in this repository currently ends with a version of the same sentence: *"setting
`profile: "self-hosted"` in configuration is rejected by the server today"*
([`deployment/index.mdx:29-34`](../../apps/docs/content/docs/deployment/index.mdx),
[`self-host-docker.mdx:17,88-97`](../../apps/docs/content/docs/deployment/self-host-docker.mdx)). The
rejection is one line —
[`profiles/local.ts:222-226`](../../packages/config/src/profiles/local.ts) — and ADR-0026 §Follow-ups
(lines 53-55) wrote down exactly why it is still there: *"A full self-hosted config profile also needs
Postgres-backed graph/memory stores (the current graph/memory adapters are SQLite-specific)."* This
feature builds what that line defers, and then ships it as artifacts an operator can actually run.

**Done looks like:** an operator clones the repo, runs `docker compose up -d`, and gets a working
multi-user Tessera on Postgres + pgvector + MinIO + Redis — registers a repo, scans it, searches,
compiles, captures a memory, reads the audit trail — with no code change and no SQLite anywhere in the
data path; a tagged release publishes the images that stack runs; and the docs describe the whole thing
without a single "not yet".

## Scope guard — and an honest size problem, stated first

**This feature is too big for one unit of work, and I want that on the record before the increment
list rather than discovered halfway through it.** The four acceptance clauses are each roughly the size
of a normal feature, and clause 1 is larger than it reads.

### Clause 1 names four adapters. A profile that "boots for real" needs eleven.

`createLocalRuntime` constructs **thirteen** adapters. Four are named in the acceptance. The rest are
bound to `BetterSQLite3Database` and have no Postgres implementation — verified by grepping the type:

| Component | `local.ts` line | Today | Self-hosted needs | In clause 1? |
|---|---|---|---|---|
| RelationalStore | 230 | `createSqliteStore` | `createPostgresStore` | **exists** (F-023) |
| VectorStore | 236 | `createSqliteVecStore` | `createPgVectorStore` | **exists** (F-023) |
| BlobStore | 232 | filesystem | **S3** | ✅ named |
| Queue | 233 | in-process | **BullMQ** | ✅ named |
| GraphStore | 241 | `createSqliteGraphStore` | **PG** | ✅ named |
| MemoryStore | 243 | `createSqliteMemoryStore` | **PG** | ✅ named |
| KeywordRetriever | 245 | SQLite **FTS5** | **PG tsvector** | ❌ |
| TemporalRetriever | 246 | SQLite table | **PG** | ❌ |
| IngestionManifest | 346 | `createSqliteManifest` | **PG** | ❌ |
| SourceRegistry | 363 | `createSqliteSourceRegistry` | **PG** | ❌ |
| ProjectStore | 386 | `createSqliteProjectStore` | **PG** | ❌ |
| TokenStore | 398 → `createRuntimeAuth` | `createSqliteTokenStore` | **PG** | ❌ |
| AuditLog | 401 | `createSqliteAuditLog` | **PG** | ❌ |

The seven unticked rows are **not scope creep** — they are what the words "boots for real" mean.
`auth.mode: token` is mandatory for a self-hosted deployment and it needs a TokenStore;
`audit.enabled` defaults to `true` ([`schema.ts:142-147`](../../packages/config/src/schema.ts)) and
needs an AuditLog; a scan without a manifest re-ingests everything on every pass; search without a
keyword index is a semantic-only retriever. And the tempting shortcut — *"keep a small SQLite beside
Postgres for the operational tables"* — **must be refused explicitly**: two API replicas would each
hold their own partial FTS index and their own token table, which destroys the one property
self-hosted exists to provide. I am naming that option only to close it.

So clause 1 alone is: **7 new adapters + 4 named ones + a port change + a profile refactor.**

### The split — **DECIDED by the lead, 2026-07-26** (was OQ-2)

> **Resolved.** The lead approved the split before any code was written. `feature_list.json` now
> carries the rescoped **F-056** (clause 1 + the compose *data* services, increments 0–8) and a new
> **F-093** (`must`, R4, `blockedBy: [F-056]`) holding the Dockerfiles, app containers, boot smoke,
> release CD, and the three guides (increments 9–13). Release contents are unchanged. The rest of this
> section is the reasoning as it was put to the lead, kept because it is the record of *why*.

- **F-056 (rescoped):** clause 1 in full — the eleven adapters, the migration story, the profile
  branch, `createRuntime`, and the compose stack's **data services** (postgres + minio + redis) so the
  profile is verifiable against real infrastructure. Increments 0–8 below. Ends with: `TESSERA_PROFILE=self-hosted`
  boots and serves everything the Local profile does.
- **F-093 (new, `must`, R4, blockedBy F-056):** clauses 2b + 3 + 4 — the four Dockerfiles, the app
  containers in compose, the boot smoke, release CD, and the three deployment guides. Increments 9–13.

Both stay `must` in R4, so the **release contents do not change** — only the unit of work does. The
cut is clean because increment 8 is the last one that touches product code and the first eight are
independently valuable (the profile works for anyone running processes themselves, which is what
`self-host-docker.mdx` already tells readers to do today).

**The plan below covers all four clauses regardless**, sequenced so either answer works. If the lead
declines the split, the work is the same list, committed under one feature id.

### Out of scope — named so their absence reads as a decision

- **npm publishing.** F-059 owns it (its clause 3: *"tagged release workflow publishing npm packages
  (@tessera/sdk, @tessera/cli) + images (**with F-056**)"*) and it **cannot precede F-059's license
  work** (its clause 1) — publishing without a LICENSE is not a thing we do. F-056's "prep" is a
  `npm pack --dry-run` verification over the publish set and a recorded publish-set note (including
  `@tessera/skills`, per F-059's `notes`). **No `private: false` flips.**
- **Kubernetes / Helm.** Not in the acceptance; compose is.
- **Postgres physical backup.** ADR-0027 §Follow-ups already ruled it an ops concern. The guides
  document `pg_dump` + managed snapshots; we build nothing.
- **A `tessera-migrate` bin / init-container.** Migrate-on-boot under an advisory lock (D3) covers
  compose and scale-out; a separate migration step is a documented k8s seam.
- **Per-tenant blob keying (F-075), cloud metering (F-057), KMS SecretsProvider.** Untouched.
- **The F-092 shiki contrast defect.** Recorded in progress.md:89-95; do not absorb it. It constrains
  which new doc pages may join the axe `PAGES` set (see D8).

## What is already true (verified in the tree, not assumed)

1. **The F-023 storage half really is done and really is tested against compose.**
   `createPostgresStore` ([`postgres-relational/index.ts:26-62`](../../packages/storage/src/adapters/postgres-relational/index.ts))
   and `createPgVectorStore` both pass the *shared* conformance suites, guarded by
   `TESSERA_TEST_POSTGRES=1` with `DATABASE_URL` defaulting to the compose service
   ([`postgres-relational.test.ts:8-12`](../../packages/storage/tests/integration/postgres-relational.test.ts)).
   **That guard idiom is the template for every new adapter here.**
2. **The migration runner exists, is backend-agnostic, and was built for exactly this moment.**
   `runMigrations` + `postgresMigrationDb` ([`migrations/runner.ts:44-54,68-98`](../../packages/storage/src/migrations/runner.ts)),
   and ADR-0027 §Follow-ups line 48: *"Adopting the runner to replace the adapters' ad-hoc
   `CREATE TABLE IF NOT EXISTS` (memory/graph schemas) is a later migration; the mechanism is now
   available."* This is that later.
3. **`runMigrations` has no concurrency control.** It reads applied ids, then applies (lines 75-96).
   Two replicas booting together both see an id absent and both apply it. On SQLite the single-writer
   file made this benign; on Postgres it is a genuine race and a `CREATE INDEX` deadlock. **This is the
   highest-risk correctness area in the feature** (D3).
4. **The two retriever ports are synchronous.** `KeywordRetriever.index(ref, content): void` /
   `remove(ref): void` ([`keyword-retriever.ts:22-24`](../../packages/retrieval/src/adapters/keyword-retriever.ts))
   and the same on `TemporalRetriever` ([`temporal-retriever.ts:35-37`](../../packages/retrieval/src/adapters/temporal-retriever.ts)).
   Postgres cannot be synchronous. `createCorpusIndexer` calls them without `await`
   ([`corpus-indexer.ts:92-96,111-113`](../../packages/config/src/sources/corpus-indexer.ts)). **The
   ports must go async** (D6) — a real E-012 change, not a detail.
5. **`RuntimeStores.relational` is typed as the *concrete* `SqliteStore`**, not `RelationalStore`
   ([`runtime.ts:16`](../../packages/config/src/runtime.ts)). Widening it is required and cheap: the
   only producer is `local.ts:407` and there is **no consumer of `stores.relational` anywhere in the
   tree** (grepped: three hits total, all definition/construction).
6. **The per-test isolation idiom for Postgres already exists**: a random table name per store +
   `DROP TABLE` in cleanup, via a short-lived admin pool
   ([`pgvector.test.ts:12-39`](../../packages/storage/tests/integration/pgvector.test.ts)).
7. **The Queue conformance suite encodes an in-process assumption.** *"delivers an enqueued payload…"*
   does `await queue.enqueue(...); await queue.shutdown(); expect(received).toBe(42)`
   ([`queue.conformance.ts:17-26`](../../packages/storage/tests/conformance/queue.conformance.ts)) —
   i.e. it assumes `shutdown()` implies delivery. BullMQ's `Worker.close()` does not wait for *waiting*
   jobs. The suite needs a harness hook (D5), not a weakened assertion.
8. **The Blob conformance requires key-traversal rejection** (`store.put('../evil', …)` must reject —
   [`blob.conformance.ts:67-74`](../../packages/storage/tests/conformance/blob.conformance.ts)). S3
   would happily store that as a literal key, so the S3 adapter must validate keys itself.
9. **The compose file is byte-pinned to the docs page.** `compose-doc-drift.test.ts` strips the leading
   comment header and compares *the entire remaining body* to the ```` ```yaml title="docker-compose.yml" ````
   fence in `self-host-docker.mdx` ([lines 25-26, 34-58, 60-69](../../apps/docs/tests/compose-doc-drift.test.ts)).
   Every compose edit is a same-commit docs edit.
10. **Neither `@aws-sdk/client-s3` nor `bullmq`/`ioredis` is in the lockfile** (grepped: the only
    `aws-sdk` hits are drizzle's optional `@aws-sdk/client-rds-data` *peer* declarations,
    `pnpm-lock.yaml:3887,3917`). `pg@8.22.0` is present. Both are new-dependency decisions.
11. **`createRuntime` does not exist.** `createLocalRuntime` is the entry, called from three places:
    [`apps/server/src/bootstrap.ts:24`](../../apps/server/src/bootstrap.ts), `tests/bench/bench.mjs:58`,
    `apps/web/tests/e2e/support/token-api-server.mjs:24`.
12. **The env-docs guard only sees `TESSERA_*`** ([`verify-state.mjs:333-359`](../../scripts/verify-state.mjs)),
    and `.env.example` already documents `DATABASE_URL`, `REDIS_URL`, `OBJECT_STORE_ENDPOINT`,
    `OBJECT_STORE_BUCKET` as *unmapped placeholders* (lines 60-66) — nothing reads them today.
13. **CI mirrors gates, one-way.** `verify-state.mjs:156-172` fails if an **active gate** has no CI
    step; it never checks the reverse. Adding a CI *job* costs nothing in `gates.json`.
14. **ADR-0035 explicitly left the hosting decision here**: *"hosting provider choice (Vercel vs. Node
    containers behind the same CD) is left to F-056"* (line 70-72).
15. **ADR-0057 predicted the BullMQ trust boundary**: *"With a shared/durable broker, a job is a trust
    boundary."* This feature makes that live (D9).
16. **No Next app sets `output: 'standalone'`** ([`apps/web/next.config.ts`](../../apps/web/next.config.ts),
    `apps/docs/next.config.ts`, `apps/marketing/next.config.ts`).
17. **A live intermittent is disclosed in progress.md:106-116** — `@tessera/api#test:e2e` failed the
    *task* on 3 of ~9 full-workspace `pnpm -w test:e2e` runs while the suite itself printed
    `116 passed`. Suspected contention. **Expect to meet it; do not attribute it to this work without
    evidence, and do not add a second source of parallel real-server contention casually.**

## Design decisions

### D1 — Where self-hosted wiring lives: a shared assembler + two profile modules + a dynamic `createRuntime`

Three candidates:

| | verdict |
|---|---|
| **Branch inside `createLocalRuntime`** | **Rejected.** It is already ~200 lines of composition; thirteen `profile === 'local' ? … : …` ternaries make it unreadable and untestable. Worse, it is *semantically* wrong: a static `import { createS3BlobStore, createBullMqQueue }` in `local.ts` drags `bullmq` + `ioredis` into the **local** process graph — the same argument that made `@tessera/mcp/http` a subpath in F-055. FR-50's promise is "zero external deps"; that includes not loading a Redis client to run offline. |
| **Duplicate the whole composition in `self-hosted.ts`** | **Rejected.** ~140 lines of retriever/compiler/sink/event-bridge wiring duplicated is two places for every future F-0xx to remember. The SSE bridge alone (lines 286-343) is exactly the kind of thing that drifts silently. |
| **Extract the profile-independent core; two thin profile modules over it** | **Chosen.** |

- **`profiles/assemble.ts`** — `assembleRuntime(parts): Runtime`. Takes the **already-constructed**
  adapters (`relational`, `vector`, `blob`, `queue`, `memoryStore`, `graphStore`, `keyword`,
  `temporal`, `manifest`, `sourceRegistry`, `projectStore`, `auth`, `audit?`, `embeddings`, `secrets`,
  `config`, `connectorFactory`, `closeExtra`) and does everything from `local.ts:245-422`: retrievers,
  hybrid, fragment source, compiler, enriched search, indexer, indexed memory, the three-way `teeSink`,
  the source service + worker, the SSE bridge, `ApiServices`, `readiness`, and `close()`. **Zero
  branching on profile inside it.**
- **`profiles/local.ts`** — `createLocalRuntime` keeps its signature and its export; it constructs the
  SQLite/filesystem/in-process adapters and calls `assembleRuntime`. **Behaviour must be
  byte-identical**, and the proof is that
  [`tests/integration/local-profile.test.ts`](../../packages/config/tests/integration/local-profile.test.ts),
  `runtime-sources.test.ts`, `runtime-indexing.test.ts`, `runtime-graph.test.ts`,
  `runtime-ingestion-scope.test.ts` are **not edited**.
- **`profiles/self-hosted.ts`** — `createSelfHostedRuntime`: Postgres store → migrations under the
  advisory lock (D3) → pgvector, S3, BullMQ, PG memory/graph/keyword/temporal/manifest/registry/
  projects/tokens/audit → `assembleRuntime`.
- **`profiles/index.ts`** — `createRuntime(config, options)`:
  ```ts
  if (config.profile === 'local') return createLocalRuntime(config, options);
  const { createSelfHostedRuntime } = await import('./self-hosted.js'); // keeps bullmq/ioredis/pg
  return createSelfHostedRuntime(config, options);                      // out of the local graph
  ```
  `packages/config/src/index.ts` exports `createRuntime` + `createLocalRuntime` statically and
  **does not `export *` from `self-hosted.js`** (that would defeat the dynamic import). A
  `@tessera/config/self-hosted` export subpath gives tests direct access — the established idiom
  (`@tessera/api/auth`, `@tessera/mcp/http`).
- `createServerRuntime` ([`bootstrap.ts:24`](../../apps/server/src/bootstrap.ts)) switches to
  `createRuntime`. `tests/bench` and `apps/web`'s e2e support keep calling `createLocalRuntime`
  deliberately — they *are* local by construction, and pinning them says so.

**`cloud` maps to the self-hosted adapter set.** The acceptance says "closes the F-023 deferral where
non-local *profiles* throw" (plural), and there is no adapter difference: the architecture table and
`deployment/index.mdx:17` both describe managed cloud as *multi-tenant Postgres + pgvector*. The
difference is configuration (OIDC, CORS allowlist, retention) plus features that are separately
tracked (F-057 metering, KMS secrets). ADR-0059 must say this in one sentence so nobody later reads
`cloud` as a claim we operate a SaaS.

### D2 — Config: extend `storage`, add a root refinement, split credentials by sensitivity

```ts
const objectStoreSchema = z.object({
  endpoint: z.string().url().optional(),        // MinIO/R2/B2; omit for real AWS S3
  region: z.string().min(1).default('us-east-1'),
  bucket: z.string().min(1).optional(),
  forcePathStyle: z.boolean().default(true),   // MinIO needs it; AWS ignores it
}).default({});

const storageSchema = z.object({
  sqlitePath, vectorPath, blobRoot,            // unchanged — local
  postgresUrl: z.string().min(1).optional(),   // self-hosted/cloud
  redisUrl: z.string().min(1).optional(),
  objectStore: objectStoreSchema,
  vectorTable: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).default('vectors'),
}).default({});
```

plus a **root `.superRefine`** beside F-055's, reusing exactly that precedent
([`schema.ts:276-289`](../../packages/config/src/schema.ts)): *`profile != 'local'` requires
`storage.postgresUrl`, `storage.redisUrl`, and `storage.objectStore.bucket`* — so a misconfigured
deployment dies at config load with a `ValidationError` naming the missing keys, **before an adapter
is constructed**, which is `load.ts`'s stated contract.

**Credentials split, deliberately:**
- **Connection URLs** (`postgresUrl`, `redisUrl`) come from config env. They embed passwords, but they
  are the universal platform convention — Fly/Render/Railway/Heroku *inject* `DATABASE_URL` and
  `REDIS_URL` — and the managed-cloud walkthrough (clause 4) depends on that. So `configFromEnv` maps
  **`TESSERA_DATABASE_URL ?? DATABASE_URL`** and **`TESSERA_REDIS_URL ?? REDIS_URL`**. This is the
  first non-`TESSERA_*` read in `load.ts` and therefore an ADR line. Both spellings go in
  `.env.example` (the guard only checks `TESSERA_*`, but the docs reference is generated from the
  whole file, so the platform names must be there for readers).
- **S3 access keys** go through the **SecretsProvider** (`secrets.require('OBJECT_STORE_ACCESS_KEY_ID')`
  / `…_SECRET_ACCESS_KEY`), never through `TesseraConfig` — exactly as `createRuntimeBilling` does for
  Dodo ([`local.ts:141-144`](../../packages/config/src/profiles/local.ts)). The security rule is
  explicit: *"Access only via the SecretsProvider port."*

New `TESSERA_*` vars: `TESSERA_DATABASE_URL`, `TESSERA_REDIS_URL`, `TESSERA_OBJECT_STORE_ENDPOINT`,
`TESSERA_OBJECT_STORE_REGION`, `TESSERA_OBJECT_STORE_BUCKET`, `TESSERA_OBJECT_STORE_FORCE_PATH_STYLE`,
`TESSERA_VECTOR_TABLE`, plus the guards `TESSERA_TEST_S3`, `TESSERA_TEST_REDIS`. **All of them must
land in `.env.example` in the same commit** (`verify-state.mjs:333-359`), and `.env.example` is the
input to `apps/docs/generated/env-reference.json` (`generate.mjs:216-258`), byte-compared by
`generated-drift.test.ts` in the **`test`** gate — so `pnpm --filter @tessera/docs generate` is
*required work inside that increment*, not a follow-up. The `reference/configuration.mdx` page needs no
edit: it renders `<EnvReference />` (line 31).

### D3 — Schema & migrations: Postgres adapters do **not** create their own tables

This is the highest-risk area and it gets the most explicit rule.

- **SQLite adapters are untouched.** Their `CREATE TABLE IF NOT EXISTS` + `PRAGMA table_info` upgrades
  stay exactly as they are. Nothing about the Local profile changes. (Rule 6.)
- **Each Postgres adapter exports its own migration list**, e.g.
  `export const pgMemoryMigrations: readonly Migration[]` in `@tessera/memory`,
  `pgGraphMigrations` in `@tessera/knowledge-graph`, `pgRetrievalMigrations` in `@tessera/retrieval`,
  `pgConfigMigrations` (tokens/audit/projects/sources/manifest) in `@tessera/config`. The package that
  owns the schema owns its DDL — the alternative (one central list in `@tessera/config`) would encode
  other packages' schemas in the composition root and break the module-boundary rule.
- **The composition root applies them, once, under a Postgres advisory lock.**
  `createSelfHostedRuntime` concatenates the lists in a fixed order and calls `runMigrations`. Because
  `pg_advisory_lock` is **session-scoped**, the lock and the migrations must run on the *same*
  connection — a pooled `db.execute` would take the lock on one client and migrate on another. So
  `@tessera/storage` gains two small additive pieces:
  ```ts
  /** MigrationDb over ONE pg client (advisory locks are session-scoped — the lock and the
      migrations must share a connection). */
  export function pgClientMigrationDb(client: pg.ClientBase): MigrationDb;

  /** Run `fn` while holding a session-scoped advisory lock, so concurrent replicas serialize
      their migration pass instead of racing runMigrations' read-then-apply (runner.ts:75-96). */
  export function withPgAdvisoryLock<T>(pool: pg.Pool, key: bigint,
                                        fn: (c: pg.PoolClient) => Promise<T>): Promise<T>;
  ```
  The second replica finds every id in `_tessera_migrations` and skips — `runMigrations` is already
  idempotent; the lock only removes the window.
- **Adapters assume their tables exist** and fail loud if not (a `relation does not exist` error at
  first query, not a silent empty result). Guarded tests run the migrations in their factory.
- **No new dependency, no drizzle-kit**, consistent with ADR-0027's explicit rejection of it.

### D4 — Test isolation for Postgres: a per-test schema via `search_path`

Every shared conformance suite promises *"a fresh, isolated store for each test"*
([`memory-store.conformance.ts:11-12`](../../packages/memory/tests/conformance/memory-store.conformance.ts)),
and F-023's answer (a random *table* name) does not generalize to adapters that own several tables.

Chosen: **a random Postgres schema per harness**, created and `search_path`-ed in the factory, dropped
in cleanup:

```ts
const schema = `t_${randomBytes(6).toString('hex')}`;
const pool = new pg.Pool({ connectionString: CONNECTION_STRING });
pool.on('connect', (c) => void c.query(`SET search_path TO ${schema}`)); // every pooled client
await pool.query(`CREATE SCHEMA ${schema}`);
await runMigrations(...);                       // unqualified DDL lands in the schema
// cleanup: await pool.end(); admin.query(`DROP SCHEMA ${schema} CASCADE`)
```

This isolates *all* tables at once, needs **no `tablePrefix` option on any adapter** (so the adapters
keep the same shape as their SQLite twins, which take just the `db` handle), and keeps every migration
statement unqualified. The schema name is generated from `randomBytes`, not user input, and is
validated against the same identifier pattern the pgvector adapter uses
([`pgvector/index.ts:60-63`](../../packages/storage/src/adapters/pgvector/index.ts)).

*Verify the `pool.on('connect')` hook early* — if a pooled client can somehow issue a query before the
hook completes, fall back to the connection-string form
`new pg.Pool({ connectionString, options: '-c search_path=' + schema })`.

### D5 — S3 and BullMQ: one hand-rolled, one taken

**BullMQ: take the dependency.** It is named in the acceptance, and reliable Redis queueing (atomic
Lua move-to-active, stalled-job recovery, backoff) is precisely what you must not hand-roll. `bullmq`
+ its `ioredis` transitive become dependencies of `@tessera/storage`, exported from a
**`@tessera/storage/bullmq` subpath** so the stdio `tessera-mcp` binary never loads a Redis client
(the F-055 subpath argument, one level down).

Two port-level frictions, both real:

- **`shutdown()` vs the conformance suite.** Finding 7. The fix is a harness hook, not a weaker
  assertion: widen `QueueFactory` to return `{ queue, settle? }` and have the suite `await settle?.()`
  before `shutdown()`. In-process returns no `settle` (its `shutdown` already drains, so the existing
  test is unchanged in meaning); BullMQ's `settle` waits until `waiting + active === 0` with a bounded
  timeout. Blast radius: **one existing call site**
  ([`in-process-queue.test.ts`](../../packages/storage/tests/integration/in-process-queue.test.ts)).
- **`drain?()` stays absent on BullMQ**, exactly as the port documents (*"distributed adapters (BullMQ)
  may omit it, in which case work is observed asynchronously"* —
  [`ports/queue.ts:20-26`](../../packages/storage/src/ports/queue.ts)). Consequence, and it is the
  right one: `SourceService.performScan` under self-hosted returns **without** `indexed`, because
  F-071 made that field optional *on purpose* for precisely this adapter. The smoke therefore **polls
  scan status** rather than assuming synchronous completion — this is the documented design working,
  not a gap.

**S3: hand-roll SigV4 over `fetch`.** `@aws-sdk/client-s3` pulls ~60 `@smithy/*` packages into the
server image for five operations. The repo has ruled twice in the other direction on exactly this
trade — ADR-0024 chose `fetch` over Octokit, ADR-0026 chose a `$n::vector` text literal over the
`pgvector` npm helper "consistent with the minimal-deps ethos" — and NFR-18 (supply chain) plus the
security rule's *"prefer first-party/local implementations for sensitive paths"* point the same way.

So `@tessera/storage/src/adapters/s3-blob/{sign.ts,index.ts}`, zero new dependencies
(`node:crypto` + global `fetch`), five operations: `PUT`, `GET`, `DELETE`, `HEAD`, `ListObjectsV2`
(with `continuation-token` pagination). Key validation is **shared with the filesystem adapter** so
both reject `../evil` identically (finding 8).

**The honest counter-argument, recorded:** SigV4 is easy to get subtly wrong — canonical-URI encoding
of keys containing `/` and non-ASCII, the payload hash, header canonicalization. Mitigations: the
signer is a pure function tested **offline** against the published AWS SigV4 test-suite vectors *and*
a canonical MinIO request; only five operations exist; and **if review prefers the SDK, the swap
changes nothing outside `s3-blob/` — the `BlobStore` interface and the conformance suite are
identical either way.** ADR-0059 decides it, and says that reversibility out loud.

Guards: `TESSERA_TEST_S3=1` (MinIO) and `TESSERA_TEST_REDIS=1`, both defaulting to the compose
services, both `describe.skipIf`-ed so an offline machine stays green — the F-023/F-005 pattern.

### D6 — The retriever ports go **fully async**, not `void | Promise<void>`

Finding 4 forces a choice. A union return type would compile everywhere unchanged — and that is the
problem: `no-floating-promises` aside, a union is *silently ignorable*, and the F-071 lesson is that
the thing which can be silently dropped eventually is. So:

```ts
index(ref: string, content: string): Promise<void>;   // was: void
remove(ref: string): Promise<void>;                    // was: void
```

on both `KeywordRetriever` and `TemporalRetriever`. `createCorpusIndexer` awaits them (and can
`Promise.all` the keyword/temporal writes, which are independent — the engineering rule's
"parallelize independent async"). Call sites to update: `corpus-indexer.ts:92-96,111-113` (production)
and ~25 test lines across `keyword-retriever.test.ts`, `temporal-retriever.test.ts`,
`hybrid-retriever.test.ts`, `context-compiler/tests/integration/corpus.ts:65`,
`config/tests/integration/local-profile.test.ts:55`. **Every assertion stays identical** — if one has
to change, the port change was not behaviour-preserving; investigate, do not edit the assertion.

This is an **E-012 port change** and belongs in its own commit so a regression bisects cleanly.

PG implementations: keyword uses `tsvector` + a GIN index with `plainto_tsquery` and `ts_rank`
(the FTS5/bm25 equivalent — ranking numbers differ, which is fine: the conformance asserts *ordering
and scoping*, not scores); temporal is a straight port of the `(tenant, project, ref) → ts` table.

### D7 — Containers: Debian base, root build context, `pnpm deploy`, standalone Next

- **Base: `node:22.16.0-bookworm-slim`** for both build and runtime stages. **Not Alpine** — this is
  load-bearing, not taste: `better-sqlite3` and `onnxruntime-node` (via `@huggingface/transformers`)
  ship **glibc** prebuilds; musl means a source build or a runtime crash. Same base for both stages
  also guarantees ABI match. Node pinned to `.nvmrc`'s 22.16.0.
- **Build context is the repo root** for all four Dockerfiles (`build: { context: ., dockerfile:
  apps/server/Dockerfile }`) — pnpm workspaces need the root lockfile, `pnpm-workspace.yaml`, and every
  workspace manifest. A repo-root **`.dockerignore`** (`node_modules`, `.next`, `dist`, `.git`,
  `.tessera`, `test-results`, `playwright-report`) is mandatory, not hygiene: without it the context
  is multi-GB on a drive already recorded as flaky.
- **Layer strategy:** `deps` stage copies *only* manifests + lockfile → `pnpm install --frozen-lockfile`
  (cached until a manifest changes) → `build` stage copies sources → `pnpm -w build` (turbo orders the
  graph) → `runtime` stage.
- **Server runtime stage: `pnpm deploy --filter @tessera/server --prod --legacy /out`.** pnpm 9's
  `deploy` needs `--legacy` (or a hoisted node-linker) in a symlinked workspace — **verify this in
  increment 9 before writing three more Dockerfiles against it.** Documented fallback if it misbehaves:
  copy the built workspace and run `pnpm install --prod --frozen-lockfile` in the runtime stage
  (bigger image, same correctness).
- **Model prefetch.** `@huggingface/transformers` downloads ~90MB on first embed and the code sets no
  `cacheDir` (grepped: no `env.cacheDir`/`TRANSFORMERS_CACHE` anywhere in `packages/ai/src`). A cold
  container's first scan would therefore hit the network. Bake it: a build step that runs one embed to
  warm the cache, with the cache directory carried into the runtime stage. **If that proves fragile,
  the honest fallback is to document the first-run download cost in the deployment guide — not to
  quietly default the compose stack to `fake` embeddings.**
- **Next apps:** add `output: 'standalone'` + `outputFileTracingRoot: <repo root>` (required for pnpm's
  symlinked workspace deps) to `apps/{web,marketing,docs}/next.config.ts`; the runtime stage copies
  `.next/standalone`, `.next/static`, `public`. **Risk to re-verify:** the `web-perf` gate spawns
  `next start` directly (`gates.json` gate 8) — standalone output is additive and `next start` should
  be unaffected, but that gate is measured in bytes and must be re-run after the config change.
- Non-root `USER node`, `HEALTHCHECK` on `GET /health`, `ENV NODE_ENV=production`.

### D8 — Compose, and what "verified end-to-end from scratch" means

One `docker-compose.yml` (the drift gate pins exactly one), five services: `postgres` (unchanged
image/healthcheck), `redis`, `minio` + a one-shot `minio-init` that creates the bucket, `server`,
`web`. `marketing`/`docs` get **Dockerfiles** (clause 2 says so) but sit behind an optional
`profiles: ["public"]` so the default `docker compose up` stays the *product* stack — they are public
sites deployed separately under ADR-0035's three-domain topology, and putting them in the default
stack would misrepresent that.

Two deliberate changes to the existing service definition, both requiring the same-commit docs fence
update (finding 9):

- **Host port publishing becomes explicit loopback** — `127.0.0.1:5432:5432` instead of `5432:5432`.
  The current form binds `0.0.0.0`. Loopback keeps the guarded conformance working (it connects to
  `127.0.0.1:5432`, `postgres-relational.test.ts:9`) while not exposing the database to the LAN.
  Redis/MinIO get the same treatment. The production checklist tells operators to drop the mappings
  entirely.
- `server` and `web` join an internal network; the server reaches `postgres`/`redis`/`minio` by service
  name, and **Redis is never published** beyond loopback — which is the mitigation for D9's threat.

**The smoke** (`tests/deploy-smoke`, `@tessera/deploy-smoke`, plain Node — no Playwright; this is an
API-level proof) does, with **no fixed sleeps**:

1. `docker compose up -d --wait` (compose v2 honours healthchecks; v5.3.0 is available on this machine).
2. `GET /health` → 200; `GET /ready` → `checks` contains `postgres`, `redis`, `objectStore`, all
   `ok: true`. *This is why `readiness` must become profile-aware* (`local.ts:388-392` hardcodes
   `name: 'sqlite'`) — an acceptance-driving reason, not polish.
3. Issue an owner token via `docker compose exec server node dist/bin/token.js --roles owner`.
4. Register the mounted fixture source; scan; **poll** `GET /v1/sources/:id/scan` with a bounded
   timeout until complete (BullMQ has no `drain()` — D5).
5. `POST /v1/search` for the fixture's unique term → hits; `POST /v1/compile` → sections > 0;
   `GET /v1/effects` → the known dependent. **One assertion set that can only pass if PG graph + PG
   memory + pgvector + S3 corpus + BullMQ all worked together.**
6. `POST /v1/memory` then read it back (PG MemoryStore + the S3-backed corpus).
7. `GET /` on the web container → 200 (image sanity, not a browser journey).
8. On any failure: print `docker compose logs --tail=200` before throwing. `docker compose down -v` in
   `finally`.

**It is a `smoke` script, not a `test:e2e` task** — deliberately. Wiring it into `turbo run test:e2e`
would make the `e2e` gate require Docker for every contributor on every change, and would add a
*second* set of real servers to the parallel run that progress.md:106-116 already suspects of
contention.

### D9 — Release CD: images here, npm in F-059

- **`.github/workflows/release.yml`**, `on: push: tags: ['v*']`, `permissions: { contents: read,
  packages: write }`. `docker/metadata-action` + `docker/build-push-action` publish four images to
  **GHCR** (`ghcr.io/<owner>/tessera-{server,web,marketing,docs}`), tagged `v1.2.3` / `1.2` / `latest`,
  `platforms: linux/amd64`, `cache-from|to: type=gha`. GHCR because it needs no extra account and
  inherits repo permissions; arm64 is deferred pending onnxruntime-node prebuild verification (say so
  in the ADR rather than shipping a broken arm64 tag).
- **This closes ADR-0035's deferred hosting question** (finding 14): *Node containers behind CD*, not
  Vercel — because the same image must run in a customer's compose stack, and a Vercel-only path would
  fork the deployment story.
- **CI gains a `deploy-smoke` job** (not a gate — finding 13; it sits beside `security` and
  `secret-scan`, which are also jobs). Rationale: `gates.json` is the developer-runnable ladder, and a
  Docker-dependent image build is CI infrastructure. If the lead prefers it gated, adding
  `{ id: "deploy", requiredFor: ["release"] }` is a one-line change that `verify-state.mjs:156-172`
  will then enforce — **recommended as a follow-up once the job's runtime and flake rate are measured,
  not before**.
- **npm: dry-run only.** A `pack` step over `@tessera/sdk`, `@tessera/cli`, `@tessera/skills` that
  fails on missing `license`/`files`/`repository`, plus a recorded publish-set note. No `private` flips,
  no registry writes. F-059 owns publishing and its license clause must land first.

### D10 — Docs

- **Rewrite** `deployment/self-host-docker.mdx` — the status table (line 17: *"the server rejects the
  profile today"*) and the whole *"What F-056 completes"* section (lines 88-97) become false the moment
  increment 8 lands. **Delete the false line in the increment that makes it false, never after** — this
  is the exact defect the F-055 evaluator pass caught in *this same file* (progress.md:147-149).
- **Rewrite** `deployment/index.mdx:29-34`.
- **New** `deployment/managed-cloud.mdx` — one provider end-to-end. Recommend **Fly.io**: Dockerfile-native
  deploy, managed Postgres, managed Redis, Tigris (S3-compatible) object storage, automatic TLS and
  custom domains — the whole stack from one vendor, which makes the walkthrough concrete instead of
  hand-wavy, framed as *"the same shape on any container host."* Covers TLS, the three subdomains per
  ADR-0035, secrets, and backups (managed snapshots + F-024's `backup-and-restore` guide).
  **Constraint:** I cannot verify provider CLI syntax from this repo. Write it against current provider
  docs at implementation time and assert nothing unverified — the documentation rule and the F-055
  lesson both apply.
- **New** `deployment/production-checklist.mdx` — auth mode, CORS allowlist, rate limits, HSTS/TLS,
  retention, telemetry, backups, host-port removal. **Cross-links `/docs/agents/remote-mcp` (F-055) —
  does not duplicate it.**
- `deployment/meta.json` pages array; `docs/architecture/ARCHITECTURE.md` §3 (line 72-74) and the
  SELF-HOSTED sketch (lines 235-237) — both now describe something real.
- **Two live traps.** (a) `prose-counts.test.ts` — never write a literal tool/command count in a
  paragraph containing "tool"/"command". (b) **The F-092 shiki contrast defect**: adding a page with
  shell/YAML **comments** to `docs.spec.ts`'s axe `PAGES` set fails AA at 3.49:1 (progress.md:89-95).
  Either keep these pages out of `PAGES` or author them without code comments. Do **not** fix F-092 here.

## Approach — fourteen increments, gates green between commits

**0 · Governance.** [`docs/adr/0059-self-hosted-profile-and-deployment-artifacts.md`](../../docs/adr/0059-self-hosted-profile-and-deployment-artifacts.md)
(next free — `docs/adr/` ends at 0058) deciding D1–D9 and stating the **threat model** (D9 below).
Commit this plan alongside it. Raise **OQ-2 (the split)** and **OQ-1 (S3 dependency)** for the lead.
_Gate:_ `state`.

**1 · The Postgres migration seam.** `pgClientMigrationDb` + `withPgAdvisoryLock` in `@tessera/storage`;
guarded test proving two concurrent `runMigrations` passes serialize and apply each id exactly once.
_Gates:_ `typecheck lint format test build`.

**2 · PG MemoryStore.** `packages/memory/src/adapters/postgres-memory-store.ts` + `pgMemoryMigrations`
+ guarded conformance (the **whole** existing suite, including both isolation cases at
`memory-store.conformance.ts:263-330`). _Gates:_ code set.

**3 · PG GraphStore.** Same shape; the recursive-CTE `getEffects` ported (`instr(path, …)` → `strpos`)
and ranked through the *shared* `selectBestRanked` so both adapters stay in parity. _Gates:_ code set.

**4 · S3 BlobStore.** SigV4 signer (offline vector tests) + adapter behind `@tessera/storage/s3` +
guarded MinIO conformance; compose gains `minio` + `minio-init`; **compose fence updated in the same
commit**. _Gates:_ code set (incl. `@tessera/docs test` for the drift gate).

**5 · BullMQ Queue.** Adapter behind `@tessera/storage/bullmq`; the `settle` harness hook + the one
in-process call site; guarded Redis conformance; compose gains `redis` (+ fence). _Gates:_ code set.

**6 · Retriever ports go async.** The E-012 change + PG keyword (tsvector/GIN) + PG temporal + guarded
conformance; `corpus-indexer` awaits. **Its own commit** — this is the one that touches long-green code.
_Gates:_ code set.

**7 · The remaining PG relational adapters.** (7a) token store + audit log; (7b) project store + source
registry + manifest. Each runs the *existing* shared suites where they exist
(`apps/api/src/projects/store.conformance.ts`, `packages/ingestion/src/sources/registry.conformance.ts`),
env-guarded. _Gates:_ code set per sub-increment.

**8 · The profile.** `profiles/assemble.ts` extraction (behaviour-preserving — the five existing
`packages/config/tests/integration/*` files are **not edited**, and that is the proof) + `self-hosted.ts`
+ `createRuntime` + the config section, root refinement, env mapping, `.env.example`, **and both
regenerations** + `RuntimeStores.relational` widened + profile-aware `readiness` + `createServerRuntime`.
A guarded integration test boots the self-hosted runtime against compose and replays
`local-profile.test.ts`'s assertions.
_Gates:_ `state typecheck lint format test build e2e`. **← end of clause 1; the recommended cut line.**

**9 · Dockerfiles.** Root `.dockerignore`, `apps/server/Dockerfile`, then the three Next ones +
`output: 'standalone'`. Verify `pnpm deploy --legacy` behaviour here, before committing to it thrice.
Re-run `web-perf`. _Gates:_ `build test:perf` + local image builds.

**10 · Full compose + the smoke.** `tests/deploy-smoke`, the five-service compose, the docs fence, and
a from-scratch `docker compose up` verified end to end. _Gates:_ code set + `pnpm --filter
@tessera/deploy-smoke smoke`.

**11 · CI + release CD.** `deploy-smoke` job; `release.yml`; the npm pack dry-run. _Gates:_ `state`
(the CI-mirror check) + a CI run once a remote is reachable.

**12 · Docs.** The rewrites + two new pages + meta.json + ARCHITECTURE. _Gates:_ code set (link-check,
prose-counts, drift).

**13 · Effects + state.** `effects.json`, `progress.md`, `feature_list.json` → `done`, a memory lesson.
_Gate:_ `state`.

## Files to touch

**`@tessera/storage`**
- `src/migrations/runner.ts` — `pgClientMigrationDb` (additive, beside `postgresMigrationDb:44-54`).
- `src/adapters/postgres-relational/index.ts` — export the pool (or add `withPgAdvisoryLock` next to it).
- `src/adapters/s3-blob/{sign.ts,index.ts,sign.test.ts}` **(new)**.
- `src/adapters/bullmq-queue/index.ts` **(new)**.
- `src/adapters/filesystem-blob/index.ts` — extract the shared key validation (no behaviour change).
- `tests/conformance/queue.conformance.ts` — the `settle` harness hook.
- `tests/integration/{in-process-queue,s3-blob,bullmq-queue,pg-advisory-lock}.test.ts`.
- `package.json` — `bullmq` dependency; `./s3` + `./bullmq` export subpaths.

**`@tessera/memory` / `@tessera/knowledge-graph`**
- `src/adapters/postgres-{memory-store,graph-store}.ts` **(new)** + `migrations.ts` **(new)**.
- `tests/integration/postgres-{memory-store,graph-store}.test.ts` **(new)** — guarded, running the
  **unmodified** shared conformance suites.
- `src/index.ts` exports.

**`@tessera/retrieval`**
- `src/adapters/{keyword,temporal}-retriever.ts` — `index`/`remove` → `Promise<void>`.
- `src/adapters/postgres-{keyword,temporal}-retriever.ts` **(new)** + migrations.
- `tests/integration/*` — `await` the writes; assertions unchanged.

**`@tessera/config`**
- `src/profiles/assemble.ts` **(new)** — the extracted composition core.
- `src/profiles/local.ts` — constructs local adapters, delegates. Same exported signature.
- `src/profiles/self-hosted.ts` **(new)**, `src/profiles/index.ts` **(new)** — `createRuntime`.
- `src/{auth,audit,projects,sources}/postgres-*.ts` **(new)** ×5 + their migrations.
- `src/schema.ts` — `storage` extensions + the root refinement; `src/load.ts` — env mapping (incl. the
  `DATABASE_URL`/`REDIS_URL` fallbacks) + `mergeConfig`; `src/schema.test.ts`.
- `src/runtime.ts` — `RuntimeStores.relational: RelationalStore`.
- `src/index.ts` — export `createRuntime`; **do not** re-export `self-hosted.js`.
- `package.json` — `./self-hosted` export subpath.
- `tests/integration/self-hosted-profile.test.ts` **(new)** — guarded.

**`@tessera/server`**
- `src/bootstrap.ts:24` — `createLocalRuntime` → `createRuntime`.
- `apps/server/Dockerfile` **(new)**.

**Containers / stack / CI**
- `.dockerignore` **(new)**; `apps/{web,marketing,docs}/Dockerfile` **(new)** + their
  `next.config.ts` (`output: 'standalone'`, `outputFileTracingRoot`).
- `docker-compose.yml` — five services (+ the optional `public` profile).
- `tests/deploy-smoke/**` **(new)**.
- `.github/workflows/ci.yml` — the `deploy-smoke` job; `.github/workflows/release.yml` **(new)**.

**Docs / generated**
- `apps/docs/content/docs/deployment/{index,self-host-docker}.mdx` rewritten;
  `{managed-cloud,production-checklist}.mdx` **(new)**; `deployment/meta.json`.
- `.env.example`; `apps/docs/generated/env-reference.json` (**regenerated, never hand-edited**).
- `docs/architecture/ARCHITECTURE.md` §3 + §11.

**Governance / state**
- `docs/adr/0059-*.md` **(new)**; `.harness/state/{effects,feature_list}.json`, `progress.md`,
  `.harness/memory/`.

## Anticipated effects

- **E-001 / E-007 (storage ports ↔ adapters ↔ conformance).** Extend, twice over. Both effect notes
  literally say *"later s3, bullmq"* — realize them. The `BlobStore` and `Queue` interfaces are
  **unchanged**; the **Queue conformance harness** changes (`settle`), which is a test-contract change
  every future queue adapter inherits. Record the BullMQ `drain()` omission explicitly: it is the port
  working as documented, and it changes `ScanSummary.indexed`'s availability under self-hosted.
- **E-010 (MemoryStore) / E-011 (GraphStore).** Extend: a third adapter each, passing the *same*
  suites including tenant **and** project isolation. Both notes currently enumerate "in-memory, sqlite".
- **E-012 (Retriever).** **Breaking-ish**: `KeywordRetriever`/`TemporalRetriever` `index`/`remove` become
  async. Dependents: `createCorpusIndexer` (the only production caller), five test files, and the
  `Runtime.keyword`/`temporal` surface (`runtime.ts:71-74`). New PG adapters join the "retrievers" item.
- **E-014 (config schema + profile composition).** The big one. `TesseraConfig.storage` gains five keys
  and its **second** cross-section refinement; `createRuntime` becomes the entry point and
  `createLocalRuntime` becomes one of two implementations behind a shared assembler;
  `RuntimeStores.relational` widens to `RelationalStore`; `readiness` becomes profile-aware. Rewrite the
  E-014 item that says the Postgres adapters "add a self-hosted/cloud profile branch behind the same
  Runtime/config" — they now *do*.
- **E-018 (auth control plane) / E-020 (audit) / E-021 (source registry) / E-009 (ingestion manifest).**
  Each gains a Postgres implementation behind the same port and the same conformance suite. E-009 also
  gains the item ADR-0057 anticipated: the `ChangeEvent` job payload now crosses a **real broker**, so
  its serialization stability is a live contract rather than a prediction.
- **E-026 (docs generated inputs).** `.env.example` → `generated/env-reference.json`, regenerated in the
  same increment; `compose-doc-drift` is now load-bearing for every compose edit; `link-check` covers the
  two new pages; `prose-counts` and the F-092 contrast constraint are traps to route around.
- **E-005 (gates ↔ CI mirror).** **No `gates.json` change** — the smoke is a CI *job*. Record the
  reasoning in the effect note so a future reader does not read the absence as an oversight, and record
  the `deploy` gate as the named, measured follow-up.
- **Decisions:** ADR-0059 (new) closes ADR-0026 §Follow-ups (lines 53-55), ADR-0027 §Follow-ups (line 48),
  and ADR-0035 §Follow-ups (lines 70-72); it extends ADR-0057's threat model to a real broker.

## Test plan

**Red before green.** Before touching `src/`, write `packages/config/tests/integration/self-hosted-profile.test.ts`
against the intended surface (`createRuntime(loadConfig({ TESSERA_PROFILE: 'self-hosted', … }))`) and
capture its failure at HEAD — it will be the literal `InternalError: deployment profile "self-hosted"
is not wired yet (self-hosted/cloud: F-023)` from `local.ts:222-226`. That message *is* the feature's
premise; put it in `progress.md` and the increment-8 commit message. Never commit it red.

**Conformance — the heart of clause 1.** Every new adapter runs the **existing, unmodified** shared
suite, guarded:

| Adapter | Suite | Guard |
|---|---|---|
| PG MemoryStore | `runMemoryStoreConformance` (14 cases incl. tenant + project isolation) | `TESSERA_TEST_POSTGRES=1` |
| PG GraphStore | `runGraphStoreConformance` (incl. `get_effects`) | same |
| PG keyword / temporal | `runRetrieverConformance` + the adapters' scope tests | same |
| PG project store | `apps/api/src/projects/store.conformance.ts` | same |
| PG source registry | `packages/ingestion/src/sources/registry.conformance.ts` | same |
| PG token store / audit log | the existing sqlite adapters' unit suites, re-pointed | same |
| S3 blob | `runBlobConformance` (incl. the traversal case) | `TESSERA_TEST_S3=1` |
| BullMQ | `runQueueConformance` (+ the new `settle` hook) | `TESSERA_TEST_REDIS=1` |

**If a shared suite has to change to accommodate an adapter, that is a finding, not a task** — the only
sanctioned change is the Queue harness hook (D5), argued above.

**Unit (offline, in the default gate)**
- SigV4 signer against the published AWS test-suite vectors + a MinIO example: canonical request,
  string-to-sign, signature, and URI encoding of a key containing `/`, a space, and a non-ASCII char.
- `withPgAdvisoryLock` / `runMigrations` idempotence — SQLite path offline, PG path guarded.
- `schema.test.ts`: `storage` defaults; `profile: 'self-hosted'` **without** `postgresUrl` throws with a
  message naming the key; with all three it parses; `TESSERA_DATABASE_URL` wins over `DATABASE_URL`;
  `configFromEnv` maps every new var.
- `createRuntime` selects local for `local` and **does not** load `self-hosted.js` (assert via a module
  registry probe or by asserting `bullmq` is absent from the loaded set — this is the
  local-stays-dependency-free proof).

**Integration — the real profile (guarded, `test` gate)**
`self-hosted-profile.test.ts` boots `createRuntime` against the compose services in a throwaway schema
and replays `local-profile.test.ts`'s journey: capture a memory and read it back; assert an effect link;
index and search; put a fragment and compile it under budget. Plus: a second runtime in a *different*
tenant sees none of it (the isolation guarantee, now over Postgres).

**Regression — the load-bearing part of increment 8.** `local-profile.test.ts`, `runtime-sources`,
`runtime-indexing`, `runtime-graph`, `runtime-ingestion-scope`, all of `packages/{memory,knowledge-graph,
retrieval,storage}`, `apps/{api,mcp}` e2e, `tests/e2e-full` and `tests/bench` stay green **untouched**
except for the mechanical `await`s of increment 6. Any other edit means the assembler extraction was not
behaviour-preserving.

**Deploy smoke (clause 2)** — D8, step by step. Assertions are product-level, not container-level: the
only thing that makes step 5 pass is every adapter working together.

**CI (clause 3)** — the `deploy-smoke` job runs the same script; `release.yml` is validated by a dry-run
tag build once a remote is reachable (ADR-0055 notes there is now an `origin`).

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
pnpm -w test:perf          # after the next.config standalone change (increment 9)
```

Targeted during the loop:

```
docker compose up -d postgres redis minio
TESSERA_TEST_POSTGRES=1 TESSERA_TEST_REDIS=1 TESSERA_TEST_S3=1 pnpm --filter @tessera/storage test
TESSERA_TEST_POSTGRES=1 pnpm --filter @tessera/memory test
TESSERA_TEST_POSTGRES=1 pnpm --filter @tessera/knowledge-graph test
TESSERA_TEST_POSTGRES=1 pnpm --filter @tessera/retrieval test
TESSERA_TEST_POSTGRES=1 pnpm --filter @tessera/config test
pnpm --filter @tessera/docs generate     # after any .env.example / compose edit
pnpm --filter @tessera/docs test         # drift + link-check + prose-counts + compose-drift
pnpm --filter @tessera/deploy-smoke smoke
```

**Run the guarded suites both ways** — with the services up *and* with them down. A machine without
Docker must stay green, or the F-023 guarantee is broken.

**Evidence for `progress.md`:** per-gate pass counts; the captured `InternalError` red-before; the
guarded conformance counts *with the guards on* (the number that proves the adapters actually ran, not
skipped); the smoke's step-by-step output including the scan poll count; the image sizes; and — per the
progress-log precedent — an honest note on any recurrence of the parallel-e2e intermittent.

## Risks / open questions

- **OQ-1 — ADR required before coding (increment 0).** ADR-0059 decides D1 (profile split + dynamic
  import), D3 (migrations, not ad-hoc DDL, under an advisory lock), D5 (**hand-rolled SigV4 vs
  `@aws-sdk/client-s3`** — a genuine dependency decision, and the security rule makes any new
  credential-handling path ADR-worthy), D6 (an async port change), D7 (base image / registry — the
  question ADR-0035 deferred here), and `cloud` mapping to the self-hosted adapter set. Its **threat
  model** must state: the deployment now holds three sets of external credentials; every blob read is a
  network call; and — closing ADR-0057's open item — **the queue is now a real broker, so a party with
  Redis access can enqueue a job claiming any tenant's scope**. The proportionate mitigation for
  self-hosted is that Redis is inside the deployment's trust boundary (authenticated, never published
  beyond loopback in compose, never internet-exposed) — *documented, with worker-side registry
  validation named as the next control if that assumption ever weakens*. Do not build it here.
- **OQ-2 — the split.** See the Scope guard. Needs the lead's decision before increment 9 (it changes
  `feature_list.json`, which `wip_limit` governs). Proposal: F-056 = increments 0-8; **F-093**
  (`must`, R4, `blockedBy: [F-056]`) = increments 9-13. F-092 is currently the highest id.
- **Compile latency over S3 is unmeasured and ungated.** The compiler resolves a fragment per candidate
  through the blob-backed `FragmentSource`; on the filesystem that is a local read, on S3 it is a
  network round-trip each. NFR-4 wants compile p95 < 2s, and the `perf` gate boots the **Local** runtime
  only — so it cannot see this. **Measure it in the smoke and record the number.** A small in-process
  LRU in `createBlobFragmentSource` is the obvious mitigation; do not build it speculatively.
- **`pnpm deploy --legacy` in a pnpm 9 symlinked workspace** is the single most likely place increment 9
  stalls. Verify it once, on the server image, before writing three more Dockerfiles against it.
- **Image size and the model.** `better-sqlite3` + `onnxruntime-node` + a baked ~90MB model make the
  server image large (expect 1.5–2.5 GB). That is the honest cost of shipping local embeddings; state
  the number in the guide rather than discovering it in a customer's registry quota.
- **The compose fence is ~120 lines of MDX.** Byte-pinned by `compose-doc-drift.test.ts`. If the page
  becomes unreadable, the correct response is to **change the gate deliberately** (compare a named
  excerpt) in its own commit with its own reasoning — never to silence it.
- **The disclosed parallel-e2e intermittent** (progress.md:106-116). This feature adds Docker-bound work
  to CI; keeping the smoke out of `turbo run test:e2e` (D8) is partly *because* of it. If it recurs,
  record it; do not silently retry.
- **Postgres `tsvector` ranking differs from FTS5 `bm25`.** The conformance asserts ordering and scoping,
  not scores, so parity holds where it is contracted — but a self-hosted deployment's keyword ranking is
  genuinely not byte-identical to a local one. Say so in the deployment guide rather than implying the
  two are interchangeable down to the rank.
- **`apps/cli`** — verify whether `tessera init` / `tessera serve` assume the local profile before
  assuming they do not. A pass-through fix is in scope; a `--profile self-hosted` init flow is not.
- **Scope creep to refuse:** Kubernetes/Helm charts; npm publishing (**F-059**); arm64 images; a
  `tessera-migrate` bin; per-tenant blob keys (**F-075**); cloud metering (**F-057**); the F-092 shiki
  contrast fix; a distributed rate-limiter/quota store; blob read caching without a measurement.
