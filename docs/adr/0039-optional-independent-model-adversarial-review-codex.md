# ADR-0039: Optional independent-model adversarial review via Codex (opt-in, disabled by default)

- **Status:** Accepted
- **Date:** 2026-07-04
- **Deciders:** Project lead, Claude
- **Tags:** harness, governance, verification, tooling, security

## Context

The harness deliberately separates planner / generator / **evaluator** and warns against the
implementer being its own unchecked verifier ([`.claude/agents/evaluator.md`](../../.claude/agents/evaluator.md)).
**openai/codex-plugin-cc** (Apache-2.0) can add an *independent-model* adversarial reviewer
(OpenAI Codex) to the evaluator step. But it (a) is a Claude-Code-specific tool bridge, not
tool-agnostic; (b) requires an external dependency (Codex CLI + OpenAI auth, Node ≥ 18.18); and
(c) **sends Tessera code to OpenAI** — a data-egress decision for a system whose brand and stack
are deliberately Anthropic-centric. The project lead delegated the call as "whatever is
professional and enterprise-grade."

## Decision

**We make independent-model adversarial review available as an opt-in, disabled-by-default
integration — not part of the agnostic core.**

- **Policy (agnostic):** a new governance policy
  [`third-party-model-review`](../../.harness/governance/third-party-model-review.md) — off by
  default, explicit human enablement per session, **advisory only** (never the verdict, never
  weakens a gate), least-privilege, and recorded in `progress.md`.
- **Implementation (tool-specific):** documented in the Claude Code adapter at
  [`.claude/integrations/codex-adversarial-review.md`](../../.claude/integrations/codex-adversarial-review.md);
  the evaluator agent references it as an optional second opinion.
- It is wired into **no** gate and **no** default flow: nothing sends code to OpenAI unless a human
  enables it for that session.

## Consequences

### Positive
- A stronger evaluator when wanted — a different model catches what a same-model verifier
  rationalizes past — without changing the safe default posture.
- The data-egress tradeoff is explicit, governed, and reversible (stop using it); no default
  leakage of code to a third party.

### Negative / Costs
- When enabled, code egresses to OpenAI (external terms, cost) and adds an external dependency.
- Split-brain risk if the external review were treated as authoritative — mitigated by
  "advisory only; our gates decide."

### Neutral / Follow-ups
- Revisit if org policy forbids third-party egress (then remove the integration), or if a native
  Anthropic cross-model reviewer becomes available.

## Alternatives considered

- **Enable it by default in the evaluator** — rejected: routine egress to OpenAI is not an
  acceptable default for an Anthropic-centric system; this is a governance decision, not a
  convenience.
- **Skip it entirely** — rejected: forgoes real evaluator value; opt-in with guardrails captures
  the upside while keeping the safe default.
- **Adapt it into the agnostic `.harness/`** — rejected: it is a tool-specific CLI bridge, not a
  tool-agnostic principle. The *policy* is agnostic; the *plugin* stays in the adapter.

## References

- Policy: [`third-party-model-review`](../../.harness/governance/third-party-model-review.md).
  Integration: [`.claude/integrations/codex-adversarial-review.md`](../../.claude/integrations/codex-adversarial-review.md).
  Evaluator: [`.claude/agents/evaluator.md`](../../.claude/agents/evaluator.md).
- Related: [ADR-0038](0038-external-agent-skill-adaptations-design-review-and-skill-observer.md),
  [ADR-0036](0036-agent-first-operations.md).
- Source: openai/codex-plugin-cc <https://github.com/openai/codex-plugin-cc> (Apache-2.0).
