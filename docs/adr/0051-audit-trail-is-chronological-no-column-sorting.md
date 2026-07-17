# ADR-0051: The audit trail is chronological — cursor pagination instead of column sorting, and no table library

- **Status:** Accepted
- **Date:** 2026-07-17
- **Deciders:** maintainer (dev-AshishRanjan), Claude Opus 4.8 (F-063)
- **Tags:** frontend, api, compliance, accessibility, dependencies

## Context

F-063's acceptance asks for "a reusable data-table pattern (**TanStack Table** + virtualization;
**sortable columns**, sticky header, **cursor pagination**, truncation with tooltips) … adopted by the
audit view first; the memory/sources tables (F-041/F-042) build on it."

Three of those clauses turned out to be unbuildable, unnecessary, or false. Verified against the tree
rather than assumed:

**1. Sortable columns and cursor pagination are mutually exclusive as specified.**
`auditQuerySchema` (`apps/api/src/schemas/audit.ts:7-15`) has **no** sort parameter. Both adapters
hardcode descending `seq` — `sqlite-audit-log.ts` `.orderBy(desc(auditEvents.seq))`, `in-memory.ts`
`.sort((a, b) => b.seq - a.seq)` — and `AuditQuery`'s own doc comment states it as contract:
*"Results are newest-first; `cursor` paginates forward."* **The cursor *is* the sort order**: `seq <
cursor` is only a valid page boundary while rows are ordered by `seq`. Sorting by actor under cursor
pagination needs a composite keyset over `(actor, seq)` and a compound cursor — a database feature,
not a dashboard story.

**2. The stated payoff for the library does not exist.** The acceptance justifies TanStack Table by
"the memory/sources tables build on it". `memory-view.tsx:180` is a `role="list"` **card list**, and a
grep across `apps/web/components/sources/**` finds **no table at all**. The real consumers of
`components/ui/table.tsx` are `tokens-panel`, `governance-view` and `settings-view` — small, static,
non-virtualized tables that a real `<table>` already serves better.

**3. A virtualized table cannot be a `<table>` anyway.** Absolutely-positioned rows leave the table
row-box algorithm (columns stop aligning); `display: block` on table/tbody/tr strips the implicit ARIA
roles. So the DOM and its semantics are hand-built regardless — and TanStack Table is **headless**: it
renders neither.

The operator was given the evidence and returned the call with the brief: *decide what is more
professional, enterprise-grade and production-ready.*

## Decision

**We will not add `@tanstack/react-table`, and the audit table will not offer column sorting.**

1. The reusable pattern is **`apps/web/components/ui/data-table.tsx`**, built on
   `@tanstack/react-virtual` (already a dependency): CSS-grid rows, sticky header, truncation with
   Radix tooltips, explicit ARIA (below). It is generic by construction — typed over `T`, with no
   audit types in it — and tested against a synthetic row type.
2. **No sorting.** An audit trail is chronological by nature; `seq` **is** its order. The user needs
   behind "sort by actor" and "sort by date" are **filters**, and F-063 adds exactly those (actor +
   date range, both long supported on the wire and never surfaced).
3. **`components/ui/table.tsx` stays** as the primitive for small static tables, and its three
   existing consumers are not migrated.
4. The virtualized grid declares its semantics explicitly, with **`aria-rowcount={-1}`** ("total
   unknown") and **absolute `aria-rowindex`**.

## Consequences

### Positive

- **The trail cannot lie about its own ordering.** Client-side sorting would show "sorted by actor"
  over the 50 loaded rows of 2,000 matching — the same dishonesty as the "narrow the filters to see
  older entries" hint this feature deletes, in a better suit. On a compliance surface that is
  disqualifying: an audit trail that misrepresents its completeness has no value.
- **No dependency whose every feature is bypassed.** react-table's row models (sort, filter,
  paginate) are all superseded by the server here. What would remain is a declarative column array —
  a dependency for `.map()`, plus a permanent second table abstraction beside `components/ui/table.tsx`
  and its upgrade burden. Production systems rot from that, not from missing libraries.
