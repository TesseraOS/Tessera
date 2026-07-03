# ADR-0027: Backup/restore + a versioned migration runner

- **Status:** Accepted
- **Date:** 2026-07-03
- **Deciders:** Project lead, Claude
- **Tags:** storage, migrations, backup, operations

## Context

FR-56 requires **backup & restore** and a **migration system for schema/data**. The storage layer
(ADR-0003/0005) has SQLite (local) and Postgres (F-023) RelationalStores; tables are currently created
ad-hoc (`CREATE TABLE IF NOT EXISTS`) inside adapters. We need a versioned way to evolve schema/data and a
way to snapshot + recover the local stores.

## Decision

**Add a small, backend-agnostic migration runner and file-level backup/restore for the local stores — no
new dependencies, no port change.**

- **Migration runner** (`runMigrations(db, migrations)`): applies ordered `{ id, up }` migrations
  **idempotently**, recording applied ids in a `_tessera_migrations(id, applied_at)` table and skipping
  ids already present. Migration `up` is caller-supplied portable SQL; ids are constrained to a safe
  identifier pattern (they're interpolated). A minimal `MigrationDb` seam with `sqliteMigrationDb` /
  `postgresMigrationDb` adapters makes it work on **both** SQLite and Postgres. Migrations apply
  individually (not one wrapping transaction) — each should be safe to re-run after a partial failure.
- **Backup/restore** for the local stores: `backupSqlite` uses SQLite's **online backup** (consistent
  single-file snapshot, safe while in use) + `restoreSqlite` (file copy, clearing stale WAL/SHM);
  `backupDirectory`/`restoreDirectory` recursively copy the filesystem blob store. Implemented with
  `better-sqlite3` + `node:fs` — no new deps.

Conformance is offline (SQLite in-memory / temp dirs); Postgres migration parity is **env-guarded**
(`TESSERA_TEST_POSTGRES=1`, verified against the F-023 Compose container).

## Consequences

### Positive
- A real, versioned, idempotent migration mechanism that runs on both backends; snapshot/recover for the
  local stores. Fully offline-verifiable; no new dependencies.

### Negative / Costs
- The runner is not a full framework (no down-migrations, no drizzle-kit generation) — deliberate: forward,
  idempotent migrations cover the need; a richer tool can wrap the same `_tessera_migrations` table later.
- `restoreSqlite` requires the target DB closed (documented).

### Neutral / Follow-ups
- **Postgres physical backup** (`pg_dump` / managed snapshots) is an **ops/deployment concern** (CLI dep) —
  documented, not built here.
- Adopting the runner to replace the adapters' ad-hoc `CREATE TABLE IF NOT EXISTS` (memory/graph schemas)
  is a later migration; the mechanism is now available.
- Incremental/point-in-time backup and a scheduler are out of scope.

## Alternatives considered

- **drizzle-kit migrations** — needs defined Drizzle schemas (tables are ad-hoc today); heavier than the
  need. The lightweight runner is enough now and can coexist with drizzle-kit later.
- **A `pg_dump`/`sqlite3`-CLI backup** — adds a runtime CLI dependency; the SQLite online-backup API +
  directory copy keep it dependency-free for the local default (physical Postgres backup stays an ops concern).

## References

- FR-56; [ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md) (ports & adapters),
  [ADR-0005](0005-orm-drizzle.md) (Drizzle), [ADR-0026](0026-postgres-pgvector-adapters.md). Effects `E-001`/`E-007`.
