---
id: whileinview-reveals-vs-fullpage-screenshot-capture
kind: lesson
title: whileInView reveals stay invisible in Playwright fullPage screenshots — scroll-walk the page first (reduced motion does NOT neutralize opacity)
links:
  - apps/marketing/lib/motion.tsx
  - apps/marketing/tests/e2e/home.spec.ts
  - docs/design/MARKETING-DESIGN.md
confidence: 0.9
created: 2026-07-10
---

**What happened:** F-051 v4.4's screenshot review captured the subpages with
`page.screenshot({ fullPage: true })` under `reducedMotion: 'reduce'`. Every
below-the-fold section wrapped in the framer-motion `Reveal` (`whileInView`) rendered as
an EMPTY band — the pricing table, FAQ, and CTA copy were missing from the evidence
images even though e2e (which actually scrolls/queries) was green.

**Why (two stacked mechanisms):**
1. Playwright's `fullPage` capture does not fire IntersectionObserver for content below
   the initial viewport — it stitches the page without real scrolling, so `whileInView`
   never triggers and elements hold their `initial={{ opacity: 0 }}` state.
2. `MotionConfig reducedMotion="user"` only disables **transform/layout** animations;
   framer still runs opacity animations under reduced motion (by a11y design). So
   "reduced motion = final layout" — true for our CSS `.rise-in` kill-switch — is NOT
   true for framer `whileInView` opacity: the trigger is still the observer.

**How to apply:**
- Before any fullPage screenshot of a page using in-view reveals, **walk the page**:
  `page.evaluate` a loop scrolling by `innerHeight/2` steps with ~60ms pauses, then
  scroll back to top, settle ~400ms, then capture. (See the capture script pattern in
  the F-051 records.)
- Screenshot evidence and axe/e2e are different observers: e2e passing does not mean the
  screenshot pipeline saw the same pixels. When an evidence image shows a blank band,
  suspect the CAPTURE first — check the page live (`get_page_text`/real scroll) before
  "fixing" component code that isn't broken.
- Corollary kept from this session: `getByText('8,000-token …')` is substring-matched —
  pass `{ exact: true }` when one entitlement string is a suffix of another
  (`128,000-token …`), and scope pricing locators to `#plans` because plan names repeat
  in the nav.
