# Plan: F-014 Dashboard — global search + Context Package inspector + UX baseline

- **Feature:** F-014 (see [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-41 (search), FR-44 (Package Inspector), FR-49 (UX baseline), NFR-9 (a11y)
- **Service / package:** `apps/web` / `@tessera/web`
- **Author:** Claude · **Date:** 2026-06-30

## Intent
Make the dashboard *do* something against the real engine: global **search** with provenance, and
the flagship **Context Package inspector** that renders the compilation trace (stages, scores,
sources, per-fragment "why included"). Production-real data via a typed `/v1` client (ADR-0022) —
no dummy data in the app.

## Approach
- **Data layer (ADR-0022):** `lib/api` — `apiFetch` (base URL via `NEXT_PUBLIC_API_BASE_URL`,
  default `http://localhost:3000/v1`; parses the `{error}` envelope → `TesseraApiError`), typed
  methods (`search`, `compile`) mirroring the API Zod schemas, and TanStack Query hooks
  (`useSearch`, `useCompile`). Add `QueryClientProvider` to `app/providers.tsx`.
- **Search surface (FR-41):** client page with a debounced query, results as ranked candidates,
  each showing **provenance** — the contributing signals (semantic/keyword/graph/symbolic) with
  per-signal rank/score/weight (the API's `signals[]`). Full UX states.
- **Inspector surface (FR-44):** a task+budget form → `POST /v1/compile`; render the
  `ContextPackage`: sections → fragments (text, kind, tokens, score, **whyIncluded**, provenance
  signals/source), the **CompilationTrace** (per-stage input/output counts + drops with reasons),
  and package **scores** (budget adherence, provenance coverage, redundancy). This is the
  provenance-first flagship.
- **Reuse** F-028 shell/primitives; add a `Inspector` nav item; replace the `/search` stub.

Increments: (1) data layer + hooks; (2) shared provenance primitives (signal badges, score bar);
(3) search page; (4) inspector page; (5) tests + e2e; (6) verify + record.

## Files to touch
- `apps/web/lib/api/{types.ts,client.ts,hooks.ts}` — typed client + React Query hooks.
- `apps/web/app/providers.tsx` — add `QueryClientProvider`.
- `apps/web/components/provenance/*` — signal badges, score bar, "why included".
- `apps/web/app/search/page.tsx` (replace stub) + `components/search/*`.
- `apps/web/app/inspector/page.tsx` (new) + `components/inspector/*`; `lib/nav.ts` (+ Inspector).
- Tests: `lib/api/*.test.ts`, component tests; `tests/e2e/{search,inspector}.spec.ts` (Playwright
  `route` stubs the API at the boundary — test infra, not app data) + axe.

## Anticipated effects
- **E-003** advanced (the dashboard now consumes REST `/v1` search + compile, and renders the
  ContextPackage/trace — the consumer side of E-013). No API contract change. `lib/api` is the
  seam the F-022 SDK later replaces (ADR-0022).

## Test plan
- **Unit:** `client` parses the error envelope → `TesseraApiError`; hooks call the right endpoint.
- **Component (RTL):** search renders results + provenance + empty/error; inspector renders
  sections/fragments/whyIncluded + trace drops + scores.
- **E2E (Playwright + axe):** search flow and inspector flow with `route`-stubbed `/v1`; WCAG
  A/AA scan on both. (a11y gate.)

## Verification
Gates with evidence: state · typecheck · lint · format · test · build · e2e (+ axe a11y).

## Risks / open questions
- **No live backend in CI** → e2e stubs `/v1` via Playwright `route` (test infra; the app itself
  ships no mock data, per ADR-0022).
- Keep heavy surfaces lean; virtualize result lists if they grow (baseline: cap + paginate).
- `@tessera/sdk` (F-022) later supersedes `lib/api` — keep the hook surface stable.
