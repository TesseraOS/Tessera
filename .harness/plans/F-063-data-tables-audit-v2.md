# Plan: F-063 Dashboard: enterprise data-table standard + Audit v2 (real pagination, actor/date filters, export)

- **Feature:** F-063 (`.harness/state/feature_list.json:2073-2103`) — the last open R3 feature
- **Requirements:** FR-48, FR-55, FR-49 (`docs/PRD.md`)
- **Service / package:** `apps/web` **+ `apps/api` + `packages/sdk`** (see Anticipated effects — unlike F-062, this feature *does* touch the server, and §D3 justifies exactly why)
- **Author:** planner subagent + Claude Opus 4.8 · **Date:** 2026-07-17
- **Status:** in_progress

## Intent

Make the audit trail a real compliance instrument: page through the whole trail instead of being told to "narrow the filters", filter by who and when, and take the filtered result away as CSV/JSON — with the export itself recorded in the trail it exports. Establish the virtualized data-table pattern once, on the audit view, without lying about table structure to a screen reader.

**Done** = an admin can reach the oldest event, filter by actor and date range, click Export, and then *see their own export* in the trail as an `audit.export` event.

## Requirements — what they actually say

- **FR-48** (`docs/PRD.md:213`): "Governance UI: users, roles, audit log, retention." Pri **S**, Rel R3.
- **FR-49** (`docs/PRD.md:214`): "UX baseline: command palette (⌘K), themes, skeleton/empty/error states, toasts, optimistic updates, **virtualized lists**, WCAG AA." Pri **M**, Rel R0→.
- **FR-55** (`docs/PRD.md:228`): "**Audit logs** for sensitive actions (access, config, **exports**)." Pri **S**, Rel R3.

**FR-55 names exports as an audited category in its own text.** That single word is the whole justification for acceptance 3's server round-trip, and it is a *requirement*, not an inference (§D3). Note also `docs/PRD.md:342` claims "governance/audit UI (FR-48/55 — **done**)" — that claim is what this feature falsifies and repairs.

No requirement names a library. "TanStack Table" appears only in the acceptance, which is a *proposed solution*, not a requirement — and §D1 disputes it on evidence.

---

## Findings (verified against the tree — paths + lines)

### 1. ✅ Premise A is TRUE — `GET /v1/audit` really does support actor/since/until/cursor, and `nextCursor` is genuinely returned

Verified end to end, not assumed.

`apps/api/src/schemas/audit.ts:7-15` — the querystring is exactly:
```ts
action: z.enum(AUDIT_ACTIONS).optional()
actor:  z.string().min(1).optional()      // "Filter by actor principal id."
outcome: z.enum(['success','denied']).optional()
since:  z.string().min(1).optional()      // "Inclusive lower time bound (ISO-8601)."
until:  z.string().min(1).optional()      // "Inclusive upper time bound (ISO-8601)."
limit:  z.coerce.number().int().positive().max(MAX_AUDIT_PAGE_SIZE).optional()
cursor: z.string().min(1).optional()      // "Opaque forward cursor from a prior page."
```
Response (`:35-38`): `{ events: auditEventSchema[], nextCursor: z.string().optional() }`. The route (`apps/api/src/routes/v1/audit.ts:29-39`) forwards all seven to `auditLog.forTenant(tenantOf(request)).query(query)`. `DEFAULT_AUDIT_PAGE_SIZE = 50`, `MAX_AUDIT_PAGE_SIZE = 200` (`apps/api/src/audit/model.ts:100-101`).

**The UI uses only `action` + `outcome`** (`audit-view.tsx:47-53`). So `actor`/`since`/`until`/`cursor` are four wire capabilities the dashboard has simply never exposed. Acceptance 2 is a pure client-side unlock — **zero API change for pagination and filters**.

### 2. ✅ The pagination is REAL keyset, in **both** adapters — not an offset fake

- **In-memory** (`apps/api/src/audit/in-memory.ts:57-72`): monotonic `seq`; `entry.seq < before`, `sort((a,b) => b.seq - a.seq)`, `slice(0, limit)`, `nextCursor = String(last.seq)`. Its doc comment (`:28-33`) states the property that matters: *"stable against concurrent appends (new events get a higher `seq`, so they never shift an in-progress page)."*
- **SQLite** (`packages/config/src/audit/sqlite-audit-log.ts:95-124`) — the adapter that actually ships: `lt(auditEvents.seq, Number(query.cursor))`, `.orderBy(desc(auditEvents.seq))`, `.limit(limit + 1)` and `hasMore = rows.length > limit`. Indexed by `idx_audit_tenant_seq` (`:70`).

**Genuine keyset pagination, fetch-one-extra for `hasMore`, stable under append.** No `OFFSET` anywhere. The premise is not just true, the implementation is good. The defect is *entirely* in the UI.

### 3. ✅ Premise B is TRUE — the "narrow the filters" hint is still there, verbatim

`apps/web/components/audit/audit-view.tsx:165-170`:
```tsx
{data?.nextCursor ? (
  <p className="text-muted-foreground flex items-center gap-1.5 px-1 text-xs">
    <ShieldAlert className="size-3.5" aria-hidden="true" />
    More events match — narrow the filters to see older entries.
  </p>
) : null}
```
The view holds a working `nextCursor` in its hand and tells the user to change the subject. `useAudit` (`apps/web/lib/api/hooks.ts:93-99`) is a plain `useQuery` — no `useInfiniteQuery`, no cursor threading.

### 4. ✅ Premise C is TRUE — `@tanstack/react-table` is NOT a dependency

`apps/web/package.json:15-44`: `@tanstack/react-query ^5.101.2` and `@tanstack/react-virtual ^3.14.5` are present; **there is no `@tanstack/react-table`**. F-061's plan was right.

### 5. 🔴 **The `web-perf` bundle argument does not exist — the gate cannot see `/audit`**

The brief asked me to weigh ~15-20KB against the 300KB budget. **The gate never measures it.**

`tests/web-perf/budgets.json:21-29` — the web app has exactly **one** measured route:
```json
{ "name": "web", "path": "/signin", "public": false, "firstLoadJsGzipKb": 300 }
```
with `$firstLoadSource` stating: *"`/signin` is the measured route because it is the only dashboard page reachable unauthenticated… Heavy views (Monaco, React Flow) are code-split and must never reach this number."*

`/audit` is behind auth and renders no table on `/signin`. A route-scoped import of `@tanstack/react-table` lands in the `/audit` chunk, not the shared shell, and `web-perf.mjs:77` measures at the `load` event of `/signin` only.

⇒ **The bundle cost is a real cost but an *unmeasured* one.** This cuts both ways and I want to be explicit: it removes the strongest argument *against* the library, and it equally removes "it's cheap, the gate passes" as an argument *for* it. **The decision must be made on design merit alone** (§D1). Recording this because the brief's framing assumed a gate that does not apply.

### 6. 🔴 **The acceptance's own premise is FALSE: there are no memory/sources tables to "build on it"**

Acceptance 1 says *"the memory/sources tables (F-041/F-042) build on it."* Verified — neither is a table:

- **Memory is a virtualized *card list*, not a table.** `apps/web/components/memory/memory-view.tsx:176-198`: `role="list"` / `role="listitem"` wrapping `<MemoryCard>`, virtualized with `useVirtualizer` (`:168-173`), absolute positioning + `translateY` (`:192-193`).
- **Sources has no table and no virtualization at all.** A grep for `Table|useVirtualizer|role=` across `apps/web/components/sources/**` returns **no matches** (4 files: `sources-view.tsx`, `register-source-dialog.tsx`, + 2 tests).

