# Plan: F-042 — Dashboard: memory browser + Monaco authoring + timeline

- **Feature:** F-042 (see [`../state/feature_list.json`](../state/feature_list.json)) · **Requirements:** FR-45 (memory browser UI), FR-43 (timeline), FR-13 (capture/edit), renders FR-12 (immutable version lineage)
- **ADRs:** none new expected. Consumes the existing `/v1/memory` surface (F-007/F-011) via the interim `lib/api` client (ADR-0022; `@tessera/sdk` adoption is F-045). New client deps (`@monaco-editor/react` + `monaco-editor`, `@tanstack/react-virtual`) recorded in `NOTICE.md`; Monaco was the product-lead-named editor (in the feature title) so it is not a default-deviation needing an ADR — but the **offline/bundled** integration approach is recorded here.
- **Package:** `@tessera/web` (only) · **Author:** Claude · **Date:** 2026-07-06
- **Verification:** typecheck · lint · test · e2e (keep format + build + state green) + **screenshot-verify**.

## Intent
The `/memory` **ComingSoon stub** becomes the real Memory workspace: **browse/filter** memories by kind + scope (virtualized), open a lineage to see its **full immutable version history** (the supersede chain, FR-12), **author** (capture + edit) memories with a **Monaco** editor + a metadata form, and a **timeline** (FR-43) that interleaves memory lineages + audit events + live SSE updates in time order. All real data over `/v1/memory` (+ `/v1/audit`, `/v1/events`); nothing fabricated (ADR-0022).

## Boundaries confirmed by reading the code
- **`/v1/memory` fully supports this** (no API change): `GET /v1/memory?kind=&scope=` (filtered list), `GET /v1/memory/:lineageId` (current), `GET /v1/memory/:lineageId/history` (every version, oldest-first), `POST` (capture), `PATCH /:lineageId` (edit → appends a superseding version). `memorySchema` carries `version`, `supersedes`, `supersededBy`, `metadata {source,author,links,tags}`, `confidence`, `createdAt` → the supersede chain is fully renderable.
- **`lib/api` today only has `captureMemory`** + a **simplified `Memory` type** (missing `metadata`/`supersedes`/`supersededBy`). Extend both (the ADR-0022 hand-mirror convention).
- **Nav already lists Memory** (Explore group) in both `lib/nav.ts` + `app-shared.tsx` — no nav change; add a Timeline entry (see below).
- **Reuse:** `CaptureMemoryDialog` (mutation+toast pattern), `MEMORY_KINDS` labels, `useAudit`/audit types (timeline), `useScanEvents`/the SSE reducer pattern (F-041, timeline live-append), `Card/Table/Badge/Select/Dialog/Sheet/Skeleton`, `EmptyState/ErrorState`, the `page.route()` e2e stub pattern.

## Approach / increments (each keeps gates green + is committed)

### Increment 1 — de-risk Monaco + virtualization (deps + a build spike)
The highest-risk item first, gated by a real `next build`. Add deps: `@monaco-editor/react` + `monaco-editor` (editor), `@tanstack/react-virtual` (virtualization). Create `components/memory/memory-editor.tsx`: a **client-only, lazy** wrapper — `next/dynamic(() => import('@monaco-editor/react'), { ssr: false })` with a `Skeleton` fallback — configured **offline** via `loader.config({ monaco })` importing the bundled `monaco-editor` (no CDN). Markdown language, height-bounded, themed to match (light/dark via `next-themes` `resolvedTheme` → Monaco `vs`/`vs-dark`), `aria-label`, and a graceful degradation note (workers optional; main-thread language services are fine for markdown). **Verify `pnpm --filter @tessera/web build` is green with a throwaway usage before building the rest.** Record the deps in `NOTICE.md`. If the offline bundle proves unworkable in Next 16 webpack, fall back to a documented approach (recorded here) rather than shipping a CDN/network dependency.

