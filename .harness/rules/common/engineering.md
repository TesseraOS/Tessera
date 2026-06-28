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

## Simplicity & concrete standards (KISS / DRY / YAGNI)
Baseline conventions (informed by the [`coding-standards`](../../skills/coding-standards/SKILL.md)
skill). Readability first.
- **KISS** — the simplest design that meets the acceptance criteria; no cleverness for its own sake.
- **DRY** — eliminate real duplication; but don't over-abstract speculatively.
- **YAGNI** — build what the feature needs now, not anticipated futures.
- **Descriptive names** — `marketSearchQuery`, not `q`; no single-letter names outside tiny scopes.
- **Small functions** — aim ≤ ~50 lines; use **early returns** to cut nesting; one responsibility.
- **No magic values** — name constants; no unexplained literals.
- **Immutability at boundaries** — prefer pure updates (spread/derive) over in-place mutation of inputs.
- **Parallelize independent async** — `Promise.all` for independent awaits; never serialize needlessly.
- **Handle errors explicitly** — every `await`/IO has a deliberate failure path (typed errors).
