# Observation buffer

A low-friction capture log for [`skill-observer`](../skills/skill-observer/SKILL.md). **This is a
working buffer, not durable canon** — it is reviewed periodically and *drained* into concrete
improvements (skill / rule edits, ADRs) or durable [`lessons/`](lessons/). Unlike the one-fact
memory entries, it is append-only and expected to churn.

Entry format (one observation each):

```
### <YYYY-MM-DD> — <short title>
- **Issue:** what happened (+ pointer: file / skill / rule)
- **Suggested improvement:** the smallest concrete change
- **Principle:** why it generalizes beyond this instance
- **Status:** open | applied (<link>) | dropped (<reason>)
```

## Open observations

_(none yet)_
