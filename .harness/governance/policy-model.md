# Policy: Governance policy model (static + stateful)

Binding. Defines *how* agent-action policies are expressed and enforced. Extends
[`tool-access.md`](tool-access.md). Inspired by meta-harness governance (Databricks
Omnigent): real guardrails go **beyond static allow/deny** to **stateful, contextual**
decisions — while staying honest about what each enforcement layer can actually guarantee.

## 1. Policy scopes (stack; stricter wins)
Policies compose across scopes, evaluated strict-first:
1. **Global** (this harness root) — applies to all work.
2. **Service** (`apps/*/.harness/`) — may only *tighten* global.
3. **Session/feature** — the active feature's constraints (e.g. "only touch F-00x's files").

A more specific scope can add restrictions; it can never relax a global golden rule
([`../../AGENTS.md` §1](../../AGENTS.md)).

## 2. Policy types

### 2.1 Static (allow / ask / deny)
Coarse, context-free rules. **Enforced now** by `../../.claude/settings.json` (Claude Code
permissions). Examples already in place: allow read/verify; ask on commit/push/destructive;
deny reading `.env*`.

### 2.2 Stateful / contextual (the upgrade)
Decisions that depend on **session state**, not just the command. We adopt these as the
governance *standard*; enforcement maturity is tracked honestly in §3.

- **Post-action approval triggers** — "after installing a new dependency, require approval
  before `git push`"; "after touching a security boundary, require an evaluator pass before
  merge."
- **Resource-scoped writes** — an agent/worker may write **only** to files in its current
  feature's scope (or files it created), not the whole tree.
- **Cost governance** — for any paid model/worker: tiered **budget** warnings and a hard
  pause (e.g. soft warn, then stop-and-ask) — so spend can't run away unattended (NFR-12).
- **Provenance/audit** — sensitive actions (config, secrets, exports, deploys) are recorded
  (ties to FR-55 audit in the product, and `progress.md` for the build).

### 2.3 Credential handling — egress-proxy injection (gold standard)
Agents and workers should **never see raw secrets**. The target pattern (as in Omnigent's
sandbox): credentials are withheld from the agent and **injected only on approved outbound
requests** via a proxy. Until we have that, the fallback is the `SecretsProvider` port +
`deny` reads of secret files + scrubbing — see [`secrets-policy.md`](secrets-policy.md).
**If any external tool or worker is ever introduced**, it must follow this: no raw tokens to it.

## 3. Enforcement reality (be honest about guarantees)

| Policy | Enforced by | Guarantee |
|--------|-------------|-----------|
| Static allow/ask/deny | `.claude/settings.json` | Hard (Claude Code blocks/prompts) |
| Post-action triggers, resource scope | Claude Code **hooks** (`PreToolUse`) + **CI** + evaluator review | Partial → strong as hooks/CI are added |
| Cost budgets | worker wrapper / CI + review | Partial (full only with a runtime that meters spend) |
| Egress-proxy credentials | future sandbox/proxy | Aspirational now; `SecretsProvider` + deny-reads in the interim |

We do **not** build our own agent runtime/sandbox to enforce these — that is an
orchestrator/meta-harness concern (Omnigent's lane), explicitly **out of scope** for Tessera
([`../../docs/PRD.md` non-goals](../../docs/PRD.md)). Where a guarantee needs a runtime we
don't have, the policy is enforced by **hooks + CI + the independent evaluator**, and the gap
is stated, not hidden.

## 4. Authoring a new policy
State: scope, trigger, the condition (and the **state** it depends on), the action
(allow/ask/deny/pause), and which enforcement layer backs it. If it needs an enforcement
mechanism we lack, say so and record it as a harness follow-up.
