---
id: verify-cloud-adapter-env-guarded-against-a-container
kind: lesson
title: Bring a cloud adapter to port-parity via the shared conformance suite, env-guarded and verified against a container
links:
  - packages/storage/src/adapters/postgres-relational/index.ts
  - packages/storage/src/adapters/pgvector/index.ts
  - packages/storage/tests/integration/pgvector.test.ts
  - docker-compose.yml
  - docs/adr/0026-postgres-pgvector-adapters.md
confidence: 0.9
created: 2026-07-03
---

**What happened:** F-023 added the Postgres + pgvector adapters (the cloud/self-hosted counterparts of the
local SQLite / sqlite-vec ones). Three choices made it clean and honestly verified:

1. **Port-parity via the *shared* conformance suite.** The new adapters implement the same
   `RelationalStore` / `VectorStore` ports and are validated by the **exact same** `runRelationalConformance`
   / `runVectorConformance` suites the SQLite adapters use — so "does the cloud backend behave identically?"
   is answered by the suite, not by re-reasoning. No port or consumer changed.
2. **Env-guarded so the offline gate stays green.** A cloud adapter needs a live server, which CI/dev may
   not have. Gate the integration tests behind an env flag (`TESSERA_TEST_POSTGRES=1` + `DATABASE_URL`) with
   `describe.skipIf` — **skipped by default** (the same pattern used for the transformers/ollama adapters).
   The workspace `test` gate stays fully green offline; the guarded suite runs on demand.
3. **Verify for real against a Docker Compose service.** A `docker-compose.yml` with the
   `pgvector/pgvector:pg16` image is the self-hosted stack *and* the test target:
   `docker compose up -d --wait postgres` then `TESSERA_TEST_POSTGRES=1 pnpm --filter … test` runs the guarded
   conformance green — real evidence, not assertion (the harness's bar for a `must`).

Adapter details worth reusing: implement pgvector with **raw SQL** (a `vector(N)` column, `<->`/`<=>`
operators, `$n::vector` text literals) rather than adding a `pgvector` npm helper — one dependency (`pg`)
instead of two, consistent with the minimal-deps ethos. Create the extension/table **lazily**, validate any
interpolated identifier (table name), and validate vector dimension before the query.

**How to apply:**
- When adding a second backend for an existing port, make it pass the **same conformance suite** — that IS
  the parity proof; don't fork the tests.
- Guard external-service integration tests behind an env flag and skip by default; keep a one-command way to
  stand the service up (Compose) and run them for real.
- Prefer raw SQL + one driver over pulling a helper lib for a thin capability; create schema lazily and
  validate interpolated identifiers.
- Docker Hub's CDN (`production.cloudfront.docker.com`) DNS can fail intermittently on a first pull — retry
  the pull before concluding the environment can't reach the registry.
