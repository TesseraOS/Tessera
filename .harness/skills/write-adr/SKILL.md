---
name: write-adr
description: Record a significant or default-deviating architectural decision as an ADR.
---

# Skill: write-adr

Use whenever a **significant decision** is made or a **documented default is deviated
from** (required by [governance](../../governance/adr-policy.md) and the
[documentation rule](../../rules/common/documentation.md)).

## When an ADR is required
- Choosing/replacing a technology, pattern, protocol, or data model.
- Deviating from an existing ADR or a stated default.
- Introducing a new trust boundary, external dependency, or cross-cutting concern.
- Resolving a PRD open question (OQ*) before writing code that depends on it.

## Steps
1. Find the next number: highest in [`docs/adr/`](../../../docs/adr) + 1.
2. Copy [`docs/adr/0000-template.md`](../../../docs/adr/0000-template.md) to
   `NNNN-kebab-title.md`.
3. Fill **Context** (forces/constraints), **Decision** (active voice, with parameters),
   **Consequences** (positive / costs / follow-ups), **Alternatives considered** (and why
   not), **References**.
4. Set **Status**: `Proposed` if it needs sign-off, `Accepted` if already agreed. If it
   replaces an older ADR, set the old one's status to `Superseded by ADR-NNNN`.
5. Add a row to the [ADR index](../../../docs/adr/README.md).
6. If the decision changes the system, update
   [`docs/architecture/ARCHITECTURE.md`](../../../docs/architecture/ARCHITECTURE.md).
7. Record the decision in [`progress.md`](../../state/progress.md) and, if broadly useful,
   in [`../../memory/decisions/`](../../memory/decisions/).

## Quality bar
An ADR a future engineer can act on without you: the *why* is explicit, alternatives are
honest, and the consequences (including costs) are stated.
