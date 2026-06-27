# Rule: Engineering (common)

Applies to all code. Production-grade only — no toy code, PoC, or hacky shortcuts.

## Correctness & boundaries
- **Validate at boundaries.** Every external input (HTTP, MCP, plugin, file, env) is
  validated before use (Zod or schema). Never trust the caller.
- **Fail loud, fail typed.** Use typed domain errors; no silent `catch {}`; no swallowing.
- **No `any` smuggling.** Prefer precise types; if a cast is unavoidable, isolate and
  comment it.

## Architecture discipline
- **Respect ports & adapters** ([ADR-0003](../../../docs/adr/0003-local-first-cloud-ready-ports-and-adapters.md)).
  Domain code depends on **ports**, never on a concrete DB/SDK/provider.
- **Respect module boundaries** ([ADR-0001](../../../docs/adr/0001-architecture-modular-monolith-in-turborepo.md)).
  Import via published package interfaces or the event bus; never reach into another
  package's internals.
- **Reuse before adding.** Search for an existing port/util/type before writing a new one.

## Change hygiene
- **Small, reversible, single-purpose changes.** One feature at a time; no drive-by
  refactors mixed into a feature.
- **No dead code, no commented-out blocks, no TODO without a tracked follow-up.**
- **Keep it green.** Don't leave the build/typecheck/tests broken between increments.

## Quality
- Clear names; functions do one thing; comments explain *why*, not *what*.
- Match the surrounding code's style and idioms.
- Performance matters but **correctness and clarity first**; optimize with evidence.
