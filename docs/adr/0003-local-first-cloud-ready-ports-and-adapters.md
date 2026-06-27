# ADR-0003: Local-first, cloud-ready via ports & adapters

- **Status:** Accepted
- **Date:** 2026-06-27 (ratified; originally agreed 2026-06-25)
- **Deciders:** Project lead, Claude
- **Tags:** architecture, storage, deployment

## Context

Tessera must run identically as Local, Self-Hosted, Managed Cloud, and Enterprise.
The product promise is that **deployment is configuration, not a fork**. The risk is
building four divergent codebases, or coupling the domain to a specific database /
queue / blob store / model provider so the local and cloud builds drift apart.

## Decision

We will apply **hexagonal architecture (ports & adapters)**. The domain defines
**ports** (interfaces); infrastructure provides **adapters** selected at runtime by
configuration. Minimum port set:

| Port | Local adapter | Cloud adapter |
|------|---------------|---------------|
| Relational store | SQLite | PostgreSQL |
| Vector store | sqlite-vec | pgvector |
| Object/blob store | local filesystem | S3-compatible |
| Queue / jobs | in-process | Redis + BullMQ |
| Embeddings | Transformers.js / Ollama | hosted provider (optional) |
| LLM | local (optional) | hosted provider |
| Secrets | env / file | KMS / vault |
| Auth | none / local | OIDC + RBAC |

The **same domain code** runs everywhere; a deployment **profile** wires adapters.
We default to the local adapters so a developer gets a working system with zero
external services.

## Consequences

### Positive
- One codebase, four deployment modes; local dev mirrors production semantics.
- Adapters are independently testable; the domain is testable with in-memory fakes.
- New backends (a different vector DB, a new model host) are additive, not invasive.

### Negative / Costs
- Up-front interface design discipline; an over-narrow port leaks the underlying tech,
  an over-wide one is hard to implement for every adapter.
- Some capabilities differ across adapters (e.g. SQL features); the port must expose a
  least-common-denominator plus capability flags.

### Neutral / Follow-ups
- Capture cross-cutting "effect-links" at the domain layer so they survive adapter
  swaps.
- A conformance test suite must run against every adapter to guarantee parity.

## Alternatives considered

- **Direct ORM/SDK calls throughout the domain** — fastest initially, but couples the
  whole system to one stack and breaks the deployment-agnostic promise. Rejected.
- **Separate local vs cloud builds** — guarantees drift and doubled maintenance.
  Rejected.

## References

- [ADR-0001](0001-architecture-modular-monolith-in-turborepo.md),
  [ADR-0005](0005-orm-drizzle.md), [ADR-0006](0006-embeddings-and-vector-store.md),
  `docs/architecture/ARCHITECTURE.md`.
