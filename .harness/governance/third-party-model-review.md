# Third-party model review (egress-gated)

Policy for using a **model outside our Anthropic/Claude workflow** (e.g. OpenAI Codex) to review
or assist with Tessera's code — most usefully as an *independent* adversarial reviewer that
strengthens the planner / generator / **evaluator** separation.

## Rule
- **Off by default.** No agent sends Tessera source, diffs, or context to a third-party model
  unless a human has **explicitly enabled** it for that session.
- **Data egress is the deciding factor.** Enabling it sends code to an external provider (e.g.
  OpenAI), subject to that provider's terms. Treat it like any external publish — you can *stop*,
  but the data does not come back. Never enable it for code covered by a stricter data policy or
  containing secrets ([`secrets-policy`](secrets-policy.md)).
- **Advisory only.** A third-party review is *input to* the evaluator, never the verdict. Our
  gates ([`../verification/`](../verification/)) and the definition-of-done remain the source of
  truth; an external model cannot mark a feature done or weaken a gate.
- **Least privilege + record.** Grant only what the review needs; record in
  [`../state/progress.md`](../state/progress.md) that an external review was used and on what.
  Tool-specific setup is documented in the adapter, not this agnostic core.

## Rationale
An independent model catches issues a same-model verifier rationalizes past — real value for the
evaluator role. But routine egress to another vendor is a governance decision, not a default, for
a deliberately Anthropic-centric system. This sits alongside [`policy-model`](policy-model.md)'s
treatment of egress and cost. Decision:
[ADR-0039](../../docs/adr/0039-optional-independent-model-adversarial-review-codex.md).
Implementation (Claude Code adapter):
[`../../.claude/integrations/codex-adversarial-review.md`](../../.claude/integrations/codex-adversarial-review.md).
