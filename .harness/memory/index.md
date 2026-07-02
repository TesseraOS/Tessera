# Memory index

One line per memory entry. Keep newest-relevant at top of each section.

## Decisions
- [stack-and-architecture](decisions/stack-and-architecture.md) — the locked stack & architecture, linking ADRs 0001–0008.

## Lessons
- [sse-test-real-socket-and-subscribe-before-handshake](lessons/sse-test-real-socket-and-subscribe-before-handshake.md) — test SSE/streaming endpoints over a real socket (not `app.inject`), and subscribe to the event source before writing the opening frame so no event is lost during setup.
- [cache-key-must-fingerprint-every-output-affecting-input](lessons/cache-key-must-fingerprint-every-output-affecting-input.md) — a reproducibility/cache key must hash every output-affecting input AND each pluggable strategy's `id` (normalized: effective defaults, sorted lists); a too-narrow key silently serves stale results.
- [surface-new-behavior-via-existing-explainability-field](lessons/surface-new-behavior-via-existing-explainability-field.md) — make new stage behavior (e.g. compiler compression) visible through an existing `whyIncluded`/trace channel instead of a new cross-package schema field, so the change stays in one package.
- [enum-driven-contract-additive-variant](lessons/enum-driven-contract-additive-variant.md) — derive downstream validation/typing (`z.enum(CONST)`, opaque tags, fallback lookups) from one source-of-truth enum so adding a variant (e.g. the temporal signal) ripples nowhere.
- [auto-extraction-structural-memory-seam](lessons/auto-extraction-structural-memory-seam.md) — feed one package's output into another (ingestion→memory) via a structural interface + an additive `DocumentSink` decorator (no dep/cycle); key auto-records on a stable `source` id for idempotency.
- [fair-deterministic-eval-design](lessons/fair-deterministic-eval-design.md) — design "beats baseline" evals so the system wins for attributable reasons, with deterministic backends; assert component wins not just the aggregate.
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
