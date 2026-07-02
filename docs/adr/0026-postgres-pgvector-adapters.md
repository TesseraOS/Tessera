# ADR-0026: Postgres + pgvector storage adapters (self-hosted/cloud) + Docker Compose

- **Status:** Accepted
- **Date:** 2026-07-03
- **Deciders:** Project lead, Claude
- **Tags:** storage, postgres, pgvector, adapters, deployment, dependencies

## Context

FR-51 requires **Postgres + pgvector** for the self-hosted/cloud deployment. The storage layer was built
local-first (ADR-0003): `RelationalStore` and `VectorStore` **ports** with SQLite / sqlite-vec adapters,
each validated by a **shared conformance suite** — and both ports were written explicitly anticipating
"later postgres, pgvector." Drizzle is the ratified query layer (ADR-0005); the vector store records the
embedding model per vector (ADR-0006).

Verifying Postgres adapters needs a running Postgres, which was unavailable until Docker Desktop was
installed. The decision is the **driver, the pgvector integration shape, the test strategy, and the stack**.

## Decision

**Add two adapters under the existing ports plus a Docker Compose stack — no port or consumer change.**

- **Postgres `RelationalStore`** (`createPostgresStore`) over **node-postgres (`pg`) + `drizzle-orm/node-postgres`**,
  exposing a Drizzle `db` handle exactly like the SQLite adapter (migrate/healthcheck/close).
- **pgvector `VectorStore`** (`createPgVectorStore`) over Postgres + the pgvector extension via **raw SQL**:
  a `vector(N)` column, kNN with the metric's operator (`<->` L2 / `<=>` cosine), vectors passed as
  `$n::vector` **text literals**. **No extra `pgvector` npm dependency** — only `pg` is added — consistent
  with the minimal-deps ethos (cf. ADR-0024 preferring `fetch` over Octokit). The extension + table are
  created lazily; the table name is constrained to an identifier pattern (it's interpolated, not
  parameterizable).
- Both adapters pass the **same** `runRelationalConformance` / `runVectorConformance` suites, proving port
  parity with SQLite.
- Conformance is **env-guarded** (`TESSERA_TEST_POSTGRES=1` + `DATABASE_URL`), **skipped by default** (the
  F-005 transformers/ollama pattern), so the offline gate stays green. Verified green against the Compose
  `pgvector/pgvector:pg16` service.
- **`docker-compose.yml`** provides the `postgres` service (pgvector image, healthcheck, volume) — the
  self-hosted stack.

## Consequences

### Positive
- Cloud/self-hosted storage backends without touching the ports or any consumer; the shared conformance
  suite guarantees behavioral parity with SQLite.
- Verified against a **real** pgvector database; the default `test` gate stays offline-green (guarded).
- Only one new runtime dependency (`pg`); pgvector used through SQL, not another library.

### Negative / Costs
- The guarded conformance requires Docker (kept opt-in); intermittent Docker Hub CDN DNS flakiness can make
  the first image pull need a retry.
- `pg` is a new runtime dependency of `@tessera/storage`.

### Neutral / Follow-ups
- A full **self-hosted config profile** also needs Postgres-backed **graph/memory** stores (the current
  graph/memory adapters are SQLite-specific), so `createLocalRuntime` still throws for non-local until those
  land — F-023 delivers the storage adapters + stack that a later profile composes (E-014).
- Backup/restore + migrations = **F-024**; connection pooling/tuning, TLS, and managed-cloud specifics are
  deployment concerns.

## Alternatives considered

- **`pgvector` npm helper** — rejected: a `$n::vector` text literal is sufficient and avoids a dependency.
- **`postgres` (postgres.js) driver** — `pg` + `drizzle-orm/node-postgres` is the mainstream Drizzle path
  and keeps parity with the ratified query layer (ADR-0005).
- **Testcontainers / an embedded Postgres** — heavier; a plain Compose service + env-guarded tests is
  simpler and mirrors the existing guarded-adapter pattern.

## References

- FR-51; [ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md) (ports & adapters, conformance),
  [ADR-0005](0005-orm-drizzle.md) (Drizzle), [ADR-0006](0006-embeddings-and-vector-store.md) (vector store).
  Effects `E-001` / `E-007`.
