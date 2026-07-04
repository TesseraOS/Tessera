---
id: external-agent-skill-adaptations
kind: decision
title: External agent-skill adaptations round 2 (design-review, skill-observer, codex opt-in; pm-skills declined)
links: [docs/adr/0038-external-agent-skill-adaptations-design-review-and-skill-observer.md, docs/adr/0039-optional-independent-model-adversarial-review-codex.md, .harness/skills/design-review/SKILL.md, .harness/skills/skill-observer/SKILL.md, NOTICE.md]
confidence: 0.95
created: 2026-07-04
---

Four external skill repos were evaluated for the harness. We **adapted** two into the agnostic
core — the same pattern as ECC and the frontend skills (see [[stack-and-architecture]]): `design-review`
(from impeccable, Apache-2.0 — a design-audit/critique/polish pass subordinate to DESIGN-SYSTEM.md)
and `skill-observer` (from one-skill / Task Observer, CC BY 4.0 — a harness self-improvement loop).
We made OpenAI **Codex adversarial review an opt-in, disabled-by-default** integration governed by
the new `third-party-model-review` policy, because it egresses code to OpenAI. We **declined
pm-skills** (MIT) as scope creep for a coding harness. Full rationale in ADR-0038 / ADR-0039;
attributions (incl. CC BY 4.0 retention) in NOTICE.md.
