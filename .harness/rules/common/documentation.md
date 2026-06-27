# Rule: Documentation (common)

Docs are part of the deliverable, not an afterthought.

- **Decisions → ADRs.** Any significant or default-deviating choice gets an
  [ADR](../../../docs/adr) via the [`write-adr`](../../skills/write-adr/SKILL.md) skill.
  Code that depends on an unresolved open question must not be written until its ADR exists.
- **Keep docs true.** If a change makes [`docs/`](../../../docs/) wrong (PRD, ARCHITECTURE,
  glossary), update the docs in the same change. Where ADRs and ARCHITECTURE disagree, the
  ADR wins and ARCHITECTURE is corrected.
- **Public surfaces are documented.** Exported package APIs, ports, plugin contracts, and
  HTTP/MCP endpoints have doc comments; HTTP is described by OpenAPI.
- **Requirements are traceable.** Reference `FR-*`/`NFR-*` ids from
  [`docs/PRD.md`](../../../docs/PRD.md) in feature plans and tests so scope stays linked.
- **Glossary discipline.** Use the canonical terms from
  [`docs/glossary.md`](../../../docs/glossary.md); add a term there before coining a new one.
