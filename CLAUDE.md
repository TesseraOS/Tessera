# CLAUDE.md

This file is the Claude Code entry point. The **authoritative, tool-agnostic operating
manual is [`AGENTS.md`](AGENTS.md)** — read it in full and follow it.

@AGENTS.md

## Claude Code specifics

- **Adapter:** Claude-specific configuration lives in [`.claude/`](.claude/):
  - [`.claude/settings.json`](.claude/settings.json) — permissions, env (Tool Access).
  - [`.claude/commands/`](.claude/commands/) — slash commands that mirror
    [`.harness/commands/`](.harness/commands/) (`/next-feature`, `/verify`, `/checkpoint`).
  - [`.claude/agents/`](.claude/agents/) — the **planner / generator / evaluator**
    subagents that realize the planner↔generator↔evaluator separation required by the
    harness.
  - [`.claude/skills/`](.claude/skills/) — thin shims pointing at the canonical skills in
    [`.harness/skills/`](.harness/skills/).
- **Source of truth:** the agnostic `.harness/` is canonical. The `.claude/` adapter must
  never contradict it; if it drifts, fix the adapter, not the manual.
- **Memory:** the repository's [`.harness/memory/`](.harness/memory/) is the committed
  system of record. Claude's personal cross-session memory only *points at* it — never
  treat personal memory as authoritative over the repo.

> Do not skip [`AGENTS.md`](AGENTS.md). Everything below it (golden rules, the working
> loop, verification, effect-links, clean-state) is binding.
