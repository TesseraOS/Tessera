# Memory index

One line per memory entry. Keep newest-relevant at top of each section.

## Decisions
- [stack-and-architecture](decisions/stack-and-architecture.md) — the locked stack & architecture, linking ADRs 0001–0008.

## Lessons
- [turbo-cache-stale-uncommitted](lessons/turbo-cache-stale-uncommitted.md) — turbo gave false-green on uncommitted changes; gate tasks now `cache: false`.
- [gitignore-broad-dir-hid-package](lessons/gitignore-broad-dir-hid-package.md) — bare `storage/` ignore rule excluded the whole `packages/storage` package; anchor ignore patterns + verify `git ls-files`.

## Architecture
_(none yet — see [`../../docs/architecture/ARCHITECTURE.md`](../../docs/architecture/ARCHITECTURE.md) for the full picture)_

## Glossary
_(canonical terms live in [`../../docs/glossary.md`](../../docs/glossary.md); add focused entries here only when a term needs more than a one-line definition)_
