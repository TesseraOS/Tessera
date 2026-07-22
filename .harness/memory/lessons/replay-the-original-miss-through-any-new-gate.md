---
id: replay-the-original-miss-through-any-new-gate
kind: lesson
title: A gate added in response to a miss must be replayed against the original miss — passing on fixed content proves nothing
links:
  - apps/docs/tests/prose-counts.test.ts
  - .harness/state/effects.json
  - apps/docs/components/reference-data.tsx
confidence: 0.95
created: 2026-07-21
---

**What happened (F-054 review):** taking the MCP surface 18 → 20 tools left five hand-written docs
sentences saying "18 tools" — in the *verify* steps a user follows right after connecting an agent.
I added `apps/docs/tests/prose-counts.test.ts` to ban a hand-copied count, ran it, watched it pass,
and moved on.

It passed because the content was already fixed. When I later replayed the **five original
sentences** through the rule, it caught four. The fifth — *"list the available tools in-session —
tessera should contribute 18"* — puts the noun ~43 characters from the number, and the rule used a
24-character proximity window. **The gate would have shipped the exact bug it was written to
prevent, while showing green.**

**Why this is the general case:** a gate written after a miss is almost always authored *while
looking at the corrected text*. The corrected text is, by construction, the one input guaranteed
not to trigger it. Green means nothing until the failing input is fed back in.

**How to apply:**
- **Recover the original input and run the rule against it.** `git show <commit-before-fix>:<path>`
  is usually enough. Assert the count you expect to catch, and read which ones you didn't.
- **Then pin the regression set in the test itself**, so the rule can never drift away from the
  cases that motivated it. `prose-counts.test.ts` carries the five real sentences as an explicit
  assertion, not as a comment.
- **Interrogate the scope you chose.** Line-scoped fixed the window, but a number and its noun on
  different lines still escaped, and this prose wraps at ~85 chars while the offending line was 83 —
  one reflow from re-opening. Paragraph scope closed it, measured at zero false positives.
- **A banned literal needs a sanctioned alternative**, or the rule is a trap. The tool half had
  `<McpToolCount />`; the command half banned a number with nothing to use instead until
  `<CliCommandCount />` was added.

**The effect-link half of the same lesson:** E-026 listed the artifacts, the render components, and
the tests over them — a complete inventory of everything that *consumes* the generated data. The
falsehood landed in prose that *quotes* it. **When a generated fact changes, grep the content for
the old value, not only for the modules that import it.** See also
[[fullpage-screenshot-photographs-inview-reveals-blank]] — the same review, and the same theme:
the gates that read a change the way a *user* would are the ones that find what the others cannot.
