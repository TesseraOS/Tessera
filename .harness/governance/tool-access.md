# Policy: Tool access

Binding. Defines which tools/commands agents may use and the principle behind the
machine-readable allowlist in
[`../../.claude/settings.json`](../../.claude/settings.json) (the Claude Code enforcement
point — the "Tool Access" concern of the harness model).

## Principle: least privilege, evidence over autonomy
Agents get the tools needed to read, build, test, and verify — and are **gated** on actions
that are hard to reverse or reach outside the repo.

> The allow/ask/deny lists below are the **static** layer. Stateful, contextual policies
> (post-action triggers, resource-scoped writes, cost budgets, egress-proxy credentials) are
> defined in [`policy-model.md`](policy-model.md) — read both together.

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

## Adopted (human-in-the-loop): external worker agent (`agy`/Gemini)

**What:** delegating bulk, well-specified work to Google's Antigravity `agy` CLI (Gemini) as
a **worker**, with Claude as **planner + independent evaluator** — our `generator` (worker) /
`planner` + `evaluator` split with an external generator.

**Decision (2026-06-27, [ADR-0012](../../docs/adr/0012-agy-gemini-worker-build-tooling.md)):
adopted as OPTIONAL, human-in-the-loop, build-phase tooling — never a Tessera product/runtime
dependency** (the product stays agent-agnostic, PRD NG7). Claude **cannot drive `agy`** (no
TTY in the sandbox -> it hangs), so a **human runs the guarded wrapper**
(`scripts/agy-worker.ps1` / `.sh`) in a real terminal; Claude writes the scoped spec and
**independently verifies**. Protocol:
[`delegate-to-worker`](../skills/delegate-to-worker/SKILL.md). Tracked as feature **F-031**.

**Mandatory guardrails:** dedicated branch; scoped `--add-dir`; `--print-timeout` + `--log-file`
always set; **never `--dangerously-skip-permissions`** on the real repo; **no secrets** passed
to the worker (egress-proxy ideal — see [`policy-model.md`](policy-model.md)); worker output is
**untrusted** until Claude's evaluator re-runs the gates; mind **cost** (policy-model budgets);
keep proprietary/sensitive code out of delegated scope (data leaves to Gemini).

## Drift
If `.claude/settings.json` and this policy disagree, this policy is the intent — update the
settings to match, and record why.
