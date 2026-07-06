# Plan: F-041 — Dashboard: Sources & Settings (connector management UI with live scan progress)

- **Feature:** F-041 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-46 (settings/config UI), FR-62 (agent-first source ops — the web mirror)
- **ADRs:** none new. Consumes the ADR-0040 runtime source surface (`/v1/sources*`, F-038), ADR-0022 (interim `lib/api` client — the web app does not adopt `@tessera/sdk` until F-045), ADR-0021/DESIGN-SYSTEM (frontend), FR-38 SSE (F-021).
- **Package:** `@tessera/web` (only) · **Author:** Claude · **Date:** 2026-07-06
- **Verification:** typecheck · lint · test · e2e (keep format + build + state green) + **screenshot-verify** (frontend bar).

## Intent
Two `/sources` and `/settings` **ComingSoon** stubs become real, enterprise-grade surfaces over the now-live runtime (F-038/F-039/F-040). A user (and, via REST/MCP, an agent — this is the web mirror of the agent-first source surface) can **register a filesystem/git repository, scan it, watch live scan progress, and remove it**, and can **read the deployment's health, budgets, and governance posture**. No fabricated data anywhere (ADR-0022): every number/row comes from a real API call; where the API has **no** surface, the UI says so rather than inventing a control.

## Boundaries confirmed by reading the code (honesty over aspiration)
- **Source kinds the runtime actually supports = `filesystem` + `git`** (`SUPPORTED_SOURCE_KINDS` in `packages/config/src/profiles/local.ts`; `connectorForRecord` maps only those, both keyed on `config.root`). The wire schema (`apps/api/src/schemas/sources.ts`) accepts `{ kind: string, label?, config: { root } }`. **GitHub is not wired into the runtime source service** and its config shape (owner/repo/token) is not on the wire — so offering a working GitHub form would be a **fake control** that 400s. Decision: ship **filesystem + git** forms (connector-specific labels/help), and present **GitHub as an explicitly unavailable option** (disabled, with a one-line "not yet available in this deployment" note). Wiring a GitHub *source* into the runtime is an ingestion/config/api change — a **documented seam**, not this web feature.
- **Settings has no dedicated config endpoint.** Honest data sources that already exist: `GET /health` (liveness), `GET /ready` (readiness + dependency checks — the Local profile reports a `sqlite` check), `GET /v1/billing/plans` (real entitlements → budgets: `maxTokensPerCompile`, `maxMonthlyCompiles`, `maxSeats`). Retention/RBAC posture is a **read-only policy card** (NFR-13, mirroring the F-027 governance view). A richer `GET /v1/info` (profile name + provider ids) is a **documented seam** (API-side — would be an E-003 producer + E-014 change, out of scope for this `web` feature; F-041's declared effects are E-003 *consumer* + E-004 *UI*).
- **Nav already lists Sources (Connect group) + Settings (footer)** in **both** sources (`lib/nav.ts` + `components/app-shared.tsx`). No nav change needed; the plan **verifies** they stay consistent (acceptance bullet 3).
- **This is the app's first SSE consumer** (the 2026-07-04 review found zero `/v1/events` consumers; F-060 is the Overview feed). F-041 consumes the stream **scoped to scan progress**. Built as a small, testable hook so F-060 can reuse the transport.

## Approach / increments (each keeps gates green + is committed)

**Reused, not rebuilt:** the interim `lib/api` typed client + TanStack hooks (ADR-0022), `Card`/`Table`/`Badge`/`Select`/`Dialog`/`Input`/`Button`/`Skeleton`/`Tooltip` UI primitives, `EmptyState`/`ErrorState`/`ComingSoon`, the `CaptureMemoryDialog` mutation+toast+reset pattern, the `AuditView`/`GovernanceView` card/table craft, `sonner` toasts, `@axe-core/playwright` a11y e2e, the `page.route()` network-stub test pattern.

### Increment 1 — data layer (`apps/web/lib/api`)
- **`types.ts`** (+): `SourceKind = 'filesystem' | 'git' | 'github'` (github present for labeling only), `Source { id, kind, label, config: Record<string, unknown>, createdAt }`, `RegisterSourceBody { kind, label?, config: { root } }`, `SourceListResponse { sources }`, `ScanSummary { added, modified, removed, unchanged }`, `ScanResult { source, summary }`, `ScanStatus { state: 'idle'|'running'|'error', lastScan?: { summary, at }, error? }`. Billing: `Entitlements`, `Plan`, `PlansResponse`. Ops: `HealthStatus { status: 'ok' }`, `ReadyCheck { name, ok, detail? }`, `ReadyStatus { status: 'ready'|'not_ready', checks }`. (Types mirror the `/v1` Zod schemas — the ADR-0022 hand-mirror convention until F-045.)
- **`client.ts`** (+): `api.listSources`, `api.registerSource`, `api.removeSource`, `api.scanSource`, `api.getScanStatus`, `api.getPlans`; plus root (non-`/v1`) ops `api.getHealth`, `api.getReady` via a small `rootFetch` that derives the origin by stripping the trailing `/v1` from `BASE_URL` (health/ready are unversioned). `getReady` treats **503 as a valid body** (readiness report), not an error.
- **`hooks.ts`** (+): `useSources`, `useRegisterSource`, `useRemoveSource`, `useScanSource`, `useScanStatuses` (or per-source `useScanStatus`), `usePlans`, `useHealth`, `useReady`. Mutations invalidate `['sources']`; a scan also refreshes the per-source status.
- **`events.ts`** (new): a browser-`EventSource` hook `useScanEvents()` that connects to `${ORIGIN}/v1/events`, listens for `source.scan.started` / `source.scan.completed` / `document.ingested`, and reduces them into `{ [sourceId]: { running, ingested, lastSummary } }`. The reducer `scanEventsReducer(state, event)` is a **pure, exported function** (unit-tested offline — no live socket needed). SSR-guarded (`typeof EventSource !== 'undefined'`); cleans up on unmount.

### Increment 2 — Sources page (`/sources`)
- **`components/sources/register-source-dialog.tsx`** (new): `Dialog` mirroring `CaptureMemoryDialog`. Kind `Select` (Filesystem / Git / GitHub — GitHub `disabled` with a note). Connector-specific field: filesystem → "Directory path" (help: absolute path to the folder to index); git → "Repository path" (help: local working-tree root; git provenance is read from it). Client-side validation (non-empty trimmed path) → `useRegisterSource`; success toast + close + `['sources']` invalidate; error toast from `TesseraApiError`.
- **`components/sources/sources-view.tsx`** (new): header card ("Sources" + "Register source" button) → the register dialog; `useSources()` with **loading (skeleton) / error (`ErrorState` + retry) / empty (`EmptyState` with a register CTA) / list** states. Each source = a `Card`: kind icon + label, mono `config.root`, `createdAt`, a **live status badge** (idle / **Scanning…** with the running document count from SSE / last-scan summary `+A ~M −R` + relative time / error), and actions **Scan** (`useScanSource` → toast with the returned summary) + **Remove** (confirm, `useRemoveSource`). Live progress merges `useScanEvents()` (SSE, primary) with `useScanStatuses()` (query, fallback/authoritative on completion). Provenance-first, token-lean, WCAG AA (labelled controls, `aria-busy`, non-color status cues).
- **`app/sources/page.tsx`**: replace `ComingSoon` with `<SourcesView />` in the standard `mx-auto max-w-5xl` container (matching `/audit`).

### Increment 3 — Settings page (`/settings`)
- **`components/settings/settings-view.tsx`** (new), three read-only cards:
  1. **Deployment & health** — API endpoint (base URL), a live **health** badge (`useHealth`), and a **readiness** badge + a checks table (`useReady`: name / ok / detail). Honest: "This deployment" reflects what the API reports.
  2. **Plans & budgets** — `usePlans()` table: plan name, price, **compile budget** (`maxTokensPerCompile`), monthly compiles, seats; the free/open-core default is highlighted. Loading/error/empty states.
  3. **Governance & retention** — a read-only posture card (append-only, tenant-scoped, retention by max-age/max-entries; RBAC least-privilege) with a link to `/governance`, mirroring `GovernanceView`'s retention card (NFR-13). Clearly labeled "managed server-side" — no fake toggles.
- **`app/settings/page.tsx`**: replace `ComingSoon` with `<SettingsView />`.

### Increment 4 — tests + records
- **Unit (vitest + RTL):** `sources-view.test.tsx` (renders a stubbed list; empty; error+retry; opens the register dialog; GitHub option disabled), `register-source-dialog.test.tsx` (validation gate; submit calls the mutation), `settings-view.test.tsx` (renders health/ready/plans from stubbed hooks), `events.test.ts` (the pure `scanEventsReducer`: started→running, document.ingested increments, completed→summary). Mirror `search-view.test.tsx`'s QueryClient wrapper + `api` mock.
- **e2e (Playwright + axe):** `sources.spec.ts` — stub `**/v1/sources` (list), `**/v1/sources/*/scan` (GET status), `**/v1/events` (an empty/never-ending stream is fine); assert the list renders, the register dialog opens with validated fields, GitHub is disabled; **WCAG A/AA clean**. `settings.spec.ts` — stub `**/health`, `**/ready`, `**/v1/billing/plans`; assert the three cards render (endpoint, a plan budget, retention posture); **WCAG A/AA clean**.
- **Nav:** confirm `lib/nav.ts` + `app-shared.tsx` both point to `/sources` + `/settings` (already true) — no change, but part of DoD.
- **Records:** `effects.json` (E-003 gains the sources/settings web consumers; E-004 gains the sources/settings views), `feature_list.json` F-041 → `done` (+ notes), `progress.md`, memory only if a reusable lesson emerges (e.g. the SSE-consumer + honest-boundary pattern).

## Files to touch
- `apps/web/lib/api/`: `types.ts`, `client.ts`, `hooks.ts`, `events.ts` (new), `events.test.ts` (new).
- `apps/web/components/sources/`: `sources-view.tsx` (new), `register-source-dialog.tsx` (new), `sources-view.test.tsx` (new), `register-source-dialog.test.tsx` (new).
- `apps/web/components/settings/`: `settings-view.tsx` (new), `settings-view.test.tsx` (new).
- `apps/web/app/sources/page.tsx`, `apps/web/app/settings/page.tsx` (replace stubs).
- `apps/web/tests/e2e/`: `sources.spec.ts` (new), `settings.spec.ts` (new).
- `.harness/state/{effects.json, feature_list.json, progress.md}`; memory + index (if a lesson lands).
- Possibly `components/ui/alert-dialog.tsx` (shadcn) for the remove confirm — **or** reuse the existing `Dialog` to avoid adding a component (prefer reuse).

## Anticipated effects
- **E-003** (REST contracts) — new **consumers**: the web app reads `GET /v1/sources`, `POST /v1/sources`, `DELETE /v1/sources/:id`, `POST /v1/sources/:id/scan`, `GET /v1/sources/:id/scan`, `GET /v1/events` (SSE), `GET /v1/billing/plans`, `GET /health`, `GET /ready` via `lib/api`. No producer/schema change → OpenAPI/SDK untouched.
- **E-004** (design tokens / UI) — new token-consuming views (`sources`, `settings`) + the register dialog; tokens-only, WCAG AA.
- (No E-014/E-021 change — the runtime/source contracts are unchanged; this is a pure consumer.)

## Test plan
- **Unit:** views render list/empty/error; register-dialog validation + submit; the pure SSE reducer; settings renders from stubbed hooks.
- **e2e:** `/sources` + `/settings` render from route-stubbed APIs; register dialog opens + validates; GitHub disabled; **axe WCAG A/AA = 0 violations** on both.
- **Screenshot (frontend bar):** boot the web app (and, where practical, the real Local API) and screenshot `/sources` (empty + with a source + scanning) and `/settings` (health/plans/retention). Where the API isn't reachable, screenshot the honest error/empty states.

## Verification
`node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` · `pnpm test:e2e` · `pnpm build`. Plus screenshot verification of both routes.

## Risks / open questions
- **SSE in tests** — the live socket is hard to assert in Playwright route-mocking; mitigated by making the reducer a **pure unit-tested function** and stubbing `/v1/events` as an inert stream in e2e (the page must render + stay a11y-clean with no events). A live SSE round-trip is covered by the API-side F-021 e2e already.
- **`/ready` returns 503 when not ready** — `getReady` must read the body on 503 (not throw), or the health card can't show "not ready". Handled in `client.ts`.
- **GitHub honesty** — disabled option + note; the runtime-wiring seam is documented here and in the feature notes so it isn't mistaken for a regression.
- **No scope creep** — strictly `@tessera/web`; no API/config/SDK change. The `/v1/info` and GitHub-source seams are recorded, not built.
