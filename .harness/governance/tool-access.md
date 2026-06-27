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

## Drift
If `.claude/settings.json` and this policy disagree, this policy is the intent — update the
settings to match, and record why.
