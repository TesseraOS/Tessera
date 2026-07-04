# Governance

Governance defines **what agents are allowed to do** and **how shared resources are
treated** — the policies that keep an autonomous agent from doing the wrong thing
confidently.

| Policy | Covers |
|--------|--------|
| [`commit-policy`](commit-policy.md) | What/when to commit, message format, branching, what's ignored. |
| [`secrets-policy`](secrets-policy.md) | Handling of secrets and sensitive data. |
| [`tool-access`](tool-access.md) | Which tools/commands agents may run; maps to `.claude/settings.json`. |
| [`policy-model`](policy-model.md) | How policies are expressed/enforced: static + **stateful/contextual** (scopes, cost budgets, egress-proxy credentials). |
| [`adr-policy`](adr-policy.md) | When a decision must become an ADR. |
| [`third-party-model-review`](third-party-model-review.md) | Using a model outside our Claude workflow (e.g. Codex) to review code — egress-gated, opt-in, advisory-only. |

These policies are **binding** and sit just below the golden rules in precedence
([`../rules/README.md`](../rules/README.md)). Violating governance is a stop-and-fix event,
not a judgment call.