- **`aria-rowcount={-1}` is the honest value.** Cursor pagination means the total is genuinely
  unknown: `AuditPage` is `{ events, nextCursor? }` — no count exists in the model, the schema, or
  either adapter. Announcing the *loaded* count would tell a screen reader "row 50 of 50" while
  `nextCursor` proves otherwise. ARIA specifies `-1` for exactly this.
- **The user need is met.** "What did this actor do?" and "what happened on Tuesday?" are answered —
  better than by sorting, because a filter narrows the *whole* trail while a sort would only reorder
  the page you happen to hold.

### Negative / Costs

- **Three acceptance clauses are not delivered**: TanStack Table, sortable columns, and
  "memory/sources build on it". The first two are refused on the merits above; the third rests on
  tables that do not exist.
- **The pattern ships with one consumer**, so its genericity is asserted by construction and by a
  synthetic-row test rather than proven by a second adopter. A follow-on adopter would prove it.
- **We own the ARIA.** A hand-declared grid can drift in ways a real `<table>` cannot — hence the
  explicit `aria-rowindex` assertions (axe **cannot** see a window-relative index: it is structurally
  valid ARIA and completely broken for assistive tech) and axe on the **empty** grid (F-061 shipped a
  critical violation only an empty state could reveal).
- **If sorting is ever genuinely needed**, it must be built server-side as a compound keyset — this
  ADR does not make that cheaper, it only refuses to fake it.

### Neutral / Follow-ups

- **A second adopter** would settle the genericity question. `tokens-panel` / `governance-view` /
  `settings-view` are *not* candidates: they are static and small, and migrating them would be an a11y
  downgrade. A future long, virtualized, server-paginated table is the right first reuse.
- **Revisit if the audit API gains a sort parameter.** That would be a real feature with its own ADR
  (composite keyset + compound cursor), and this decision would then be worth re-opening — the cursor
  would no longer *be* the sort order.
- **`AuditEvent.metadata` is write-dead** (nothing populates it), so the `audit.export` event records
  who/when but not *which filters*. Extending the recorder is an E-020 infra change across every
  audited route.

## Alternatives considered

- **Add TanStack Table anyway, to honour the acceptance's letter.** Additive and low-risk — it would
  be route-chunked, and `web-perf` measures only `/signin` so the gate would neither punish nor bless
  it. Rejected: an unmeasured cost is still a cost, and it would sit *above* the only hard part
  (the DOM + ARIA) contributing nothing to it.
- **Client-side sorting of the loaded window.** Rejected as a lie — see Consequences.
- **Server-side sorting with a compound keyset over `(actor, seq)`.** The only way to satisfy
  "sortable columns" honestly. Rejected as sequencing, not merit: it roughly doubles the feature,
  needs its own ADR, and serves a need the new filters already meet.
- **Migrate the three static tables to `DataTable` to prove reuse.** Rejected: scope creep *and* an
  a11y downgrade (a real `<table>` has native semantics and no ARIA to get wrong).
- **A real `<table>` with virtualization.** Not available: `position: absolute` rows leave the row-box
  algorithm, and `display: block` strips the implicit roles. There is no third option.

## References

- Related: `ADR-0009` (frontend stack), `ADR-0021` (design system + a11y), `ADR-0033` (tenant-scoped
  data plane), `ADR-0034` (SQLite audit log), `ADR-0036` (REST/MCP parity — why the export adds no MCP
  tool), `ADR-0050` (a cross-tenant lesson this feature's export e2e applies).
- Requirements: `docs/PRD.md` FR-48 (governance UI), FR-55 (audit logs for sensitive actions,
  **including exports**), FR-49 (UX baseline: virtualized lists, WCAG AA).
- Features: `F-063` (this work), `F-078` (the SQLite audit adapter does not run the shared conformance
  suite — the root cause of a clamp divergence this feature fixed).
- Code: `apps/web/components/ui/data-table.tsx`, `apps/api/src/schemas/audit.ts`,
  `packages/config/src/audit/sqlite-audit-log.ts`, `apps/api/src/audit/collect.ts`.
