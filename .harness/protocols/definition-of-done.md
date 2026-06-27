# Protocol: Definition of Done

**Trigger:** deciding whether a feature is complete. A feature is `done` only when **every**
item below is true. If any fails, it stays `in_progress`.

## Checklist
- [ ] **Acceptance met.** Every item in the feature's `acceptance` (in
      [`../state/feature_list.json`](../state/feature_list.json)) is satisfied — no more, no
      less (no scope creep).
- [ ] **Gates green with evidence.** All applicable gates in the
      [verification protocol](verification.md) pass; evidence recorded.
- [ ] **Tests added.** Unit/integration (and E2E for user-facing); adapter changes pass the
      conformance suite. ([testing rule](../rules/common/testing.md))
- [ ] **Effects traced.** [effect-link protocol](effect-link.md) run;
      [`effects.json`](../state/effects.json) updated; dependents handled or recorded.
- [ ] **Docs current.** PRD/ARCHITECTURE/glossary updated if affected; new decisions have
      [ADRs](../skills/write-adr/SKILL.md).
- [ ] **Rules satisfied.** [Constraints](../rules/) honored (types, security, boundaries).
- [ ] **No debt left silently.** No dead code, no stray TODO without a tracked follow-up,
      no secrets, no commented-out blocks.
- [ ] **State recorded.** [`progress.md`](../state/progress.md) updated; feature status set;
      lessons captured to [memory](../memory/) if reusable.
- [ ] **Clean tree.** [clean-state protocol](clean-state.md) satisfied.

## Anti-patterns that are NOT done
- "Compiles / runs locally once" without tests or evidence.
- Acceptance partially met but "close enough."
- Known dependent left broken or unrecorded.
- Gate skipped or weakened to get green.
