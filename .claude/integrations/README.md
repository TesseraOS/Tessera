# .claude — optional integrations

Tool-specific, **opt-in** integrations for Claude Code that are *not* part of the agnostic
[`../../.harness/`](../../.harness/) core. Each is **off by default** and governed by a policy in
the canonical harness — integrations *implement* a policy, they never override one.

| Integration | What | Policy | Default |
|-------------|------|--------|---------|
| [`codex-adversarial-review`](codex-adversarial-review.md) | Independent-model (OpenAI Codex) adversarial code review / rescue for the evaluator role | [`third-party-model-review`](../../.harness/governance/third-party-model-review.md) | **Disabled** |

Nothing here may relax a golden rule ([`../../AGENTS.md`](../../AGENTS.md)) or a governance policy
([`../../.harness/governance/`](../../.harness/governance/)).
