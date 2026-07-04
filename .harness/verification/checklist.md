# Verification checklists

Two checklists: the **per-feature** definition-of-done, and the **harness self-audit**
(does our harness still embody the methodology).

## A. Per-feature (Definition of Done)
The canonical list lives in
[`../protocols/definition-of-done.md`](../protocols/definition-of-done.md). Summary:
acceptance met · gates green with evidence · tests added · effects traced · docs/ADRs
current · rules satisfied · no silent debt · state recorded · clean tree.

## B. Harness self-audit
Run when changing the harness itself, or periodically. Distilled from *Learn Harness
Engineering* (12 lectures) and ECC. Each item should be answerable **yes** with a pointer.

- [ ] **Capable ≠ reliable.** Reliability comes from this harness, not from assuming a
      better model. (lecture 1)
- [ ] **Harness is a closed loop.** init → work → verify → record → clean is defined and
      followed. ([`../instructions/workflow.md`](../instructions/workflow.md))
- [ ] **Repository is the system of record.** Durable state is in files, not chat.
      ([`../state/`](../state/), [`../memory/`](../memory/))
- [ ] **No single giant instruction file.** Rules are modular. ([`../rules/`](../rules/))
- [ ] **Continuity across sessions.** progress.md + feature_list let a fresh agent resume.
- [ ] **Initialization has its own phase.** ([`../protocols/initialization.md`](../protocols/initialization.md))
- [ ] **No overreach / under-finish.** wip_limit:1; scope bounded by acceptance.
- [ ] **Feature list is a primitive.** ([`../state/feature_list.json`](../state/feature_list.json))
- [ ] **No premature victory.** ([`../protocols/verification.md`](../protocols/verification.md))
- [ ] **E2E matters.** user-facing features require e2e before done.
- [ ] **Observability inside the harness/product.** ([`../protocols/observability.md`](../protocols/observability.md))
- [ ] **Every session leaves a clean state.** ([`../protocols/clean-state.md`](../protocols/clean-state.md))
- [ ] **Tessera-specific: effects are traced.** ([`../protocols/effect-link.md`](../protocols/effect-link.md))
- [ ] **Planner / generator / evaluator are separated.** ([`../../.claude/agents/`](../../.claude/agents/))
- [ ] **Stated rules are mechanically enforced where possible.** The `state` gate
      (`scripts/verify-state.mjs`, hardened 2026-07-04) checks: state-file validity +
      schema sync, wip_limit, blockers-done, plan-before-code, PRD requirement
      traceability, gates.json validity + CI mirror (E-005), memory-index coverage,
      governed-doc links, env docs. A rule that *can* be a check and isn't is a gap.
- [ ] **Agent-first parity is enforced.** Product operations ship REST + MCP with (or
      before) UI ([`../rules/common/agent-first.md`](../rules/common/agent-first.md), ADR-0036).

A "no" anywhere is a harness gap to fix — file it as a harness feature/task.
