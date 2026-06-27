# Rule: Dashboard (apps/web)

Service-specific additions to the global
[`frontend`](../../../../.harness/rules/frontend/frontend.md) rule. Read it first.

## Data flow
- Talk to the backend **only** through the generated `@tessera/sdk` + TanStack Query. No
  ad-hoc `fetch` scattered in components, no business logic in the UI.
- Server state in TanStack Query; minimal client state in Zustand; forms via React Hook
  Form + Zod (reuse API schemas where possible).
- Prefer Server Components; opt into client components only for interactivity.

## Provenance-first surfaces
- The **Context Package inspector** (FR-44) is a flagship surface: render the compilation
  trace — stages, candidates, scores, drops, and per-fragment "why included." Any view that
  shows context must show its provenance.

## UX baseline (FR-49 — required for "done")
Loading (skeleton) / empty / error states everywhere; ⌘K command palette; optimistic
updates with rollback; toasts; **virtualized** long lists/tables; purposeful Framer Motion
micro-interactions; light/dark/system themes.

## Accessibility (NFR-9 — a verification gate)
Semantic HTML, labelled controls, managed focus, visible focus rings, sufficient contrast,
full keyboard operability. A UI feature is not done if it fails accessibility checks.

## Performance
Code-split and lazy-load heavy views (graph, Monaco); measure bundle/runtime with evidence;
stream where it improves first paint.
