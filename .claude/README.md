# .claude — Claude Code adapter

This directory **binds Claude Code to Tessera's tool-agnostic harness**. It is a thin
adapter: the canonical rules, skills, commands, and protocols live in
[`../.harness/`](../.harness/) and the manual in [`../AGENTS.md`](../AGENTS.md). Nothing
here may contradict them — if it drifts, fix the adapter.

## Contents
| Path | Role |
|------|------|
| [`settings.json`](settings.json) | Permissions (Tool Access). Committed; no secrets. Machine-local overrides go in `settings.local.json` (git-ignored). |
| [`commands/`](commands/) | Slash commands (`/next-feature`, `/verify`, `/checkpoint`) that invoke the canonical [`../.harness/commands/`](../.harness/commands/). |
| [`agents/`](agents/) | The **planner / generator / evaluator** subagents — the separation the harness requires. |
| [`skills/`](skills/) | Thin shims pointing at the canonical [`../.harness/skills/`](../.harness/skills/). |

## Principles
- **Agnostic core, thin adapter.** Other agents (Cursor, Codex, …) read `AGENTS.md` and
  `.harness/` directly; this folder is just Claude Code's translation layer.
- **Separation of concerns.** Plan with the planner subagent, implement with the generator,
  verify with the evaluator — don't let the implementer be its own unchecked verifier.
- **Permissions are least-privilege.** Read/verify is allowed; commits, pushes, and
  destructive ops require confirmation (see
  [`../.harness/governance/tool-access.md`](../.harness/governance/tool-access.md)).
