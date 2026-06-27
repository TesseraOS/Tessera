---
name: effect-trace
description: Find and record what a change affects, updating the effect-link graph so edits don't silently break dependents.
---

# Skill: effect-trace

Tessera exists partly to stop agents from "fixing one place and breaking three." We hold
ourselves to the same standard: **before declaring a change done, trace its effects.**
Implements the [effect-link protocol](../../protocols/effect-link.md).

## When
- Before closing any feature.
- Immediately after changing a **shared contract**: a port interface, an exported type, a
  public package API, a DB schema, an HTTP/MCP contract, or a config schema.

## Steps
1. **Identify the changed unit(s)** — symbol/file/module/contract.
2. **Look up existing effects.** Search [`effects.json`](../../state/effects.json) for
   links whose `from` matches what you changed. Each lists a dependent you must review.
3. **Derive new effects.** Consider: callers/importers, every adapter of a changed port,
   the port's conformance suite, generated SDK/OpenAPI, docs/ADRs, and the dashboard.
4. **Act on each dependent:** update it now (preferred), or — if genuinely out of the
   current feature's scope — record it as a `backlog` feature / follow-up note. Never leave
   a known break unrecorded.
5. **Update the graph.** Add/adjust links in `effects.json` (schema:
   [`schemas/effects.schema.json`](../../state/schemas/effects.schema.json)) with
   `rationale`, `confidence`, and `origin` (`static`/`manual`/`learned`).
6. **Validate:** `node scripts/verify-state.mjs`.

## Example invariants already in the graph
- *Change a storage **Port** interface ⇒ update **all** its adapters + the conformance
  suite (+ an ADR if the contract semantics change).*
- *Change the REST/MCP contract ⇒ regenerate OpenAPI + the TS SDK + update the dashboard.*

Keeping this graph honest is what makes `get_effects` trustworthy in the product.
