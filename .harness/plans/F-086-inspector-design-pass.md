# Plan: F-086 Inspector v3 — a design-review pass, not another rebuild

- **Feature:** F-086 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-49, NFR-14
- **Service / package:** apps/web
- **Author:** Claude (Opus 4.8) · **Date:** 2026-07-17

## Intent

User item 9: *"The UI/UX of the inspector page is not professional. Make it professional and
enterprise grade."* — said about a page **F-062 had rebuilt three commits earlier**. So the brief was
explicitly *not* another quick restyle: screenshot first, judge against the design system, change the
least that resolves the critique.

## What the audit actually found (design-review skill, before-screenshots first)

The gap was not structure — F-062's structure (form → session → scores → sections → trace, honest
empty guidance, agent-ready export) is right. The gap was **five mechanical defects in execution**:

1. **~52px of dead space inside every card.** The shadcn Card base carries `gap-6`; every other
   dashboard surface neutralizes it with `gap-0`, and the inspector never did — stacking `gap-6` +
   `pb-3` + `pt-4` between each title and its content. This single miss produced most of the
   "hollow, unfinished" read.
2. **Nested cards** (an explicit design-review anti-pattern): each fragment was a *bordered* box
   inside the section Card, containing an inset "Why included" box, an inset `<pre>`, and a bordered
   footer — three surface levels deep.
3. **A raw 64-char sha256 printed as a full wrapping line under every fragment.** F-062 "demoted" the
   ref below the citation but still printed it; N fragments = N lines of hash noise.
4. **Raw compiler strings as section headings** — "code", "memory", lowercase, no counts: debug
   output styled as titles.
5. **One card shouting** — the form's default-size `CardTitle` against `text-sm` everywhere else.

## The changes (smallest that resolve the hits — remove, don't add)

- `gap-0` on all seven inspector Cards; headers normalized to the dashboard's `p-0 pb-4` /
  content `p-0` rhythm.
- Fragment flattened to **one quiet surface** (`bg-background/30`, no border): why-included is prose
  with a label, only the code body keeps its own ground, the footer strip loses its border.
- The ref becomes a 10-char identifier beside the score, full hash on `title` and in the Markdown
  copy — reachable, never printed.
- Section headers: `capitalize` + a fragment count in the header row.
- Form title → `text-sm` ("Compile context"); description tightened.

## Verification

- Web unit 18/18 (F-062's honest-empty-guidance tests untouched and green — the acceptance's
  do-not-regress).
- Inspector e2e including the **axe WCAG A/AA sweep** — which caught a real violation in the first
  version of this polish: `opacity-60` on the truncated ref computed **3.33:1** against the fragment
  surface. `muted-foreground` is already AA-tuned; dimming it further broke the guarantee. Fixed by
  removing the alpha, and the catch is the reason the sweep is in the loop.
- Full gates: typecheck 40/40, lint 23/23, format, test 38/38, build 20/20.
- Before/after screenshots (dark) + a light-mode (Notebook) spot check: the package content now
  starts a full screen earlier; sections + trace fit where one fragment used to.

## Scope honesty

The acceptance imagined a "v3". The audit showed v3 was not needed: the professionalism gap was
execution, not architecture, and a rebuild would have discarded F-062's correct decisions to fix a
spacing utility and a nesting depth. This is the design-review skill working as intended — audit
before deciding, then the minimum. If the maintainer still reads the page as unprofessional after
this, the next step is a *directed* critique (which specific surface, against which reference), not
another blind pass.
