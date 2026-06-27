# AGENTS.md — apps/web (Tessera dashboard)

> **Scope:** the Next.js dashboard (`@tessera/web`). **Extends the root harness — read
> [`../../AGENTS.md`](../../AGENTS.md) first.** Everything global applies unchanged; this
> file only **adds** frontend specifics and never relaxes a global rule.

`extends: root`

## What this service is
The operator/developer UI: global search, knowledge-graph & architecture visualization,
timelines, the **Context Package inspector** (the "why" debugger), memory/ADR authoring,
configuration, and (later) governance/analytics. It talks only to `@tessera/api` via the
generated SDK. See [`../../docs/architecture/ARCHITECTURE.md`](../../docs/architecture/ARCHITECTURE.md).

## Service rules (in addition to root)
- Frontend rules: [`.harness/rules/frontend.md`](.harness/rules/frontend.md) and the global
  [`frontend`](../../.harness/rules/frontend/frontend.md) rule.
- **No business logic in the UI** — call the API; the dashboard renders and explains.
- **Provenance-first**: any surface showing context must show sources/scores/"why included."
- **UX baseline is mandatory** (PRD FR-49): loading/empty/error states, ⌘K, themes,
  optimistic updates, virtualization, toasts.
- **Accessibility is a gate** (NFR-9, WCAG 2.1 AA): semantic HTML, keyboard paths, focus,
  contrast.

## Relevant features
F-014 (R0) and the R1+ dashboard features (F-027, etc.) in
[`../../.harness/state/feature_list.json`](../../.harness/state/feature_list.json).

> Stub: the dashboard code arrives in the coding phase. A dedicated frontend ADR is due at
> R1; until then the global frontend rule + the PRD UX baseline govern.
