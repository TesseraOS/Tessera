---
id: a-guard-test-must-uniquely-decide-the-answer
kind: lesson
title: To verify a guard, construct the input where that guard alone decides the answer
links:
  - tests/web-perf/web-perf.mjs
  - .harness/memory/lessons/a-green-assertion-that-cannot-go-red.md
confidence: 0.95
created: 2026-07-28
---

**What happened:** F-074's perf gate self-tests its CLS implementation, because the site's real CLS
is a stable **0** — nothing the page can do would drive a wrong implementation red. One case was
named "a window is capped at 5 s even with no gap". Deleting the cap's anchor left the suite
**green, twice**:

1. **First version** used two shifts 5.5 s apart. The metric splits a window on a >1 s gap *or* a
   >5 s window — and 5.5 s satisfies the gap rule, so the cap was never reached. The case exercised
   a different branch than the one in its name.
2. **Second version** used seven shifts 900 ms apart, so only the cap could split. Still green: the
   anchor is only re-read *after* a split, and with one split at the final element there was nothing
   left to get wrong.

The committed case has a tiny first window followed by a large second one, all 900 ms apart. A cap
anchored at time zero — the natural bug — then shatters the second window into single shifts and
reports **0.1** where the metric says **0.6**.

**Why it matters:** this is [[a-green-assertion-that-cannot-go-red]] arriving from a new direction.
There the assertion was wrong (wrong unit, wrong moment, wrong date, wrong claim); here every
assertion was *correct* and the **input** was wrong — it could be satisfied without the guard ever
running. A passing test proves some path reached the assertion, and "some path" includes the one
where your guard is dead code.

**How to apply:**
- When a metric or rule has **several branches that can produce the same answer** (here: gap-split
  vs cap-split), an input that trips an earlier branch proves nothing about a later one. Construct
  the input where the branch under test is the *only* thing that can decide the result.
- Watch for state that is **only read after a transition**: put at least two transitions in the
  input, or the second one — where the state actually matters — never happens.
- Delete the guard and re-run. If it stays green, the test is wrong, not the guard. Do this before
  believing the test, not after a bug ships.

See [[engineering-standards]].
