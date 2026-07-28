---
id: synthesized-clicks-lose-to-a-focus-refetch
kind: lesson
title: A dead-looking click in the in-app browser can be a refetch re-rendering the row — Playwright is the arbiter
links:
  - apps/web/lib/api/hooks.ts
  - apps/web/tests/e2e/home.spec.ts
confidence: 0.85
created: 2026-07-28
---

**What happened:** verifying F-065's bell by hand in the in-app browser, clicking a notification row
did nothing — no request, no optimistic update — while a programmatic `element.click()` on the same
button worked, and "Mark all as read" *in the same popover* worked with a real click. A capture-phase
listener confirmed the trusted `click` reached the button and was not `defaultPrevented`.

The rows are rendered from a TanStack Query result with `refetchOnWindowFocus` on. Each synthesized
click **gave the window focus**, which fired a refetch, which re-rendered the list between
`pointerdown` and `mouseup` — so the element the click resolved against was no longer the one React
held a handler for. `Mark all as read` sits outside the refetched list, which is why it survived.

A real user never sees this: their window already has focus, so no refetch is triggered by the click.

**How to apply:**
- **Do not conclude "defect" from a dead click in the in-app browser.** Check whether the element is
  inside a query-backed list, and whether the click could have triggered a refetch.
- **Settle it in Playwright**, which drives a browser whose window is already focused and which the
  repo already gates on. F-065's row mark-read passed there first try, on the same code.
- The general form: hand-driving a page is for *seeing* the UI. Anything about whether an interaction
  works belongs in the e2e suite, where it also keeps working.

See [[frontend-quality-bar]].
