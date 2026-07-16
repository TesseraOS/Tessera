---
id: measure-per-field-before-arguing-a-budget
kind: lesson
title: A failing budget gate is a question, not a verdict — measure per-field before arguing the threshold
links:
  - tests/bench/thresholds.json
  - packages/config/src/sources/search-enrichment.ts
  - packages/retrieval/src/domain.ts
  - .harness/plans/F-061-search-depth.md
confidence: 0.9
created: 2026-07-16
---

**What happened:** F-061 added `label` + `kind` + `node` to every search hit. The `perf` gate failed —
`918 > 900` tokens. The plan had *predicted* this risk and pre-written two responses: argue the
threshold up (an ADR-grade case), or make the field opt-in. Both were wrong, because both accepted the
plan's **arithmetic** that the label was the cost.

Measuring each field separately took one throwaway script and disproved it:

| default fields | tokens |
|---|---|
| `ref` `score` `signals` | 734 |
| `+ label` | 824 (+90) |
| `+ kind` | 859 (+35) |
| `+ node` | **994 (+135)** |

**`node` was the expensive field, and it restated the label** — `node.key` is the label's path with the
extension stripped. The shape was shipping the same path twice on every hit. Nobody would have found
that by arguing about the threshold; the fix was in the *shape*, which is exactly what
`thresholds.json:3` says ("the fix is in the code or a new feature, not in this file").

The measurement also produced a **better contract** than either pre-planned option: *the default is
what makes a hit an **answer** (`ref`/`score`/`signals`/`label` — a 64-char hash is not an answer at
any price); everything else is **depth** the caller asks for.* That line is defensible in a way
"we needed 18 more tokens" never is. Final: **783/900, 117 spare**, no threshold moved. And the real
label cost **56**, not the 90 the synthetic predicted — the estimate was wrong in *both* directions.

**How to apply:**
- **A budget gate failing is information about your design, not an obstacle to it.** Before you argue
  the number up or reach for the pre-planned mitigation, spend five minutes finding out *where the
  bytes went*. The plan's arithmetic is a hypothesis; the gate is the experiment.
- **Measure per-field, not in aggregate.** "We are 18 over" invites a threshold nudge. "One field costs
  135 and duplicates another" writes the fix for you.
- **Suspect redundancy between new fields.** Two fields derived from the same source datum (here: a
  path, and that path minus its extension) will both look individually reasonable and be jointly
  wasteful.
- **Let the budget force a contract line.** Being made to choose *what is always on* is a design
  benefit, not a tax: it separates "what makes this an answer" from "depth", and that distinction is
  worth having independently of the token count.
- **Escalate with the measurement, never the request.** "The gate failed, here is the per-field
  breakdown, here are three options with their costs" is a decision someone can make in a minute.
  "Can I raise the threshold?" is not.

**Corollary — record the headroom you leave.** 13% spare is now the budget for the *next* always-on
field, and the label's cost scales with path length. A gate you pass by 2% is one corpus away from
flaking; say so where the next person will look.
