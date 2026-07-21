---
name: compile-before-coding
description: >-
  Pull a compiled, cited, token-budgeted context package from Tessera instead of reading whole
  files into the window. Use at the start of any task that needs knowledge of a repository —
  before opening files, before grepping the tree, before planning a change.
compatibility: Requires a connected Tessera MCP server (run `tessera init`, or `npx @tessera/cli init`).
metadata:
  tessera.version: '1.0.0'
  tessera.category: workflow
  tessera.headline: Compile context, do not dump files
  tessera.why: Reading whole files spends the window on text the task never needed.
  tessera.tools: compile_context,search,explain
---

# Compile before coding

Tessera indexes the repository and can assemble the *relevant* slice of it for a stated task,
under a token budget you choose, with provenance on every fragment. Ask for that slice. Do not
reconstruct it by reading files.

## When to use this

Any task that depends on what the repository already contains: implementing a feature, fixing a
bug, reviewing a change, answering "how does X work". Use it **first** — before the file tree,
before grep, before opening anything.

Skip it only when the task carries its own context (a one-line typo fix in a file already open,
or work in a repository Tessera has not indexed).

## The loop

**1. Compile.**

```json
compile_context { "task": "add rate limiting to the login route", "budget": 3000 }
```

- `task` — the literal task statement, in the words you would use to explain it. Selection is
  driven by this string; "auth" retrieves worse than "add rate limiting to the login route".
- `budget` — the maximum tokens the package may occupy. It is a hard ceiling: the compiler
  fits the package to it and reports what it used. Start at **2000–4000**.
- `filters: { "kinds": [...] }` — restrict which fragment kinds may be selected, when you
  already know the answer is code, or a memory, or a decision.
- `retrievalLimit` — how many candidates to consider before fitting. Raise it when the
  repository is large and the package looks like it missed an area.

**2. Read the fragments, keep the refs.** Each fragment carries its text and its provenance —
the source path it came from. That path is your citation and your next read target.

**3. Act.** Open a whole file only when a fragment tells you *which* file and you need more of
it than the fragment carried.

## Choosing a budget

The budget is a decision about cost, not a formality.

| Situation | Budget |
|---|---|
| A focused change in a known area | 1500–2500 |
| A feature touching several modules | 3000–5000 |
| Unfamiliar repository, orienting | 4000–6000 |

A budget large enough to hold the whole repository defeats the point: you are back to dumping
files, just with extra steps.

## When the package looks thin

Widen deliberately rather than abandoning the tool:

```json
search { "query": "login rate limit", "limit": 10, "include": { "snippet": { "maxChars": 240 } } }
```

`search` returns ranked hits across code, memory, and the knowledge graph. Every hit carries a
`ref`, a `score`, and a human-readable `label`. The `include` extras cost tokens and are opt-in —
ask for `snippet` when you need to judge relevance, `kind` to tell code from memory, and `node`
only when you intend to pass it to `get_effects`.

Use what you learn to restate the task more precisely, then compile again. A better `task`
string beats a bigger budget almost every time.

## Citing what you used

When you explain a change, cite the provenance paths the package gave you. A claim traceable to
a fragment is checkable; a claim from memory is not. This is the difference between "the login
route validates the body with Zod (`apps/api/src/routes/auth.ts`)" and "I believe it uses Zod".

## `explain` — for debugging selection, not for every task

```json
explain { "task": "add rate limiting to the login route", "budget": 3000 }
```

`explain` returns the package **plus** why each fragment was selected and what was rejected. It
is deliberately verbose: use it when a compile returned something surprising and you need to see
the selection reasoning. Do not use it as the default path — you pay for the explanation on
every call.

## Anti-patterns

- **Walking the tree first.** Listing directories to decide what to read is the behaviour this
  skill replaces. Compile, then read what the package points at.
- **Compiling with a vague task.** `"fix the bug"` retrieves nothing useful. State the bug.
- **Ignoring the citations** and re-deriving from a full-file read what the package already
  proved.
- **One compile for a multi-part task.** Two focused compiles beat one broad one; the budget is
  spent on what each part actually needs.
