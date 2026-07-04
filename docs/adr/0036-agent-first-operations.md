# ADR-0036: Agent-first operations — API/MCP parity rule, CLI onboarding, skills registry

- **Status:** Accepted
- **Date:** 2026-07-04
- **Deciders:** Project lead + supervising architect session
- **Tags:** product, mcp, api, cli, dx, launch

## Context

Tessera's primary consumer is **the agent** (PRD §4). The product lead's direction for
launch sharpens this: *humans should depend less on the dashboard; the user's own AI
agent should be able to configure and operate Tessera end-to-end* — Tessera is an
automation tool, and it must be **fast and token-cheap** for agents (the whole value
proposition is that agents stop re-reading whole repos).

Today that principle is only partially true: search/compile/effects/memory are exposed
via REST + MCP, but **operational** actions (registering sources, triggering scans,
issuing tokens, configuring providers) have no product surface at all — and the MCP
transport is stdio-only, so remote/hosted agents cannot connect. There is also no
low-friction install path (no CLI, no published packages) and no way for an agent to
*learn* Tessera workflows (no skills, no `llms.txt`).

## Decision

We will make **agent-first a binding engineering rule plus three product surfaces**:

1. **API/MCP parity rule (binding, from now on):** every product operation the
   dashboard can perform MUST be available through REST `/v1` **and** (where it makes
   sense for an agent) an MCP tool, *before or together with* the UI. The dashboard is
   a client of the same API — never a privileged surface. New features list their
   REST + MCP surface in acceptance criteria; the evaluator rejects UI-only operations.
2. **CLI + one-command onboarding (`@tessera/cli`, F-054):** `npx @tessera/cli init`
   stands up a Local deployment (config + server + MCP) and **emits agent client
   config** (Claude Code, Cursor, Cline, Codex, Continue, …) so "connect your agent"
   is one command; also `source add`, `token issue`, `doctor`, `serve`.
3. **Skills registry (F-053):** first-party, versioned **agent skills** (SKILL.md
   format) that teach agents Tessera workflows (compile-before-coding,
   effects-before-editing, capture-memory-after-decisions). Browsable at `/skills`
   on the marketing site (reference: unabyss.com/skills), downloadable, and
   installable via CLI/MCP.
4. **Remote MCP (F-055):** an HTTP/streamable MCP transport with Bearer auth feeding
   the existing gateway (F-026 auth + quotas), so hosted agents connect to
   self-hosted/cloud deployments — stdio remains the local default.
5. **Token-efficiency as a performance requirement (NFR-4 extension, F-049):** MCP/REST
   responses stay compact (no redundant prose, bodies only when asked — `explain` is
   already the verbose path); benchmark suite tracks tokens-per-answer alongside
   latency; `llms.txt` + agent-readable docs ship with the public web (ADR-0035).

## Consequences

### Positive
- Agents can install, configure, and operate Tessera without a human in the dashboard —
  the product's own differentiator applied to itself.
- The parity rule prevents the classic drift where ops functionality accretes UI-only.
- Skills turn "integrates with agents" into distribution: each skill is a reason to
  connect Tessera.

### Negative / Costs
- Every operational feature now carries three surfaces (REST + MCP + UI) — more
  acceptance criteria per feature (mitigated: thin routes/tools over the same services,
  the established one-engine/two-surfaces pattern from F-011/F-012).
- Remote MCP expands the attack surface — it must ride the existing gateway
  (auth/quota/audit), never bypass it.

### Neutral / Follow-ups
- Realized by F-038 (sources via REST+MCP first), F-053 (skills), F-054 (CLI),
  F-055 (remote MCP), F-049 (token/latency benchmarks).
- The parity rule is recorded in the harness rules (`.harness/rules/`) by F-038's
  implementation session so the generator/evaluator enforce it mechanically.

## Alternatives considered

- **Dashboard-first, API later** — rejected: contradicts the primary persona and the
  product lead's explicit direction; historically produces UI-only ops surfaces.
- **Building our own agent to operate Tessera** — rejected: NG2 stands (we serve
  agents, we don't build one).
- **Custom skill format** — rejected: adopt the emerging SKILL.md convention agents
  already load; zero new protocol.

## References

- Related: ADR-0017 (MCP surface), ADR-0026/0029 (gateway auth+quotas), ADR-0035
  (public web), PRD §4 (personas), §6.10 (FR-69/70/71), NFR-4; unabyss.com/skills
  (reference, to be exceeded).
