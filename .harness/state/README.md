# State

The harness's durable state — the part of the system that **must live outside the context
window**. These files are the source of truth for scope, history, and consequences.

| File | Role | Schema |
|------|------|--------|
| [`feature_list.json`](feature_list.json) | **Feature tracking** — the machine-readable scope; one feature at a time (`wip_limit: 1`). | [`schemas/feature_list.schema.json`](schemas/feature_list.schema.json) |
| [`progress.md`](progress.md) | **Progress tracking** — session-by-session log so any agent can resume. | — |
| [`effects.json`](effects.json) | **Effect-links** — "change A ⇒ change B/C," kept honest by the effect-link protocol. | [`schemas/effects.schema.json`](schemas/effects.schema.json) |

## Rules
- Validate after every edit: `node scripts/verify-state.mjs`.
- `feature_list.json` and `effects.json` are JSON (no comments); keep them schema-valid.
- At most **one** feature is `in_progress` at a time.
- These files are committed (system of record — [commit policy](../governance/commit-policy.md)).

## Conventions
- Feature ids: `F-00x`. Effect-link ids: `E-00x`.
- Statuses: `backlog → todo → in_progress → blocked → in_review → done`.
- Releases: `R0` (local MVP) … `R3` (enterprise & product completeness), `R4` (launch),
  per [`../../docs/roadmap.md`](../../docs/roadmap.md). New releases are added to
  `releases[]` here; the schema accepts any `R<n>` (membership is enforced by
  `verify-state`, so there is no dual-maintenance drift).
