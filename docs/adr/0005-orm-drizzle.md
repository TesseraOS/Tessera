# ADR-0005: ORM / query layer — Drizzle

- **Status:** Accepted
- **Date:** 2026-06-27
- **Deciders:** Project lead, Claude
- **Tags:** storage, backend

## Context

Per [ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md), the relational
store is **SQLite locally** and **PostgreSQL in the cloud**, behind a port. We need a
TypeScript data layer that: targets both SQLite and Postgres from one schema, stays
thin enough to coexist with raw SQL (for vector ops via sqlite-vec / pgvector and for
recursive graph queries), gives end-to-end type inference, and ships a first-class
migration story. This was the open "Drizzle vs Prisma" question.

## Decision

We will use **Drizzle ORM** with **drizzle-kit** migrations, behind our storage port.

- One schema definition; **dialect-specific** builds for SQLite and Postgres where they
  legitimately differ (kept inside adapters, not the domain).
- Drizzle's SQL-first model lets us drop to raw/partial SQL for vector similarity and
  recursive CTE graph traversals without fighting an abstraction.
- Types are inferred from schema → no codegen step in the dev loop.

## Consequences

### Positive
- Lightweight, fast, no heavy runtime/engine; excellent TS inference.
- Plays well with the multi-dialect, raw-SQL-when-needed reality of vector + graph work.
- Migrations are explicit SQL we can review and reason about.

### Negative / Costs
- Less "batteries-included" than Prisma (no Studio-equivalent by default; fewer guardrails).
- Multi-dialect parity (SQLite vs Postgres types/features) is our responsibility, tested
  via the storage adapter conformance suite.

### Neutral / Follow-ups
- Provide a thin repository layer over Drizzle so the domain depends on the **port**, not
  on Drizzle types directly (keeps [ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md) intact).

## Alternatives considered

- **Prisma** — great DX and tooling, but historically heavier (engine binary, codegen),
  and raw SQL / multi-dialect vector & recursive-graph work is more awkward. Closer than
  it used to be, but Drizzle fits our SQL-first, dual-dialect needs better.
- **Kysely** — superb typed query builder, but we also want schema + migrations in one
  tool; Drizzle covers both.
- **Raw SQL only** — maximal control, too much boilerplate and footguns for the breadth
  of the schema.

## References

- [ADR-0003](0003-local-first-cloud-ready-ports-and-adapters.md),
  [ADR-0006](0006-embeddings-and-vector-store.md).
