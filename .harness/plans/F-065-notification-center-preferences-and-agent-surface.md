# Plan: F-065 Notification service — center, preferences, agent-readable surface

- **Feature:** F-065 (entry in [`../state/feature_list.json`](../state/feature_list.json))
- **Requirements:** FR-38, FR-49, NFR-6
- **Service / package:** apps/api (+ @tessera/config, @tessera/ingestion, @tessera/mcp, @tessera/sdk, apps/web)
- **Author:** Claude (Opus 5) · **Date:** 2026-07-28

## Intent

Give a returning human *and a reconnecting agent* an honest answer to "what changed while I was
away?" — cross-device, surviving a reload and a device switch, filtered by what that person actually
wants to hear about. Done looks like: the bell's unread badge is the same on a laptop and a phone;
`settings` has per-kind notification toggles; and an agent calls `list_notifications` instead of
guessing.

## The scope decision (lead-approved, 2026-07-28)

F-065's `acceptance` was written before F-089, which decided that **the audit trail is the one
history** and rewrote F-065's own `notes` to "preferences, CROSS-DEVICE read state keyed
{tenantId, principalId}, the agent-readable surface, and `occurredAt` on wire events". The two
readings build different systems, so it was escalated. **Lead chose the projection design:**

1. **Notifications are a typed, severity-tagged projection of the audit trail** — not a second
   store of the same facts. This is what acceptance clause 1's own words ask for ("produced from
   the SAME domain events … never a second event taxonomy"); a parallel notification table would
   be exactly the second taxonomy it forbids, and exactly what F-089 rejected.
2. **The new `NotificationStore` persists only what genuinely cannot be derived**: cross-device
   read state and per-user preferences. Both keyed `{tenantId, principalId}`.
3. **Kinds ship only with a real producer.** `system.alert` is *not* built — a preference toggle
   that can never fire is dishonest UI. Recorded as a seam.

Consequence to close in this feature: a background scan's *outcome* has no trail row (since F-081
the route returns 202 and the audit row means "a scan was started"), so `scan.completed` /
`scan.failed` would be underivable. Increment 1 fixes that at the source.

This deviates from the literal acceptance text ⇒ **ADR-0064**.

## Approach

### The taxonomy (`kind` ← audit action, deterministic, one map)

| audit action | kind | severity |
|---|---|---|
| `memory.write` | `memory.captured` | `info` |
| `source.scan.completed` *(new)* | `scan.completed` | `info` |
| `source.scan.failed` *(new)* | `scan.failed` | `error` |
| `token.manage` | `token.changed` | `warning` |
| `billing.manage` | `plan.changed` | `info` |

Every other audit action projects to **no** notification — notifications are deliberately a small
set of things worth interrupting someone for; everything else stays in the activity feed and the
trail. `token.created`/`token.revoked` collapse to one `token.changed`: the trail has a single
`token.manage` action for both, and inventing two kinds the producer cannot distinguish would be a
vocabulary that lies.

### Scoping: tenant-wide notifications, per-principal read state

A projected notification belongs to the **workspace** (the bell has shown tenant activity since
F-060), so `recipient` is "every principal in the tenant" rather than a per-user inbox — a shape the
trail cannot express anyway (it records one actor, not an audience). What *is* per principal is read
state and preferences, which is precisely what the store holds. Stated in the ADR so the narrower
reading of "recipient scoping" is a decision, not an omission.

### Increments

1. **Audit vocabulary + scan outcomes.** Add `source.scan.completed` / `source.scan.failed` /
   `notification.read` / `notification.manage` to `AUDIT_ACTIONS`. Thread the **initiating actor**
   through the scan lifecycle (`SourceService.scan`/`startScan` → `IngestionEvents`), so the
   composition root's SSE bridge can record the outcome row with the principal who started it —
   no new `PrincipalKind`, the trail's "who did what" invariant intact. Optional/additive: a scan
   without an actor records nothing, exactly as today.
2. **Notification domain (pure, Fastify-free).** `NotificationKind`, `NotificationSeverity`,
   `Notification`, `NotificationPreferences`, the action→kind map, and `projectNotifications()` —
   the function both REST and MCP call (ADR-0036, one engine/two surfaces).
3. **`NotificationStore` port + in-memory reference adapter + shared conformance suite** (read
   state, preferences, tenant *and* principal isolation, prune) — mirrors the F-027 audit pattern.
4. **SQLite adapter** in `@tessera/config` running the same conformance suite; wired in the local +
   self-hosted profiles and `Runtime`.
5. **REST**: `GET /v1/notifications` (unread/kind/severity filters, cursor-paginated, `unreadCount`),
   `POST /v1/notifications/read`, `POST /v1/notifications/read-all`, `GET`/`PUT
   /v1/notifications/preferences`. Zod → OpenAPI → **regenerated SDK**.
6. **MCP `list_notifications`** + `TOOL_PERMISSIONS` / `MCP_AUDIT_ACTIONS` entries.
7. **`occurredAt` on wire events** — stamped centrally in `sseFrame` (the one place that already
   owns the wire shape, so it cannot regress per-emitter).
