# Tessera — Design System

| Field | Value |
|-------|-------|
| **Status** | Accepted v2.0 — F-070 (multi-theme catalog, illustration layer + mascot budget, executable contrast gate) |
| **Last updated** | 2026-07-12 |
| **Authority** | [ADR-0009](../adr/0009-frontend-stack-and-design-system.md) (frontend stack & design foundation), [ADR-0047](../adr/0047-dashboard-multi-theme-illustration-layer-contrast-gate.md) (theme catalog, illustration layer, contrast gate) |
| **Enforced by** | [`.harness/rules/frontend/frontend.md`](../../.harness/rules/frontend/frontend.md), [`.harness/rules/frontend/contrast.md`](../../.harness/rules/frontend/contrast.md), [`apps/web/.harness/rules/frontend.md`](../../apps/web/.harness/rules/frontend.md), `apps/web/tests/contrast.test.ts` (executable) |

> **Scope note (F-051 / ADR-0042):** this document governs the **dashboard** (`apps/web`).
> The public surfaces (`apps/marketing`, later the public chrome of `apps/docs`) are governed
> by [`MARKETING-DESIGN.md`](./MARKETING-DESIGN.md) — on marketing pages that document wins.
>
> This is the **single source of truth for the dashboard's look, feel, and interaction**.
> Every UI feature (starting F-028 UI foundation, then F-014) must conform. It operationalizes
> the UI/UX requirements in [`../PRD.md`](../PRD.md) (FR-49, NFR-9) and the references the
> project lead provided (see [§10](#10-references)).
>
> **Machine-readable projection:** [`design-system.manifest.json`](./design-system.manifest.json)
> — the agent/harness-facing contract (token roles, component inventory, motion, budgets). This
> document is the source of truth; the manifest is its projection. See
> [ADR-0021](../adr/0021-frontend-harness-and-design-skill-adaptation.md).

---

## 0. Reference implementation — efferd Dashboard 3 (BINDING for layout/structure)

> **This is the authority for the dashboard's layout, shell structure, information design,
> and honesty** ([ADR-0023](../adr/0023-adopt-efferd-dashboard-3-design-reference.md)).
> We follow **efferd Dashboard 3** + its app-shell (shadcn blocks: `@efferd/dashboard-3`,
> `@efferd/app-shell-3`). Deviating requires a superseding ADR. The principles in §1+ still apply;
> where they conflict, this section wins.
>
> **v2 amendment ([ADR-0047](../adr/0047-dashboard-multi-theme-illustration-layer-contrast-gate.md)):**
> the *color* clauses below (dark-first near-black, monochrome, no brand hue) now describe
> the **Monkai default theme**, not the dashboard as a whole — see §0.1 for the theme
> catalog. Everything else in this section (shell, icons, data-viz grammar, honesty)
> remains binding across every theme.

- **Theme (Monkai default):** **dark-first**, near-black canvas; light theme is a clean inverse;
  **monochrome** UI. In Monkai the **only** functional accent is **emerald-up / red-down**, via the
  [`Delta`](../../apps/web/components/delta.tsx) chip. No gradients-for-decoration (all themes).
- **Surfaces:** flat cards in Monkai (`shadow` tokens defined but flat); other themes express
  their own vendored border/shadow scale — components use **surface tokens**, never hardcode
  `shadow-none`/`border-none`.
- **Icons:** **Lucide** only. **Logo:** the Tessera **mosaic** mark
  ([`logo.tsx`](../../apps/web/components/logo.tsx)).
- **Shell:** shadcn **Sidebar** (inset, collapsible, **grouped** nav with section labels) +
  breadcrumb header + ⌘K search + appearance/user — see
  [`app-shell.tsx`](../../apps/web/components/app-shell.tsx).
- **Data viz:** shadcn **Charts** (Recharts); KPI **stat cards** (label / value / `Delta` /
  footnote); **tables** + divided lists.
- **Honesty:** **no fabricated data** — surfaces show first-class **empty/zero states** until real
  data exists (then charts/Delta trends fill in). Illustrations (§11) never imply data.

### 0.1 Theme catalog (ADR-0047, F-070)

Two orthogonal axes on `<html>` — components stay token-only and never branch on either:

| Axis | Mechanism | Values |
|------|-----------|--------|
| **Mode** | `.dark` class (next-themes; `system` supported) | `light` · `dark` · `system` |
| **Theme** | `data-theme` attribute (persisted `localStorage('tessera.theme')`, pre-paint script — no FOUC) | `monkai` (default) · `amber` · `claude` · `notebook` |

- **Monkai** — the efferd set (§0 colors), Geist faces; the classless `:root`/`.dark` blocks in
  [`globals.css`](../../apps/web/app/globals.css) **are** Monkai (byte-stable default).
- **Amber** (tweakcn `amber-minimal`) — white/near-black canvas, amber primary; Inter /
  Source Serif 4 / JetBrains Mono; radius 0.375rem.
- **Claude** (tweakcn `claude`) — warm paper canvas, terracotta primary; system font stacks;
  radius 0.5rem.
- **Notebook** (tweakcn `notebook`) — sketchbook neutrals + yellow accent; Architects Daughter /
  Fira Code; radius 0.625rem.

Vendored (never `shadcn add` — it clobbers `:root`) into `apps/web/app/themes.css` as
`[data-theme='X']` / `[data-theme='X'].dark`
blocks: full role set + `--chart-*` + `--sidebar-*` + `--radius` + `--shadow-*` + per-theme
`--font-sans/serif/mono`. Theme fonts load via `next/font` with `preload: false` (self-hosted,
fetched only when used). Every vendored value is subject to the §8.1 contrast gate — AA
failures are minimally nudged in-place with a CSS comment.

**Appearance switching propagates radially** from the control that asked
(`apps/web/lib/theme.tsx`: `startViewTransition` + clip-path circle;
instant under `prefers-reduced-motion` or without the API). Switch surfaces: header
AppearanceSwitcher, ⌘K palette, /settings Appearance card.

## 1. Design principles

Distilled from the reference set (unabyss, ui-skills, coss/ui, efferd) into rules we hold:

1. **Restraint over richness.** Minimal decoration; hide complexity until needed
   (progressive disclosure). Functional clarity beats ornamentation.
2. **Legibility as luxury.** Generous whitespace, clear typographic hierarchy, high
   contrast. The user should grasp a screen at a glance.
3. **Functional motion.** Motion communicates state and causality — never decoration for
   its own sake. Fast, interruptible, and respects `prefers-reduced-motion`.
4. **Trust through consistency.** Repeated patterns, one component per job, predictable
   behavior. Accessibility and keyboard parity are architectural, not afterthoughts.
5. **Provenance-first.** Tessera's value is explainability — any surface that shows context
   must show *where it came from and why* (sources, scores). This is our signature.
6. **Performance is a feature.** Perceived speed (optimistic UI, skeletons, virtualization)
   and real speed (code-splitting, streaming) are part of the design, not an afterthought.

## 2. Foundations — design tokens

We theme **shadcn/ui via semantic CSS variables**, authored with **[tweakcn](https://tweakcn.com/editor/theme)**
and exported into the app. **Components never hardcode colors/spacing — only tokens.**

### 2.1 Color (semantic roles, light + dark)
Each role has a background and a foreground (text-on) pairing:

| Token | Use |
|-------|-----|
| `--background` / `--foreground` | app canvas + default text |
| `--card` / `--card-foreground` | surfaces, panels |
| `--popover` / `--popover-foreground` | overlays, menus |
| `--primary` / `--primary-foreground` | primary actions, brand |
| `--secondary` / `--secondary-foreground` | secondary actions |
| `--muted` / `--muted-foreground` | subtle backgrounds, secondary text |
| `--accent` / `--accent-foreground` | highlights, hover states |
| `--destructive` / `--destructive-foreground` | dangerous/irreversible actions |
| `--border`, `--input`, `--ring` | borders, field borders, focus rings |
| `--chart-1` … `--chart-5` | data-viz categorical palette |
| `--sidebar-*` | sidebar surface tokens (bg/fg/primary/accent/border/ring) |

- **Modes:** light / dark / **system**, toggled via a `.dark` class on `:root`; all roles
  defined for both, **in every theme of the §0.1 catalog**. Never branch on theme or mode in
  components — use the tokens.
- **Contrast:** every registered text/background pairing meets WCAG AA (≥ 4.5:1 body, ≥ 3:1
  large text / non-text UI) — **enforced executably** across all themes × modes (§8.1).

### 2.2 Radius, typography, spacing, elevation
- **Radius:** single `--radius` base with derived `sm/md/lg/xl` — consistent rounding.
- **Typography:** one sans font family (display + body); a defined type scale
  (e.g. `xs→3xl`) with set weights and line-heights; **monospace** for code/IDs/provenance.
- **Spacing:** Tailwind's 4px-based scale; consistent component padding rhythm.
- **Elevation:** a small, fixed shadow set (`sm/md/lg`); avoid arbitrary shadows.
- **Z-index & breakpoints:** a documented z-index ladder (base → dropdown → sticky →
  overlay → toast) and Tailwind breakpoints; no magic numbers.

## 3. Component system

Built on **shadcn/ui** (Radix/Base-UI primitives + Tailwind) — accessible, composable,
owned-in-repo components. Categories we standardize:

- **Forms (composable hierarchy):** `Field` / `Fieldset` / `Form` over atomic `Input`,
  `Textarea`, `Checkbox`, `RadioGroup`, `Select`, `Switch`, `Slider`. Validation with
  **React Hook Form + Zod** (reuse API schemas where possible).
- **Overlays (granular depth):** `Dialog`, `Drawer`/`Sheet`, `Popover`, `Tooltip`,
  `ContextMenu`, `DropdownMenu`, and the **Command palette (⌘K)**. Pick the lightest overlay
  that fits; manage focus and escape consistently.
- **Data display:** `Table` (**virtualized** for large sets), `Card`, `Badge`, `Progress`,
  charts via **Recharts/Tremor** (using the `--chart-*` palette), `Tabs`, `Accordion`.
- **Feedback & states:** `Toast` (notifications), `Skeleton` (loading), and first-class
  **empty** and **error** states for every async surface.
- **Specialized:** **React Flow** (knowledge graph / architecture), **Monaco** (memory/ADR
  editing) — both lazy-loaded.

> One component per job. Don't build a bespoke widget where a primitive composes.

## 4. Layout patterns

From the efferd dashboard reference, the app shell and dashboard conventions:

- **App shell:** persistent **sidebar** (collapsible, `--sidebar-*` tokens) + **top bar**
  (search, ⌘K, theme toggle, user/org). Content region scrolls independently.
- **Dashboard composition:** **KPI/stat header**, **card grids** (modular, multi-column),
  charts (area/line/pie/sparkline), activity feeds, attention lists.
- **Controls:** **time-range / date toolbars** for temporal filtering without navigation.
- **Density:** support both **dense** (many metrics) and **sparse** (focused) views.
- **Responsive:** fluid down to tablet/mobile widths; sidebar collapses to a drawer; grids
  reflow. (Responsive web — **not** a PWA; see ADR-0009.)

## 5. Interaction & motion

Motion via **Framer Motion**, governed by the "functional motion" principle:

- **Micro-interactions:** hover/press/focus feedback, subtle state transitions.
- **Page/route transitions:** quick, consistent; no janky reflow.
- **Optimistic updates:** reflect the user's action immediately, reconcile/rollback on the
  server response (TanStack Query mutations).
- **Drag-and-drop & context menus** where they speed real tasks (not novelty).
- **Loading sequences:** skeletons over spinners; stream/stagger content in.
- **Rules:** animations are fast (~150–250ms), interruptible, and **disabled under
  `prefers-reduced-motion`**.

## 6. UX baseline (mandatory — PRD FR-49)

Every relevant surface ships these; a UI feature is **not done** without them:

- [ ] Loading (**skeleton**), **empty**, and **error** states
- [ ] **Optimistic updates** with rollback where it helps perceived speed
- [ ] **Toasts** for async outcomes
- [ ] **Command palette (⌘K)** + keyboard shortcuts; full keyboard operability
- [ ] **Virtualized** long lists/tables
- [ ] **Drag-and-drop** and **context menus** where they aid the task
- [ ] **Real-time updates** (SSE/WebSocket) reflected in the UI
- [ ] Light / dark / **system** themes
- [ ] High-performance rendering (no eager render of large sets)

## 7. Provenance-first surfaces (Tessera signature)

- **Context Package inspector (FR-44):** render the compilation trace — stages, candidates,
  scores, drops, and per-fragment **"why included"** with source links. This is the flagship
  screen.
- **Knowledge graph / architecture (React Flow):** explorable nodes/edges incl. effect-links.
- **Timelines:** changes / decisions / incidents over time.
- **Memory & ADR authoring (Monaco):** edit with live validation.
Any view that surfaces context shows its **sources and scores** — no unexplained results.

## 8. Accessibility (NFR-9 — WCAG 2.1 AA, a verification gate)

Semantic HTML; every control labelled; managed focus order; **visible focus rings**
(`--ring`); AA contrast on all token pairings; full keyboard paths (incl. overlays and the
command palette); `prefers-reduced-motion` honored; screen-reader-tested critical flows.
Accessibility checks (e.g. axe) run in the web E2E gate.

### 8.1 Contrast gate (ADR-0047 — executable, not aspirational)

Governed by [`.harness/rules/frontend/contrast.md`](../../.harness/rules/frontend/contrast.md)
and the **`contrast-checker`** skill:

- **≥ 4.5:1** for normal text pairings; **≥ 3:1** for large text (≥ 24px / ≥ 18.66px bold)
  and non-text UI (focus ring, input boundaries) — WCAG 2.1 SC 1.4.3 + 1.4.11.
- A **registered pairing list** (fg/bg, card, popover, primary, secondary, muted-fg on
  muted/background/card, accent, destructive-as-text, sidebar set, ring-vs-background)
  is asserted by `apps/web/tests/contrast.test.ts` across **all 4 themes × 2 modes** on
  every `test`-gate run.
- **Fix the token, never the check.** Failing values get the smallest oklch-lightness nudge
  that passes, with a CSS comment. New token pairs used for text must be added to the
  registry in the same change.

## 9. Performance budgets

- **Code-split & lazy-load** heavy views (React Flow graph, Monaco, charts).
- **Virtualize** large tables/lists.
- Stream/SSR where it improves first paint; keep the initial bundle lean (measure with
  evidence — Lighthouse/bundle analysis in CI).
- Data via the generated **`@tessera/sdk` + TanStack Query**; cache and dedupe requests.

## 10. References

Provided by the project lead, used to ground this system:
- Theming/tokens: <https://tweakcn.com/editor/theme> (+ the vendored `amber-minimal` /
  `claude` / `notebook` registry themes, ADR-0047)
- Dashboard blocks/layout: <https://efferd.com/blocks/dashboard>
- UI components/conventions: <https://coss.com/ui>
- UI/UX skills & micro-interactions: <https://www.ui-skills.com/>
- Premium aesthetic reference: <https://unabyss.com/>
- Foundations: shadcn/ui, Radix/Base UI, Tailwind CSS.

## 11. Illustration layer & mascot (ADR-0047, F-070 — budgeted)

The dashboard carries a **signature illustration layer** in the marketing art idiom
(ADR-0044/0045 precedent), owned in `apps/web/components/art/`:

- **Form:** server-rendered SVG on a fixed internal grid; **dashboard tokens only**
  (`--chart-*`, `--primary`, `--muted-foreground`, …) so every art is theme-true in all
  4 themes × 2 modes; CSS-only motion (transform/opacity), killed by
  `prefers-reduced-motion` (a designed still scene remains); decorative instances
  `aria-hidden` (or `role="img"` + label when informative); cheap interactivity only
  (hover/pointer — no canvas/WebGL, no animation libraries).
- **Honesty:** arts depict **product truths** (compiler pipeline, effect propagation,
  retrieval signals, memory strata, audit ledger) — never fake charts, metrics, or data.
- **Usage budget (hard):** empty states · error states · the 404 · onboarding/first-run.
  **Never** headers, navigation, or data views (tables, result lists, traces). The
  **overview hero band is retired** (ADR-0053): the Overview leads with state, and its art
  now lives inside the onboarding card — which renders only while the workspace is actually
  empty, so the budget's "onboarding/first-run" line is where it belongs. Text remains the
  information carrier;
  [`EmptyState`](../../apps/web/components/empty-state.tsx) /
  [`ErrorState`](../../apps/web/components/error-state.tsx) expose optional `art` /
  `mascot` slots.
- **Mascot (F-068 absorbed):** `@tessera/mascot` with the closed `--mascot-*` contract
  bound **per theme** in `globals.css` (the gilded heart maps to each theme's warm accent;
  in Monkai it is the one warm moment on non-data surfaces — the emerald/red functional
  accent rule applies to data UI, which the mascot never enters). Placements: empty
  (`searching`/`watching`), error (`alarmed`), 404 (`lost`). Reduced-motion still poses are
  part of the a11y gate. (ADR-0047's overview-onboarding `greeting` placement retires with
  the hero band — ADR-0053. It was never built: `mood="greeting"` appears nowhere in `apps/web`.)
