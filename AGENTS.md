# AGENTS.md — Operating manual for agents working on Tessera

> **This file is mandatory and authoritative.** Any agent (Claude Code, Cursor, Codex,
> Cline, …) working in this repository **must read this first** and follow it. It is
> tool-agnostic; Claude Code also loads `CLAUDE.md`, which simply imports this file.
> Tessera is codenamed *ContextOS* internally — the product is **Tessera**.

---

## 0. The one-paragraph brief

Tessera is a deployment-agnostic **Context & Memory OS for AI coding agents** (see
[`docs/PRD.md`](docs/PRD.md), [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md)).
We are **pre-coding**: product definition (Phase A) and this **harness** (Phase B) exist;
application code is built next, **one feature at a time**, following this manual.

## 1. Golden rules (non-negotiable)

1. **The repository is the system of record — not the chat.** All durable state lives in
   files: scope in [`.harness/state/feature_list.json`](.harness/state/feature_list.json),
   history in [`.harness/state/progress.md`](.harness/state/progress.md), consequences in
   [`.harness/state/effects.json`](.harness/state/effects.json), knowledge in
   [`.harness/memory/`](.harness/memory/), decisions in [`docs/adr/`](docs/adr).
2. **One feature at a time.** Work the single feature you claimed in `feature_list.json`
   (`wip_limit: 1`). Do not start another until it is `done`. No scope creep.
3. **Plan before code.** Produce/confirm a plan (see
   [`.harness/plans/`](.harness/plans/)) before editing source.
4. **Verification is the proof, not your assertion.** A feature is done only when the
   verification gates pass with evidence (see
   [`.harness/protocols/verification.md`](.harness/protocols/verification.md) and
   [`.harness/protocols/definition-of-done.md`](.harness/protocols/definition-of-done.md)).
   Never declare victory on unrun or failing checks.
5. **Respect effects.** Before finishing, run the **effect-link protocol**
   ([`.harness/protocols/effect-link.md`](.harness/protocols/effect-link.md)): consult and
   update [`.harness/state/effects.json`](.harness/state/effects.json) so a change here
   doesn't silently break there.
6. **Never break existing, verified code.** Additive, reversible changes; keep the build
   green at every step.
7. **Decisions require an ADR.** Any deviation from a documented default →
   [`docs/adr/`](docs/adr) via the [`write-adr`](.harness/skills/write-adr/SKILL.md) skill.
8. **Leave a clean state.** Every session ends per
   [`.harness/protocols/clean-state.md`](.harness/protocols/clean-state.md): progress
   recorded, tree clean or intentionally staged, no half-applied edits.
9. **Production-grade only.** No toy code, PoC, or hacky shortcuts (see
   [`.harness/rules/`](.harness/rules/)). Secure, typed, tested, observable.
10. **Commit only what should be committed, only when asked.** See
    [`.harness/governance/commit-policy.md`](.harness/governance/commit-policy.md).

## 2. The working loop

```
initialize → select feature → plan → implement → verify → trace effects → record → clean
```

1. **Initialize** — [`.harness/protocols/initialization.md`](.harness/protocols/initialization.md):
   read this file, the active feature, recent `progress.md`, relevant rules & memory.
2. **Select feature** — pick the next eligible item in `feature_list.json` (respect
   release order + `wip_limit`); set it `in_progress`. Command:
   [`next-feature`](.harness/commands/next-feature.md).
3. **Plan** — write/confirm a feature plan in [`.harness/plans/`](.harness/plans/).
4. **Implement** — follow [`add-feature`](.harness/skills/add-feature/SKILL.md) and the
   [`rules/`](.harness/rules/). Small, verifiable increments.
5. **Verify** — run the gates ([`verify`](.harness/commands/verify.md)); only green counts.
6. **Trace effects** — [`effect-trace`](.harness/skills/effect-trace/SKILL.md); update
   `effects.json`.
7. **Record** — update `progress.md` and `feature_list.json` (status → `done` /
   `in_review`); capture any lessons to [`.harness/memory/`](.harness/memory/).
8. **Clean** — [`checkpoint`](.harness/commands/checkpoint.md) leaves a clean state.

## 3. Where everything lives (harness map)

| Harness concern | Location |
|-----------------|----------|
| **Instructions** | this file + [`.harness/instructions/`](.harness/instructions/) |
| **Constraints / rules** | [`.harness/rules/`](.harness/rules/) (common + per-language/area) |
| **Skills** (how-to workflows) | [`.harness/skills/`](.harness/skills/) |
| **Commands** | [`.harness/commands/`](.harness/commands/) (mirrored by `.claude/commands/`) |
| **Protocols** | [`.harness/protocols/`](.harness/protocols/) |
| **Governance** | [`.harness/governance/`](.harness/governance/) |
| **Plans** | [`.harness/plans/`](.harness/plans/) |
| **State** (feature tracking, progress, effects) | [`.harness/state/`](.harness/state/) |
| **Memory** (system of record) | [`.harness/memory/`](.harness/memory/) |
| **Verification** | [`.harness/verification/`](.harness/verification/) |
| **Tool access / observability** | [`.harness/governance/tool-access.md`](.harness/governance/tool-access.md), [`.harness/protocols/observability.md`](.harness/protocols/observability.md) |
| **Product docs** | [`docs/`](docs/) (PRD, architecture, ADRs, glossary, roadmap) |
| **Claude Code adapter** | [`.claude/`](.claude/) (settings, commands, subagents) |

## 4. Scope, services & precedence

- **Global harness** (this root) applies everywhere. **Service-scoped** harnesses live in
  each app (`apps/api/AGENTS.md`, `apps/web/AGENTS.md`) and **extend** root — they add
  service rules, never relax global golden rules. **More specific wins** on conflicts.
- Planner / generator / evaluator are **separated** (Claude Code: see
  [`.claude/agents/`](.claude/agents/)). Plan and verification are not done by the same
  unchecked pass.

## 5. Tech & commands (cheat-sheet)

- Runtime: **Node 22.16.0** (see [`.nvmrc`](.nvmrc)), **pnpm ≥ 9**, **Turborepo**.
- Stack: Fastify + TS (api), Next.js (web), Drizzle, sqlite-vec→pgvector, Transformers.js.
  See ADRs [0001–0008](docs/adr).
- Bootstrap / health: `scripts/init.ps1` (Windows) or `scripts/init.sh` (POSIX).
- Verify state files: `node scripts/verify-state.mjs`.
- Verification gates (activate as code lands): see
  [`.harness/verification/gates.json`](.harness/verification/gates.json).

## 6. Definition of done (summary)

A feature is **done** when: acceptance criteria in `feature_list.json` are met; all
applicable gates pass with evidence; effects traced and recorded; tests added; docs/ADRs
updated; `progress.md` updated; tree clean. Full checklist:
[`.harness/protocols/definition-of-done.md`](.harness/protocols/definition-of-done.md).

> If anything in this manual conflicts with a model's prior assumptions, **this manual
> wins**. When in doubt, prefer reading state over guessing, and verification over
> confidence.
