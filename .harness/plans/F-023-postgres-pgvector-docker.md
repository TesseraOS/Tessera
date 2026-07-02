# Plan: F-023 — Postgres + pgvector adapters + Docker Compose stack

- **Feature:** F-023 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-51
- **ADRs:** **0026 (new — Postgres + pgvector adapters, driver + Compose)**; relates to ADR-0003 (ports & adapters), 0005 (Drizzle), 0006 (embeddings/vector)
- **Package:** `@tessera/storage` (extend) · **Author:** Claude · **Date:** 2026-07-03
- **Verification:** typecheck · lint · test (keep format + build green). Postgres conformance is **env-guarded** (skipped without a DB); verified green against a real container.

## Intent
Deliver the **self-hosted/cloud** storage backends (FR-51): a **Postgres** `RelationalStore` and a
**pgvector** `VectorStore` that implement the *existing* storage ports and pass the *shared* conformance
suites, plus a **Docker Compose** stack that stands up Postgres+pgvector. "Done" = both adapters pass the
conformance suites against a real Postgres (via the Compose stack), with no change to the ports or any
consumer.

## Scope (acceptance is the contract — nothing more)
- **In:** `createPostgresStore` (pg + drizzle node-postgres) + `createPgVectorStore` (pgvector) under the
  storage ports; env-guarded conformance + adapter round-trip tests; `docker-compose.yml` (pgvector image);
  ADR-0026.
- **Deliberately out (noted honestly):** a full **self-hosted config profile** wiring Postgres end-to-end —
  that also needs Postgres-backed **graph/memory** stores (the sqlite graph/memory adapters are
  SQLite-specific), so `createLocalRuntime` keeps throwing for non-local until those land; F-023 delivers
  the storage adapters + stack that a later profile composes (E-014). Backup/restore/migrations = F-024.
  Connection pooling/tuning, TLS, and cloud-managed specifics = deployment concerns.

## Approach — mirror the SQLite adapters, share the conformance
The `RelationalStore` port is minimal (migrate/healthcheck/close); the SQLite adapter extends it with a
Drizzle `db`. The Postgres adapter does the same over `pg.Pool` + `drizzle-orm/node-postgres`. The
`VectorStore` port (upsert/query/delete/close + capabilities) is implemented with pgvector via **raw SQL**
(a `vector(N)` column; `<->` for L2 / `<=>` for cosine), formatting vectors as `'[a,b,c]'::vector` — **no
extra `pgvector` npm dep** (consistent with the minimal-deps ethos; only `pg` is added). The **same**
`runRelationalConformance` / `runVectorConformance` suites validate them, proving port parity with SQLite.

Postgres needs a reachable server, so the conformance tests are **env-guarded** (`TESSERA_TEST_POSTGRES=1`
+ `DATABASE_URL`, default `postgres://tessera:tessera@127.0.0.1:5432/tessera`) and **skipped by default** —
the same pattern F-005 used for transformers/ollama. I stand up the Compose stack and run them green for
evidence; the workspace default `test` gate stays green without Docker.

## Files to touch
- `packages/storage/src/adapters/postgres-relational/index.ts` — **new** `createPostgresStore`.
- `packages/storage/src/adapters/pgvector/index.ts` — **new** `createPgVectorStore` (lazy `CREATE
  EXTENSION vector` + table; upsert `ON CONFLICT`; kNN query; delete; dimension validation).
- `packages/storage/src/index.ts` — export both.
- `packages/storage/package.json` — add `pg` (runtime) + `@types/pg` (dev).
- `packages/storage/tests/integration/postgres-relational.test.ts` — env-guarded conformance + Drizzle round-trip.
- `packages/storage/tests/integration/pgvector.test.ts` — env-guarded conformance (unique table per harness; cleanup drops it).
- `docker-compose.yml` — a `postgres` service on `pgvector/pgvector:pg16` with creds/volume/healthcheck.
- `docs/adr/0026-*.md` + ADR index.

## Anticipated effects
- **E-001 / E-007** (storage ports ⇒ adapters + conformance): **realized** — the ports both already
  anticipate "later postgres, pgvector"; these adapters + the shared suites fulfil that. No port change, so
  no consumer breaks. Enables (does not yet build) the self-hosted profile branch on **E-014**.

## Test plan
- **Conformance (env-guarded, against the container):** Postgres relational (migrate idempotent, healthcheck
  true→false on close, close idempotent) + a Drizzle create/insert/select round-trip; pgvector (nearest-first
  with distance+model, respects k, upsert-replaces-id, delete, dimension-mismatch rejects, capabilities).
- **Default gate:** without the env, both suites skip → workspace `test` unaffected.

## Verification
`node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test`
(Postgres tests skip) · `pnpm build`. **Plus** the guarded evidence: `docker compose up -d postgres`, then
`TESSERA_TEST_POSTGRES=1 pnpm --filter @tessera/storage test` runs the Postgres+pgvector conformance green.

## Risks / open questions
- **Verification requires Docker** → now available (Docker Desktop installed); the Compose stack provides
  pgvector. Guarded tests keep the offline gate green.
- **pgvector extension availability** → the `pgvector/pgvector` image ships it; `CREATE EXTENSION IF NOT
  EXISTS vector` runs as the default superuser.
- **Driver choice** → `pg` (node-postgres) + `drizzle-orm/node-postgres` (Drizzle is the ratified query
  layer, ADR-0005); vectors via raw SQL to avoid an extra dep. Recorded in ADR-0026.
