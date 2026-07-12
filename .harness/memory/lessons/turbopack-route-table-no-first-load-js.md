---
id: turbopack-route-table-no-first-load-js
kind: lesson
title: Next 16 Turbopack build no longer prints first-load JS — measure budgets over the wire
links:
  - docs/design/marketing-design.manifest.json
  - .harness/state/progress.md
confidence: 0.9
created: 2026-07-12
---

**What happened:** during F-067, the plan's budget evidence ("route table first-load JS ≈
191.5KB") could not be produced — Next 16.2.9's Turbopack `next build` route table lists
routes and static/dynamic status but **no longer emits per-route first-load JS sizes** (the
webpack-era column older progress entries cite is gone).

**Fix used:** measure over the wire instead — load the built page and sum CDP
`encodedDataLength` for the page's own HTML + script refs (exclude `next/link` prefetches of
OTHER routes, which pollute the window; run twice and take the stable minimum). Cross-check
that no unexpected content ships client-side by grepping `.next/static/chunks` for
distinctive page copy (server-component content must not appear there).

**How to apply:** when citing the 240KB gz marketing budget (or any first-load budget), don't
promise "route table" numbers — the tool no longer emits them. Use the wire measurement +
chunk-grep method, or add a scripted size check if the budget becomes a formal gate
(`web-perf` is still `planned`). Also note: a route group can add a shared glue chunk
(~17KB for `/legal/*`) that shows up in wire totals even for zero-JS static pages.
