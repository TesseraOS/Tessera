# Tessera Harness

The **harness** is the closed-loop working system that governs how AI agents build
Tessera. It exists because *most agent failures are harness failures, not model
failures*: capable models still lose continuity, overreach, declare victory early, and
skip verification unless the surrounding system prevents it.

This directory is **tool-agnostic** and **canonical**. Claude Code binds to it through the
thin [`../.claude/`](../.claude/) adapter; other agents read [`../AGENTS.md`](../AGENTS.md)
directly.

## Harness tree → folder map

The harness model has nine concerns. Each maps to a concrete place here:

| Concern | Lives in |
|---------|----------|
| **Instructions** | [`../AGENTS.md`](../AGENTS.md) + [`instructions/`](instructions/) |
| **Constraints** | [`rules/`](rules/) |
| **Skills** | [`skills/`](skills/) |
| **Commands** | [`commands/`](commands/) |
| **Protocols** | [`protocols/`](protocols/) |
| **Governance** | [`governance/`](governance/) |
| **Plans** | [`plans/`](plans/) |
| **State** | [`state/`](state/) — feature tracking, progress, effects |
| **Feature tracking** | [`state/feature_list.json`](state/feature_list.json) |
| **Progress tracking** | [`state/progress.md`](state/progress.md) |
| **Memory** | [`memory/`](memory/) |
| **Verification** | [`verification/`](verification/) + [`protocols/verification.md`](protocols/verification.md) |
| **Tool access** | [`governance/tool-access.md`](governance/tool-access.md) + `../.claude/settings.json` |
| **Observability** | [`protocols/observability.md`](protocols/observability.md) |

## How a session runs

See [`../AGENTS.md` §2](../AGENTS.md) for the loop. In short:
`initialize → select feature → plan → implement → verify → trace effects → record → clean`.

## Design notes

- **Agnostic core, thin adapter.** Because the product is agent-agnostic and MCP-first,
  its own tooling is too. The canonical rules/skills/protocols live here; `../.claude/`
  only translates them into Claude Code's command/subagent/skill format.
- **Global vs service-scoped.** This is the global harness. Each app
  (`../apps/*/AGENTS.md` + `../apps/*/.harness/`) extends it with service-specific rules;
  the more specific scope wins on conflict, but no service may relax a global golden rule.
- **State outside the context window.** Nothing important lives only in a conversation —
  it lives in [`state/`](state/), [`memory/`](memory/), and [`../docs/`](../docs/).

## Provenance

Principles distilled from *Learn Harness Engineering* (walkinglabs) and the ECC harness
patterns, adapted to Tessera's modular-monolith monorepo. See
[`verification/checklist.md`](verification/checklist.md) for the methodology self-audit.
