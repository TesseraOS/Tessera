# Protocol: Effect-link

**Trigger:** whenever a **shared contract** changes — a port interface, exported type,
public package API, DB schema, HTTP/MCP contract, or config schema — and before closing any
feature.

This is the harness embodiment of Tessera's core idea: *changing A often requires changing
B and C.* We capture those links so neither agents nor humans fix one place and break
others. The runtime `get_effects` feature (PRD FR-17/19) is only as trustworthy as this
discipline.

## Procedure
1. **Name what changed** (symbol/file/module/contract id).
2. **Consult existing links.** In [`../state/effects.json`](../state/effects.json), find
   every link whose `from` matches. Each `to` is a dependent to review.
3. **Derive new links** from the change. Standard propagation paths:
   - port interface → **all adapters** + the port **conformance suite**;
   - exported type/API → all importers + the generated **SDK**;
   - HTTP/MCP contract → **OpenAPI** + SDK + dashboard;
   - DB schema → migrations + repositories + affected queries;
   - config schema → deployment profiles + docs.
4. **Resolve each dependent:** fix now (preferred) or record as a `backlog` feature /
   follow-up. **A known break must never be left unrecorded.**
5. **Update the graph.** Add/adjust entries in `effects.json` per
   [`../state/schemas/effects.schema.json`](../state/schemas/effects.schema.json), with
   `from`, `to`, `kind: EFFECT_LINK`, `rationale`, `confidence` (0–1), and `origin`
   (`static` | `manual` | `learned`).
6. **Validate:** `node scripts/verify-state.mjs`.

## Quality
- Prefer high-confidence, specific links over vague ones.
- An effect-link with no rationale is not useful — always say *why* B must change when A does.
