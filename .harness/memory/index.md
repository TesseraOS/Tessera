# Memory index

One line per memory entry. Keep newest-relevant at top of each section.

## Decisions
- [stack-and-architecture](decisions/stack-and-architecture.md) — the locked stack & architecture, linking ADRs 0001–0008.

## Lessons
- [hybrid-fusion-shared-ref-space](lessons/hybrid-fusion-shared-ref-space.md) — RRF fuses by rank (no score normalization); signals only combine when retrievers share a `ref` id space (an ingestion-wiring requirement).
- [adapter-parity-shared-pure-core](lessons/adapter-parity-shared-pure-core.md) — when multiple adapters must return identical results, share one pure ranking/selection function; the conformance suite then proves parity.
- [zod-exactoptional-bridge](lessons/zod-exactoptional-bridge.md) — Zod `.optional()` infers `T | undefined`, clashing with `exactOptionalPropertyTypes`; bridge in a mapper, don't loosen types.
- [ingestion-redaction-terminal-gate](lessons/ingestion-redaction-terminal-gate.md) — enforce security invariants (secret redaction) as a fixed terminal pipeline stage, not optional config; keep emitted source ASCII-clean.
- [turbo-cache-stale-uncommitted](lessons/turbo-cache-stale-uncommitted.md) — turbo gave false-green on uncommitted changes; gate tasks now `cache: false`.
- [gitignore-broad-dir-hid-package](lessons/gitignore-broad-dir-hid-package.md) — bare `storage/` ignore rule excluded the whole `packages/storage` package; anchor ignore patterns + verify `git ls-files`.

## Architecture
_(none yet — see [`../../docs/architecture/ARCHITECTURE.md`](../../docs/architecture/ARCHITECTURE.md) for the full picture)_

## Glossary
_(canonical terms live in [`../../docs/glossary.md`](../../docs/glossary.md); add focused entries here only when a term needs more than a one-line definition)_
