---
id: monaco-offline-in-next-and-virtualization-jsdom
kind: lesson
title: Integrate a heavy client-only editor (Monaco) offline + code-split, and de-risk it with a build spike FIRST; stub layout-dependent libs (virtualizer) in jsdom tests
links:
  - apps/web/components/memory/memory-editor.tsx
  - apps/web/components/memory/memory-editor-impl.tsx
  - apps/web/components/memory/memory-view.tsx
  - apps/web/components/memory/memory-view.test.tsx
confidence: 0.85
created: 2026-07-06
---

**What happened:** F-042 needed a Monaco editor for authoring memories in a Next.js 16 (Turbopack,
App Router, React 19) app that must run **offline** (self-hosted/enterprise). Two traps, both handled:

1. **Monaco integration is the risk — spike the BUILD before writing the feature.** Plan-then-code, but
   the first *code* increment was a throwaway build spike (deps + a lazy editor wired into one page →
   `next build`), reverted after it went green. That proved the toolchain (offline bundling, Turbopack,
   worker behaviour) *before* investing in the browser/detail/authoring UI. De-risk the scariest
   dependency first; don't discover it's unworkable after building everything on top of it.

2. **Bundle Monaco locally, lazily, ssr:false — never CDN.** `@monaco-editor/react` defaults to loading
   monaco from a CDN (a network dependency that breaks offline + in headless e2e). Fix: `import * as
   monaco from 'monaco-editor'; loader.config({ monaco })` in a **client-only** impl module, wrapped by
   `next/dynamic(() => import('./impl'), { ssr:false, loading: <Skeleton/> })`. Result: monaco (~MBs) is
   **code-split** out of the initial bundle and loads only when authoring opens; it runs fully offline.
   For a **markdown/plain-text** editor no language worker is needed — the main-thread fallback is silent
   (no console errors); only ts/json/css/html need workers. Theme it from `next-themes`' `resolvedTheme`
   → `vs`/`vs-dark`, and set a11y via `options.ariaLabel` (not a DOM attribute).

3. **jsdom has no layout → stub layout-dependent libs in unit tests.** `@tanstack/react-virtual`
   measures the scroll element's height; in jsdom that is `0`, so the virtualizer renders **zero** rows
   and the list appears empty. Mock `useVirtualizer` to return every row (`getVirtualItems` over
   `count`); real virtualization is covered by the Playwright e2e + screenshots where layout is real.
   Likewise mock the Monaco wrapper to a controlled `<textarea>` so authoring tests exercise
   validation/submit without loading the editor. (Same family as jsdom needing ResizeObserver/pointer
   polyfills for Radix.)

4. **A `vi.fn()` typed with no params makes `mock.calls[0][0]` a tsc error** (`Tuple type '[]' has no
   element at index '0'`) even though it runs fine — assert with `toHaveBeenCalledWith(...)` instead of
   indexing the typed-empty tuple. And under `exactOptionalPropertyTypes`, a computed `detail?: string`
   that may be `undefined` must be **conditionally spread** (`...(x ? { detail: x } : {})`), not assigned.
