# Policy: Tool access

Binding. Defines which tools/commands agents may use and the principle behind the
machine-readable allowlist in
[`../../.claude/settings.json`](../../.claude/settings.json) (the Claude Code enforcement
point — the "Tool Access" concern of the harness model).

## Principle: least privilege, evidence over autonomy
Agents get the tools needed to read, build, test, and verify — and are **gated** on actions
that are hard to reverse or reach outside the repo.

## Allowed without prompting (read & verify)
- Read/search the repo; run the **verification gates** and state validator
  (`node scripts/verify-state.mjs`, `pnpm -w typecheck|lint|test|build`).
- Local, read-only git inspection (`git status|diff|log|show`).
- Run `scripts/init.*` health checks.

## Allowed but recorded (mutating local state)
- Edit files within the repo per the working loop.
- Update state/memory/plans files.

## Gated — require explicit user authorization
- **Commits and any push** (commit policy: only when asked).
- **Network/outbound** actions (publishing, calling external services, installing from new
  registries beyond the pinned toolchain), and anything that sends repo content to a third
  party.
- **Destructive** operations: `rm -rf`, `git reset --hard`, history rewrites, force-push,
  deleting/overwriting files the agent didn't create without first inspecting them.
- Changing CI/CD, secrets, or deployment configuration.

## Subagents
The planner / generator / evaluator subagents
([`../../.claude/agents/`](../../.claude/agents/)) carry **scoped** tool sets: the planner
and evaluator are read/verify-oriented; the generator may edit. Keep the evaluator
independent of the generator.

## Deferred (under consideration): external worker agents

**Option:** delegating bulk work to a cheaper external model as a *worker* (e.g.
[`antigravity-for-claude-code`](https://github.com/yuting0624/antigravity-for-claude-code) —
Google's Antigravity `agy` CLI driving Gemini), with Claude as planner + independent
evaluator. Maps onto our existing `generator` (worker) / `planner` + `evaluator` split.

**Decision (2026-06-27): deferred, not adopted.** Reasons: pre-code (nothing to delegate
yet); native-Windows-unsupported (needs WSL; slow over the `E:` mount); sends code to a
third party (Google); a community plugin that runs arbitrary commands; and its own warning
that the worker "may alter its environment to make a check pass."

**Revisit only when ALL hold:** (a) we are in a heavy implementation phase with real bulk
work; (b) it runs **sandboxed**, on a **dedicated branch**, never `--yolo` on the real repo;
(c) Claude's **independent `evaluator`** verifies every result (the worker never self-certifies);
(d) data-sharing to the provider is consciously accepted; (e) it is **optional dev tooling
only** — never a Tessera product/runtime dependency (the product stays agent-agnostic). At
that point, capture the adoption in an ADR.

## Drift
If `.claude/settings.json` and this policy disagree, this policy is the intent — update the
settings to match, and record why.
