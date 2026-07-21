---
name: capture-memory
description: >-
  Write decisions, lessons, and incidents back to Tessera when work lands, so the next session
  starts warm instead of re-deriving them. Use after making a non-obvious choice, fixing a
  surprising bug, or learning something the code does not state.
compatibility: Requires a connected Tessera MCP server (tessera init, or npx @tessera/cli init).
metadata:
  tessera.version: '1.0.0'
  tessera.category: workflow
  tessera.headline: Write down what the code cannot say
  tessera.why: A reason not recorded is re-derived, or worse, reversed.
  tessera.tools: capture_memory,search
---

# Capture memory

The repository records *what* the code does. It does not record why this approach beat the
obvious one, which fix failed first, or what broke last time someone tried. Tessera stores that,
scoped and searchable, so the next session — yours or another agent's — starts from it.

## When to use this

At the end of a unit of work, and at the moment of surprise:

- a decision was made between real alternatives
- a bug's cause was not what it looked like
- something failed in a way worth not repeating
- a structural truth about the system became clear
- a term is used in this repository with a specific meaning

Do **not** capture: what the diff already shows, transient status ("working on X"), or anything
you would not want a stranger to read.

## The loop

**1. Check whether it already exists.**

```json
search { "query": "sqlite writer lock retry", "limit": 5 }
```

If a memory already makes this claim, refine that one instead of adding a near-duplicate. Two
memories that half-agree are worse than one that is right.

**2. Capture it.**

```json
capture_memory {
  "kind": "lesson",
  "title": "SQLite writes must retry on SQLITE_BUSY, not widen the transaction",
  "body": "The ingestion worker failed under concurrent scans...",
  "scope": "packages/ingestion",
  "confidence": 0.9
}
```

## Choosing the kind

Pick deliberately — the kind is how it gets found later.

| kind | Use it for |
|---|---|
| `decision` | A choice between real alternatives: what was chosen, why, what was rejected. |
| `lesson` | A generalizable rule learned the hard way. |
| `incident` | Something that broke in a running system, and what resolved it. |
| `failure` | An approach that was tried and did not work — so it is not tried again. |
| `architecture` | A structural truth about how the system fits together. |
| `glossary` | A term with a specific local meaning. |
| `task` | Work state worth resuming from. |

## Writing one that is worth keeping

**Title is the claim, not the topic.** "SQLite writes must retry on SQLITE_BUSY" is findable and
tells you the answer. "SQLite issues" is a folder name.

**Body: context → what → why → consequence.** Aim for under 200 words. State the reasoning that
would otherwise be lost, not the diff that is already in git.

**`scope`** — the area the memory governs (a package, a path, a subsystem). Scope is what stops
a lesson about one connector from surfacing during unrelated work.

**`confidence`** — 0 to 1, honest. A verified fact is 1. A strong inference from one incident is
0.7. If you would not defend it in review, it is below 0.5 and should probably say so in the
body.

**`metadata`** — optional `source`, `author`, `links`, `tags`. Use `links` to point at the issue,
PR, or ADR that carries the full story.

## Anti-patterns

- **Capturing the diff.** "Renamed `getUser` to `findUser`" is in git. The memory is *why*.
- **Topic titles.** They are unfindable at the moment of need.
- **Secrets, tokens, credentials, or customer data** in the body. Memories are retrievable by
  every agent on the workspace.
- **Capturing everything.** A store of 400 low-value memories retrieves worse than 40 good ones.
  If it will not change a future decision, skip it.
- **Deferring it.** The reasoning is in your window now and gone after the next task.
