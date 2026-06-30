# ADR-0022: Interim dashboard data client until the generated SDK (F-022)

- **Status:** Accepted
- **Date:** 2026-06-30
- **Deciders:** Project lead, Claude
- **Tags:** frontend, web, api, data

## Context

F-014 (dashboard: global search + Context Package inspector) is the first UI that needs **real
data** from the F-011 REST `/v1` API. [ADR-0009](0009-frontend-stack-and-design-system.md) and the
frontend rules mandate that the dashboard access data **only via the generated `@tessera/sdk`**
with no scattered `fetch` — but the SDK is **F-022 (R1)** and does not exist yet. The project lead
directed that this is a **production system: no dummy/fixture data in the app**. We must not
reorder the roadmap to pull F-022 into R0, nor scatter ad-hoc fetch calls, nor ship mock data.

## Decision

We will build a **small, typed, in-repo data client** at `apps/web/lib/api` over the `/v1` API,
consumed exclusively through **TanStack Query** hooks:

- One `apiFetch` wrapper: base URL from `NEXT_PUBLIC_API_BASE_URL` (default
  `http://localhost:3000/v1`), JSON, and it parses the API's `{ error: { code, message } }`
  envelope into a typed `TesseraApiError`.
- Typed methods mirroring the API Zod schemas (`search`, `compile`, `getEffects`, …) and matching
  response types in `lib/api/types.ts`.
- React Query hooks (`useSearch`, `useCompile`, …) — the only data path components use. **No
  component calls `fetch` directly; the app ships no mock data.**

This client is a **drop-in seam**: when F-022 lands, `@tessera/sdk` replaces `lib/api` with a
localized change (same hook surface). **Tests** stub at the network/client boundary (Playwright
`route`, mocked client) — that is test infrastructure, not production data.

## Consequences

### Positive
- F-014 ships in R0 against the real API, production-real (no fixtures), honoring "no scattered
  fetch" — without reordering the roadmap.
- The swap to the generated SDK is isolated to `lib/api`.

### Negative / Costs
- Response types are hand-mirrored from the API Zod schemas until F-022 generates them (small,
  localized duplication; the API's error envelope + contracts are stable per E-003).

### Neutral / Follow-ups
- **Superseded in part by F-022**: when `@tessera/sdk` is generated, replace `lib/api` internals
  with it and keep the hook surface. Tracked on effect E-003.

## Alternatives considered

- **Pull F-022 (generate the SDK) into R0** — rejected: reorders the roadmap and expands the
  in-progress feature; F-014 is the claimed R0 item (one feature at a time).
- **Fixtures / mock data in the app** — rejected: the lead requires a production system with no
  dummy data.
- **Ad-hoc `fetch` in components** — rejected: violates the frontend rule; the centralized typed
  client preserves the SDK's intent.

## References

- [ADR-0009](0009-frontend-stack-and-design-system.md) (SDK is the data path),
  [ADR-0016](0016-rest-api-fastify-zod-bridge.md) (the `/v1` contract + error envelope),
  `feature_list.json` (F-014 consumes this; F-022 supersedes it), effect **E-003**.
