---
name: effects-before-editing
description: >-
  Ask Tessera what depends on a file, symbol, or module before you change it, and record the
  couplings the graph cannot infer. Use before editing any shared contract, exported symbol, or
  configuration value — while the change is still a plan, not a diff.
compatibility: Requires a connected Tessera MCP server (tessera init, or npx @tessera/cli init).
metadata:
  tessera.version: '1.0.0'
  tessera.category: workflow
  tessera.headline: Know the blast radius before the diff
  tessera.why: A dependent found in review costs more than one found before the edit.
  tessera.tools: get_effects,query_graph,assert_effect,search
---

# Effects before editing

Tessera maintains a knowledge graph of the repository — files, symbols, modules, decisions,
memories — plus **effect-links**: recorded couplings that say "changing this may require
reviewing that". Read the blast radius before you change a shared thing.

## When to use this

Before editing anything more than one caller can see:

- an exported function, type, or constant
- a shared schema, contract, or response shape
- a configuration key or environment variable
- a file other modules import

Skip it for edits that cannot escape the file (a local variable, a comment, a private helper).

## The loop

**1. Ask for the dependents.**

```json
get_effects { "kind": "symbol", "key": "createSession", "maxDepth": 2 }
```

- `kind` — one of `file`, `symbol`, `module`, `person`, `decision`, `memory`.
- `key` — the natural key: a source-relative path for a `file`, the name for a `symbol`.
- `maxDepth` — how far to follow the chain. Depth 1 is direct dependents; depth 2–3 shows the
  transitive reach. Start at 2; raise it when the change is a contract everyone consumes.

The result is a ranked set of dependents with their paths.

**2. Classify the change.** With the dependent list in front of you:

- **Additive** (a new optional field, a new export) — dependents keep working; note them and
  move on.
- **Breaking** (a renamed export, a changed shape, a removed field) — every dependent is work.
  Plan those edits into the *same* change, or the build is red between commits.

**3. Edit, dependents included.** A breaking change with its dependents resolved in one change
is reviewable. The same change with dependents deferred is a trap for whoever runs the tests.

## When `get_effects` comes back empty

Empty is a fact about the graph, not proof of safety. Check, in order:

1. **Is the node indexed?** `list_sources` then `scan_source { "id": "..." }` — an unscanned or
   stale source has no nodes to return.
2. **Is the key right?** Graph keys are source-relative and extensionless for files
   (`src/ledger`, not `./src/ledger.ts`). Find the exact key with
   `search { "query": "createSession", "include": { "node": true } }` — the `node` extra returns
   the graph node to pass straight into `get_effects`.
3. **Explore the neighbourhood.**
   ```json
   query_graph { "nodeKinds": ["symbol", "file"], "edgeKinds": ["imports", "calls"], "limit": 200 }
   ```
   A bounded subgraph, for when you need to see the shape rather than one node's dependents.

## Record what the graph cannot infer

Static analysis sees imports and calls. It does not see "this JSON fixture must match that Zod
schema" or "these two constants must stay in sync". When you discover such a coupling — usually
by breaking it — record it:

```json
assert_effect {
  "from": { "kind": "file", "key": "packages/api/src/schemas/user" },
  "to":   { "kind": "file", "key": "packages/web/src/fixtures/user" },
  "rationale": "The fixture is validated against this schema in tests; a field change breaks it.",
  "confidence": 0.9
}
```

`rationale` is required, and it is the point. A link without a reason cannot be reviewed,
trusted, or retired later. Write the sentence you would want to read when this fires in six
months. Set `confidence` honestly — a certain coupling is 1, an informed guess is 0.6.

## The rule

Never change a shared contract without running `get_effects` on it first. Reading a blast radius
takes one call. Rediscovering it from a failing pipeline takes an afternoon.

## Anti-patterns

- **Editing first and checking after.** The result is the same information at a higher price.
- **Treating an empty result as a green light** without checking that the source was scanned.
- **Asserting links with a rationale like "related".** That is noise; it teaches the next reader
  nothing and cannot be evaluated.
- **Depth 20 on everything.** A huge transitive set is not a plan. Start shallow, go deeper only
  where the change is genuinely a contract.
