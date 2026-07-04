# Rule: Agent-first parity (API/MCP before UI)

Binding, per [ADR-0036](../../../docs/adr/0036-agent-first-operations.md) (PRD **G8**).
Tessera's primary consumer is the agent; the dashboard is a client, never a privileged
surface.

## The rule

1. **Every product operation the dashboard can perform MUST be available through REST
   `/v1` and — where it makes sense for an agent — an MCP tool, before or together with
   the UI.** A feature that ships a UI-only operation is not done; the evaluator rejects
   it.
2. **Feature acceptance criteria list their surfaces explicitly** (REST route, MCP tool,
   UI view). Omission is a planning error, caught at the plan step.
3. **The dashboard consumes the same public API** (the generated SDK / `/v1` routes) —
   never a private endpoint, server-side shortcut, or hand-mirrored catalog that can
   drift from the API's truth.
4. **Responses are token-lean.** Agents pay per token: compact JSON, no prose padding,
   bodies only when asked (`explain` is the deliberate verbose path). Token cost is a
   performance budget (NFR-4), benchmarked by the perf gate (F-049).
5. **New MCP tools ride the gateway** (auth + RBAC + quotas + audit, F-026/F-047) — no
   tool bypasses it.

## Why

The product's whole thesis is that agents should operate on compiled context instead of
raw repositories — so agents must be able to *operate the product itself* without a
human clicking for them (product-lead direction, 2026-07-04). UI-first surfaces are how
ops functionality silently becomes human-only.

## Do / Don't

- **Do**: design the REST + MCP contract first; wire the UI to the same service through
  the typed client.
- **Do**: keep MCP tool inputs/outputs Zod-validated and minimal.
- **Don't**: add a dashboard action backed by logic that exists only in the web app.
- **Don't**: return narrative strings where a typed structure serves the agent better.
