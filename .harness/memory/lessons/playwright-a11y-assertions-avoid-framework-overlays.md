---
id: playwright-a11y-assertions-avoid-framework-overlays
kind: lesson
title: In Playwright, target error text by id (not role=alert) and run axe BEFORE opening a Radix menu — Next's route announcer and open dropdowns pollute the a11y tree
links:
  - apps/web/tests/e2e/auth.spec.ts
  - apps/web/app/signin/page.tsx
confidence: 0.9
created: 2026-07-14
---

**What happened:** Two false failures while writing F-045's `auth.spec.ts` against real pages:

1. `expect(page.getByRole('alert')).toBeVisible()` for a form error → **strict-mode violation:
   resolved to 2 elements.** The form's `<p role="alert">` AND Next.js's
   `<div id="__next-route-announcer__" role="alert">` (which Next injects on every client route
   change) both matched.
2. `new AxeBuilder({ page }).analyze()` run **while a Radix DropdownMenu was open** → serious
   `aria-hidden-focus` violation. Radix marks the rest of the page `aria-hidden` for the focus trap,
   but the sidebar/command-palette buttons underneath stay focusable → axe flags the (real, but
   test-induced) contradiction.

**Why:** Both are artifacts of the framework's live DOM, not app bugs — the route announcer is a
permanent `role=alert` region, and an open modal-like overlay deliberately aria-hides the
background (with focusables still in the tree until the overlay closes).

**How to apply:**
1. Assert form/inline errors by a **stable id or exact text**, never the bare `alert` role:
   `page.locator('#token-error')`. (Also give such messages an `id` + `aria-describedby` for a11y.)
2. Run **axe on the resting page state** — before opening any dropdown/dialog/popover. Scan the
   overlay separately if you must, but never with a trigger left open from a prior step.
3. Corollary: pages with **infinite CSS art animations** (the §11 illustration layer) can hang the
   Browser-pane screenshot tool on a slow disk; freeze with an injected
   `*{animation:none!important}` style, or screenshot the production build (faster than `next dev`).
   The accessibility/functional proof is the axe + Playwright e2e, not the screenshot.
