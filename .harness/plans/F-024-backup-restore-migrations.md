# Plan: F-024 — Backup/restore + migration system

- **Feature:** F-024 · **Requirements:** FR-56 · **Package:** `@tessera/storage`
- **ADRs:** **0027 (new — migration runner + local backup/restore)**; relates to ADR-0003/0005/0026
- **Author:** Claude · **Date:** 2026-07-03 · **Verification:** typecheck · lint · test

## Intent
Give the storage layer a **versioned migration runner** and **backup/restore** for the local stores
(FR-56), so schema/data evolves safely and a deployment can snapshot + recover. Backend-agnostic where it
matters (the migration runner works on SQLite **and** Postgres).

## Scope (acceptance is the contract)
- **In:**
  - **Migration runner** — `runMigrations(db, migrations)` applies ordered `{ id, up }` migrations
    **idempotently**, tracking applied ids in a `_tessera_migrations` table; a small `MigrationDb` seam with
    `sqliteMigrationDb` / `postgresMigrationDb` adapters (works on both backends).
  - **Backup/restore (local stores)** — SQLite **online backup** (`backupSqlite`) + `restoreSqlite`
    (file copy); recursive **filesystem/blob** `backupDirectory` / `restoreDirectory`.
  - Tests: migration apply/idempotent/order/tracking (SQLite; Postgres env-guarded), backup round-trips
    (SQLite + directory). ADR-0027.
- **Deliberately out (noted honestly):** **Postgres physical backup** via `pg_dump`/managed snapshots — an
  ops/deployment concern (CLI dep), documented not built; adopting the runner to replace the ad-hoc
  `CREATE TABLE IF NOT EXISTS` in the memory/graph adapters (a later migration); point-in-time/incremental
  backup; a scheduler. No new runtime deps (SQLite backup via better-sqlite3, copies via `node:fs`).

## Files to touch
- `packages/storage/src/migrations/runner.ts` — `Migration`, `MigrationDb`, `sqliteMigrationDb`,
  `postgresMigrationDb`, `runMigrations`.
- `packages/storage/src/backup/backup.ts` — `backupSqlite`/`restoreSqlite`, `backupDirectory`/`restoreDirectory`.
- `packages/storage/src/index.ts` — export both.
- `packages/storage/tests/integration/migrations.test.ts` — SQLite runner + env-guarded Postgres.
- `packages/storage/tests/integration/backup.test.ts` — SQLite + directory round-trips.
- `docs/adr/0027-*.md` + ADR index.

## Anticipated effects
- **E-001 / E-007** (storage): additive — a migration runner + backup/restore utilities over the existing
  stores; no port change, no consumer break.

## Verification
`node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test`
(migration/backup round-trips; Postgres migration parity via `TESSERA_TEST_POSTGRES=1` against the running
container) · `pnpm build`.

## Risks
- **Backend SQL differences** → the runner uses only portable DDL/DML; migration `up` is caller-supplied SQL.
- **Migration id injection** → ids validated to a safe pattern (developer-controlled, but constrained).
- **Restore safety** → restore is file/dir copy with the target store closed; documented.
