---
id: plugin-sdk-envelope-over-ports
kind: lesson
title: A plugin SDK is a uniform envelope over existing ports — don't re-define them; dogfood + isolate
links:
  - packages/plugin-host/src/domain.ts
  - packages/plugin-host/src/host.ts
  - docs/adr/0020-plugin-sdk-and-host.md
confidence: 0.85
created: 2026-06-29
---

**What happened:** F-013 added the Plugin SDK + host for the five extension points (connector /
processor / ai-provider / storage-backend / retrieval-strategy). The contracts for those points
**already existed as ports** (ingestion Connector/Processor, ai Embeddings, storage ports, retrieval
Retriever). The clean move was to make the Plugin SDK a **uniform envelope** — `Plugin<TConfig,
TCapability>` = manifest (+ Zod config schema) + `setup → capability`, where the **capability is the
existing port** — rather than re-defining plugin-specific interfaces (which would duplicate and drift).

**How to apply:**
- For a plugin/extension system over code that already has ports, **wrap, don't re-define**: the
  plugin's `capability` type *is* the existing port. The SDK adds identity + config validation +
  lifecycle, nothing more.
- **Dogfood without cycles:** put the first-party plugin wrappers in the host package so it depends on
  the domain packages **one-way**; don't make domain packages depend on the host (that needs a
  separate contracts-only package, deferred). This proves "first-party uses the same contract as third
  parties" without touching verified code.
- **Failure isolation (FR-58):** the host catches config-validation + setup/lifecycle errors, marks
  the plugin `failed` with the message, and **never throws out** or stops other plugins — only an
  *unknown id* throws (a programming error). A bad plugin must not crash startup.
- **Heterogeneous registry typing:** accept `Plugin<C, T>` generically at `register`, store it
  type-erased behind a **single localized cast** (`as unknown as Plugin<unknown, unknown>`) — the host
  validates config via the plugin's own schema, so the erased handling is safe. No `any`.

Related: [[composition-root-type-only-and-fake-provider]] (the runtime that may later wire adapters via
the host), [[adapter-parity-shared-pure-core]] (ports & shared cores).
