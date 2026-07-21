---
name: project-onboarding
description: >-
  Bootstrap a repository into Tessera end to end — register the source, scan it, verify the index
  is real, and leave an anchor memory behind. Use the first time you work in a repository that
  Tessera has not indexed yet, or when search and compile come back empty.
compatibility: Requires a connected Tessera MCP server (tessera init, or npx @tessera/cli init).
metadata:
  tessera.version: '1.0.0'
  tessera.category: setup
  tessera.headline: Make a new repository answerable
  tessera.why: An unindexed repository silently returns nothing, which reads like nothing exists.
  tessera.tools: list_sources,add_source,scan_source,get_stats,search,compile_context,capture_memory
---

# Project onboarding

Every other Tessera workflow assumes the repository is indexed. This is the one that makes that
true, and — just as important — **proves** it, because an empty index and an empty answer look
identical from the outside.

## When to use this

- The first time you work in a repository with Tessera connected.
- When `search` or `compile_context` returns nothing for a query you know should match.
- After moving, renaming, or re-cloning a working tree.

## The loop

**1. Look before you add.**

```json
list_sources {}
```

Sources are already registered as often as not. Adding a second source for the same tree
duplicates the index and makes results worse, not better. If the root you want is listed, skip
to step 3 and rescan it.

**2. Register the source.**

```json
add_source { "kind": "filesystem", "root": "/absolute/path/to/repo", "label": "acme-api" }
```

- `kind` — `filesystem` for a working tree on disk, `git` for a repository to clone.
- `root` — an **absolute** path. A relative path resolves against the server's working
  directory, not yours, and that is the single most common way this step goes quietly wrong.
- `label` — a human-readable name; defaults to the root. Set it when you will have more than one.

Keep the response's `id`. Step 3 needs it.

**3. Scan.**

```json
scan_source { "id": "<the id from add_source>" }
```

The scan is incremental and idempotent — re-running it is safe and only processes what changed.
The result tells you what changed. The first scan of a large repository takes a while; that is
the indexing work, not a hang.

**4. Verify it is real.** This step is not optional.

```json
get_stats {}
```

Read the counts: indexed documents, memories, graph nodes, effect-links, sources, last scan. If
documents is **zero**, the scan found nothing — the root is wrong, points at an empty directory,
or everything under it was excluded. Fix the root and go back to step 3. Do not proceed to
real work on an empty index.

**5. Smoke-test both surfaces.**

```json
search { "query": "<a symbol or file you know exists>", "limit": 5 }
```

```json
compile_context { "task": "<the first real task you have here>", "budget": 2000 }
```

If a query you *know* should hit returns nothing, the index is not usable yet. Trust that signal.

**6. Leave an anchor.**

```json
capture_memory {
  "kind": "architecture",
  "title": "acme-api is a Fastify service with Postgres and a BullMQ worker",
  "body": "Entry point is src/server.ts... the worker is a separate process...",
  "scope": "acme-api"
}
```

Two or three sentences describing what this repository *is* — its shape, entry points, and the
one thing a newcomer gets wrong. Every later compile in this repository has something to anchor
on, and the next agent does not repeat this discovery.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `get_stats` shows 0 documents | Wrong or empty `root`; everything excluded | Correct the root, rescan |
| `add_source` fails | Path does not exist from the server's perspective | Use an absolute path the server can read |
| Search hits nothing you recognise | Scan not finished, or the wrong source | Rescan; confirm the source list |
| Duplicate-looking results | The same tree registered twice | Keep one source |

## Anti-patterns

- **Skipping step 4.** An empty index answers every question with silence, and silence is easy
  to mistake for "there is nothing there".
- **Relative paths in `root`.** They resolve against the server, not your shell.
- **Registering a tree twice** because the first `add_source` scrolled out of view — call
  `list_sources` instead.
- **Onboarding and then not capturing anything.** The next session redoes the orientation you
  just paid for.
