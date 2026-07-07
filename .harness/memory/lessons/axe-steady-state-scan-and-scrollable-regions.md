---
id: axe-steady-state-scan-and-scrollable-regions
kind: lesson
title: Run axe scans at steady state (emulate reduced motion) and make scrollable pre blocks focusable named regions
links:
  - apps/marketing/tests/e2e/home.spec.ts
  - apps/marketing/components/ui/code-block.tsx
  - apps/marketing/eslint.config.mjs
confidence: 0.9
created: 2026-07-07
---

**What happened (two F-051 e2e failures):**
1. axe reported hundreds of contrast violations like `#1b1b1b on #0c0c0c` — colors that exist
   nowhere in the tokens. It was scanning **mid-entrance-animation**: one-shot `rise-in`
   elements at intermediate opacity produce blended foreground colors.
2. axe `scrollable-region-focusable` failed on a `<pre class="overflow-x-auto">` code block —
   at 375px it can scroll, so keyboard users must be able to reach it (WCAG 2.1.1).

**Why:** axe measures the DOM as-is at scan time; timing-dependent scans are flaky and test
the wrong thing. And jsx-a11y's `no-noninteractive-tabindex` conflicts head-on with axe's
scrollable-region rule — both are "a11y correct" until scoped.

**How to apply:**
- In axe e2e tests, `page.emulateMedia({ reducedMotion: 'reduce' })` **before** `goto` — the
  global reduced-motion kill-switch renders the final layout instantly, making the scan
  deterministic. Keep one separate test asserting the animated path ends fully visible.
- Give scrollable code blocks `tabIndex={0} role="region" aria-label={label}`, and scope the
  eslint rule to allow it: `'jsx-a11y/no-noninteractive-tabindex': ['error', { roles:
  ['tabpanel', 'region'] }]` — never disable the rule wholesale.
