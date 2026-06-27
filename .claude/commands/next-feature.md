---
description: Select and claim the next eligible Tessera feature (respects wip_limit).
---

Follow the canonical command at `.harness/commands/next-feature.md`.

In short: ensure no feature is `in_progress` in `.harness/state/feature_list.json`
(`wip_limit: 1`); pick the lowest-id `todo` feature for the current release whose
`blockedBy` are all `done`; set it `in_progress`; read its requirements/acceptance and the
linked docs/ADRs; then proceed into the `add-feature` skill (plan first). Validate with
`node scripts/verify-state.mjs`.

Do not invent features that aren't in the list, and never claim more than one.
