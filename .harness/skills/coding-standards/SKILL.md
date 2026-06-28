---
name: coding-standards
description: Apply Tessera's baseline coding conventions when writing, reviewing, refactoring, or onboarding — readability, KISS/DRY/YAGNI, naming, immutability, tests.
---

# Skill: coding-standards

The cross-project quality baseline. Use it when **starting code, reviewing a diff,
refactoring, setting up lint, or onboarding**. It does not replace the binding
[rules](../../rules/) — it indexes and operationalizes them.

> Adapted (MIT) from ECC `coding-standards` (© Affaan Mustafa) — see
> [`NOTICE.md`](../../../NOTICE.md).

## The standard (binding rules)
- **General quality & simplicity:** [`rules/common/engineering.md`](../../rules/common/engineering.md)
  — readability first, KISS/DRY/YAGNI, descriptive names, small functions + early returns,
  no magic values, immutability at boundaries, parallel independent async, explicit errors.
- **Types:** [`rules/typescript/typescript.md`](../../rules/typescript/typescript.md)
  (strict, no `any`, Zod at boundaries, ESM/exports boundaries).
- **Tests:** [`rules/common/testing.md`](../../rules/common/testing.md)
  (levels, port conformance suites, AAA, behavior-named tests).
- **Security:** [`rules/security/security.md`](../../rules/security/security.md).
- **Area-specific:** [`api`](../../rules/api/api.md), [`frontend`](../../rules/frontend/frontend.md),
  and per-service rules under `apps/*/.harness/rules/`.

## Using it as a review checklist
Names descriptive? · functions small + single-purpose? · no duplication / no speculative
abstraction? · no magic numbers? · inputs validated, errors typed? · immutable updates? ·
independent async parallelized? · tests cover the acceptance criteria (AAA, behavior-named)? ·
package boundaries respected (no deep cross-package imports)? · docs/ADRs updated if needed?

For deeper, domain-specific patterns (e.g. Fastify routes, React components), defer to the
area rules and — when adding new coding harness — consult ECC for proven patterns and adapt
with attribution.
