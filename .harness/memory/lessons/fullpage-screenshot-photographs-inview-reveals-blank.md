---
id: fullpage-screenshot-photographs-inview-reveals-blank
kind: lesson
title: A fullPage screenshot photographs whileInView reveals as blank — scroll the page first, and diff a control page before blaming your change
links:
  - apps/marketing/lib/motion.tsx
  - docs/design/MARKETING-DESIGN.md
  - packages/skills/scripts/generate.mjs
confidence: 0.95
created: 2026-07-21
---

**What happened (F-054 screenshot review):** the first `/skills` capture came back with the hero
rendered and **everything below it blank** — no cards, no install section. The obvious reading was
"my page is broken", but the e2e had just asserted `toBeVisible()` on every one of those headings
and passed.

Both facts were true. `Reveal` (`lib/motion.tsx`) is `initial={{opacity: 0}}` + `whileInView`, and a
`fullPage: true` screenshot **does not scroll** — it captures the whole document in one pass, so
nothing below the first viewport ever intersects and the reveals never fire. Playwright's
`toBeVisible()` is also blind to it: it checks for a non-empty box and `visibility`, and
**`opacity: 0` still counts as visible**. So the test could not have caught it and the screenshot
could not have shown it.

The same capture also showed a washed-out white band over the hero. Capturing the **untouched
`/pricing` page with the identical script** reproduced it exactly — a WebGL-canvas artifact of the
capture, not the change.

**Why it matters:** the design protocol makes screenshot review part of done, so a systematically
misleading capture either wastes an hour chasing a phantom or, worse, gets waved through as "that's
just how it screenshots" — at which point the review stops being a gate at all.

**How to apply:**
- Before a `fullPage` capture, **walk the page** so every `whileInView` fires, then return to the
  top: step `window.scrollTo` by ~0.6 viewport heights with a short pause, scroll back, settle.
- **Capture a control page you did not touch** with the same script before attributing any anomaly
  to your change. It is one extra minute and it is the difference between a finding and a phantom.
- Do not lean on `toBeVisible()` to prove something is *seen* — assert computed `opacity`, or assert
  the rendered pixels, when visibility is the actual claim.
- `reducedMotion: 'reduce'` freezes the shader but does **not** disable framer-motion opacity
  (`MotionConfig reducedMotion="user"` keeps opacity, dropping transforms), so reveals still need
  the scroll.

**The corollary that earned this its keep:** the same review caught a defect no test had — manifest
prose rendering Markdown backticks literally (`` `tessera init` ``) on the public page. **Fields that
render as plain text on any surface must be gated against Markdown syntax**, because "it's markdown
elsewhere in the file" is exactly the assumption that leaks it. The generator now rejects
`` ` ``/`*`/`_`/link syntax in description/compatibility/headline/why. Screenshot review is the only
gate that reads the page as a reader does — spend it on things tests structurally cannot see.
