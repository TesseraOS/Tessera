---
id: enum-driven-contract-additive-variant
kind: lesson
title: Derive downstream validation/typing from one source-of-truth enum so a new variant is purely additive
links:
  - packages/retrieval/src/domain.ts
  - apps/api/src/schemas/common.ts
  - apps/web/components/provenance/signal-badge.tsx
  - packages/retrieval/src/adapters/temporal-retriever.ts
confidence: 0.85
created: 2026-07-02
---

**What happened:** F-018 added a fifth retrieval signal (`temporal`) to `@tessera/retrieval`. The only
production code change to *add the kind* was one array entry: `RETRIEVER_KINDS = [… , 'temporal']`.
Every consumer absorbed it with **zero edits** because each was built to derive from that single
constant rather than restate it:

- **API validation** — `retrieverKindSchema = z.enum(RETRIEVER_KINDS)`. Deriving the Zod enum from the
  constant means the request/response schema (and OpenAPI) picked up `temporal` automatically.
- **Compiler** — treats `RetrieverKind` as an **opaque tag** (`signals: RetrieverKind[]`, a set/dedup),
  never an exhaustive `switch`. A new member can't make it non-exhaustive.
- **Web** — `SignalBadge` used a `Record<string, string>` lookup **with a fallback** (`?? 'bg-muted'`)
  and typed the field as `string`, so an unknown signal renders gracefully; it even pre-mapped
  `temporal → --chart-5`.

Contrast the anti-pattern: re-listing the members in each consumer (a hand-written union, a `switch`
with no default, a hard-coded array) — each of which would need editing and could silently drift.

**How to apply:**
- Define a shared closed set **once** as `const X = [...] as const` + `type = typeof X[number]`, and
  make every consumer *derive*: `z.enum(X)` for validation, `Record<Kind, …>` (or a fallback lookup)
  for presentation, and opaque tags (no exhaustive `switch` without a `default`) where a value is just
  carried through.
- Then adding a variant is additive by construction — audit the consumers once to confirm none restate
  the set, and let the gates prove it. (For a fifth adapter, also reuse the sibling's shape: the temporal
  retriever mirrored the keyword retriever's owned-SQLite-index pattern, so it fit the conformance suite
  and the profile wiring with no new concepts.)
