# Codex adversarial review (optional, opt-in)

Wraps **[openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc)** (Apache-2.0) so the
**evaluator** can get an *independent-model* second opinion — an adversarial review from OpenAI
Codex that challenges implementation choices a same-model verifier might rationalize past.

> **Governed by
> [`third-party-model-review`](../../.harness/governance/third-party-model-review.md) and
> [ADR-0039](../../docs/adr/0039-optional-independent-model-adversarial-review-codex.md).
> OFF BY DEFAULT. Enabling it sends Tessera code to OpenAI.** Do not enable it for code with
> secrets or under a stricter data policy. It is **advisory only** — it never sets the verdict or
> weakens a gate.

## When to use
- The evaluator wants a cross-model check on a risky or complex feature before a Pass.
- A generator is genuinely stuck and a human authorizes delegating a scoped task ("rescue").

Use it as *input*; our gates and the definition-of-done remain the source of truth.

## Requirements (all external to this repo)
- Node ≥ 18.18, the **Codex CLI installed and authenticated**, and a ChatGPT subscription or an
  OpenAI API key.

## Setup — only when a human enables it for the session
1. Follow the plugin's README ([openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc)):
   add its marketplace, then `/plugin install codex@openai-codex`; reload plugins.
2. Verify with `/codex:setup`.
3. Commands: `/codex:review`, `/codex:adversarial-review`, `/codex:rescue`, plus job controls
   `/codex:status` · `/codex:result` · `/codex:cancel`.

## Guardrails
- Record in [`../../.harness/state/progress.md`](../../.harness/state/progress.md) that an external
  review was used and on what.
- Do not commit anything solely on Codex's say-so — re-run our gates ([`../commands/verify.md`](../commands/verify.md)).
- Disable when done; keep it off by default.

Attribution: [`../../NOTICE.md`](../../NOTICE.md).
