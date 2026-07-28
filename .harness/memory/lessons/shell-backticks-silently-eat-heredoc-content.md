---
id: shell-backticks-silently-eat-heredoc-content
kind: lesson
title: Backticks inside single-quoted shell strings are command substitution — they delete text and nothing fails
links:
  - .harness/state/effects.json
  - .harness/protocols/effect-link.md
confidence: 0.95
created: 2026-07-28
---

**What happened:** F-065's effect-links were written by piping a JS one-liner into `node -e '...'`.
Several `rationale`/`ref` strings used a backtick for an apostrophe (`principal\`s`). Inside the
**bash** `node -e '…'` invocation those backticks opened command substitution: bash ran the enclosed
words as commands, printed a syntax error, and substituted **nothing**. `verify-state.mjs` then
reported "✓ state valid — 32 effect-links", because a shorter string is still a valid string.

Three of nine `to` entries vanished and two rationales lost their middle. Nothing failed. It was
caught only by reading the written file back.

**Why it matters:** this is the same failure mode F-064 hit when a catalog value was seeded from a
truncated lint message — *content silently lost, with every gate green*. Structural validators check
that a field is a non-empty string; they cannot check that it still says what was meant.

**How to apply:**
- Never build multi-line or prose-carrying content through `node -e '…'` in bash. **Write a `.mjs`
  file with the Write tool and run it** — no shell quoting layer, so no substitution.
- The same applies to `python -c`, `sed`, and heredocs that are not quoted (`<<EOF` interpolates;
  `<<'EOF'` does not).
- After any scripted edit to a state file, **read the field back** and check its tail, not just that
  the file parses. A truncation shows up at the end.

See [[engineering-standards]].
