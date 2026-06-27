# Command: next-feature

Select and claim the next feature to work on.

## Procedure
1. Ensure **no** feature is currently `in_progress` in
   [`../state/feature_list.json`](../state/feature_list.json) (`wip_limit: 1`). If one is,
   resume it instead.
2. Choose the **lowest-id eligible** feature: status `todo`, for the **current release**,
   with every `blockedBy` already `done`.
3. Set its `status` to `in_progress`.
4. Read its `requirements`, `acceptance`, and linked docs/ADRs.
5. Proceed into the [`add-feature`](../skills/add-feature/SKILL.md) skill (plan first).

## Guardrails
- Never claim more than one feature.
- Never invent a feature that isn't in the list — add it (as `backlog`) first, with
  requirement links, if it's genuinely needed.
- Validate after editing: `node scripts/verify-state.mjs`.
