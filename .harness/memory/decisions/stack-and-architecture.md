---
id: stack-and-architecture
kind: decision
title: Locked stack & architecture for Tessera
links:
  - docs/adr/0001-architecture-modular-monolith-in-turborepo.md
  - docs/adr/0002-backend-framework-fastify.md
  - docs/adr/0003-local-first-cloud-ready-ports-and-adapters.md
  - docs/adr/0004-context-compilation-over-naive-rag.md
  - docs/adr/0005-orm-drizzle.md
  - docs/adr/0006-embeddings-and-vector-store.md
  - docs/adr/0008-brand-tessera-and-package-scope.md
confidence: 1.0
created: 2026-06-27
---

Tessera (`@tessera/*`, codename ContextOS) is a **modular monolith** in a **Turborepo +
pnpm** monorepo (ADR-0001), backend **Node 22 LTS + Fastify + TypeScript** (ADR-0002),
**local-first / cloud-ready via ports & adapters** (ADR-0003). The core is **context
compilation, not naive RAG** (ADR-0004). Data layer **Drizzle** (ADR-0005); **embeddings**
local-default via Transformers.js (Ollama/hosted optional) and **vector store** sqlite-vec
(local) → pgvector (cloud) (ADR-0006). Brand **Tessera** (ADR-0008).

This memory is the short, linkable "what we decided"; each ADR holds the full "why,
alternatives, consequences." Deviating from any of these requires a **new superseding ADR**
(see [`../../governance/adr-policy.md`](../../governance/adr-policy.md)). Full design:
[`../../../docs/architecture/ARCHITECTURE.md`](../../../docs/architecture/ARCHITECTURE.md).
