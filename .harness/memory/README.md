# Memory (in-repo system of record)

This is Tessera's **committed, authoritative** project memory — the "repository is memory"
principle made concrete. It is distinct from any agent's *personal* cross-session memory
(e.g. Claude Code's own store): personal memory may **point at** this canon, but **this
repo is the source of truth**.

> This is also dogfooding: the memory model here mirrors the product's memory subsystem
> (PRD FR-10/11/12). What we learn maintaining it informs `@tessera/memory`.

## Layout
| Folder | Kind | Holds |
|--------|------|-------|
| [`decisions/`](decisions/) | decision | durable choices (often summarizing/locking an [ADR](../../docs/adr)). |
| [`lessons/`](lessons/) | lesson | what we learned, what to avoid, incident/failure write-ups. |
| [`architecture/`](architecture/) | architecture | enduring facts about how the system is shaped. |
| [`glossary/`](glossary/) | glossary | canonical term definitions (mirror [`docs/glossary.md`](../../docs/glossary.md)). |

Index of entries: [`index.md`](index.md).

## Entry format
One fact per file, kebab-case name, with frontmatter:

```markdown
---
id: <kebab-slug>
kind: decision | lesson | architecture | glossary
title: <short title>
links: [docs/adr/000x-….md, .harness/...]   # related artifacts
confidence: 0.0–1.0
created: YYYY-MM-DD
supersedes: <id?>
---

The fact. Link related memory inline. Keep it durable, not session-scoped.
```

## Rules
- Don't duplicate ADRs — **reference** them; a decision memory is the short, linkable
  "what we decided," the ADR is the full "why."
- Versioned & supersedable: never silently rewrite a decision; supersede it and link back.
- Capture **reusable** lessons after non-trivial work (see [clean-state](../protocols/clean-state.md)).