The real consumers of `components/ui/table.tsx` are **four**, and they are not the ones named:
`apps/web/components/profile/tokens-panel.tsx`, `apps/web/components/governance/governance-view.tsx`, `apps/web/components/audit/audit-view.tsx`, `apps/web/components/settings/settings-view.tsx`.

This is the fourth feature in a row whose acceptance carried a stale premise (F-060's "first `/v1/events` consumer" was the third; F-061's "first real virtualization" was the second; F-062's checked out). See §D8 for the scope consequence.

### 7. 🔴 **Acceptance 1 asks for two things that are in tension by construction: "sortable columns" AND "cursor pagination"**

**The audit API cannot sort, and this is not an oversight — it is what a keyset cursor *means*.**

- There is no `sort`/`order` parameter in `auditQuerySchema` (`apps/api/src/schemas/audit.ts:7-15` — the full list is in Finding 1).
- Both adapters hardcode descending `seq`: `sqlite-audit-log.ts:112` `.orderBy(desc(auditEvents.seq))`; `in-memory.ts:63` `.sort((a, b) => b.seq - a.seq)`.
- `AuditQuery`'s doc comment (`apps/api/src/audit/model.ts:74`) states it as contract: *"Results are newest-first; `cursor` paginates forward."*

**The cursor *is* the sort order.** `seq < cursor` is only a valid page boundary while rows are ordered by `seq`. Sorting by `actor` under cursor pagination would require a composite keyset (`actor`, `seq`) and a compound cursor — a real database feature, not a UI story.

And **client-side sorting would be a lie of exactly the kind this feature exists to remove.** Sorting the 50 loaded rows by actor, on a surface where 2,000 more match, presents "sorted by actor" while showing page 1 of 40. That is the "narrow the filters" dishonesty in a new costume. See §D2.

### 8. 🔑 The audited-export precedent exists, and `collectAuditTrail` is the exact code to reuse

`GET /v1/dsr/export` (`apps/api/src/routes/v1/dsr.ts:63-85`) — `preHandler: requirePermission('admin:manage')`, **`config: { audit: 'dsr.export' }`** (`:72`), and it already returns `audit: bundle.audit.map(...)` (`:82`). The audited-export shape is established.

The reusable part is `collectAuditTrail` (`apps/api/src/dsr/bundle.ts:55-67`), whose doc comment states F-063's completeness requirement *for me*:

> *"Page the whole audit trail. `query` is paginated by contract, so **an export must follow `nextCursor` to be complete**; the cursor is opaque and strictly forward, so this terminates."*

```ts
async function collectAuditTrail(auditLog: AuditLog): Promise<readonly AuditEvent[]> {
  const events: AuditEvent[] = [];
  let cursor: string | undefined;
  do {
    const page = await auditLog.query({ limit: MAX_AUDIT_PAGE_SIZE, ...(cursor !== undefined ? { cursor } : {}) });
    events.push(...page.events);
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return events;
}
```
It is **private to `apps/api/src/dsr/bundle.ts`** and takes **no filters**. F-063 generalizes it (filters + a cap) and reuses it in both places (§D4).

**But `/v1/dsr/export` must NOT be reused for this**: it exports memories + graph + sources + the *entire unfiltered* trail, and `dsr.export` means "data-subject-rights right-of-access", a different compliance fact from "an admin exported the audit view". Reusing it would misreport in the trail. Right shape, wrong meaning — the F-062 lesson's corollary (*"read what a candidate for reuse actually does before planning around its name"*) applies, and here it says "reuse the function, not the endpoint".

### 9. 🔑 There is **no** `AuditAction` for an audit export — one must be added (E-020)

`apps/api/src/audit/model.ts:14-34` — the full set (17): `search`, `compile`, `effects.read`, `memory.read`, `memory.write`, `effects.write`, `source.read`, `source.manage`, `billing.read`, `billing.manage`, `audit.read`, `token.read`, `token.manage`, `retention.read`, `retention.manage`, `dsr.export`, `dsr.delete`. **No `audit.export`.**

`config: { audit: ... }` works via `apps/api/src/audit/recorder.ts:30-52`: an `onResponse` hook reads `request.routeOptions.config?.audit`, takes actor + tenant from the `AuthContext`, and derives `outcome` from the status (`>= 400 → 'denied'`, `:37`). It is **failure-isolated** (`.catch` → `log.warn`, `:48-50`) and skips unauthenticated requests. Target comes from `auditTarget` (`:14-19`): a `lineageId` param, else `request.routeOptions.url`.

**The action is read from *static route config*, so it cannot vary per request.** That rules out an `?export=true` flag on `/v1/audit` — varying the recorded action by query would require making the recorder read a mutable per-request override, an E-020 infrastructure change affecting every audited route. A separate route with its own static config is both smaller and the established pattern (`/dsr/export` is its own route). This is why §D3 lands on a new endpoint rather than a flag.

### 10. 🔴 `AuditEvent.metadata` is a **write-dead field** — nothing in the product ever populates it

Modelled (`model.ts:60`), assigned by `toAuditEvent` (`:118`), in the Zod schema and on the wire (`schemas/audit.ts:31`), and persisted by both adapters (`sqlite-audit-log.ts:35,89`). But the **only** `.record({…})` call site in `apps/api/src` is `recorder.ts:41-47`, and it passes `tenantId`, `actor`, `action`, `target`, `outcome` — **never `metadata`**. (The MCP gateway's own recorder, `apps/mcp/src/gateway.ts:154`, is the other call site.)

**Consequence for acceptance 3**: the `audit.export` event will record *who exported, when, and that it was an export* — but **not which filters were exported**, because there is no supported path to per-request metadata. That satisfies the acceptance as written ("the export action is itself audited") and is a genuine limit worth naming (SL-4). Extending the recorder is an E-020 infra change touching every audited route — register, don't fold (F-062 precedent).

### 11. The MCP surface: **no audit tool should be added, and the taxonomy record will not break**

- `apps/mcp/src/gateway.test.ts:34-49` pins the exact sorted set of **14** tools. There is **no audit tool, no dsr tool, no retention tool, no billing tool.** The established pattern is unambiguous: **admin/compliance surfaces are REST-only on the agent surface.**
- ADR-0036 parity means the agent surface must be no less **capable**. It has never had audit read. Adding `audit_export` would *expand* agent capability into compliance data — an authorization-surface expansion, not parity. ⇒ **No MCP tool. `gateway.test.ts:34-49` untouched.**
- **Adding an `AuditAction` does not break the MCP taxonomy**: `MCP_AUDIT_ACTIONS` (`apps/mcp/src/gateway.ts:64-83`) is `Readonly<Record<McpToolName, AuditAction>>` — exhaustive over **tool names**, valued by action. A new action is a new *value*, not a new key. Verified, not assumed. `gateway.test.ts:119` ("maps every guarded tool to an audit action") likewise stays green.

### 12. The `perf` gate does not measure audit — at all

`tests/bench/thresholds.json` gates exactly six numbers: `latencyMs.searchP95` (300), `latencyMs.compileP95` (2000), `latencyMs.incrementalIngestP95` (1000), `tokensPerAnswer.searchRest` (900), `tokensPerAnswer.searchMcp` (900), `tokensPerAnswer.compileEnvelopeRatio` (1.9). **No audit route, no audit tokens.** A new `/v1/audit/export` route adds no `perf`-gate exposure. The measure-per-field lesson therefore has nothing to bite on here — but its *corollary* does, and I apply it in §D4: the export is the one place in this feature where response size is genuinely unbounded, so it gets an explicit, stated cap rather than a hope.

### 13. 🐛 Adapter drift: SQLite does not clamp `limit`; the conformance suite does not test it

- `in-memory.ts:58` — `const limit = Math.min(query.limit ?? DEFAULT_AUDIT_PAGE_SIZE, MAX_AUDIT_PAGE_SIZE);`
- `sqlite-audit-log.ts:96` — `const limit = query.limit ?? 50;` — **no `Math.min`**, and a hardcoded `50` instead of importing `DEFAULT_AUDIT_PAGE_SIZE`.
- `apps/api/src/audit/audit-log.conformance.ts` mentions `limit` only at `:88,96` (`{ limit: 2 }`) — **the clamp is not in the conformance suite**, which is why the two adapters diverge undetected.

Not exploitable over HTTP today (the route schema caps at `.max(MAX_AUDIT_PAGE_SIZE)`, `schemas/audit.ts:13`). **But it matters for F-063**: the export loop calls the *port* directly, below the schema, which is exactly where the divergence lives. Increment 1 pins `MAX_AUDIT_PAGE_SIZE` in the loop and adds the missing conformance case (a tiny, additive, in-scope hardening of the very code path being reused).

### 14. Conventions, fixtures and traps — checked, not assumed

- **e2e permission fixtures: NO change needed.** `apps/web/tests/e2e/support/fixtures.ts:22` — `LOCAL_IDENTITY.permissions` already contains **`admin:manage`** (and `:39`/`:52`/`:64` in `LOCAL_RBAC`). Like F-061/F-062, unlike F-060. Verified.
- **E-015 `instrumentServices` trap: N/A — and for a *structural* reason.** `packages/observability/src/instrument-services.ts:58-70` maps `ApiServices` members explicitly (its comment: *"Optional ApiServices members MUST be forwarded — dropping one silently 500s its routes"*). **The `AuditLog` is not an `ApiServices` member**: it is threaded separately into `buildServer` and passed as its own argument — `recordAudit(v1, audit)` (`apps/api/src/routes/v1/index.ts:62`), `registerAuditRoutes(v1, audit)` (`:75`), `registerDsrRoutes(v1, services, audit)` (`:77`). The new route uses that same `audit` parameter. Nothing to forward, nothing to drop.
- **SDK regen IS needed** (unlike F-062): `packages/sdk/package.json:22` — `"generate": "node scripts/generate.mjs"`; `packages/sdk/src/index.ts:26-27` already re-exports `type AuditQuery, type AuditPage` and `client.ts:205-207` has `getAudit`. The new route needs a generated-type re-export + an `exportAudit` client method + a doc-commented interface entry (`client.ts:92-93` is the pattern).
- **`AuditAction` is hand-mirrored in the web** (`apps/web/lib/api/types.ts:241-258`, ADR-0022 residual) — **but there is a real compile-time guard**: `apps/web/lib/api/client.ts:88` passes the web's `AuditQuery` into `sdk.getAudit(query)`, whose `AuditQuery` derives from the generated OpenAPI enum (`packages/sdk/src/client.ts:27`). An action present in the web union but absent from the regenerated SDK enum **fails typecheck**. That fixes the increment order: **API → regen → web**, never the reverse.
- **`AUDIT_ACTION_LABELS`** (`apps/web/lib/governance.ts:13-31`) is `Record<AuditAction, string>` — **exhaustive**, so it fails typecheck until the new label is added. And `AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS)` (`:33`) means the action-filter dropdown picks up "Audit export" **for free**.
- **`components/ui/tooltip.tsx` exists** (Radix, `@radix-ui/react-tooltip ^1.2.10`) — the truncation-tooltip requirement needs no new primitive.
- **`AuditView` has NO RTL test today** — `apps/web/components/audit/` contains exactly one file, `audit-view.tsx`. F-063 adds the first.
- **Data flow**: `apps/web/.harness/rules/frontend.md:7-8` — SDK + TanStack Query only. `:20` requires **virtualized** long lists/tables; `:23-25` — *"A UI feature is not done if it fails accessibility checks."*
- **Tokens**: `apps/web/tests/contrast.test.ts:15-18` — *"If a case fails: FIX THE TOKEN… never this file's thresholds. New token pairs used as text must be added to the registry in the same change."*
- `scripts/verify-state.mjs` requires `.harness/plans/F-063-*.md` while `in_progress`. All **11** gates in `.harness/verification/gates.json` are `active`.

### 15. ⚠️ Two live e2e contracts drive the audit view — one of them is a glob collision waiting to happen

- **`apps/web/tests/e2e/audit.spec.ts:8`** — `await page.route('**/v1/audit*', ...)`. **That glob also matches `/v1/audit/export`.** The existing stub would silently intercept the export call and fulfil it with a page-shaped body. Playwright resolves routes **last-registered-first**, so the new spec must register the more specific `**/v1/audit/export*` handler *after* it, or tighten both. This is a trap that would present as a baffling test failure.
- **`tests/e2e-full/tests/human-journey.spec.ts:92-96`** — the audit view is **step 6, the final step of the full-stack human journey**, against a real trail:
  ```ts
  await page.goto('/audit');
  await expect(page.getByText('e2e-user').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Memory write').first()).toBeVisible();
  ```
  `getByText` survives the `<table>` → ARIA-grid change (it matches text content, not tags), but **`e2e-full` runs last (gate order 9)** and this is the only place with a real audit trail. It is also therefore the only place acceptance 3 can be *truly* proven (§Test plan).

---

## ✅ OQ-1 — RESOLVED 2026-07-17: do NOT add TanStack Table; ship no sorting. ADR required.

**Escalated to the operator with the evidence; they returned the call with the brief "decide what is
more professional and enterprise grade and ready for production." Decision: the planner's
recommendation stands.** Every premise below was verified against the tree first, not taken on report:
`@tanstack/react-table` is absent from `apps/web/package.json`; `auditQuerySchema`
(`apps/api/src/schemas/audit.ts:7-15`) has **no** sort parameter; both adapters hardcode descending
`seq`; `memory-view.tsx:180` is `role="list"` and a grep across `apps/web/components/sources/**` finds
**no table at all**.

**The reasoning, since "enterprise-grade" was the criterion:**

1. **A dependency whose every feature is bypassed is not enterprise, it is dead weight.** Sorting,
   filtering and pagination — react-table's entire row-model value — are all done by the server here.
   It is headless, so it contributes **no DOM and no ARIA**, and the genuinely hard part (§D6: a
   virtualized grid that does not lie to a screen reader) is hand-built either way. It would buy a
   declarative column array and cost a permanent **second table abstraction** beside
   `components/ui/table.tsx`, plus upgrade burden. Production systems rot from that, not from missing
   libraries.
2. **Client-side sorting on a compliance surface is disqualifying.** Sorting the 50 loaded rows of
   2,000 matches and labelling it "sorted by actor" is *worse* than the "narrow the filters" hint this
   feature deletes, because it is less obviously wrong. An audit trail that misrepresents its own
   completeness has no value.
3. **Server-side sorting is real engineering for a need already met.** An audit trail is chronological
   by nature — `seq` **is** its order. "What did this actor do?" and "what happened on Tuesday?" are
   **filters**, and acceptance 2 adds precisely those. Compound keysets over `(actor, seq)` to satisfy
   a word in the acceptance, when the user need is already served, is over-engineering.

**Deviation from the written acceptance, recorded:** clause 1's "TanStack Table" and "sortable
columns" are **not** delivered; clause 1's "the memory/sources tables build on it" rests on tables
that do not exist. An **ADR** records the sort/cursor tension as the durable architectural fact it is
(SL-1, SL-2, SL-5). Everything else in clause 1 — a reusable pattern, virtualization, sticky header,
cursor pagination, truncation with tooltips — ships.

The original analysis follows.

## ⚠️ OQ-1 (original) — the acceptance names TanStack Table. The evidence says do not add it.

**Recommendation: DO NOT add `@tanstack/react-table`. Build the pattern on `@tanstack/react-virtual` (already installed) + a new `components/ui/data-table.tsx`.** This deviates from a written acceptance clause, so it needs an ADR and the operator's eye. Here is the case, loudly.

**What TanStack Table actually provides** is row models: sorting, filtering, pagination, grouping, column sizing. It is headless — **it renders no DOM**. Now check each against this surface:

| react-table capability | usable on audit? | evidence |
|---|---|---|
| Sorting row model | ❌ **impossible** | No `sort` param exists; both adapters hardcode `desc(seq)`; the `seq <` cursor *is* the sort order (Finding 7). Client-sorting a loaded window is a lie. |
| Filtering row model | ❌ unusable | Filters are server-side: `action`/`actor`/`outcome`/`since`/`until` (Finding 1). |
| Pagination row model | ❌ unusable | Server keyset cursor (Finding 2). |
| Column sizing/reorder | ❌ not in acceptance | — |
| The DOM + ARIA | ❌ **provides none** | It is headless. The hard part of this feature (§D6) is entirely ours either way. |
| Column definitions | ✅ | …which is `columns.map()`. |

**So the library's entire value here reduces to a declarative column array — and we would be paying a dependency for `.map()`.** Every row model it exists to provide is bypassed by a server that filters, sorts and paginates.

Three more nails:
1. **The stated payoff does not exist.** Acceptance 1 justifies the library by "the memory/sources tables build on it". **There are no memory/sources tables** (Finding 6): memory is a `role="list"` card list, sources has no table. The pattern's plausible future consumers are `tokens-panel` / `governance-view` / `settings-view` — small, static, non-virtualized tables that `components/ui/table.tsx` already serves *better* with real `<table>` semantics (§D7).
2. **The bundle argument is unavailable in both directions** (Finding 5): `web-perf` measures `/signin` only, so the gate would neither punish nor bless it. An unmeasured cost is still a cost — dependency surface, upgrade burden, and a second table abstraction in a codebase that already has one.
3. **We hand-roll the DOM regardless** (§D6), because a virtualized table cannot be a `<table>`. react-table would sit *above* the part that is hard and contribute nothing to it.

**If the operator overrides and wants the library anyway:** it is additive and low-risk (route-chunked, invisible to `web-perf`), and the plan changes only in §D9 increment 4 — `data-table.tsx` takes `ColumnDef[]` and `useReactTable({ getCoreRowModel })` instead of a plain array. Nothing else in this plan moves. **I recommend against**, and recommend an ADR recording *why* (the sort/cursor tension in Finding 7 is a durable architectural fact that the next person will otherwise re-litigate).

## ⚠️ OQ-2 (small, decide within the work) — should the audit export be capped?

`collectAuditTrail` (`bundle.ts:55-67`) is **unbounded today** for DSR. Mirroring that gives an admin-only route that materializes an entire trail in memory. §D4 recommends an explicit `MAX_AUDIT_EXPORT_ROWS` + a truthful `truncated` flag, which *deviates from the DSR precedent* — hence flagged. DSR's own unbounded loop is pre-existing, is not amplified by this feature, and should be **registered, not folded** (the F-062 / F-048 precedent).

---

## Design decisions (and their justification)

**D1 — The data-table pattern: `components/ui/data-table.tsx` over `@tanstack/react-virtual`.** See OQ-1. The pattern's API is deliberately small and generic:
```ts
interface DataTableColumn<T> { key: string; header: string; width: string; cell: (row: T) => ReactNode; truncate?: boolean }
interface DataTableProps<T> { columns, rows, rowKey, label, busy, rowCount?, estimateRowHeight, emptyState, footer }
```
CSS-grid rows for column alignment, `useVirtualizer` for windowing, explicit ARIA (§D6), sticky header, Radix tooltips on `truncate` columns. No sorting (§D2) — because none can be honest here, and building unused machinery to satisfy a word in the acceptance is the definition of a toy.

**D2 — Sorting is NOT shipped. It cannot be done honestly, and this is a durable fact, not a shortcut.**

Acceptance 1's "sortable columns" and "cursor pagination" are **mutually exclusive as specified** (Finding 7): a `seq < cursor` boundary is only valid in `seq` order. Three options, one honest:

| option | verdict |
|---|---|
| Client-sort the loaded window | ❌ **A lie.** Sorts 50 of 2,000 and labels it "sorted by actor" — the exact dishonesty (audit-view.tsx:165-170) this feature removes. |
| Server-side sort + composite cursors | ❌ A real DB feature (compound keyset over `(actor, seq)`), across the port + **both** adapters + conformance. Not a dashboard story. Register if wanted. |
| **Ship no sorting; ship filters instead** | ✅ **Recommended.** |

An audit trail is **chronological by nature** — `seq` *is* its order, and time-descending is the only ordering a compliance record has. "Show me what this actor did" and "show me last Tuesday" are not sorts; they are **filters**, and acceptance 2 adds exactly those. The user need is met; only the mechanism named in the acceptance is refused. Recorded as **SL-1**.

**D3 — 🔑 Export: the server records the FACT and guarantees COMPLETENESS; the client does the FORMATTING. This resolves the tension, and the F-062 lesson *predicts* this answer rather than opposing it.**

The brief asked me to apply the F-062 lesson's test explicitly and say what it yields. The lesson's test is: *"if the client and the server both implemented this, could they produce answers that disagree about what is true?"* The trap is asking it once about "the export". **It is three questions, and they have different answers:**

| sub-question | could client & server disagree about *truth*? | verdict |
|---|---|---|
| **The CSV/JSON bytes** — quoting, column order, date format | **No — only about style.** A re-formatting of rows the caller holds, byte for byte. | **CLIENT** ✅ *(lesson applies exactly as written)* |
| **"An admin exported the trail at T"** | **Not a disagreement — the client cannot produce this claim at all.** An audit event is not a re-formatting of data the caller holds; it is a *new fact*, and a self-asserted one would be forgeable. | **SERVER** |
| **"These are ALL the rows matching these filters"** | **YES.** A client that has loaded 2 of 40 pages and calls it "the filtered view" is *wrong about what the filtered view is*. Completeness is a fact. | **SERVER** |

⇒ **The lesson is honoured, not contradicted.** F-062's Markdown was *purely* a re-encoding, so all of it was client-side. F-063's export has a re-encoding **wrapped around two server-only facts**. The lesson's own words draw the line: *"the reason, not the shape, is what transfers"* — and the reason (divergent truth) **does** hold for completeness, while a distinct requirement (FR-55's word "**exports**") holds for the audit event.

The smallest honest design:

```
GET /v1/audit/export?action&actor&outcome&since&until
  preHandler: requirePermission('admin:manage')
  config:     { audit: 'audit.export' }          ← the fact, recorded by the existing hook
  →  { exportedAt, count, truncated, events: AuditEvent[] }    ← DATA, not bytes
```
The server returns **JSON data**; `apps/web/lib/export/audit-csv.ts` turns it into CSV or JSON **client-side** (pure, DOM-free, unit-tested — mirroring F-062's `lib/export/context-package.ts`). **No `format` param. The server never emits a byte of CSV.** That is the line, and it is exactly where the lesson puts it.

**Why not the cheaper alternatives** — both were checked, not waved off:
- *Client pages `/v1/audit` to completeness and formats locally (no new route).* Fails acceptance 3. It produces N × `audit.read` events, which are **indistinguishable from an admin scrolling the page**. A compliance officer asking "who exfiltrated the trail?" cannot answer. That distinction *is* FR-55's "exports" clause.
- *An `?export=true` flag on `/v1/audit`.* **Structurally impossible without an infra change**: the recorder reads the action from *static route config* (`recorder.ts:32`, Finding 9). Varying it per request means a mutable per-request override on every audited route.

**Bonus, and it is the acceptance proof:** because the export is an `audit.export` event, **it shows up in the audit view itself** — filterable via the action dropdown, which gains the entry for free (Finding 14). Export → refetch → the trail contains "Audit export". A self-demonstrating compliance loop, and the strongest possible e2e assertion for acceptance 3.

**D4 — Export scope: ALL matching rows, server-paged, with an explicit cap and a truthful `truncated` flag.**

"The filtered view" = **every row matching the current filters**, never the loaded pages. A compliance export of page 1 of 40 is worse than no export, because it *looks* complete. `collectAuditTrail`'s own doc comment already says so (Finding 8).

Generalize it in place — `collectAuditTrail(auditLog, filters?, cap?)` — and reuse it in both DSR and the new route, so one loop, one termination proof, one test surface. Pin `limit: MAX_AUDIT_PAGE_SIZE` inside the loop (Finding 13's clamp divergence lives exactly here).

**The cap (OQ-2):** `MAX_AUDIT_EXPORT_ROWS = 50_000` + `truncated: boolean` on the response, surfaced in the UI ("Exported the 50,000 most recent matching events — narrow the date range for the rest" — a *true* sentence, and note it is only allowed to sound like the hint we deleted because here it is actually the case). Rationale: this is a UI button, not a rare deliberate act like DSR; an unbounded materialization on an admin route is a latent OOM; and per the measure-per-field lesson's corollary, **the honest move is to state the bound where the next person will look** rather than hope. A truncated export that *says* it is truncated is honest; a silent one is the trap. Recorded as SL-3.

**D5 — Pagination UX: `useInfiniteQuery` + an explicit "Load older events" button. Not infinite scroll.**

- **Compliance means reproducibility.** An explicit click yields a knowable, statable set ("showing 150 events"). Infinite scroll makes "what am I looking at?" unanswerable — and makes "export what I see" ambiguous, which is precisely the confusion §D4 exists to prevent.
- **Infinite scroll + virtualization + a sticky header is an AT trap**: the load trigger lives inside a virtual window, so it may not be in the DOM when a keyboard user reaches the end. A button is one tab stop that announces itself.
- TanStack Query already ships it: `useInfiniteQuery({ getNextPageParam: (last) => last.nextCursor })`, `data.pages.flatMap(p => p.events)` → the accumulated array → the virtualizer. Zero new dependencies.
- This replaces `audit-view.tsx:165-170` with a control that uses the cursor the component already had.

**D6 — 🔑 The a11y crux: a virtualized table CANNOT be a `<table>`. Explicit ARIA + `aria-rowindex` + `aria-rowcount={-1}`.**

**Why `<table>` is off the table.** Virtualization requires absolutely-positioned rows at computed offsets (the `memory-view.tsx:192-193` / `search-view.tsx:295-299` pattern). `position: absolute` on a `<tr>` removes it from the table row-box algorithm, so columns stop aligning; the usual workaround, `display: block` on the table/tbody/tr, **strips the implicit ARIA roles** browsers derive from those tags. Either way the semantics are gone. ⇒ **`components/ui/table.tsx` (real `<table>`, `:7-16`) is not reusable for the virtualized variant** — a finding worth stating plainly, since the brief asked whether it helps. It helps the *static* tables, and §D7 keeps it there.

**What AA actually demands** — the brief asked for precision, so: **no WCAG SC mentions `aria-rowcount`.** The binding criteria are **1.3.1 Info and Relationships** and **4.1.2 Name, Role, Value** — both **Level A**, and therefore *included* in AA (AA = A + AA). 1.3.1 requires that structure and relationships conveyed visually be **programmatically determinable**. Rendering a visual grid whose rows/columns exist only as `<div>`s fails it. ARIA is the *mechanism* by which a windowed DOM satisfies 1.3.1: explicit roles carry the relationships, and `aria-rowindex` carries *which* row this is in the full set — without it, AT announces "row 5" when the user is on row 1,205.

**The structure — and the one trick that makes it clean:**
```tsx
<div role="table" ref={scrollRef} aria-label="Audit events" aria-rowcount={-1}
     className="max-h-[65vh] overflow-y-auto">     {/* the role=table element IS the scroll container */}
  <div role="rowgroup" className="sticky top-0 z-10 bg-sidebar">
    <div role="row" aria-rowindex={1}>
      <div role="columnheader">Time</div> …
    </div>
  </div>
  <div role="rowgroup" style={{ height: totalSize, position: 'relative' }}>   {/* the spacer IS the rowgroup */}
    {virtualItems.map(v => (
      <div role="row" aria-rowindex={v.index + 2}
           style={{ position: 'absolute', top: 0, transform: `translateY(${v.start}px)` }}>
        <div role="cell">…</div> …
      </div>
    ))}
  </div>
</div>
```
Two deliberate collapses, each killing a bug the brief predicted:
- **The `role="table"` element is itself the scroll container.** A plain `<div>` between `role=table` and `role=rowgroup` breaks axe's `aria-required-children` / `aria-required-parent`. Collapsing them means both rowgroups are *direct* children — and it is also what makes `position: sticky; top: 0` work for the header. **The sticky-header requirement and the clean ownership chain are the same structure.**
- **The virtualizer's height-spacer *is* the body rowgroup** (rather than a `<div>` nested inside one, as at `search-view.tsx:290`). Rows become direct DOM children of a rowgroup. No `role="presentation"` gymnastics, no `aria-owns`.

**`aria-rowcount={-1}` is the honest value, and it is load-bearing.** Cursor pagination means **we do not know the total** — `AuditPage` is `{ events, nextCursor? }` (`model.ts:89-92`), with no count anywhere in the model, the schema, or either adapter. ARIA specifies `-1` for exactly this ("total unknown"). Putting the *loaded* count there would announce "row 50 of 50" to a screen reader while `nextCursor` proves otherwise — **the "narrow the filters" lie, whispered to the users least able to detect it.** This is the single detail I would most want reviewed.

**How to prove it — because "axe green" is NOT the proof:**
- **axe catches structure**: `aria-required-children`, `aria-required-parent`, `aria-valid-attr-value` fire if the role nesting or an ARIA reference breaks. That is real, and it is what caught F-061's critical dangling `aria-activedescendant`.
- **axe does NOT catch a wrong `aria-rowindex`.** An off-by-one, or window-relative indices (1..10 repeating), is *invisible* to axe and totally broken for AT. ⇒ **explicit RTL assertions on the values**: scroll to row 60, assert the rendered rows carry `aria-rowindex` 61-70 (not 1-10), and that `aria-rowcount` is `-1` while `nextCursor` exists.
- **axe on the EMPTY state specifically.** F-061 shipped a critical violation that only an empty state revealed; a virtualized grid with zero rows is a `role="rowgroup"` with no `role="row"` children — an `aria-required-children` candidate. Assert it directly.
- F-061's two-part fix stays the reference: the `clamped >= 0` guard (`search-view.tsx:283`) and the `scrollToIndex` effect (`:238-240`), whose comment is the whole lesson: *"the visuals look fine while a screen reader announces nothing at all, which is the kind of a11y bug you cannot see."*

**D7 — `components/ui/table.tsx` stays exactly as it is, and the other three consumers are NOT migrated.** `tokens-panel`, `governance-view` and `settings-view` render small, static, non-virtualized tables. A real `<table>` is **better** for them: native semantics, zero ARIA to get wrong. Migrating them to `DataTable` would be scope creep *and* an a11y downgrade. F-063 changes only `audit-view.tsx`'s usage.

**D8 — Adoption: the pattern + the audit view. Memory/sources are out of scope, and their premise is false.**

Acceptance 1's "the memory/sources tables build on it" rests on tables that **do not exist** (Finding 6). Converting memory's working `role="list"` card list into a table to prove a pattern would be a UX regression *and* golden-rule-2 scope creep. Recommendation: **ship the pattern with one honest consumer**; register a follow-on if the operator wants tabular memory/sources.

On "a reusable pattern with one consumer is unproven" — fair, and I will not pretend otherwise. The mitigation is that `DataTable`'s API is generic **by construction** (columns + rows + rowKey + label; no audit types anywhere in `components/ui/data-table.tsx`), and it is pinned by its own RTL tests using a **synthetic row type**, not `AuditEvent`. That proves genericity without inventing a second consumer. Recorded as SL-5.

**D9 — 🐛 CSV formula injection is this export's fence-injection.** F-062's export had ``` fences; this one has spreadsheets. A CSV cell beginning `=`, `+`, `-`, `@` (or tab/CR) is **executed as a formula** by Excel and Google Sheets — `=HYPERLINK(...)` exfiltration, `=cmd|...` on older Excel. And audit cells are **not** trusted: `actor.principalId` comes from an OIDC/token identity, and `target` from `auditTarget` (`recorder.ts:14-19`) — a `lineageId` or a route URL. Mitigations, both required, both tested:
1. **RFC 4180 quoting** — wrap in `"` and double any embedded `"`; handles commas/quotes/newlines.
2. **Formula neutralization** — prefix a leading `=`/`+`/`-`/`@`/tab/CR with `'`.

Same discipline as F-061's offsets-not-HTML and F-062's longest-backtick-run: **structurally correct, not hopefully correct.** Explicit unit test with a principal id of `=1+1` and a target containing `",\n`.

**D10 — Date-range filter: send ISO-8601, and do not pretend to a precision the API lacks.** `since`/`until` are `z.string().min(1)` (`schemas/audit.ts:11-12`) compared **lexicographically** against `event.at` (`in-memory.ts:23-24`; `gte`/`lte` in `sqlite-audit-log.ts:103-104`). That is correct **only for UTC ISO-8601 with a `Z`** — which is what `toAuditEvent` writes (`model.ts:117`, `new Date().toISOString()`). ⇒ the UI must send `.toISOString()`, never a locale string or a bare date. A date-only `until` of `2026-07-17` would exclude everything *on* the 17th (since `2026-07-17T09:00Z > 2026-07-17`) — a classic and silent off-by-one-day. Fix: `until` = end-of-day → `T23:59:59.999Z`. Pinned by a unit test on the pure query-builder.

---

## Approach — verifiable increments

Each increment ends green on `pnpm -w typecheck && pnpm -w lint && pnpm -w test`. Order is forced by Finding 14's typecheck guard: **API → regen → web.**

**0. OQ-1 → operator** (TanStack Table: adopt or not). **Does not block increments 1-3** (all server/SDK). It gates increment 4 only. OQ-2 (export cap) is decided within increment 1.

**1. API — the export route + the reusable loop.**
`apps/api/src/audit/model.ts` (+`'audit.export'` to `AUDIT_ACTIONS`, `MAX_AUDIT_EXPORT_ROWS`); `apps/api/src/dsr/bundle.ts` (generalize `collectAuditTrail(auditLog, filters?, cap?)`, export it); `apps/api/src/schemas/audit.ts` (`auditExportQuerySchema`, `auditExportResponseSchema`); `apps/api/src/routes/v1/audit.ts` (`GET /audit/export`); `apps/api/src/audit/audit-log.conformance.ts` (the missing `limit` clamp case, Finding 13); `packages/config/src/audit/sqlite-audit-log.ts` (clamp to `MAX_AUDIT_PAGE_SIZE`, use `DEFAULT_AUDIT_PAGE_SIZE`).
✅ Verify: `pnpm -w test` — route e2e: 403 without `admin:manage`; the export follows `nextCursor` past one page; filters narrow it; **an `audit.export` event lands in the trail**; `truncated: true` at the cap; **cross-tenant isolation** (tenant B's export contains zero of tenant A's events — the shared-bus lesson: for a tenant-scoped surface a cross-tenant case is the *primary* case, and a single-tenant suite cannot see the bug). Conformance passes for **both** adapters.

**2. SDK regen.**
`pnpm --filter @tessera/sdk generate` → `openapi.json` + `src/generated/schema.ts` diff; add `exportAudit` to `client.ts` (interface doc-comment + impl) and re-export `type AuditExport` from `src/index.ts:26-27`.
✅ Verify: `pnpm -w build`; regen is idempotent (a second run produces no diff).

**3. Web contract mirror.**
`apps/web/lib/api/types.ts:241-258` (+`'audit.export'`); `apps/web/lib/governance.ts:13-31` (+`'audit.export': 'Audit export'` — exhaustive `Record`, so typecheck *demands* it); `client.ts` (`exportAudit`); `hooks.ts` (`useAuditInfinite` via `useInfiniteQuery`, `useAuditExport` via `useMutation`).
✅ Verify: typecheck proves the web union ⊆ the regenerated SDK enum (Finding 14).

**4. Pure logic + the primitive — no audit types.**
`apps/web/lib/export/audit-csv.ts` (`toCsv`, `toJson`, `csvCell`); `apps/web/lib/audit/query.ts` (the pure filter→`AuditQuery` builder, D10); `apps/web/components/ui/data-table.tsx`.
✅ Verify: `pnpm -w test` — **formula injection** (`=1+1`, `@x`, `-x`, `+x`) and RFC-4180 (`",\n`) cases; `until` becomes end-of-day; `DataTable` RTL against a **synthetic** row type: `aria-rowindex` is *absolute* under scroll, `aria-rowcount={-1}`, sticky header present, empty state renders no orphan rowgroup.

**5. Audit v2.**
`apps/web/components/audit/audit-view.tsx` — actor + date-range filters, `useAuditInfinite` + "Load older events" (**deleting `:165-170`**), `DataTable` adoption, export menu; `apps/web/components/audit/audit-export.tsx`.
✅ Verify: RTL (**the first `audit-view.test.tsx`**) — "Load older" appends and disappears when `nextCursor` is absent; actor/date reach `api.getAudit`; export calls `exportAudit` **with the current filters** and downloads a blob (assert `revokeObjectURL`); a rejected clipboard/download surfaces `toast.error`, never an unhandled rejection.

**6. e2e + e2e-full + screenshots + record.**
`apps/web/tests/e2e/audit.spec.ts` (**mind the glob collision, Finding 15**); `tests/e2e-full/tests/human-journey.spec.ts:92-96`; screenshots; `effects.json`, `progress.md`, `feature_list.json`, ADR.

## Files to touch

**API**
- `apps/api/src/audit/model.ts` — `+'audit.export'` (E-020); `MAX_AUDIT_EXPORT_ROWS`.
- `apps/api/src/schemas/audit.ts` — `auditExportQuerySchema` (`auditQuerySchema` minus `limit`/`cursor`), `auditExportResponseSchema` (`{exportedAt, count, truncated, events}`).
- `apps/api/src/routes/v1/audit.ts` — `GET /audit/export`, `admin:manage`, `config: { audit: 'audit.export' }`.
- `apps/api/src/dsr/bundle.ts:55-67` — generalize + export `collectAuditTrail`; DSR's call is unchanged in behaviour.
- `apps/api/src/audit/audit-log.conformance.ts` — the `limit`-clamp case (Finding 13).
- `packages/config/src/audit/sqlite-audit-log.ts:96` — clamp to `MAX_AUDIT_PAGE_SIZE`; import `DEFAULT_AUDIT_PAGE_SIZE`.
- Route/integration tests alongside.

**SDK**
- `packages/sdk/openapi.json`, `packages/sdk/src/generated/schema.ts` — **generated, never hand-edited**.
- `packages/sdk/src/client.ts` — `exportAudit` (+ interface doc-comment, the `:92-93` pattern).
- `packages/sdk/src/index.ts:26-27` — re-export `type AuditExport`.

**Web**
- `apps/web/components/ui/data-table.tsx` (+ test) — **new**, the pattern (§D1/D6).
- `apps/web/lib/export/audit-csv.ts` (+ test) — **new**, pure (§D9).
- `apps/web/lib/audit/query.ts` (+ test) — **new**, pure (§D10).
- `apps/web/components/audit/audit-view.tsx` — rewritten around `DataTable`; **`:165-170` deleted**.
- `apps/web/components/audit/audit-export.tsx` (+ test) — **new**.
- `apps/web/components/audit/audit-view.test.tsx` — **new** (none exists).
- `apps/web/lib/api/types.ts:241-258`, `apps/web/lib/governance.ts:13-31`, `apps/web/lib/api/client.ts`, `apps/web/lib/api/hooks.ts:93-99`.
- `apps/web/tests/e2e/audit.spec.ts` — extend (Finding 15).
- `apps/web/tests/contrast.test.ts` — **only if** a new text token pair appears; prefer existing tokens.
- **NOT** `apps/web/tests/e2e/support/fixtures.ts` — verified: `admin:manage` already at `:22`.
- **NOT** `apps/web/components/ui/table.tsx` and **not** its three other consumers (§D7).
- **NOT** `apps/web/components/memory/memory-view.tsx` or `components/sources/*` (§D8).

**e2e-full / docs / state**
- `tests/e2e-full/tests/human-journey.spec.ts:92-96` — extend step 6 with the export loop.
- `docs/adr/00XX-virtualized-data-table-and-audit-export.md` — **new** (OQ-1, D2, D3, D6).
- `.harness/state/{effects.json,progress.md,feature_list.json}`.

**Explicitly NOT touched:** `apps/mcp` (Finding 11), `packages/context-compiler`, `packages/retrieval`, `packages/billing`, `tests/bench/*`, `tests/web-perf/*`.

## Anticipated effects

- **E-020** (audit trail: `AuditLog` port + `AuditEvent` model + recording hook) — **EXTENDED.** `+'audit.export'` in `AUDIT_ACTIONS` ripples to: `z.enum(AUDIT_ACTIONS)` ×2 (`schemas/audit.ts:8,27`) → OpenAPI → SDK; `apps/web/lib/api/types.ts:241-258`; `AUDIT_ACTION_LABELS` (`governance.ts:13`, exhaustive `Record` → typecheck-enforced); `sqlite-audit-log.ts:31` `$type<AuditAction>()` (type-only — TEXT column, **no migration**). **Verified NOT affected:** `MCP_AUDIT_ACTIONS` (`gateway.ts:64`) is keyed by `McpToolName`, so a new action is a new value, not a new key. New: `GET /v1/audit/export`; `collectAuditTrail` promoted to a shared, filtered helper.
- **E-003** (REST `/v1` + MCP contracts) — **EXTENDED, REST only.** New route + 2 schemas → OpenAPI → **SDK regen required** (unlike F-062). **No MCP tool** (Finding 11) ⇒ `apps/mcp/src/gateway.test.ts:34-49` (14 tools) untouched.
- **E-004** (design tokens / web) — extended. `DataTable`, the filter row, the export menu, the "Load older" control: tokens-only across 4 themes × 2 modes; any new text token pair **registered in `apps/web/tests/contrast.test.ts` in the same change**.
- **E-015** (`instrumentServices`) — **N/A, structurally.** The `AuditLog` is not an `ApiServices` member; it is a separate `buildServer` argument (`routes/v1/index.ts:62,75,77`). Nothing to forward (Finding 14).
- **E-018** (auth/RBAC) — **untouched.** No new permission; `admin:manage` exists and is already in the e2e fixtures (`fixtures.ts:22`).
- **E-005** (gates) — no gate config changes. **No expected movement in `perf`** (audit is unmeasured, Finding 12) or **`web-perf`** (`/audit` is not the measured route, Finding 5).

## Test plan

- **Unit (pure, no DOM):**
  - `audit-csv` — **formula injection**: `=1+1`, `+x`, `-x`, `@x`, leading tab/CR each neutralized with `'`; **RFC 4180**: `"`, `,`, `\n` in `target`; a missing `target` renders empty, not `undefined`; `metadata` absent (Finding 10); unicode; empty set → headers only.
  - `lib/audit/query` — `until` → end-of-day `T23:59:59.999Z` (D10's silent off-by-one-day); ISO `Z` always; empty filters → `{}`, never `{actor: ''}`.
  - `collectAuditTrail` (api) — follows `nextCursor` across pages; **terminates**; honours filters; stops at `MAX_AUDIT_EXPORT_ROWS` with `truncated: true`; requests `limit: MAX_AUDIT_PAGE_SIZE`.
- **Conformance (both adapters):** the existing suite + the new `limit`-clamp case (Finding 13) — `query({limit: 10_000})` returns ≤ `MAX_AUDIT_PAGE_SIZE` from **in-memory and SQLite alike**.
- **API route:** `/v1/audit/export` — 403 without `admin:manage`; multi-page completeness; filters; `truncated`; **an `audit.export` event is recorded and the exporting principal is the actor**; **cross-tenant isolation — tenant B's export contains zero of tenant A's events**, asserted only *after* tenant B sees its own event (the shared-bus lesson: never let "nothing arrived yet" pass for "the leak is closed"). Remove the `forTenant` scoping and watch it go red before restoring.
- **RTL:**
  - `DataTable` (synthetic rows, no audit types — §D8): `aria-rowindex` is **absolute** after scrolling to row 60 (61-70, *not* 1-10 — the bug axe cannot see); `aria-rowcount === "-1"`; header is `role="row"`/`aria-rowindex={1}` and sticky; `role="table"` owns exactly two `role="rowgroup"` children; **empty rows → no orphan rowgroup**; a truncated cell exposes its full text via tooltip.
  - `AuditView` (**new file**): "Load older events" appends and vanishes when `nextCursor` is absent; **the "narrow the filters" string is gone**; actor/date reach `api.getAudit` as ISO; export calls `exportAudit` with the **current** filters and revokes the object URL; a failed export → `toast.error`, no unhandled rejection.
- **E2E (web, axe):** `/audit` — stub `**/v1/audit*` **and** `**/v1/audit/export*` (register the specific route **last**, Finding 15). Assert: axe WCAG A/AA on the **populated** grid, and **separately on the EMPTY state** (F-061's critical violation was empty-state-only, and a zero-row `role="rowgroup"` is an `aria-required-children` candidate); "Load older" fetches with the cursor; the export triggers a download.
- **E2E-full** (`human-journey.spec.ts:92-97`) — **the only place acceptance 3 can truly be proven**, because it is the only real trail. Keep `getByText('e2e-user')` + `getByText('Memory write')`, then: click **Export CSV** → reload `/audit` → assert the trail now shows **"Audit export"** by `e2e-user`. Four lines; it proves the server route, the new action, the recorder wiring, the SDK, and the UI in one assertion, against a live deployment.
- **Screenshots:** `/audit` populated, empty, and mid-"Load older", 4 themes × light/dark, incl. reduced motion. F-061's `dark:ring-0`-beats-`ring-2` defect was invisible to every test and visible only in a screenshot — and this view is full of `dark:ring-0` cards (`audit-view.tsx:60,114,177`).

## Verification

Run in gate order (`.harness/verification/gates.json`); stop at first failure. Feature-declared: `typecheck`, `lint`, `test`, `e2e`.

| Gate | Command | Evidence |
|---|---|---|
| state | `node scripts/verify-state.mjs` | this plan exists as `F-063-*.md`; effects/schema sync; ADR linked |
| typecheck | `pnpm -w typecheck` | clean — **and it is a contract proof**: the web `AuditAction` union must be ⊆ the regenerated SDK enum (Finding 14) |
| lint | `pnpm -w lint` | clean (incl. package-boundary) |
| format | `pnpm -w format:check` | clean |
| test | `pnpm -w test` | unit + conformance (**both adapters**) + route + RTL + contrast |
| build | `pnpm -w build` | clean |
| e2e | `pnpm -w test:e2e` | api + **mcp (must be unchanged — 14 tools)** + web (axe AA on **populated *and* empty**) |
| web-perf | `pnpm -w test:perf` | first-load JS — **expect NO movement**: `/signin` is the measured route and renders no table (Finding 5) |
| e2e-full | `pnpm -w test:e2e:full` | **required and decisive** — audit is step 6 of the human journey; carries the `audit.export` round-trip |
| perf | `pnpm -w bench` | **expect NO movement** — audit is not measured (Finding 12) |

Also: `pnpm --filter @tessera/sdk generate` must be **run** (this feature changes the wire) and must be **idempotent** on a second run.

## Scope limits & deferrals (stated, not hidden)

1. **SL-1 — No column sorting ships.** The API cannot sort and the `seq` cursor *is* the order (Finding 7); client-sorting a paginated window is the very lie this feature removes (§D2). Acceptance 1's "sortable columns" is **not delivered**, deliberately. Server-side sort needs composite keyset cursors across the port + both adapters — register it if wanted.
2. **SL-2 — No `@tanstack/react-table`** (OQ-1). Every row model it offers is bypassed by a server that filters, sorts and paginates; the named future consumers do not exist (Finding 6). ADR required.
3. **SL-3 — The export is capped** at `MAX_AUDIT_EXPORT_ROWS` and says so via `truncated` (§D4, OQ-2). Diverges from DSR's unbounded `collectAuditTrail`, which is pre-existing, unamplified here, and **registered not folded**.
4. **SL-4 — The `audit.export` event records WHO exported and WHEN, not WHICH FILTERS.** `AuditEvent.metadata` is never written by the recorder (Finding 10) and the action comes from static route config (Finding 9). Acceptance 3 is met as written; per-request audit metadata is an E-020 infra change across every audited route. **Register.**
5. **SL-5 — The pattern ships with ONE consumer.** Memory is a card list and sources has no table (Finding 6), so the acceptance's adoption premise is false. Genericity is proven by `DataTable`'s tests using a synthetic row type, not by converting a working card list (§D8).
6. **SL-6 — `components/ui/table.tsx` and its three other consumers are untouched** (§D7). Real `<table>` semantics are *better* for static tables; migrating them would be creep and an a11y downgrade.
7. **SL-7 — `aria-rowcount` is `-1` (unknown), permanently.** Cursor pagination yields no total anywhere in the model, schema or adapters. A count would require `COUNT(*)` per query on an admin route — and a *guessed* one would be a lie to AT (§D6).
8. **SL-8 — `apps/web/lib/api/types.ts`'s `AuditAction` remains a hand-mirror** (ADR-0022 residual, F-062's RISK-6). Bounded here by a **real** compile-time guard (Finding 14), unlike F-062's open-string case.

## Risks / open questions

- **OQ-1 (OPERATOR DECISION — gates increment 4 only): TanStack Table.** **Recommendation: do not add it.** Sorting is impossible (Finding 7), filtering/pagination are server-side, it renders no DOM so it does not touch the hard part, its named payoff does not exist (Finding 6), and the bundle gate cannot see it either way (Finding 5). ADR required either way; an override changes only increment 4.
- **OQ-2 (decide in increment 1): the export cap.** Recommend cap + `truncated`. Diverges from DSR.
- **RISK-1 (highest) — `e2e-full` runs LAST and drives this exact view.** `human-journey.spec.ts:92-96` asserts `getByText('e2e-user')` / `'Memory write'` against a real trail, after a `<table>` → ARIA-grid rewrite. `getByText` should survive (text, not tags), but virtualization means **a row must be in the window to be found** — a real corpus could push the target row out of view where the stubbed e2e never would. Verify in increment 6, not at the gate.
- **RISK-2 — the `**/v1/audit*` glob collision** (Finding 15). The existing stub silently swallows `/v1/audit/export`. Presents as a baffling failure. Register the specific route last.
- **RISK-3 — axe `aria-required-children` on the virtualized grid.** §D6's structure is designed against it (both rowgroups direct children of `role="table"`; the spacer *is* the rowgroup), but this is a **prediction to verify in increment 4**, not a fact. The brief is right that a virtualized grid is worse than F-061's listbox: it has a *required ownership chain*, where the listbox had one attribute.
- **RISK-4 — `aria-rowindex` correctness is invisible to axe.** Window-relative indices (1..10 repeating) look perfect to every automated check and are useless to AT. Only the explicit RTL assertion catches it. This is the F-061 lesson generalized: the a11y bugs that ship are the ones no gate can see.
- **RISK-5 — CSV formula injection** (§D9). Audit cells carry externally-influenced identity strings. This export's fence-injection; structural fix + explicit test.
- **RISK-6 — the date off-by-one-day** (§D10). Lexicographic `until` comparison makes a date-only bound exclude the whole final day — silently, plausibly, and exactly on a compliance surface. Pinned by a unit test.
- **RISK-7 — cross-tenant export.** A new admin route reading a tenant-scoped store is precisely the shared-bus lesson's shape. `forTenant(tenantOf(request))` is one line and omitting it is invisible in a single-tenant suite. **Verify the isolation test fails without the fix**, and assert B's own event *before* asserting the absence of A's.
- **RISK-8 — golden rule 6 on a compliance surface.** `audit-view.tsx` is on the full-stack human journey and is the FR-48/55 evidence surface. The rewrite is the largest single-file change here; the e2e-full step is the regression guard.

---
