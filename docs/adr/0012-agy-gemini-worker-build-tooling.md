# ADR-0012: Adopt `agy`/Gemini as an optional, human-in-the-loop build worker

- **Status:** Accepted
- **Date:** 2026-06-27
- **Deciders:** Project lead, Claude
- **Supersedes:** the "deferred" stance recorded in [`.harness/governance/tool-access.md`](../../.harness/governance/tool-access.md)
- **Tags:** build-tooling, workflow, governance

## Context

The project lead wants to use Google's Antigravity CLI (`agy`, Gemini) as a **worker
sub-agent** during coding phases to offload bulk work (scaffolding, tests, migrations,
first-pass review), with Claude as planner + verifier — the cost/throughput pattern from
`yuting0624/antigravity-for-claude-code`.

`agy` v1.0.13 **is installed** and `--version`/`--help` work. Probing from Claude's tool
sandbox (which has **no TTY**) showed `agy models` / `agy -p` **hang with a 0-byte log** — so
**Claude cannot drive `agy` itself**. But a real-terminal run proved the opposite for a
human: the log shows `agy` **authenticates via keyring and streams from Gemini** (model
"Gemini 3.5 Flash"); `--print` simply emits nothing until the *entire* response is ready,
which is easily mistaken for a hang. The wrapper therefore defaults to **interactive** mode
(visible progress + tool-review approvals) and uses `--print` only on request.

This is strictly **build-time tooling**, never part of the Tessera product (the product
stays agent-agnostic — see PRD NG7).

## Decision

Adopt `agy`/Gemini as an **optional, human-in-the-loop worker** for the build phase:

- **Claude is planner + independent evaluator; `agy` is the generator/worker.** Claude
  decomposes a task into a **scoped spec**; a **human runs** the guarded wrapper
  (`scripts/agy-worker.ps1` / `.sh`) in a real terminal; Claude then **independently
  verifies** the result (never trusting the worker's self-check). Protocol:
  [`delegate-to-worker`](../../.harness/skills/delegate-to-worker/SKILL.md). Tracked as
  feature **F-031**.
- **Guardrails (enforced by the wrapper + policy-model):** work happens on a **dedicated
  branch**; workspace is **scoped** via `--add-dir`; a `--print-timeout` and `--log-file`
  are always set; **`--dangerously-skip-permissions` is forbidden** on the real repo; **no
  raw secrets** are passed to the worker; nothing is auto-committed/pushed.
- **Not fully Claude-automated** on this setup: because `agy` needs a real console, the
  human triggers the run. If a future environment (e.g. WSL/Linux/macOS, or a working
  non-interactive auth) lets Claude drive `agy` safely, an automated mode may be added via a
  superseding/extending ADR.

## Consequences

### Positive
- Cheaper/faster bulk work during heavy coding, while Claude keeps judgment + verification
  (matches our planner/generator/evaluator separation).
- Strong guardrails; no secrets to the worker; reversible (dedicated branch).

### Negative / Costs
- Human-in-the-loop (not fully automated) due to the TTY/auth constraint.
- Sends code to Google/Gemini — a conscious data-sharing tradeoff; keep proprietary/secret
  material out of delegated scope.
- A community-tool dependency; outputs must always be independently verified.

### Neutral / Follow-ups
- Revisit full automation if the console/auth constraint is removed (WSL/native).
- Cost governance per [`policy-model.md`](../../.harness/governance/policy-model.md) (budgets).

## Alternatives considered

- **Full Claude-driven automation now** — blocked: `agy` hangs without a TTY in Claude's
  sandbox.
- **Keep deferred** — superseded; the lead chose to build it.
- **Build our own meta-harness/sandbox** — out of scope (Omnigent's lane; PRD NG7).

## References

- [`.harness/skills/delegate-to-worker/SKILL.md`](../../.harness/skills/delegate-to-worker/SKILL.md),
  [`.harness/governance/tool-access.md`](../../.harness/governance/tool-access.md),
  [`.harness/governance/policy-model.md`](../../.harness/governance/policy-model.md).