8. **Web**: `useNotifications` / mutations; the bell reads server read state; retire
   `lib/store/notifications` (its own doc comment names this feature as its successor).
9. **Web**: notification preferences card in `settings`, strings through `lib/i18n`.
10. **E2E + docs + ADR-0064 + effects + progress + close.**

### Authorization

Reads require `stats:read` (they project workspace activity — the `get_stats` precedent, and viewer
holds it). Read-marks and preference writes are **self-scoped** — they cannot affect another
principal or another tenant — so they require authentication only, like `GET /v1/me`. Preference
writes are audited (`notification.manage`): "who turned off token-change alerts?" is a real
question. List reads are **not** audited — a per-page-load read would flood the trail it reads
from, the same posture as `/v1/stats` and `/v1/stats/activity/recent`.

## Files to touch

- `apps/api/src/audit/model.ts` — four new actions; `RECENT_ACTIVITY_ACTIONS` re-checked.
- `packages/ingestion/src/domain.ts`, `src/sources/service.ts` — optional actor on the scan lifecycle.
- `packages/config/src/profiles/assemble.ts` — bridge records scan-outcome audit rows.
- `apps/api/src/notifications/{model,project,port,in-memory,notification-store.conformance,index}.ts` — new.
- `packages/config/src/notifications/sqlite-notification-store.ts` — new.
- `apps/api/src/schemas/notifications.ts`, `src/routes/v1/notifications.ts`, `routes/v1/index.ts`,
  `server.ts`, `services.ts` — the HTTP surface + injection.
- `apps/mcp/src/{server,gateway,schemas}.ts` — `list_notifications`.
- `apps/api/src/events.ts` — `occurredAt` in `sseFrame`.
- `packages/sdk/src/generated/schema.ts` — regenerated.
- `apps/web/lib/api/{hooks,types}.ts`, `components/app-header.tsx`,
  `components/settings/notification-settings.tsx`, `lib/i18n/en.ts`, `lib/governance.ts`;
  **delete** `apps/web/lib/store/notifications.ts`.
- `docs/adr/0064-*.md`, `apps/docs/content/docs/**` (generated API reference).

## Anticipated effects

- **E-003** (REST + MCP contract): new routes + new tool ⇒ Zod schemas, OpenAPI, **SDK regen**, web.
- **E-020** (audit port + adapters + conformance): `AUDIT_ACTIONS` grows ⇒ both adapters' typed
  columns, the Zod enum, `AUDIT_ACTION_LABELS` (exhaustive `Record<AuditAction, string>` — a
  compile error until updated), CSV export, `describeEvent`.
- **E-014 / E-018 / E-004** (per the feature's `effects`): SSE payload shape (`occurredAt`),
  composition root wiring, dashboard surfaces.
- New effect-link for the `NotificationStore` port ⇒ in-memory + SQLite + conformance.
- `packages/ingestion` scan signature ⇒ REST scan route + MCP `scan_source`.

## Test plan

- **Unit:** action→kind projection (incl. actions that map to nothing), severity, preference
  filtering, unread counting, watermark math, cursor paging.
- **Conformance:** `NotificationStore` suite run against in-memory **and** SQLite; tenant isolation
  *and* principal isolation (two users of one tenant do not share read state); prune.
- **Integration:** route tests for authorization (viewer may list, may mark own read), the
  `notification.manage` audit row, the unaudited list read, the scan-outcome audit rows.
- **E2E:** emit → persisted → listed → mark-read → badge clears, **and the cross-device claim**:
  mark read in one browser context, assert cleared in a second. Preferences: disable a kind, its
  rows leave the list. axe on the bell panel and the settings card (awaiting
  `document.getAnimations()` first — ADR-0063 follow-up).

## Verification

`typecheck`, `lint`, `format`, `test`, `e2e` across the workspace (the feature's `verification`
list), plus `node scripts/verify-state.mjs`. Evidence captured in `progress.md`: test counts, e2e
pass count, and the SDK regeneration diff being non-empty *and* type-clean.

## Risks / open questions

- **Widening `AUDIT_ACTIONS` changes existing surfaces.** `source.scan.completed`/`failed` do not
  end in `.read`, so they join `ACTIVITY_ACTIONS`/`RECENT_ACTIVITY_ACTIONS` and will appear in the
  Overview chart and feed — more rows per scan (start + outcome). Judged honest and additive, but
  existing F-084/F-089 tests must be re-read rather than re-baselined.
- **Retiring `lib/store/notifications`** deletes persisted per-device marks; users see previously
  read rows as unread once. Acceptable (the server becomes the source of truth) and stated in the
  ADR — but the sign-out `clear()` call site must go with it or sign-out breaks.
- **`occurredAt` stamped at frame time**, not emit time. Within milliseconds (frames are written in
  the emit handler) and better than the client's clock, which is what it replaces. Documented at
  `sseFrame`.
- The audit trail cannot express "this operation ran and failed" — `AuditOutcome` is
  `success | denied`, and `recordAudit` maps a 500 to `denied`. Worked around here with two distinct
  actions; the underlying gap is **out of scope** and gets filed as a follow-up.
