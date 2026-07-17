# Plan: F-080 Overview v2 — retire the greeting hero, gate onboarding on real state, bound the feed

- **Feature:** F-080 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-38 (live updates), FR-49 (UX baseline), FR-62 (sources)
- **Service / package:** apps/web
- **Author:** Claude (Opus 4.8) · **Date:** 2026-07-17
- **Decision record:** [ADR-0053](../../docs/adr/0053-overview-leads-with-state-not-a-greeting-band.md)

## Intent

Maintainer review, 2026-07-17: the Overview's top card *"is static and doesn't suit a dashboard.
It's very unprofessional"*; onboarding still shows for a workspace with data; the activity list grows
the page without bound.

Done means: the Overview opens on the numbers, onboarding appears exactly once and only while it is
true, and the feed stays inside its card.

## Approach

Three changes to one page, plus the ADR that makes the first one legal.

1. **ADR-0053 first** (done before code — golden rule 7). Removing the hero deviates from
   **ADR-0047**, which sanctioned "the overview hero band" in its *hard* illustration usage budget,
   and from DESIGN-SYSTEM §11 which codifies it. Supersede **in part** — the same pattern ADR-0047
   itself used against ADR-0023 — and edit §11 to match, so the docs cannot contradict the code.
2. **Retire `HeroBand`.** Delete it; the Overview leads with `DashboardStats`. Keep an `sr-only`
   `<h1>Overview</h1>`: the hero owned the page's only `h1`, and the breadcrumb header is a landmark,
   not a heading.
3. **Gate onboarding on `/v1/stats`**, not the feed (ADR-0053 §2 — the load-bearing correction; see
   Risks). The card renders only when `sources === 0 && documents === 0`. `useStats()` already
   invalidates on `source.scan.completed`, so it self-resolves the moment data lands.
4. **Bound the feed.** `max-h-[22rem] overflow-y-auto` on the `<ul>` itself.

## Files to touch

- `apps/web/components/dashboard.tsx` — delete `HeroBand`; add the `useStats` gate + `GetStarted`.
- `apps/web/components/activity-feed.tsx` — bounded, focusable scroll on the list.
- `docs/adr/0053-*.md` (new), `docs/adr/0047-*.md` (status), `docs/adr/README.md` (index),
  `docs/design/DESIGN-SYSTEM.md` (§11 budget + mascot placements).
- `apps/web/components/dashboard.test.tsx` (new).

## Anticipated effects

- **No API/contract change** — client-only; `/v1/stats` is consumed as-is, and no field is added to
  it (ADR-0053 keeps the schema's refusal of trend fields). Nothing in `effects.json` is invalidated.
- **E-004 (design tokens / DESIGN-SYSTEM)** is the live one: §11's usage budget is a *contract* the
  `design-review` skill audits against. Editing the budget without editing the doc would leave the
  gate enforcing a retired rule — hence the doc edits ship in this feature, not after it.
- `Constellation` is **not** orphaned (still on `/signin`, the graph empty state, and now the
  onboarding card), so ADR-0047's art layer survives the budget narrowing.
- Consumers of `useStats` gain one more caller. Same query key ⇒ shared cache, one fetch.

## Test plan

- **Unit (`dashboard.test.tsx`, new):** onboarding shows for `{sources: 0, documents: 0}`; hides for a
  populated workspace; **stays hidden for a populated workspace with an empty feed** (the exact
  regression the `/v1/stats` gate exists to prevent); shows for an empty workspace *with* session
  activity (activity is not data); shows nothing while loading; shows nothing on error. Hero copy is
  gone; the `h1` survives.
- **Regression:** `activity-feed.test.tsx` and `home.spec.ts` must stay green untouched. `home.spec.ts`
  resolves the feed via `getByRole('list', { name: 'Recent activity' })` — so the scroll must go on
  the `ul`, preserving role + label.
- **a11y:** the axe gate runs `wcag2a/2aa/21a/21aa`, which includes **`scrollable-region-focusable`**
  — a scrollable list of non-focusable rows needs `tabIndex={0}` or a keyboard user cannot scroll it.

## Verification

Gates: `state`, `typecheck`, `lint`, `format`, `test`, `build`. Plus the web a11y/e2e suite
(`home.spec.ts`) for the scroll + heading changes, and screenshots across themes per the frontend
quality bar.

## Risks / open questions

- **The gate signal was the main risk, and it is resolved.** "Hide it once there's activity" reads
  naturally and is wrong: the feed is session-only by design, so it empties on reload and the card
  would greet an established user forever. `/v1/stats` is persisted. Pinned by test.
- **Removing the `h1`** is an a11y regression if simply deleted; `sr-only` keeps it at zero visual
  cost.
- **Duplicate CTA, accepted:** on an empty workspace "Connect a source" renders twice — onboarding
  step 1 and the feed's empty-state CTA (asserted by `activity-feed.test.tsx:85`). Out of scope for
  the reported items and tested behaviour; noted for F-064, not changed here (golden rule 2).
- **Scope split (mid-implementation):** the activity chart (item 5) moved to **F-084**. Aggregating
  the audit trail honestly needs a store-level `GROUP BY` — the alternative, paging the window into
  the API to count it, is the same thing this feature refuses to let the client do. That is an
  `AuditLog` port change (both adapters + conformance, E-020) colliding with F-078, and ADR-0051
  records that both adapters hardcode descending `seq`, so "oldest retained event" is not even a
  cheap query. ADR-0053 clause 3 records the decision; F-084 implements it.