### Increment 2 — data layer (`lib/api`)
- `types.ts`: extend `Memory` to the full schema (`metadata: { source?, author?, links?, tags? }`, `supersedes: string|null`, `supersededBy: string|null`); add `MemoryListFilter { kind?, scope? }`, `MemoryHistory { versions: Memory[] }`, `EditMemoryBody`.
- `client.ts`: add `listMemories(filter)`, `getMemory(lineageId)`, `memoryHistory(lineageId)`, `editMemory(lineageId, body)` (PATCH). `captureMemory` already exists (extend its body type with optional `scope`/`confidence`/`metadata`).
- `hooks.ts`: `useMemories(filter)`, `useMemory(lineageId)`, `useMemoryHistory(lineageId)`, `useEditMemory()` (invalidate `['memories']` + the lineage). `useCaptureMemory` already exists — make it invalidate `['memories']`.

### Increment 3 — memory browser (`/memory`)
- `components/memory/memory-view.tsx`: header (title + "New memory" → the authoring dialog) + **filters** (kind `Select`, scope `Select`/input) + a **virtualized list** (`@tanstack/react-virtual`) of memory cards (kind badge, title, scope, version, relative time); loading/empty/error states. Clicking a memory opens the **detail** `Sheet`.
- `components/memory/memory-detail.tsx` (`Sheet`): the current version (title/body rendered, metadata, confidence, scope) + a **version-history** timeline (the supersede chain from `useMemoryHistory`, oldest→newest, each version's changes, "current" badge on the head) + an **Edit** action (opens the authoring dialog in edit mode).
- `app/memory/page.tsx`: replace `ComingSoon` with `<MemoryView />`.

### Increment 4 — authoring (capture + edit) with Monaco + metadata
- Evolve `CaptureMemoryDialog` → `components/memory/memory-authoring-dialog.tsx` (capture **and** edit modes): kind `Select`, title `Input`, **body via `MemoryEditor` (Monaco)**, scope `Input`, and a metadata sub-form (source/author/tags). Capture → `useCaptureMemory`; edit → `useEditMemory` (PATCH, appends a version). Keep the existing `new-memory-button.tsx` entry point working (it opens the dialog). Real mutations + toast; invalidations refresh the browser.

### Increment 5 — timeline (`/timeline`, FR-43)
- `components/timeline/timeline-view.tsx`: a unified, time-ordered feed built from (a) **memory lineages** (`useMemories` → captured/edited entries by `createdAt`), (b) **audit events** (`useAudit` → actions; admin-gated but full-access on the Local profile), and (c) **live SSE** (`useScanEvents`-style subscription to `memory.captured` / `document.ingested` / `source.scan.completed`, **appended** at the top as they arrive). A pure `mergeTimeline(memories, audit, live)` reducer (unit-tested). Typed entry kinds with icons/colors; empty/error states.
- `app/timeline/page.tsx` (new route) + a **Timeline** nav item in **both** nav sources (`lib/nav.ts` Explore group + `app-shared.tsx`).

### Increment 6 — tests + records
- **Unit (vitest + RTL):** `memory-view` (list/filter/empty/error, virtualization renders items), `memory-detail` (renders the supersede chain, "current" badge), `memory-authoring-dialog` (validation gate; capture vs edit calls the right mutation — **mock the Monaco wrapper** to a plain `textarea` so tests stay light/deterministic), the pure `mergeTimeline` reducer, and `client` methods. Mirror the F-041 mock pattern.
- **e2e (Playwright + axe):** `memory.spec.ts` (stub `**/v1/memory*` list + history; render browser + open a detail sheet showing version history; WCAG A/AA clean) + `timeline.spec.ts` (stub memory + audit + inert `/v1/events`; render entries; a11y). Monaco is `ssr:false`+lazy so the pages render without it; the authoring dialog's editor is exercised in unit tests via the mock.
- **Records:** `effects.json` (E-010 memory model → new web consumer; E-003 new consumers; E-004 new views + Monaco/virtualization), `feature_list.json` F-042 → done, `progress.md`, `NOTICE.md` (new deps), memory lesson if one emerges (e.g. Monaco-offline-in-next). Screenshot-verify `/memory`, the detail sheet, the authoring dialog (Monaco), and `/timeline`.

## Files to touch
- `apps/web/lib/api/`: `types.ts`, `client.ts`, `hooks.ts`.
- `apps/web/components/memory/`: `memory-view.tsx`, `memory-detail.tsx`, `memory-authoring-dialog.tsx`, `memory-editor.tsx` (Monaco wrapper) + `*.test.tsx` (new).
- `apps/web/components/timeline/`: `timeline-view.tsx`, `timeline.ts` (pure merge) + `*.test.ts(x)` (new).
- `apps/web/app/memory/page.tsx` (replace stub); `apps/web/app/timeline/page.tsx` (new).
- `apps/web/lib/nav.ts` + `apps/web/components/app-shared.tsx` (add Timeline to both).
- `apps/web/components/new-memory-button.tsx` / `capture-memory-dialog.tsx` (fold into the authoring dialog; keep the entry point).
- `apps/web/tests/e2e/`: `memory.spec.ts`, `timeline.spec.ts` (new).
- `apps/web/package.json` (+3 deps); `NOTICE.md`; `.harness/state/{effects,feature_list,progress}`; memory.

## Anticipated effects
- **E-010** (memory model): a new **web consumer** of the Memory version lineage (list/get/history/edit) — renders the immutable supersede chain (FR-12). No model change.
- **E-003** (REST contracts): new **consumers** of `GET /v1/memory(/:id[/history])`, `PATCH /v1/memory/:id`, `GET /v1/audit`, `GET /v1/events`. No producer change.
- **E-004** (design tokens / UI): new token-consuming views (`memory`, `timeline`) + the Monaco editor themed via tokens; Monaco + `@tanstack/react-virtual` are new UI deps.

## Test plan
- **Unit:** browser list/filter/empty/error + virtualization; detail supersede-chain; authoring validation + capture-vs-edit (Monaco mocked to a textarea); pure `mergeTimeline`; client methods.
- **e2e:** `/memory` (browse + detail/version-history, axe clean) + `/timeline` (merged entries, axe clean), both from route-stubbed APIs.
- **Screenshot:** `/memory` (list + filters), the detail sheet (version history), the authoring dialog (Monaco), `/timeline` — live against the real API (fake embeddings + scratchpad DB), seeding a couple of memories + an edit to show a real supersede chain.

## Verification
`node scripts/verify-state.mjs` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` · `pnpm test:e2e` · `pnpm build` + screenshots. **Gate Monaco on a green `next build` in increment 1 before building the rest.**

## Risks / open questions
- **Monaco + Next 16 (App Router, offline).** Mitigation: lazy `ssr:false` dynamic import, bundle the local `monaco-editor` via `loader.config({ monaco })` (no CDN), verify `next build` green **first** (increment 1). Workers are optional for markdown (main-thread fallback); if the bundle/worker setup fights Next webpack, record the resolution here. Tests mock the editor (a `textarea`) so unit/e2e never depend on Monaco loading.
- **Bundle size / initial load.** Monaco is heavy → strictly code-split (only loads when the authoring dialog opens); the browser/timeline/detail never import it.
- **Timeline data sources.** Audit is `admin:manage`-gated; on the Local zero-auth profile the caller is full-access (works). If unauthorized (hosted), the timeline degrades to memory + SSE (handle the 403 gracefully, don't error the whole view).
- **Virtualization + a11y.** Keep semantic list roles + keyboard nav under virtualization; axe must stay clean.
- **No scope creep.** Strictly `@tessera/web`; no API/config/SDK change. `@tessera/sdk` adoption stays F-045.
