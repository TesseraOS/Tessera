---
id: a-green-assertion-that-cannot-go-red
kind: lesson
title: Prove the assertion can fail — and that what it measures is what you think
links:
  - apps/web/tests/e2e/parity.spec.ts
  - apps/web/tests/e2e/shortcuts.spec.ts
  - apps/web/tests/e2e/home.spec.ts
  - apps/web/components/timeline/timeline-view.tsx
confidence: 1
created: 2026-07-28
---

**What happened:** F-064 produced four separate cases where a test's *result* was not evidence of
what its *name* claimed, and each looked completely different:

1. **A wrong unit.** The reduced-motion assertion "failed" against 724 durations of `1e-05s`.
   Reduced motion was working perfectly — that is 0.01ms in scientific notation, and the filter
   string-matched `"0.01ms"`. One `parseFloat` away from a green test that could never go red.
2. **A wrong moment.** axe reported 727 colour-contrast violations that vanished on retry. It was
   auditing *during* a dialog's fade-in, sampling every element through a half-transparent overlay.
   The "flake" was a real measurement of a transient state.
3. **A wrong date.** `home.spec.ts` asserted `getByText('12')` without `exact`, which also matched
   the activity feed's "12d ago". The test passed or failed depending on **the day it ran**, and it
   went off the morning the fixture turned 12 days old.
4. **A wrong claim.** "The connector actually asks before it walks a root" asserted that loading
   succeeded — which stays true with the permission call deleted, because a plugin that never asks
   loads just as successfully.

**Why:** a passing test proves *some* path reached the assertion, not that the path you meant is the
one that did. Unit mismatches, timing, ambient state (dates, viewport, animation) and
success-shaped assertions all satisfy an expectation without exercising the mechanism.

**How to apply:**

1. **Make it fail on purpose, once.** Remove the `emulateMedia` call, delete the guard, strip the
   declaration — whatever the test claims to protect. If it stays green, it is not evidence yet. This
   is the cheapest of the four fixes and catches the most.
2. **Parse, do not string-match, anything a browser computes.** Durations, colours and sizes are
   serialised in whatever form the engine prefers (`1e-05s`, `rgb()` vs `rgba()`, `0px`).
3. **Wait for animations before auditing.** `await Promise.all(document.getAnimations().map(a =>
   a.finished.catch(() => undefined)))` — and catch, because a cancelled animation rejects. Any axe
   run right after opening an animated surface is otherwise measuring a transition.
4. **Assert exactly.** `getByText(x)` is a substring match; relative timestamps, counts and ids
   collide with it. Prefer `{ exact: true }` and scope by role or region.
5. **Suspect "flaky" before believing it.** Three of the four above first presented as flakiness.
   Retry-green is a hypothesis, not a diagnosis — read the failure before adding a retry.

See [[loading-a-plugin-successfully-proves-nothing]] (case 4's general form) and
[[mutation-checks-audit-the-comment-not-only-the-code]].
