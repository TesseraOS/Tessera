# Plans

Feature plans live here. **Plan before code** ([`../../AGENTS.md` §1](../../AGENTS.md)): a
short, written plan precedes implementation so intent, approach, and anticipated effects are
explicit and reviewable.

## Conventions
- One file per feature: `F-00x-short-slug.md`, created from [`TEMPLATE.md`](TEMPLATE.md).
- A plan is **living** during the feature: update it as understanding changes; it becomes
  part of the record when the feature closes.
- Non-trivial features: draft the plan with the **planner** subagent
  ([`../../.claude/agents/planner.md`](../../.claude/agents/planner.md)), keeping planning
  separate from implementation.

## What a good plan contains
Intent (which `FR-*`/feature), files to touch, approach, **anticipated effects**
(feeds [effect-link](../protocols/effect-link.md)), test plan, and explicit verification
steps. Keep it scannable — a plan no one reads is waste.

> Plans are committed (system of record). They are distinct from Claude Code's transient
> plan-mode scratch files.
